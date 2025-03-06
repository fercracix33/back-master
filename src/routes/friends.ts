import { Router, Request, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const friendsRouter = Router();

// Enviar una solicitud de amistad
friendsRouter.post('/requests', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const { friendId } = req.body;

  if (!friendId || userId === Number(friendId)) {
    return res.status(400).json({ error: 'ID de amigo inválido.' });
  }

  try {
    const existingRequest = await prisma.friendship.findFirst({
      where: { userId, friendId: Number(friendId) }
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'Ya existe una solicitud de amistad.' });
    }

    const newRequest = await prisma.friendship.create({
      data: {
        userId,
        friendId: Number(friendId),
        status: 'pending'
      }
    });

    res.status(201).json(newRequest);
  } catch (error) {
    console.error('Error al enviar solicitud de amistad:', error);
    res.status(500).json({ error: 'Error interno al enviar la solicitud.' });
  }
}) as RequestHandler);

// Aceptar una solicitud de amistad
friendsRouter.patch('/requests/:id/accept', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const requestId = Number(req.params.id);

  if (isNaN(requestId)) {
    return res.status(400).json({ error: 'ID de solicitud inválido.' });
  }

  try {
    const request = await prisma.friendship.findUnique({ where: { id: requestId } });

    if (!request || request.friendId !== userId || request.status !== 'pending') {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada.' });
    }

    const updatedRequest = await prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'accepted' }
    });

    res.json(updatedRequest);
  } catch (error) {
    console.error('Error al aceptar solicitud de amistad:', error);
    res.status(500).json({ error: 'Error interno al aceptar la solicitud.' });
  }
}) as RequestHandler);

// Rechazar una solicitud de amistad
friendsRouter.patch('/requests/:id/reject', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const requestId = Number(req.params.id);

  if (isNaN(requestId)) {
    return res.status(400).json({ error: 'ID de solicitud inválido.' });
  }

  try {
    const request = await prisma.friendship.findUnique({ where: { id: requestId } });

    if (!request || request.friendId !== userId || request.status !== 'pending') {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada.' });
    }

    await prisma.friendship.update({
      where: { id: requestId },
      data: { status: 'rejected' }
    });

    res.json({ message: 'Solicitud de amistad rechazada.' });
  } catch (error) {
    console.error('Error al rechazar solicitud de amistad:', error);
    res.status(500).json({ error: 'Error interno al rechazar la solicitud.' });
  }
}) as RequestHandler);

// Listar amigos del usuario
friendsRouter.get('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ userId, status: 'accepted' }, { friendId: userId, status: 'accepted' }]
      },
      include: {
        user: { select: { id: true, name: true } },
        friend: { select: { id: true, name: true } }
      }
    });

    const friends = friendships.map((fr: { userId: number; friend: { id: number; name: string }; user: { id: number; name: string } }) => 
      fr.userId === userId ? fr.friend : fr.user
    );

    res.json(friends);
  } catch (error) {
    console.error('Error al obtener amigos:', error);
    res.status(500).json({ error: 'Error interno al obtener la lista de amigos.' });
  }
}) as RequestHandler);

// Eliminar un amigo
friendsRouter.delete('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const friendId = Number(req.params.id);

  if (isNaN(friendId)) {
    return res.status(400).json({ error: 'ID de amigo inválido.' });
  }

  try {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId, friendId, status: 'accepted' },
          { userId: friendId, friendId: userId, status: 'accepted' }
        ]
      }
    });

    if (!friendship) {
      return res.status(404).json({ error: 'Amistad no encontrada.' });
    }

    await prisma.friendship.delete({ where: { id: friendship.id } });

    res.json({ message: 'Amistad eliminada correctamente.' });
  } catch (error) {
    console.error('Error al eliminar amigo:', error);
    res.status(500).json({ error: 'Error interno al eliminar amigo.' });
  }
}) as RequestHandler);

export default friendsRouter;
