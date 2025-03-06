import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import prisma from './prisma/client';
import authRouter from './routes/auth';
import notesRouter from './routes/notes';
import chatRouter from './routes/chat';
import boardsRouter from './routes/boards';
import notificationsRouter from './routes/notifications';
import { authenticateToken, socketAuthMiddleware } from './middleware/auth';
import usersRouter from './routes/users';
import friendsRouter from './routes/friends';
import eventsRouter from './routes/events';
import foldersRouter from './routes/folders';
import filesRouter from './routes/files';

dotenv.config(); // Cargar variables de entorno

const app: Application = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
});
app.set('io', io);

// 📌 Middleware global
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 📌 Verificar conexión con la base de datos antes de iniciar
async function startServer() {
  try {
    await prisma.$connect();
    console.log('✅ Conexión con la base de datos establecida');

    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      console.log(`🚀 Servidor iniciado en http://localhost:${PORT}/api`);
    }).on('error', (err) => {
      console.error('❌ Error al iniciar el servidor:', err);
    });
  } catch (error) {
    console.error('❌ No se pudo conectar a la base de datos:', error);
    process.exit(1);
  }
}

// 📌 Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 📌 Rutas de la API
app.use('/api/auth', authRouter);
app.use('/api/notes', authenticateToken, notesRouter);
app.use('/api/chats', authenticateToken, chatRouter);
app.use('/api/boards', authenticateToken, boardsRouter);
app.use('/api/notifications', authenticateToken, notificationsRouter);
app.use('/api/users', authenticateToken, usersRouter);
app.use('/api/friends', authenticateToken, friendsRouter);
app.use('/api/events', authenticateToken, eventsRouter);
app.use('/api/folders', authenticateToken, foldersRouter);
app.use('/api/upload', authenticateToken, filesRouter);

// 📌 Rutas no encontradas
app.use((req, res, next) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// 📌 Manejo de errores global
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

// 📌 Middleware de autenticación para WebSockets
io.use(socketAuthMiddleware);

// 📌 Eventos de WebSocket
io.on('connection', (socket) => {
  console.log(`⚡️ [WebSocket] Cliente conectado: ${socket.id}, Usuario: ${socket.data.userId}`);

  // Join personal room for user notifications
  socket.join(`user_${socket.data.userId}`);

  socket.on('joinChat', (chatId: string) => {
    socket.join(`chat_${chatId}`);
  });

  socket.on('chatMessage', async (data: { chatId: number; content: string; noteId?: number; fileUrl?: string }) => {
    try {
      const newMessage = await prisma.message.create({
        data: {
          content: data.content,
          chatId: data.chatId,
          senderId: socket.data.userId,
          noteId: data.noteId || null,
          fileUrl: data.fileUrl || null,
        },
        include: { sender: true },
      });

      io.to(`chat_${data.chatId}`).emit('chatMessage', newMessage);
      // Notificación en tiempo real para mensajes nuevos
      try {
        const chat = await prisma.chat.findUnique({
          where: { id: data.chatId },
          include: { users: { select: { id: true } }, isGroup: true, name: true }
        });
        if (chat) {
          const senderId = socket.data.userId;
          const roomName = `chat_${data.chatId}`;
          const room = io.sockets.adapter.rooms.get(roomName);
          const onlineInChatUserIds = new Set<number>();
          if (room) {
            for (const socketId of room) {
              const sock = io.sockets.sockets.get(socketId);
              if (sock && sock.data.userId) {
                onlineInChatUserIds.add(sock.data.userId);
              }
            }
          }
          for (const user of chat.users) {
            if (user.id !== senderId) {
              if (!onlineInChatUserIds.has(user.id)) {
                const messageText = chat.isGroup && chat.name ? `Nuevo mensaje en ${chat.name}` : `Nuevo mensaje de ${newMessage.sender.name}`;
                const notification = await prisma.notification.create({
                  data: {
                    userId: user.id,
                    message: messageText,
                    type: 'chat'
                  }
                });
                io.to(`user_${user.id}`).emit('notification', notification);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error al crear notificación de chat:', err);
      }
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      socket.emit('error', { message: 'No se pudo enviar el mensaje.' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

startServer();
