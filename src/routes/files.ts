import { Router, Request, Response, RequestHandler } from 'express';
import multer, { Multer } from 'multer';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { AuthRequest } from '../middleware/auth';

const filesRouter = Router();
const upload: Multer = multer({ storage: multer.memoryStorage() });

// Configurar cliente de Supabase si hay credenciales
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
let supabaseClient = null;

if (supabaseUrl && supabaseKey) {
  supabaseClient = createClient(supabaseUrl, supabaseKey);
}

const bucketName = process.env.SUPABASE_BUCKET || 'uploads';

// Endpoint de subida de archivo
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
    const timestamp = Date.now();
    const ext = path.extname(originalName) || '';
    const uniqueName = `user_${userId}_${timestamp}${ext}`;

    let publicUrl: string | undefined;

    if (supabaseClient) {
      const { error: uploadError } = await supabaseClient.storage
        .from(bucketName)
        .upload(uniqueName, file.buffer, { contentType: file.mimetype });

      if (!uploadError) {
        const { data } = supabaseClient.storage.from(bucketName).getPublicUrl(uniqueName);
        publicUrl = data.publicUrl;
      } else {
        console.error('Error al subir a Supabase:', uploadError);
      }
    }

    if (!publicUrl) {
      // Guardar localmente si no se pudo usar Supabase
      const uploadDir = path.join(__dirname, '..', '..', 'uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filePath = path.join(uploadDir, uniqueName);
      fs.writeFileSync(filePath, file.buffer);

      const protocol = req.protocol;
      const host = req.get('host');
      publicUrl = `${protocol}://${host}/uploads/${uniqueName}`;
    }

    res.status(201).json({ url: publicUrl });
  } catch (error) {
    console.error('Error al almacenar archivo:', error);
    res.status(500).json({ error: 'Error interno al almacenar el archivo.' });
  }
}) as RequestHandler);

export default filesRouter;
