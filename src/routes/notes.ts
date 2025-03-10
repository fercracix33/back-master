import { Router, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs-extra';
import path from 'path';
import { supabase } from '../index';

const notesRouter = Router();
const localStoragePath = process.env.LOCAL_STORAGE_PATH || path.join(__dirname, '..', '..', 'notas-locales');
fs.ensureDirSync(localStoragePath);

// Obtener todas las notas públicas
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

// Obtener una nota pública por ID
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

// Crear una nueva nota con almacenamiento híbrido
const createNote: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const { title, content, isPublic, folderId } = req.body;

  if (!title || !content) {
    res.status(400).json({ error: 'Título y contenido son requeridos.' });
    return;
  }

  try {
    let folderIdValue: number | null = null;
    if (folderId) {
      const folder = await prisma.folder.findFirst({ where: { id: Number(folderId), ownerId: userId } });
      if (folder) {
        folderIdValue = folder.id;
      }
    }

    const newNote = await prisma.note.create({
      data: {
        title,
        content,
        isPublic: isPublic || false,
        authorId: userId,
        folderId: folderIdValue
      }
    });

    // Guardar la nota localmente
    const folderPath = folderIdValue ? path.join(localStoragePath, `folder_${folderIdValue}`) : localStoragePath;
    fs.ensureDirSync(folderPath);
    const filePath = path.join(folderPath, `${title}.md`);
    fs.writeFileSync(filePath, content);

    // Subir la nota a Supabase
    const { error: uploadError } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET || 'notas')
      .upload(`notas/${title}.md`, content, { contentType: 'text/markdown' });

    if (uploadError) {
      console.error('Error subiendo la nota a Supabase:', uploadError);
    }

    res.status(201).json(newNote);
  } catch (error) {
    console.error('Error al crear la nota:', error);
    res.status(500).json({ error: 'No se pudo crear la nota' });
  }
};

notesRouter.get('/public', getPublicNotes);
notesRouter.get('/public/:id', getPublicNoteById);
notesRouter.post('/', createNote);
export default notesRouter;
