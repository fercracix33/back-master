import prisma from '../prisma/client';
import { Server as SocketIOServer } from 'socket.io';

export default function startScheduledNotificationWorker(io: SocketIOServer) {
  const intervalMs = 60 * 1000; // Ejecutar cada minuto

  const processNotifications = async () => {
    const now = new Date(); // hora del sistema en UTC
    console.log(`[🕐] Hora actual del servidor (UTC): ${now.toISOString()}`);
    console.log(`[🖥️] Timezone detectada: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);

    try {
      const dueNotifications = await prisma.scheduledNotification.findMany({
        where: {
          sent: false,
          scheduledFor: {
            lte: now // Solo aquellas que ya deben ejecutarse
          }
        }
      });

      console.log(`[🔍] Notificaciones pendientes encontradas: ${dueNotifications.length}`);

      for (const notif of dueNotifications) {
        const { id, userId, message, type, scheduledFor } = notif;

        const isDue = scheduledFor <= now;
        const estado = isDue ? '✔️' : '⛔️';
        console.log(`  ${estado} ID ${id} - scheduledFor: ${scheduledFor.toISOString()} (<= ahora: ${now.toISOString()})`);

        if (!isDue) continue;

        try {
          const notification = await prisma.notification.create({
            data: {
              userId,
              message,
              type,
              scheduledFor
            }
          });

          console.log(`[💾] Notificación persistente creada (ID: ${notification.id})`);

          io.to(`user_${userId}`).emit('notification', notification);
          console.log(`[📡] Emitida a user_${userId}`);

          await prisma.scheduledNotification.update({
            where: { id },
            data: { sent: true }
          });

          console.log(`[✅] Marcada como enviada (ID: ${id})`);
        } catch (error) {
          console.error(`❌ Error al procesar notificación ID ${id}:`, error);
        }
      }
    } catch (err) {
      console.error('❌ Error al buscar notificaciones pendientes:', err);
    }
  };

  setInterval(processNotifications, intervalMs);
  console.log('⏳ Scheduler de notificaciones programadas iniciado.');
}
