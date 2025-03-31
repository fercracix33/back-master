import { Router, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const notificationsRouter = Router();

// Obtener notificaciones del usuario (p. ej. no leídas primero)
const getNotifications: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    });
    res.json(notifications);
  } catch (error) {
    console.error('Error obteniendo notificaciones:', error);
    res.status(500).json({ error: 'Error obteniendo notificaciones' });
  }
};

// Marcar una notificación como leída
const markNotificationAsRead: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const notifId = Number(req.params.id);

  if (isNaN(notifId)) {
    res.status(400).json({ error: 'ID de notificación inválido.' });
    return;
  }

  try {
    const notif = await prisma.notification.updateMany({
      where: { id: notifId, userId },
      data: { isRead: true }
    });

    if (notif.count === 0) {
      res.status(404).json({ error: 'Notificación no encontrada o no autorizada' });
      return;
    }

    res.json({ message: 'Notificación marcada como leída' });
  } catch (error) {
    console.error('Error actualizando notificación:', error);
    res.status(500).json({ error: 'Error actualizando notificación' });
  }
};

// Borrar notificación
const deleteNotification: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const notifId = Number(req.params.id);

  if (isNaN(notifId)) {
    res.status(400).json({ error: 'ID de notificación inválido.' });
    return;
  }

  try {
    const deleted = await prisma.notification.deleteMany({
      where: { id: notifId, userId }
    });

    if (deleted.count === 0) {
      res.status(404).json({ error: 'Notificación no encontrada o no autorizada' });
      return;
    }

    res.json({ message: 'Notificación eliminada' });
  } catch (error) {
    console.error('Error eliminando notificación:', error);
    res.status(500).json({ error: 'Error eliminando notificación' });
  }
};

// Asignar las funciones a las rutas
notificationsRouter.get('/', getNotifications);
notificationsRouter.patch('/:id/read', markNotificationAsRead);
notificationsRouter.delete('/:id', deleteNotification);


// 📌 Ruta de prueba: Crear notificación manualmente
notificationsRouter.post('/debug/create-test', (async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        message: '🔔 Notificación de prueba',
        type: 'EVENT',
        scheduledFor: new Date(),
      },
    });

    res.status(201).json({ message: 'Notificación creada', notification });
  } catch (error) {
    console.error('❌ Error creando notificación:', error);
    res.status(500).json({ error: 'Error interno al crear la notificación' });
  }
}) as RequestHandler);


export default notificationsRouter;
