import prisma from '../prisma/client';
import { Server as SocketIOServer } from 'socket.io';

export default function startScheduledNotificationWorker(io: SocketIOServer) {
  const intervalMs = 60 * 1000; // Cada 1 minuto

  const processNotifications = async () => {
    const now = new Date();

    try {
      const dueNotifications = await prisma.scheduledNotification.findMany({
        where: {
          sent: false,
          scheduledFor: { lte: now },
        }
      });

      for (const scheduled of dueNotifications) {
        // 1. Crear notificación real persistente
        const notification = await prisma.notification.create({
          data: {
            userId: scheduled.userId,
            message: scheduled.message,
            type: scheduled.type,
            scheduledFor: scheduled.scheduledFor,
          }
        });

        // 2. Emitir al socket del usuario
        io.to(`user_${scheduled.userId}`).emit('notification', notification);

        // 3. Marcar como enviada
        await prisma.scheduledNotification.update({
          where: { id: scheduled.id },
          data: { sent: true }
        });

        console.log(`🔔 Notificación enviada a user_${scheduled.userId}`);
      }
    } catch (err) {
      console.error('❌ Error al procesar notificaciones programadas:', err);
    }
  };

  // Iniciar loop
  setInterval(processNotifications, intervalMs);
  console.log('⏳ Scheduler de notificaciones programadas iniciado.');
}
