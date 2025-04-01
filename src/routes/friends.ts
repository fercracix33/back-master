import { Router, Request, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import eventBus from '../socket/eventBus';

const friendsRouter = Router();

// Enviar una solicitud de amistad
friendsRouter.post('/requests', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const { friendId } = req.body;

  if (!friendId || userId === Number(friendId)) {
    return res.status(400).json({ error: 'ID de amigo inválido.' });
  }

  try {
    const existingRequest = await prisma.friendRequest.findFirst({
      where: {
        fromId: userId,
        toId: Number(friendId)
      }
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'Ya existe una solicitud de amistad.' });
    }

    const newRequest = await prisma.friendRequest.create({
      data: {
        fromId: userId,
        toId: Number(friendId),
        status: 'PENDING'
      }
    });

    res.status(201).json(newRequest);
    eventBus.emit('friendRequestCreated', {
      fromUserId: userId,
      toUserId: Number(friendId),
      requestId: newRequest.id
    });

  } catch (error) {
    console.error('Error al enviar solicitud de amistad:', error);
    res.status(500).json({ error: 'Error interno al enviar la solicitud.' });
  }
}) as RequestHandler);

// Aceptar una solicitud de amistad y crear relación bidireccional
friendsRouter.patch('/requests/:id/accept', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const requestId = Number(req.params.id);

  if (isNaN(requestId)) {
    return res.status(400).json({ error: 'ID de solicitud inválido.' });
  }

  try {
    const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });

    if (!request || request.toId !== userId || request.status !== 'PENDING') {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada.' });
    }

    const updatedRequest = await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'ACCEPTED' }
    });

    // Crear la relación de amistad (doble entrada)
    await prisma.friendship.createMany({
      data: [
        { userId: request.fromId, friendId: userId },
        { userId: userId, friendId: request.fromId }
      ],
      skipDuplicates: true
    });

    res.json(updatedRequest);
    eventBus.emit('friendRequestAccepted', {
      requesterId: request.fromId,
      accepterId: userId
    });

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
    const request = await prisma.friendRequest.findUnique({ where: { id: requestId } });

    if (!request || request.toId !== userId || request.status !== 'PENDING') {
      return res.status(404).json({ error: 'Solicitud no encontrada o ya procesada.' });
    }

    await prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'REJECTED' }
    });

    res.json({ message: 'Solicitud de amistad rechazada.' });
  } catch (error) {
    console.error('Error al rechazar solicitud de amistad:', error);
    res.status(500).json({ error: 'Error interno al rechazar la solicitud.' });
  }
}) as RequestHandler);

// Listar solicitudes recibidas pendientes
friendsRouter.get('/requests/received', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const requests = await prisma.friendRequest.findMany({
      where: {
        toId: userId,
        status: 'PENDING'
      },
      include: {
        from: { select: { id: true, name: true } }
      }
    });

    res.json(requests);
  } catch (error) {
    console.error('Error al obtener solicitudes recibidas:', error);
    res.status(500).json({ error: 'Error interno al obtener solicitudes.' });
  }
}) as RequestHandler);

// Listar amigos actuales
friendsRouter.get('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const friendships = await prisma.friendship.findMany({
      where: { userId },
      include: {
        friend: { select: { id: true, name: true } }
      }
    });

    const friends = friendships.map((f: { friend: { id: number; name: string } }) => f.friend);
    res.json(friends);
  } catch (error) {
    console.error('Error al obtener amigos:', error);
    res.status(500).json({ error: 'Error interno al obtener la lista de amigos.' });
  }
}) as RequestHandler);

// Eliminar un amigo (relación bidireccional)
friendsRouter.delete('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const friendId = Number(req.params.id);

  if (isNaN(friendId)) {
    return res.status(400).json({ error: 'ID de amigo inválido.' });
  }

  try {
    const deleted = await prisma.friendship.deleteMany({
      where: {
        OR: [
          { userId, friendId },
          { userId: friendId, friendId: userId }
        ]
      }
    });

    if (deleted.count === 0) {
      return res.status(404).json({ error: 'Amistad no encontrada.' });
    }

    res.json({ message: 'Amistad eliminada correctamente.' });
  } catch (error) {
    console.error('Error al eliminar amigo:', error);
    res.status(500).json({ error: 'Error interno al eliminar amigo.' });
  }
}) as RequestHandler);


export default friendsRouter;
