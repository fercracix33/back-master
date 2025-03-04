import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import prisma from './prisma/client';
import authRouter from './routes/auth';
import notesRouter from './routes/notes';
import chatRouter from './routes/chat';
import boardsRouter from './routes/boards';
import notificationsRouter from './routes/notifications';
import { authenticateToken, socketAuthMiddleware } from './middleware/auth';

dotenv.config(); // Cargar variables de entorno antes de cualquier otro código

const app: Application = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
});

// 📌 Middleware global
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: '*', // Permite cualquier origen temporalmente
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// 📌 Verificar conexión con la base de datos antes de iniciar el servidor
async function startServer() {
  try {
    await prisma.$connect();
    console.log('✅ Conexión con la base de datos establecida');
    
    // 📌 Iniciar servidor
    const PORT = process.env.PORT || 4000;
    server.listen(PORT, () => {
      console.log(`🚀 Servidor iniciado en http://localhost:${PORT}/api`);
    }).on('error', (err) => {
      console.error('❌ Error al iniciar el servidor:', err);
    });
  } catch (error) {
    console.error('❌ No se pudo conectar a la base de datos:', error);
    process.exit(1); // Detiene la ejecución si hay error
  }
}

// 📌 Endpoint de salud para comprobar si la API está activa
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// 📌 Rutas de la API
app.use('/api/auth', authRouter);
app.use('/api/notes', authenticateToken, notesRouter);
app.use('/api/chats', authenticateToken, chatRouter);
app.use('/api/boards', authenticateToken, boardsRouter);
app.use('/api/notifications', authenticateToken, notificationsRouter);

// 📌 Manejo de rutas no encontradas
app.use((req, res, next) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// 📌 Manejo de errores centralizado
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});

// 📌 Middleware de autenticación para WebSockets
io.use(socketAuthMiddleware);

// 📌 Eventos de WebSocket
io.on('connection', (socket) => {
  console.log(`⚡️ [WebSocket] Cliente conectado: ${socket.id}, Usuario: ${socket.data.userId}`);

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
