import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const tagsRouter = Router();

// 📌 Crear nueva etiqueta
tagsRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { name } = req.body;

  if (!name) {
    res.status(400).json({ error: 'El nombre es obligatorio.' });
    return;
  }

  try {
    const existingTag = await prisma.tag.findUnique({ where: { name } });

    if (existingTag) {
      res.status(400).json({ error: 'Ya existe una etiqueta con este nombre.' });
      return;
    }

    const tag = await prisma.tag.create({ data: { name } });

    res.status(201).json(tag);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear etiqueta.' });
  }
});

// 📌 Obtener todas las etiquetas
tagsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      orderBy: { name: 'asc' },
    });

    res.json(tags);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener etiquetas.' });
  }
});

// 📌 Editar etiqueta
tagsRouter.patch('/:id', async (req: AuthRequest, res: Response) => {
  const tagId = Number(req.params.id);
  const { name } = req.body;

  if (!name) {
    res.status(400).json({ error: 'El nombre es obligatorio.' });
    return;
  }

  try {
    const updatedTag = await prisma.tag.update({
      where: { id: tagId },
      data: { name },
    });

    res.json(updatedTag);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar etiqueta.' });
  }
});

// 📌 Eliminar etiqueta
tagsRouter.delete('/:id', async (req: AuthRequest, res: Response) => {
  const tagId = Number(req.params.id);

  try {
    await prisma.tag.delete({ where: { id: tagId } });

    res.json({ message: 'Etiqueta eliminada correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar etiqueta.' });
  }
});

export default tagsRouter;
