import { Router, Request, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs-extra';
import path from 'path';
import { supabase } from '../index';

const foldersRouter = Router();
const localStoragePath = process.env.LOCAL_STORAGE_PATH || path.join(__dirname, '..', 'notas-locales');

// Crear una nueva carpeta con archivos y notas opcionales
foldersRouter.post('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const { name, parentId, notes, files } = req.body; // ✅ Ahora se pueden incluir notas y archivos

  if (!name) {
    return res.status(400).json({ error: 'El nombre de la carpeta es obligatorio.' });
  }

  try {
    // Crear la carpeta en la base de datos
    const newFolder = await prisma.folder.create({
      data: {
        name,
        ownerId: userId,
        parentId: parentId ? Number(parentId) : null,
        notes: {
          create: notes ? notes.map((note: { title: string; content: string }) => ({
            title: note.title,
            content: note.content,
            authorId: userId,
          })) : [],
        },
        files: {
          create: files ? files.map((file: { name: string; path: string; size: number; mimeType: string }) => ({
            name: file.name,
            path: file.path,
            size: file.size,
            mimeType: file.mimeType,
            ownerId: userId,
          })) : [],
        }
      },
      include: {
        notes: true,
        files: true
      }
    });

    // Crear carpeta localmente
    const folderPath = path.join(localStoragePath, name);
    fs.ensureDirSync(folderPath);

    res.status(201).json(newFolder);
  } catch (error) {
    console.error('Error al crear carpeta:', error);
    res.status(500).json({ error: 'Error interno al crear la carpeta.' });
  }
}) as RequestHandler);

// Obtener carpetas del usuario (INCLUYENDO NOTAS Y ARCHIVOS)
foldersRouter.get('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const folders = await prisma.folder.findMany({
      where: { ownerId: userId },
      include: {
        notes: true, // ✅ Ahora se incluyen notas
        files: true, // ✅ Ahora se incluyen archivos
      }
    });

    res.json(folders);
  } catch (error) {
    console.error('Error al obtener carpetas:', error);
    res.status(500).json({ error: 'Error interno al obtener carpetas.' });
  }
}) as RequestHandler);

// Mover archivos o notas a otra carpeta
foldersRouter.patch('/:id/move', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const folderId = Number(req.params.id);
  const { fileIds, noteIds, newFolderId } = req.body;

  if (isNaN(folderId) || isNaN(newFolderId)) {
    return res.status(400).json({ error: 'ID de carpeta inválido.' });
  }

  try {
    // Actualizar los archivos y notas para asignarlos a la nueva carpeta
    await prisma.file.updateMany({
      where: { id: { in: fileIds }, ownerId: userId },
      data: { folderId: newFolderId },
    });

    await prisma.note.updateMany({
      where: { id: { in: noteIds }, authorId: userId },
      data: { folderId: newFolderId },
    });

    res.json({ message: 'Archivos y notas movidos correctamente.' });
  } catch (error) {
    console.error('Error al mover archivos/notas:', error);
    res.status(500).json({ error: 'Error interno al mover archivos o notas.' });
  }
}) as RequestHandler);

export default foldersRouter;
