import { Router, Request, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs-extra';
import path from 'path';
import { supabase } from '../index';
const foldersRouter = Router();

// Definir ruta de almacenamiento local
const localStoragePath = process.env.LOCAL_STORAGE_PATH || path.join(__dirname, '..', 'notas-locales');

// Crear una nueva carpeta
foldersRouter.post('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const { name, parentId } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'El nombre de la carpeta es obligatorio.' });
  }

  try {
    const newFolder = await prisma.folder.create({
      data: {
        name,
        userId,
        parentId: parentId ? Number(parentId) : null
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

// Obtener carpetas del usuario
foldersRouter.get('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const folders = await prisma.folder.findMany({
      where: { userId },
      include: { notes: true }
    });

    res.json(folders);
  } catch (error) {
    console.error('Error al obtener carpetas:', error);
    res.status(500).json({ error: 'Error interno al obtener carpetas.' });
  }
}) as RequestHandler);

// Actualizar nombre de carpeta
foldersRouter.patch('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const folderId = Number(req.params.id);
  const { name, parentId } = req.body;

  if (isNaN(folderId)) {
    return res.status(400).json({ error: 'ID de carpeta inválido.' });
  }

  try {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId }
    });

    if (!folder || folder.userId !== userId) {
      return res.status(404).json({ error: 'Carpeta no encontrada o sin permisos.' });
    }

    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: {
        name: name || folder.name,
        parentId: parentId ? Number(parentId) : folder.parentId
      }
    });

    // Renombrar carpeta localmente
    if (name && name !== folder.name) {
      const oldPath = path.join(localStoragePath, folder.name);
      const newPath = path.join(localStoragePath, name);
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
      }
    }

    res.json(updatedFolder);
  } catch (error) {
    console.error('Error al actualizar carpeta:', error);
    res.status(500).json({ error: 'Error interno al actualizar la carpeta.' });
  }
}) as RequestHandler);

// Eliminar carpeta (y sus subcarpetas y notas)
foldersRouter.delete('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const folderId = Number(req.params.id);

  if (isNaN(folderId)) {
    return res.status(400).json({ error: 'ID de carpeta inválido.' });
  }

  try {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });

    if (!folder || folder.userId !== userId) {
      return res.status(404).json({ error: 'Carpeta no encontrada o sin permisos.' });
    }

    // Eliminar carpeta localmente
    const folderPath = path.join(localStoragePath, folder.name);
    if (fs.existsSync(folderPath)) {
      fs.removeSync(folderPath);
    }

    await prisma.folder.delete({ where: { id: folderId } });

    res.json({ message: 'Carpeta eliminada correctamente.' });
  } catch (error) {
    console.error('Error al eliminar carpeta:', error);
    res.status(500).json({ error: 'Error interno al eliminar la carpeta.' });
  }
}) as RequestHandler);

export default foldersRouter;
