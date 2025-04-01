import { Router, Request, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const eventsRouter = Router();

// Mapa en memoria para temporizadores de notificaciones programadas
const eventTimeouts: Map<number, NodeJS.Timeout> = new Map();

// Crear un nuevo evento de calendario
eventsRouter.post('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const { title, description, date, startTime, endTime, category, color, participants, reminderMinutes } = req.body;

  if (!title || !date || !startTime || !endTime) {
    return res.status(400).json({ error: 'Título, fecha, hora de inicio y fin son obligatorios.' });
  }

  try {
    let participantIds: number[] = [];
    if (Array.isArray(participants)) {
      participantIds = participants.map((id: any) => Number(id)).filter(id => id !== userId);
    }

    participantIds.push(userId);
    participantIds = Array.from(new Set(participantIds));

    const newEvent = await prisma.event.create({
      data: {
        title,
        description: description || null,
        date: new Date(date),
        startTime,
        endTime,
        category: category || null,
        color: color || null,
        reminderMinutes: reminderMinutes != null ? Number(reminderMinutes) : 1440,
        ownerId: userId,
        participants: {
          connect: participantIds.map(id => ({ id }))
        }
      },
      include: {
        participants: { select: { id: true, name: true } }
      }
    });

    // Programar notificaciones diferidas (hora local real)
    try {
      const eventDateParts = newEvent.date.toISOString().split('T')[0].split('-');
      const [year, month, day] = eventDateParts.map(Number);
      const [hour, minute] = newEvent.startTime.split(':').map(Number);

      const eventStart = new Date(year, month - 1, day, hour, minute);
      const reminderMs = (newEvent.reminderMinutes || 1440) * 60 * 1000;
      const scheduledForUTC = new Date(eventStart.getTime() - reminderMs);

      console.log(`[🕒] Hora del evento (local interpretado): ${eventStart.toISOString()}`);
      console.log(`[⏰] Notificación programada para (UTC): ${scheduledForUTC.toISOString()}`);

      const scheduledNotificationsData = newEvent.participants.map((participant: { id: number }) => ({
        userId: participant.id,
        message: `Recordatorio: tienes el evento "${newEvent.title}" el ${newEvent.date.toISOString().split('T')[0]} a las ${newEvent.startTime}.`,
        type: 'EVENT',
        scheduledFor: scheduledForUTC
      }));

      await prisma.scheduledNotification.createMany({
        data: scheduledNotificationsData
      });

      console.log(`📅 Notificaciones programadas creadas para las ${scheduledForUTC.toISOString()}`);
    } catch (notifError) {
      console.error('❌ Error al programar notificaciones:', notifError);
    }

    res.status(201).json(newEvent);
  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(500).json({ error: 'Error interno al crear el evento.' });
  }
}) as RequestHandler);

// Obtener eventos del usuario (personales y compartidos)
eventsRouter.get('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const events = await prisma.event.findMany({
      where: {
        participants: { some: { id: userId } }
      },
      include: {
        owner: { select: { id: true, name: true } },
        participants: { select: { id: true, name: true } }
      }
    });
    res.json(events);
  } catch (error) {
    console.error('Error al obtener eventos:', error);
    res.status(500).json({ error: 'Error interno al obtener eventos.' });
  }
}) as RequestHandler);

// Obtener un evento específico (si el usuario es participante)
eventsRouter.get('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const eventId = Number(req.params.id);

  if (isNaN(eventId)) {
    return res.status(400).json({ error: 'ID de evento inválido.' });
  }

  try {
    const event = await prisma.event.findFirst({
      where: {
        id: eventId,
        participants: { some: { id: userId } }
      },
      include: {
        owner: { select: { id: true, name: true } },
        participants: { select: { id: true, name: true } }
      }
    });

    if (!event) {
      res.status(404).json({ error: 'Evento no encontrado o no tienes acceso.' });
      return;
    }

    res.json(event);
  } catch (error) {
    console.error('Error al obtener evento:', error);
    res.status(500).json({ error: 'Error interno al obtener evento' });
  }
}) as RequestHandler);

// Actualizar un evento existente (solo el propietario)
eventsRouter.patch('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const eventId = Number(req.params.id);

  if (isNaN(eventId)) {
    return res.status(400).json({ error: 'ID de evento inválido.' });
  }

  const { title, description, date, startTime, endTime, category, color, participants, reminderMinutes } = req.body;

  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } });

    if (!event) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }
    if (event.ownerId !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este evento.' });
    }

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        title,
        description,
        date: date ? new Date(date) : event.date,
        startTime,
        endTime,
        category,
        color,
        reminderMinutes,
        participants: participants ? { set: participants.map((id: any) => ({ id: Number(id) })) } : undefined
      },
      include: {
        owner: { select: { id: true, name: true } },
        participants: { select: { id: true, name: true } }
      }
    });

    res.json(updatedEvent);
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    res.status(500).json({ error: 'Error interno al actualizar evento.' });
  }
}) as RequestHandler);

// Eliminar un evento (solo el propietario)
eventsRouter.delete('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const eventId = Number(req.params.id);

  if (isNaN(eventId)) {
    return res.status(400).json({ error: 'ID de evento inválido.' });
  }

  try {
    const event = await prisma.event.findUnique({ where: { id: eventId } });

    if (!event) {
      return res.status(404).json({ error: 'Evento no encontrado.' });
    }
    if (event.ownerId !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este evento.' });
    }

    await prisma.event.delete({ where: { id: eventId } });

    res.json({ message: 'Evento eliminado.' });
  } catch (error) {
    console.error('Error al eliminar evento:', error);
    res.status(500).json({ error: 'Error interno al eliminar evento.' });
  }
}) as RequestHandler);

export default eventsRouter;
