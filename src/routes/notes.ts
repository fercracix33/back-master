import { Router, Request, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const notesRouter = Router();

// 📌 Obtener todas las notas del usuario (privadas y públicas propias)
notesRouter.get('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const notes = await prisma.note.findMany({
      where: { authorId: userId },
      include: { folder: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json(notes);
  } catch (error) {
    console.error('Error al obtener notas:', error);
    res.status(500).json({ error: 'Error interno al obtener notas' });
  }
}) as RequestHandler);

// 📌 Obtener todas las notas públicas (Wuolah-like, disponible para todos)
notesRouter.get('/public', (async (_req: Request, res: Response) => {
  try {
    const publicNotes = await prisma.note.findMany({
      where: { isPublic: true },
      include: {
        author: { select: { id: true, name: true } }, // Mostrar nombre y ID del autor
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(publicNotes);
  } catch (error) {
    console.error('Error obteniendo notas públicas:', error);
    res.status(500).json({ error: 'Error interno al obtener notas públicas' });
  }
}) as RequestHandler);

// 📌 Obtener una nota pública por ID (disponible para todos)
notesRouter.get('/public/:id', (async (req: Request, res: Response) => {
  const noteId = Number(req.params.id);

  if (isNaN(noteId)) {
    return res.status(400).json({ error: 'ID de nota inválido.' });
  }

  try {
    const note = await prisma.note.findFirst({
      where: { id: noteId, isPublic: true },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    if (!note) {
      return res.status(404).json({ error: 'Nota no encontrada o no es pública' });
    }

    res.json(note);
  } catch (error) {
    console.error('Error obteniendo la nota pública:', error);
    res.status(500).json({ error: 'Error interno al obtener la nota pública' });
  }
}) as RequestHandler);

// 📌 Crear una nueva nota (pública o privada)
notesRouter.post('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const { title, content, isPublic, folderId } = req.body;

  if (!title || !content) {
    return res.status(400).json({ error: 'Título y contenido son requeridos.' });
  }

  try {
    let folderIdValue: number | null = null;
    
    // Verificar si la carpeta existe y pertenece al usuario
    if (folderId) {
      const folder = await prisma.folder.findFirst({ where: { id: Number(folderId), ownerId: userId } });
      if (folder) {
        folderIdValue = folder.id;
      }
    }

    // Crear la nota en la base de datos
    const newNote = await prisma.note.create({
      data: {
        title,
        content,
        isPublic: isPublic || false,
        authorId: userId,
        folderId: folderIdValue,
      }
    });

    res.status(201).json(newNote);
  } catch (error) {
    console.error('Error al crear la nota:', error);
    res.status(500).json({ error: 'No se pudo crear la nota' });
  }
}) as RequestHandler);

// 📌 Editar una nota (privada o pública)
notesRouter.patch('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const noteId = Number(req.params.id);
  const { title, content, isPublic, folderId } = req.body;

  if (isNaN(noteId)) {
    return res.status(400).json({ error: 'ID de nota inválido.' });
  }

  try {
    const note = await prisma.note.findFirst({
      where: { id: noteId, authorId: userId },
    });

    if (!note) {
      return res.status(404).json({ error: 'Nota no encontrada o no tienes acceso.' });
    }

    let folderIdValue: number | null = note.folderId;
    
    // Verificar si la carpeta existe y pertenece al usuario
    if (folderId) {
      const folder = await prisma.folder.findFirst({ where: { id: Number(folderId), ownerId: userId } });
      if (folder) {
        folderIdValue = folder.id;
      }
    }

    // Actualizar la nota
    const updatedNote = await prisma.note.update({
      where: { id: noteId },
      data: { title, content, isPublic, folderId: folderIdValue }
    });

    res.json(updatedNote);
  } catch (error) {
    console.error('Error al actualizar nota:', error);
    res.status(500).json({ error: 'Error interno al actualizar la nota' });
  }
}) as RequestHandler);

// 📌 Mover una nota a otra carpeta
notesRouter.put('/:id/move', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const noteId = Number(req.params.id);
  const { newFolderId } = req.body;

  if (isNaN(noteId)) {
    return res.status(400).json({ error: 'ID de nota inválido.' });
  }

  try {
    const updatedNote = await prisma.note.update({
      where: { id: noteId, authorId: userId },
      data: { folderId: newFolderId ? Number(newFolderId) : null },
    });

    res.json(updatedNote);
  } catch (error) {
    console.error('Error al mover la nota:', error);
    res.status(500).json({ error: 'Error interno al mover la nota' });
  }
}) as RequestHandler);

// 📌 Eliminar una nota
notesRouter.delete('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const noteId = Number(req.params.id);

  if (isNaN(noteId)) {
    return res.status(400).json({ error: 'ID de nota inválido.' });
  }

  try {
    await prisma.note.delete({ where: { id: noteId, authorId: userId } });
    res.json({ message: 'Nota eliminada correctamente.' });
  } catch (error) {
    console.error('Error al eliminar nota:', error);
    res.status(500).json({ error: 'Error interno al eliminar la nota' });
  }
}) as RequestHandler);

export default notesRouter;
