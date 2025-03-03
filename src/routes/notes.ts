import { Router, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const notesRouter = Router();

// Obtener todas las notas públicas (explorar)
const getPublicNotes: RequestHandler = async (req, res): Promise<void> => {
  try {
    const publicNotes = await prisma.note.findMany({
      where: { isPublic: true },
      include: {
        author: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(publicNotes);
  } catch (error) {
    console.error('Error obteniendo notas públicas:', error);
    res.status(500).json({ error: 'Error obteniendo notas públicas' });
  }
};

// Obtener detalles de una nota pública por ID
const getPublicNoteById: RequestHandler = async (req, res): Promise<void> => {
  const noteId = Number(req.params.id);
  if (isNaN(noteId)) {
    res.status(400).json({ error: 'ID de nota inválido.' });
    return;
  }
  try {
    const note = await prisma.note.findFirst({
      where: { id: noteId, isPublic: true },
      include: {
        author: { select: { name: true, id: true } }
      }
    });
    if (!note) {
      res.status(404).json({ error: 'Nota no encontrada o no es pública' });
      return;
    }
    res.json(note);
  } catch (error) {
    console.error('Error obteniendo la nota:', error);
    res.status(500).json({ error: 'Error obteniendo la nota' });
  }
};

// Crear una nueva nota (pública o privada)
const createNote: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const { title, content, isPublic, folderId } = req.body;

  if (!title || !content) {
    res.status(400).json({ error: 'Título y contenido son requeridos.' });
    return;
  }

  try {
    const newNote = await prisma.note.create({
      data: {
        title,
        content,
        isPublic: isPublic || false,
        authorId: userId,
        folderId: folderId || null
      }
    });
    res.status(201).json(newNote);
  } catch (error) {
    console.error('Error al crear la nota:', error);
    res.status(500).json({ error: 'No se pudo crear la nota' });
  }
};

// Actualizar una nota propia
const updateNote: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const noteId = Number(req.params.id);
  const { title, content, isPublic, folderId } = req.body;

  if (isNaN(noteId)) {
    res.status(400).json({ error: 'ID de nota inválido.' });
    return;
  }

  try {
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note || note.authorId !== userId) {
      res.status(404).json({ error: 'Nota no encontrada o sin permisos para editar.' });
      return;
    }

    const updated = await prisma.note.update({
      where: { id: noteId },
      data: { title, content, isPublic, folderId }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error al actualizar la nota:', error);
    res.status(500).json({ error: 'Error al actualizar la nota' });
  }
};

// Dar "like" a una nota pública
const likeNote: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const noteId = Number(req.params.id);

  if (isNaN(noteId)) {
    res.status(400).json({ error: 'ID de nota inválido.' });
    return;
  }

  try {
    const note = await prisma.note.update({
      where: { id: noteId },
      data: {
        likes: { increment: 1 }
      }
    });

    await prisma.notification.create({
      data: {
        userId: note.authorId,
        message: `A ${userId} le gustó tu nota "${note.title}"`,
        type: "social"
      }
    });

    res.json({ message: 'Nota valorada con éxito' });
  } catch (error) {
    console.error('Error al dar like a la nota:', error);
    res.status(500).json({ error: 'No se pudo dar like a la nota' });
  }
};

// Copiar una nota pública a "Mis Notas"
const copyNote: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const noteId = Number(req.params.id);

  if (isNaN(noteId)) {
    res.status(400).json({ error: 'ID de nota inválido.' });
    return;
  }

  try {
    const original = await prisma.note.findFirst({
      where: { id: noteId, isPublic: true }
    });

    if (!original) {
      res.status(404).json({ error: 'Nota pública no encontrada' });
      return;
    }

    const copied = await prisma.note.create({
      data: {
        title: original.title,
        content: original.content,
        isPublic: false,
        authorId: userId
      }
    });

    res.status(201).json({ message: 'Nota copiada a tus notas', note: copied });
  } catch (error) {
    console.error('Error al copiar la nota:', error);
    res.status(500).json({ error: 'Error al copiar la nota' });
  }
};

// Obtener "Mis Notas" (notas privadas del usuario autenticado)
const getMyNotes: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;

  try {
    const myNotes = await prisma.note.findMany({
      where: { authorId: userId, isPublic: false },
      include: { folder: true }
    });

    res.json(myNotes);
  } catch (error) {
    console.error('Error obteniendo tus notas:', error);
    res.status(500).json({ error: 'Error obteniendo tus notas' });
  }
};

// Asignar las funciones a las rutas
notesRouter.get('/public', getPublicNotes);
notesRouter.get('/public/:id', getPublicNoteById);
notesRouter.post('/', createNote);
notesRouter.put('/:id', updateNote);
notesRouter.post('/:id/like', likeNote);
notesRouter.post('/:id/copy', copyNote);
notesRouter.get('/', getMyNotes);

export default notesRouter;
