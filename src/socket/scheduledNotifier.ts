import prisma from '../prisma/client';
import { Server as SocketIOServer } from 'socket.io';

export default function startScheduledNotificationWorker(io: SocketIOServer) {
  const intervalMs = 60 * 1000; // Ejecutar cada 1 minuto

  const processNotifications = async () => {
    const now = new Date();
    console.log(`[🕐] Hora actual del servidor (UTC): ${now.toISOString()}`);

    try {
      const dueNotifications = await prisma.scheduledNotification.findMany({
        where: {
          sent: false,
          scheduledFor: { lte: now },
        }
      }) as { id: number; userId: number; message: string; type: string; scheduledFor: Date }[];

      console.log(`[🔍] Notificaciones vencidas encontradas: ${dueNotifications.length}`);

      dueNotifications.forEach(n => {
        const estado = n.scheduledFor <= now ? '✔️' : '⛔️';
        console.log(`  ${estado} ID ${n.id} - scheduledFor: ${n.scheduledFor.toISOString()} <= now: ${now.toISOString()}`);
      });

      for (const scheduled of dueNotifications) {
        console.log(`[📬] Procesando notificación ID ${scheduled.id} para usuario ${scheduled.userId}`);

        try {
          // Crear notificación persistente
          const notification = await prisma.notification.create({
            data: {
              userId: scheduled.userId,
              message: scheduled.message,
              type: scheduled.type,
              scheduledFor: scheduled.scheduledFor,
            }
          });

          console.log(`[💾] Notificación creada (ID: ${notification.id})`);

          // Emitir por socket si está conectado
          io.to(`user_${scheduled.userId}`).emit('notification', notification);
          console.log(`[📡] Emitida a user_${scheduled.userId}`);

          // Marcar como enviada
          await prisma.scheduledNotification.update({
            where: { id: scheduled.id },
            data: { sent: true }
          });

          console.log(`[✅] Marcada como enviada (ID: ${scheduled.id})`);
        } catch (error) {
          console.error(`❌ Error procesando notificación ${scheduled.id}:`, error);
        }
      }
    } catch (err) {
      console.error('❌ Error global en procesamiento de notificaciones:', err);
    }
  };

  setInterval(processNotifications, intervalMs);
  console.log('⏳ Scheduler de notificaciones programadas iniciado.');
}
