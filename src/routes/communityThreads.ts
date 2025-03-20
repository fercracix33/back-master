import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const communityThreadsRouter = Router();

// 📌 Crear un hilo en una comunidad
communityThreadsRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { communityId, title, content } = req.body;
  const userId = req.user?.userId;

  if (!communityId || !title || !content) {
    res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
    return;
  }

  try {
    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'No perteneces a esta comunidad.' });
      return;
    }

    const thread = await prisma.communityThread.create({
      data: {
        communityId,
        title,
        content,
        authorId: userId,
      },
    });

    res.status(201).json(thread);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear hilo.' });
  }
});

// 📌 Obtener todos los hilos de una comunidad
communityThreadsRouter.get('/:communityId', async (req: AuthRequest, res: Response) => {
  const communityId = Number(req.params.communityId);
  const userId = req.user?.userId;

  try {
    const community = await prisma.community.findUnique({ where: { id: communityId } });

    if (!community) {
      res.status(404).json({ error: 'Comunidad no encontrada.' });
      return;
    }

    if (community.visibility === 'PRIVATE') {
      const membership = await prisma.communityMembership.findUnique({
        where: { userId_communityId: { userId, communityId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'No tienes acceso a los hilos de esta comunidad.' });
        return;
      }
    }

    const threads = await prisma.communityThread.findMany({
      where: { communityId },
      include: { author: { select: { id: true, name: true } }, comments: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(threads);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener hilos.' });
  }
});

// 📌 Obtener detalles de un hilo específico
communityThreadsRouter.get('/thread/:threadId', async (req: AuthRequest, res: Response) => {
  const threadId = Number(req.params.threadId);

  try {
    const thread = await prisma.communityThread.findUnique({
      where: { id: threadId },
      include: {
        author: { select: { id: true, name: true } },
        comments: { include: { author: { select: { id: true, name: true } } } },
      },
    });

    if (!thread) {
      res.status(404).json({ error: 'Hilo no encontrado.' });
      return;
    }

    res.json(thread);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener detalles del hilo.' });
  }
});

// 📌 Comentar en un hilo
communityThreadsRouter.post('/:threadId/comments', async (req: AuthRequest, res: Response) => {
  const threadId = Number(req.params.threadId);
  const userId = req.user?.userId;
  const { content } = req.body;

  if (!content) {
    res.status(400).json({ error: 'El comentario no puede estar vacío.' });
    return;
  }

  try {
    const thread = await prisma.communityThread.findUnique({ where: { id: threadId } });

    if (!thread) {
      res.status(404).json({ error: 'Hilo no encontrado.' });
      return;
    }

    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: thread.communityId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'No tienes permiso para comentar en este hilo.' });
      return;
    }

    const comment = await prisma.communityThreadComment.create({
      data: {
        threadId,
        content,
        authorId: userId,
      },
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al añadir comentario.' });
  }
});

// 📌 Eliminar un hilo
communityThreadsRouter.delete('/thread/:threadId', async (req: AuthRequest, res: Response) => {
  const threadId = Number(req.params.threadId);
  const userId = req.user?.userId;

  try {
    const thread = await prisma.communityThread.findUnique({ where: { id: threadId } });

    if (!thread) {
      res.status(404).json({ error: 'Hilo no encontrado.' });
      return;
    }

    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: thread.communityId } },
    });

    if (!membership || (membership.role === 'MEMBER' && thread.authorId !== userId)) {
      res.status(403).json({ error: 'No tienes permiso para eliminar este hilo.' });
      return;
    }

    await prisma.communityThread.delete({ where: { id: threadId } });

    res.json({ message: 'Hilo eliminado correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar hilo.' });
  }
});

export default communityThreadsRouter;
