import { Router, Request, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs-extra';
import path from 'path';
import { supabase } from '../index';

const foldersRouter = Router();
const localStoragePath = process.env.LOCAL_STORAGE_PATH || path.join(__dirname, '..', 'notas-locales');

// 📌 Crear una nueva carpeta con archivos y notas opcionales
foldersRouter.post('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const { name, parentId, notes, files } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'El nombre de la carpeta es obligatorio.' });
  }

  try {
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

    const folderPath = path.join(localStoragePath, name);
    fs.ensureDirSync(folderPath);

    res.status(201).json(newFolder);
  } catch (error) {
    console.error('Error al crear carpeta:', error);
    res.status(500).json({ error: 'Error interno al crear la carpeta.' });
  }
}) as RequestHandler);

// 📌 Obtener carpetas del usuario (incluyendo notas y archivos)
foldersRouter.get('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const folders = await prisma.folder.findMany({
      where: { ownerId: userId },
      include: {
        notes: true,
        files: true,
      }
    });

    res.json(folders);
  } catch (error) {
    console.error('Error al obtener carpetas:', error);
    res.status(500).json({ error: 'Error interno al obtener carpetas.' });
  }
}) as RequestHandler);

// 📌 Editar una carpeta
foldersRouter.patch('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const folderId = Number(req.params.id);
  const { name } = req.body;

  if (isNaN(folderId)) {
    return res.status(400).json({ error: 'ID de carpeta inválido.' });
  }

  try {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId }
    });

    if (!folder) {
      return res.status(404).json({ error: 'Carpeta no encontrada.' });
    }

    if (folder.ownerId !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para editar esta carpeta.' });
    }

    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: { name },
    });

    res.json(updatedFolder);
  } catch (error) {
    console.error('Error al editar carpeta:', error);
    res.status(500).json({ error: 'Error interno al editar la carpeta.' });
  }
}) as RequestHandler);

// 📌 Eliminar una carpeta
foldersRouter.delete('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const folderId = Number(req.params.id);

  if (isNaN(folderId)) {
    return res.status(400).json({ error: 'ID de carpeta inválido.' });
  }

  try {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        files: true,
        notes: true
      }
    });

    if (!folder) {
      return res.status(404).json({ error: 'Carpeta no encontrada.' });
    }

    if (folder.ownerId !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar esta carpeta.' });
    }

    // Eliminar archivos de Supabase
    const filePaths = folder.files.map((file: { path: string }) => file.path);
    if (filePaths.length > 0) {
      const { error: deleteError } = await supabase.storage.from(process.env.SUPABASE_BUCKET || 'uploads').remove(filePaths);
      if (deleteError) {
        console.error('Error al eliminar archivos de Supabase:', deleteError);
        return res.status(500).json({ error: 'Error al eliminar archivos de Supabase.' });
      }
    }

    // Eliminar archivos y notas de la base de datos
    await prisma.file.deleteMany({ where: { folderId } });
    await prisma.note.deleteMany({ where: { folderId } });

    // Eliminar la carpeta de la base de datos
    await prisma.folder.delete({ where: { id: folderId } });

    // Eliminar la carpeta localmente
    const folderPath = path.join(localStoragePath, folder.name);
    fs.removeSync(folderPath);

    res.json({ message: 'Carpeta eliminada correctamente.' });
  } catch (error) {
    console.error('Error al eliminar carpeta:', error);
    res.status(500).json({ error: 'Error interno al eliminar la carpeta.' });
  }
}) as RequestHandler);

export default foldersRouter;
