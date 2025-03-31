import { Router, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import eventBus from '../socket/eventBus';


const communityThreadsRouter = Router();

// 📌 Obtener detalles de un hilo específico
communityThreadsRouter.get('/thread/:threadId', (async (req: AuthRequest, res: Response) => {
  const threadId = Number(req.params.threadId);
  console.log('[GET] Obtener detalles del hilo:', threadId);

  if (isNaN(threadId)) {
    return res.status(400).json({ error: 'ID de hilo inválido.' });
  }

  try {
    const thread = await prisma.communityThread.findUnique({
      where: { id: threadId },
      include: {
        author: { select: { id: true, name: true } },
        comments: { include: { author: { select: { id: true, name: true } } } },
      },
    });

    if (!thread) return res.status(404).json({ error: 'Hilo no encontrado.' });

    res.json(thread);
  } catch (error) {
    console.error('❌ Error al obtener detalles del hilo:', error);
    res.status(500).json({ error: 'Error al obtener detalles del hilo.' });
  }
}) as RequestHandler);

// 📌 Eliminar un hilo
communityThreadsRouter.delete('/thread/:threadId', (async (req: AuthRequest, res: Response) => {
  const threadId = Number(req.params.threadId);
  const userId = req.user?.userId;
  console.log('[DELETE] Eliminar hilo:', { threadId, userId });

  if (!userId) return res.status(401).json({ error: 'No autenticado.' });
  if (isNaN(threadId)) return res.status(400).json({ error: 'ID de hilo inválido.' });

  try {
    const thread = await prisma.communityThread.findUnique({ where: { id: threadId } });
    if (!thread) return res.status(404).json({ error: 'Hilo no encontrado.' });

    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: thread.communityId } },
    });

    if (!membership || (membership.role === 'MEMBER' && thread.authorId !== userId)) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este hilo.' });
    }

    await prisma.communityThread.delete({ where: { id: threadId } });

    console.log('[DELETE] Hilo eliminado');
    res.json({ message: 'Hilo eliminado correctamente.' });
  } catch (error) {
    console.error('❌ Error al eliminar hilo:', error);
    res.status(500).json({ error: 'Error interno al eliminar hilo.' });
  }
}) as RequestHandler);

// 📌 Comentar en un hilo
communityThreadsRouter.post('/:threadId/comments', (async (req: AuthRequest, res: Response) => {
  const threadId = Number(req.params.threadId);
  const userId = req.user?.userId;
  const { content } = req.body;

  console.log('[POST] Comentar hilo:', { threadId, userId, content });

  if (!userId) return res.status(401).json({ error: 'No autenticado.' });
  if (isNaN(threadId)) return res.status(400).json({ error: 'ID de hilo inválido.' });
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'El comentario no puede estar vacío.' });
  }

  try {
    const thread = await prisma.communityThread.findUnique({
      where: { id: threadId },
    });

    if (!thread) {
      return res.status(404).json({ error: 'Hilo no encontrado.' });
    }

    const membership = await prisma.communityMembership.findUnique({
      where: {
        userId_communityId: {
          userId,
          communityId: thread.communityId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'No tienes permiso para comentar en este hilo.' });
    }

    // ✅ Modelo corregido: prisma.threadComment
    const comment = await prisma.threadComment.create({
      data: {
        threadId: thread.id,
        content: content.trim(),
        authorId: userId,
      },
    });

    console.log('[POST] Comentario creado:', comment);
    res.status(201).json(comment);
    eventBus.emit('threadCommentCreated', {
      threadId: thread.id,
      commenterId: userId
    });
    
  } catch (error) {
    console.error('❌ Error al comentar en el hilo:', error);
    res.status(500).json({ error: 'Error interno al añadir comentario.' });
  }
}) as RequestHandler);


// 📌 Crear un hilo en una comunidad
communityThreadsRouter.post('/', (async (req: AuthRequest, res: Response) => {
  const { communityId, title, content } = req.body;
  const userId = req.user?.userId;
  console.log('[POST] Crear hilo:', { communityId, title, userId, content });

  if (!userId) return res.status(401).json({ error: 'No autenticado.' });
  if (!communityId || !title || !content) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
  }

  try {
    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'No perteneces a esta comunidad.' });
    }

    const thread = await prisma.communityThread.create({
      data: {
        communityId,
        title,
        content,
        authorId: userId,
      },
    });

    console.log('[POST] Hilo creado:', thread);
    res.status(201).json(thread);
  } catch (error) {
    console.error('❌ Error al crear hilo:', error);
    res.status(500).json({ error: 'Error al crear hilo.' });
  }
}) as RequestHandler);

// 📌 Obtener todos los hilos de una comunidad (última ruta para evitar conflictos)
communityThreadsRouter.get('/:communityId', (async (req: AuthRequest, res: Response) => {
  const communityId = Number(req.params.communityId);
  const userId = req.user?.userId;
  console.log('[GET] Obtener hilos de comunidad:', { communityId, userId });

  if (isNaN(communityId)) {
    return res.status(400).json({ error: 'ID de comunidad inválido.' });
  }

  try {
    const community = await prisma.community.findUnique({ where: { id: communityId } });
    if (!community) return res.status(404).json({ error: 'Comunidad no encontrada.' });

    if (community.visibility === 'PRIVATE') {
      const membership = await prisma.communityMembership.findUnique({
        where: { userId_communityId: { userId, communityId } },
      });

      if (!membership) {
        return res.status(403).json({ error: 'No tienes acceso a los hilos de esta comunidad.' });
      }
    }

    const threads = await prisma.communityThread.findMany({
      where: { communityId },
      include: {
        author: { select: { id: true, name: true } },
        comments: { include: { author: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    console.log('[GET] Hilos encontrados:', threads.length);
    res.json(threads);
  } catch (error) {
    console.error('❌ Error al obtener hilos:', error);
    res.status(500).json({ error: 'Error interno al obtener hilos.' });
  }
}) as RequestHandler);

export default communityThreadsRouter;
