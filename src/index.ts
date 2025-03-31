import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import { Server as SocketIOServer } from 'socket.io';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs-extra';
import prisma from './prisma/client';
import { createClient } from '@supabase/supabase-js';
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
import communitiesRouter from './routes/communities';
import communityResourcesRouter from './routes/communityResources';
import communityThreadsRouter from './routes/communityThreads';
import tagsRouter from './routes/tags';
import configureSockets from './socket/index';
import startScheduledNotificationWorker from './socket/scheduledNotifier';

dotenv.config(); // Cargar variables de entorno

// 📌 Configurar Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'uploads';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const app: Application = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
});

app.set('io', io);
configureSockets(io);
startScheduledNotificationWorker(io);
// 📌 Middleware global
const localStoragePath = process.env.LOCAL_STORAGE_PATH || path.join(__dirname, '..', 'notas-locales');
fs.ensureDirSync(localStoragePath);
app.use('/uploads', express.static(localStoragePath));
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
app.use('/api/files', authenticateToken, filesRouter);
app.use('/api/communities', authenticateToken, communitiesRouter);
app.use('/api/community-resources', authenticateToken, communityResourcesRouter);
app.use('/api/community-threads', authenticateToken, communityThreadsRouter);
app.use('/api/tags', authenticateToken, tagsRouter);

// 📌 Rutas no encontradas
app.use((req, res, next) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// 📌 Manejo de errores global
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno del servidor' });
});



startServer();
