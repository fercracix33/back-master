import { Router, Request, Response, RequestHandler } from 'express';
import multer, { Multer } from 'multer';
import prisma from '../prisma/client';
import { supabase } from '../index';
import fs from 'fs-extra';
import path from 'path';
import { AuthRequest } from '../middleware/auth';

const filesRouter = Router();
const upload: Multer = multer({ storage: multer.memoryStorage() });

const bucketName = process.env.SUPABASE_BUCKET || 'uploads';
const localStoragePath = process.env.LOCAL_STORAGE_PATH || path.join(__dirname, '..', '..', 'uploads');
fs.ensureDirSync(localStoragePath);

// 📌 Subir archivos (solo gestión de archivos, sin lógica de notas o carpetas)
filesRouter.post('/', upload.single('file'), (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  
  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No se envió ningún archivo.' });
  }

  try {
    const file = req.file;
    const originalName = file.originalname;
    const ext = path.extname(originalName) || '';
    const uniqueName = `user_${userId}_${Date.now()}${ext}`;

    let publicUrl: string | undefined;

    // Subir a Supabase
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(uniqueName, file.buffer, { contentType: file.mimetype });

    if (uploadError) {
      console.error('Error al subir a Supabase:', uploadError);
      return res.status(500).json({ error: 'Error al subir el archivo.' });
    }

    const { data } = supabase.storage.from(bucketName).getPublicUrl(uniqueName);
    publicUrl = data.publicUrl;

    // Guardar en la base de datos
    const newFile = await prisma.file.create({
      data: {
        name: originalName,
        path: uniqueName,
        size: file.size,
        mimeType: file.mimetype,
        ownerId: userId,
      }
    });

    res.status(201).json({ file: newFile, url: publicUrl });
  } catch (error) {
    console.error('Error al almacenar archivo:', error);
    res.status(500).json({ error: 'Error interno al almacenar el archivo.' });
  }
}) as RequestHandler);

// 📌 Obtener todos los archivos de un usuario
filesRouter.get('/', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;

  try {
    const files = await prisma.file.findMany({
      where: { ownerId: userId }
    });

    // Generar URLs de Supabase para cada archivo
    const filesWithUrls = files.map((file: { path: string }) => ({
      ...file,
      url: supabase.storage.from(bucketName).getPublicUrl(file.path).data.publicUrl
    }));

    res.json(filesWithUrls);
  } catch (error) {
    console.error('Error al obtener archivos:', error);
    res.status(500).json({ error: 'Error interno al obtener archivos.' });
  }
}) as RequestHandler);

// 📌 Obtener un archivo por ID
filesRouter.get('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const fileId = Number(req.params.id);

  if (isNaN(fileId)) {
    return res.status(400).json({ error: 'ID de archivo inválido.' });
  }

  try {
    const file = await prisma.file.findFirst({
      where: { id: fileId, ownerId: userId }
    });

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado o no tienes permiso para verlo.' });
    }

    // Obtener la URL pública desde Supabase
    const publicUrl = supabase.storage.from(bucketName).getPublicUrl(file.path).data.publicUrl;

    res.json({ ...file, url: publicUrl });
  } catch (error) {
    console.error('Error al obtener archivo:', error);
    res.status(500).json({ error: 'Error interno al obtener el archivo.' });
  }
}) as RequestHandler);

// 📌 Eliminar un archivo por ID
filesRouter.delete('/:id', (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const fileId = Number(req.params.id);

  if (isNaN(fileId)) {
    return res.status(400).json({ error: 'ID de archivo inválido.' });
  }

  try {
    // Buscar el archivo en la base de datos
    const file = await prisma.file.findFirst({
      where: { id: fileId, ownerId: userId }
    });

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado o no tienes permiso para eliminarlo.' });
    }

    // Eliminar de Supabase
    const { error: deleteError } = await supabase.storage
      .from(bucketName)
      .remove([file.path]);

    if (deleteError) {
      console.error('Error al eliminar archivo de Supabase:', deleteError);
      return res.status(500).json({ error: 'Error al eliminar el archivo de Supabase.' });
    }

    // Eliminar de la base de datos
    await prisma.file.delete({ where: { id: fileId } });

    res.json({ message: 'Archivo eliminado correctamente.' });
  } catch (error) {
    console.error('Error al eliminar archivo:', error);
    res.status(500).json({ error: 'Error interno al eliminar el archivo.' });
  }
}) as RequestHandler);

export default filesRouter;
