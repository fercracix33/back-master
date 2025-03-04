import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';

// Importamos Prisma y routers
import prisma from './prisma/client';
import authRouter from './routes/auth';
import notesRouter from './routes/notes';
import chatRouter from './routes/chat';
import boardsRouter from './routes/boards';
import notificationsRouter from './routes/notifications';
import { authenticateToken, socketAuthMiddleware } from './middleware/auth';

// 📌 Configurar variables de entorno
dotenv.config();

const app: Application = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' } // Permite cualquier origen para WebSockets
});
// 📌 Middleware global
app.use(cors({
  origin: '*', // Permite cualquier origen temporalmente
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// 📌 Endpoint de salud para comprobar si la API está activa
app.get('/api/health', (req, res) => {
  res.json({ status: "ok" });
});

// 📌 Rutas de la API
app.use('/api/auth', authRouter);
app.use('/api/notes', authenticateToken, notesRouter);
app.use('/api/chats', authenticateToken, chatRouter);
app.use('/api/boards', authenticateToken, boardsRouter);
app.use('/api/notifications', authenticateToken, notificationsRouter);

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

// 📌 Iniciar servidor
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en http://localhost:${PORT}/api`);
});
