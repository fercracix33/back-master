import { Router, Response, RequestHandler, Request } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const communitiesRouter = Router();

// Crear comunidad
// Crear comunidad (CREATE)
communitiesRouter.post('/', async (req: Request, res: Response) => {
    const userId = (req as AuthRequest).user?.userId;
    const { name, description, image, visibility, tags } = req.body;
  
    if (!name) {
      res.status(400).json({ error: 'El nombre es obligatorio.' });
      return;
    }
  
    try {
      const community = await prisma.community.create({
        data: {
          name,
          description,
          image,
          visibility: visibility || 'PUBLIC',
          creatorId: userId,
          members: { create: { userId, role: 'ADMIN' } },
          tags: tags
            ? { create: tags.map((tagId: number) => ({ tag: { connect: { id: tagId } } })) }
            : undefined,
        },
        include: { members: true, tags: { include: { tag: true } } },
      });
  
      res.status(201).json(community);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Error interno al crear la comunidad' });
    }
  });
  

// Obtener todas las comunidades (info limitada en privadas)
communitiesRouter.get('/', (async (_req: Request, res: Response) => {
  try {
    const communities = await prisma.community.findMany({
      include: { tags: { include: { tag: true } } },
    });

    const formatted = communities.map((c: any) =>
      c.visibility === 'PUBLIC'
        ? c
        : {
            id: c.id,
            name: c.name,
            description: 'Comunidad privada',
            visibility: c.visibility,
            tags: c.tags,
          }
    );

    res.json(formatted);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);

// Obtener comunidades públicas
communitiesRouter.get('/public', (async (_req: Request, res: Response) => {
  try {
    const communities = await prisma.community.findMany({
      where: { visibility: 'PUBLIC' },
      include: { tags: { include: { tag: true } } },
    });
    res.json(communities);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);

// Obtener comunidades del usuario actual
communitiesRouter.get('/me', (async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.userId;

  try {
    const memberships = await prisma.communityMembership.findMany({
      where: { userId },
      include: { community: { include: { tags: { include: { tag: true } } } } },
    });

    res.json(memberships);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);

// Obtener comunidad específica
communitiesRouter.get('/:id', (async (req: Request, res: Response) => {
  const communityId = Number(req.params.id);

  try {
    const community = await prisma.community.findUnique({
      where: { id: communityId },
      include: {
        tags: { include: { tag: true } },
        members: { include: { user: { select: { id: true, name: true } } } },
        threads: true,
        resources: true,
      },
    });

    if (!community) {
      return res.status(404).json({ error: 'Comunidad no encontrada' });
    }

    res.json(community);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);

// Actualizar comunidad
communitiesRouter.patch('/:id', (async (req: Request, res: Response) => {
  const communityId = Number(req.params.id);
  const userId = (req as AuthRequest).user?.userId;
  const { name, description, image, visibility } = req.body;

  try {
    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const updated = await prisma.community.update({
      where: { id: communityId },
      data: { name, description, image, visibility },
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);

// Eliminar comunidad
communitiesRouter.delete('/:id', (async (req: Request, res: Response) => {
  const communityId = Number(req.params.id);
  const userId = (req as AuthRequest).user?.userId;

  try {
    const community = await prisma.community.findUnique({ where: { id: communityId } });

    if (community?.creatorId !== userId) {
      return res.status(403).json({ error: 'Solo el creador puede eliminar' });
    }

    await prisma.community.delete({ where: { id: communityId } });

    res.json({ message: 'Comunidad eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);

export default communitiesRouter;
