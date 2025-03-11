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

// 📌 Endpoint para subir archivos
filesRouter.post('/', upload.single('file'), (async (req: Request, res: Response) => {
  const userId: number = (req as AuthRequest).user?.userId ?? 0;
  const { folderId } = req.body;

  if (!userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No se envió ningún archivo.' });
  }

  try {
    const file = req.file;
    const originalName = file.originalname;
    const timestamp = Date.now();
    const ext = path.extname(originalName) || '';
    const uniqueName = `user_${userId}_${timestamp}${ext}`;

    let publicUrl: string | undefined;

    // Subir a Supabase
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(uniqueName, file.buffer, { contentType: file.mimetype });

    if (!uploadError) {
      const { data } = supabase.storage.from(bucketName).getPublicUrl(uniqueName);
      publicUrl = data.publicUrl;
    } else {
      console.error('Error al subir a Supabase:', uploadError);
    }

    // Guardar en la base de datos
    const newFile = await prisma.file.create({
      data: {
        name: originalName,
        path: uniqueName,
        size: file.size,
        mimeType: file.mimetype,
        folderId: folderId ? Number(folderId) : null,
        ownerId: userId,
      }
    });

    res.status(201).json({ file: newFile, url: publicUrl });
  } catch (error) {
    console.error('Error al almacenar archivo:', error);
    res.status(500).json({ error: 'Error interno al almacenar el archivo.' });
  }
}) as RequestHandler);

// 📌 Endpoint para obtener la lista de archivos
filesRouter.get('/', (async (req: Request, res: Response) => {
  try {
    const files = await prisma.file.findMany();

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

// 📌 Endpoint para obtener un archivo por ID
filesRouter.get('/:id', (async (req: Request, res: Response) => {
  const fileId = Number(req.params.id);

  if (isNaN(fileId)) {
    return res.status(400).json({ error: 'ID de archivo inválido.' });
  }

  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId }
    });

    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado.' });
    }

    // Obtener la URL pública desde Supabase
    const publicUrl = supabase.storage.from(bucketName).getPublicUrl(file.path).data.publicUrl;

    res.json({ ...file, url: publicUrl });
  } catch (error) {
    console.error('Error al obtener archivo:', error);
    res.status(500).json({ error: 'Error interno al obtener el archivo.' });
  }
}) as RequestHandler);

export default filesRouter;
