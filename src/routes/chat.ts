import { Router, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const chatRouter = Router();

// Crear un nuevo chat (privado o grupal)
const createChat: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const { isGroup, name, participantIds } = req.body;

  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    res.status(400).json({ error: 'Debe proveer participantes para el chat.' });
    return;
  }

  try {
    // Convertir los IDs a números y asegurar que el usuario actual esté incluido
    const participants = participantIds.map(Number);
    if (!participants.includes(userId)) {
      participants.push(userId);
    }

    // Crear chat en la base de datos
    const newChat = await prisma.chat.create({
      data: {
        name: isGroup ? name : null,
        isGroup: Boolean(isGroup),
        users: {
          connect: participants.map(id => ({ id })) // Conecta los usuarios en la tabla intermedia
        }
      },
      include: {
        users: { select: { id: true, name: true } }
      }
    });

    res.status(201).json(newChat);
  } catch (error) {
    console.error('Error al crear el chat:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Obtener lista de chats del usuario autenticado
const getChats: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;

  try {
    const chats = await prisma.chat.findMany({
      where: {
        users: {
          some: { id: userId } // Filtra chats donde el usuario está presente
        }
      },
      include: {
        users: { select: { id: true, name: true } },
        messages: { 
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { sender: { select: { name: true } } }
        }
      }
    });

    res.json(chats);
  } catch (error) {
    console.error('Error al obtener los chats:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Obtener mensajes de un chat específico
const getChatMessages: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const chatId = Number(req.params.chatId);

  if (isNaN(chatId)) {
    res.status(400).json({ error: 'ID de chat inválido.' });
    return;
  }

  try {
    // Verificar que el usuario es miembro del chat
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { users: { select: { id: true } } }
    });

    if (!chat) {
      res.status(404).json({ error: 'Chat no encontrado.' });
      return;
    }

    const isMember = chat.users.some(u => u.id === userId);
    if (!isMember) {
      res.status(403).json({ error: 'No tienes permiso para acceder a este chat.' });
      return;
    }

    // Obtener mensajes (podríamos agregar paginación con `skip`, `take`)
    const messages = await prisma.message.findMany({
      where: { chatId },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, name: true } }, note: true }
    });

    res.json(messages);
  } catch (error) {
    console.error('Error al obtener mensajes del chat:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Asignar las funciones a las rutas
chatRouter.post('/', createChat);
chatRouter.get('/', getChats);
chatRouter.get('/:chatId/messages', getChatMessages);

export default chatRouter;
