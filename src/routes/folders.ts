import { Router, Request, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import fs from 'fs-extra';
import path from 'path';
import { supabase } from '../index';

const foldersRouter = Router();
const localStoragePath = process.env.LOCAL_STORAGE_PATH || path.join(__dirname, '..', 'notas-locales');

// 📌 Función para eliminar una carpeta y todo su contenido de manera recursiva
const deleteFolder = async (folderId: number) => {
  try {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: { files: true, notes: true, children: true }
    });

    if (!folder) return;

    // 🔹 Eliminar subcarpetas primero (recursivo)
    for (const subfolder of folder.children) {
      await deleteFolder(subfolder.id);
    }

    // 🔹 Eliminar archivos de Supabase
    const filePaths = folder.files.map((file: { path: string }) => file.path);
    if (filePaths.length > 0) {
      const { error: deleteError } = await supabase.storage
        .from(process.env.SUPABASE_BUCKET || 'uploads')
        .remove(filePaths);

      if (deleteError) {
        console.error('Error al eliminar archivos de Supabase:', deleteError);
      }
    }

    // 🔹 Eliminar archivos y notas en la base de datos
    await prisma.file.deleteMany({ where: { folderId } });
    await prisma.note.deleteMany({ where: { folderId } });

    // 🔹 Eliminar la carpeta de la base de datos
    await prisma.folder.delete({ where: { id: folderId } });

    // 🔹 Eliminar la carpeta del sistema de archivos local
    const folderPath = path.join(localStoragePath, folder.name);
    fs.removeSync(folderPath);

    console.log(`Carpeta con ID ${folderId} eliminada correctamente.`);
  } catch (error) {
    console.error(`Error al eliminar carpeta ${folderId}:`, error);
  }
};

// 📌 Crear una nueva carpeta
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
        ownerId: userId,
        parentId: parentId ? Number(parentId) : null
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

// 📌 Obtener carpetas del usuario
foldersRouter.get('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const folders = await prisma.folder.findMany({
      where: { ownerId: userId },
      include: { children: true }
    });

    res.json(folders);
  } catch (error) {
    console.error('Error al obtener carpetas:', error);
    res.status(500).json({ error: 'Error interno al obtener carpetas.' });
  }
}) as RequestHandler);

// 📌 Editar una carpeta (solo nombre)
foldersRouter.patch('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const folderId = Number(req.params.id);
  const { name } = req.body;

  if (isNaN(folderId)) {
    return res.status(400).json({ error: 'ID de carpeta inválido.' });
  }

  try {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, ownerId: userId }
    });

    if (!folder) {
      return res.status(404).json({ error: 'Carpeta no encontrada o no tienes acceso.' });
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

// 📌 Mover una carpeta dentro de otra
foldersRouter.patch('/:id/move', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const folderId = Number(req.params.id);
  const { newParentId } = req.body;

  if (isNaN(folderId) || (newParentId && isNaN(newParentId))) {
    return res.status(400).json({ error: 'ID de carpeta inválido.' });
  }

  try {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, ownerId: userId }
    });

    if (!folder) {
      return res.status(404).json({ error: 'Carpeta no encontrada o no tienes acceso.' });
    }

    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: { parentId: newParentId || null }
    });

    res.json(updatedFolder);
  } catch (error) {
    console.error('Error al mover carpeta:', error);
    res.status(500).json({ error: 'Error interno al mover la carpeta.' });
  }
}) as RequestHandler);

// 📌 Eliminar una carpeta y todo su contenido
foldersRouter.delete('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const folderId = Number(req.params.id);

  if (isNaN(folderId)) {
    return res.status(400).json({ error: 'ID de carpeta inválido.' });
  }

  try {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, ownerId: userId }
    });

    if (!folder) {
      return res.status(404).json({ error: 'Carpeta no encontrada o no tienes acceso.' });
    }

    await deleteFolder(folderId);

    res.json({ message: 'Carpeta y todo su contenido eliminados correctamente.' });
  } catch (error) {
    console.error('Error al eliminar carpeta:', error);
    res.status(500).json({ error: 'Error interno al eliminar la carpeta.' });
  }
}) as RequestHandler);


foldersRouter.put('/:id/move', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const folderId = Number(req.params.id);
  const { newParentFolderId } = req.body;

  if (isNaN(folderId)) {
    return res.status(400).json({ error: 'ID de carpeta inválido.' });
  }

  try {
    // Verificar que la carpeta pertenece al usuario
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, ownerId: userId },
    });

    if (!folder) {
      return res.status(404).json({ error: 'Carpeta no encontrada o no tienes acceso.' });
    }

    // Verificar si la carpeta destino existe y pertenece al usuario
    if (newParentFolderId) {
      const parentFolder = await prisma.folder.findFirst({
        where: { id: Number(newParentFolderId), ownerId: userId },
      });

      if (!parentFolder) {
        return res.status(400).json({ error: 'La carpeta destino no existe o no tienes acceso.' });
      }

      // Prevenir mover una carpeta dentro de sí misma
      if (folderId === newParentFolderId) {
        return res.status(400).json({ error: 'No puedes mover una carpeta dentro de sí misma.' });
      }
    }

    // Actualizar la carpeta con la nueva carpeta padre
    const updatedFolder = await prisma.folder.update({
      where: { id: folderId },
      data: { parentFolderId: newParentFolderId ? Number(newParentFolderId) : null },
    });

    res.json(updatedFolder);
  } catch (error) {
    console.error('Error al mover la carpeta:', error);
    res.status(500).json({ error: 'Error interno al mover la carpeta.' });
  }
}) as RequestHandler);



export default foldersRouter;
