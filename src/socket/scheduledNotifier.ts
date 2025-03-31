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
        console.log(`[📬] Procesando notificación programada ID ${scheduled.id} para user ${scheduled.userId}`);
      
        try {
          // 1. Crear la notificación persistente
          const notification = await prisma.notification.create({
            data: {
              userId: scheduled.userId,
              message: scheduled.message,
              type: scheduled.type,
              scheduledFor: scheduled.scheduledFor
            }
          });
      
          console.log(`[💾] Notificación persistente creada (ID: ${notification.id})`);
      
          // 2. Emitir al usuario si está conectado
          io.to(`user_${scheduled.userId}`).emit('notification', notification);
          console.log(`[📡] Notificación emitida a user_${scheduled.userId}`);
      
          // 3. Marcar como enviada
          await prisma.scheduledNotification.update({
            where: { id: scheduled.id },
            data: { sent: true }
          });
      
          console.log(`[✅] Notificación marcada como enviada (ID: ${scheduled.id})`);
        } catch (error) {
          console.error(`❌ Error al procesar notificación ID ${scheduled.id}:`, error);
        }
      }
      
    } catch (err) {
      console.error('❌ Error al procesar notificaciones programadas:', err);
    }
  };

  // Iniciar loop
  setInterval(processNotifications, intervalMs);
  console.log('⏳ Scheduler de notificaciones programadas iniciado.');
}
