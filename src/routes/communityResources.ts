import { Router, Request, Response } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const communityResourcesRouter = Router();

// 📌 Añadir recurso a una comunidad (archivo, nota o carpeta)
communityResourcesRouter.post('/', async (req: AuthRequest, res: Response) => {
  const { communityId, resourceId, resourceType: type, tags } = req.body;
  const userId = req.user?.userId;

  if (!communityId || !resourceId || !type) {
    res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
    return;
  }

  try {
    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'No perteneces a esta comunidad.' });
      return;
    }
    const resource = await prisma.communityResource.create({
      data: {
        communityId,
        resourceId,
        type, // "NOTE", "FILE", "FOLDER"
        authorId: userId, // correcto según schema
        tags: tags
          ? { create: tags.map((tagId: number) => ({ tag: { connect: { id: tagId } } })) }
          : undefined,
      },
      include: { tags: { include: { tag: true } } },
    });
    res.status(201).json(resource);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al añadir recurso comunitario.' });
  }
});

// 📌 Obtener recursos de una comunidad
communityResourcesRouter.get('/:communityId', async (req: AuthRequest, res: Response) => {
  const communityId = Number(req.params.communityId);
  const userId = req.user?.userId;

  try {
    const community = await prisma.community.findUnique({ where: { id: communityId } });

    if (!community) {
      res.status(404).json({ error: 'Comunidad no encontrada.' });
      return;
    }

    if (community.visibility === 'PRIVATE') {
      const membership = await prisma.communityMembership.findUnique({
        where: { userId_communityId: { userId, communityId } },
      });

      if (!membership) {
        res.status(403).json({ error: 'No tienes acceso a los recursos de esta comunidad.' });
        return;
      }
    }

    const resources = await prisma.communityResource.findMany({
      where: { communityId },
      include: { tags: { include: { tag: true } } },
    });

    res.json(resources);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al obtener recursos.' });
  }
});

// 📌 Eliminar recurso de comunidad
communityResourcesRouter.delete('/:resourceId', async (req: AuthRequest, res: Response) => {
  const resourceId = Number(req.params.resourceId);
  const userId = req.user?.userId;

  try {
    const resource = await prisma.communityResource.findUnique({ where: { id: resourceId } });

    if (!resource) {
      res.status(404).json({ error: 'Recurso no encontrado.' });
      return;
    }

    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: resource.communityId } },
    });

    if (!membership || membership.role === 'MEMBER') {
      res.status(403).json({ error: 'Permisos insuficientes para eliminar el recurso.' });
      return;
    }

    await prisma.communityResource.delete({ where: { id: resourceId } });

    res.json({ message: 'Recurso eliminado correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar recurso.' });
  }
});

// 📌 Añadir tags a un recurso comunitario
communityResourcesRouter.post('/:resourceId/tags', async (req: AuthRequest, res: Response) => {
  const resourceId = Number(req.params.resourceId);
  const userId = req.user?.userId;
  const { tags } = req.body;

  try {
    const resource = await prisma.communityResource.findUnique({ where: { id: resourceId } });

    if (!resource) {
      res.status(404).json({ error: 'Recurso no encontrado.' });
      return;
    }

    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: resource.communityId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'Permisos insuficientes.' });
      return;
    }

    await prisma.communityResource.update({
      where: { id: resourceId },
      data: {
        tags: { create: tags.map((tagId: number) => ({ tag: { connect: { id: tagId } } })) },
      },
    });

    res.json({ message: 'Etiquetas añadidas correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al añadir etiquetas.' });
  }
});

// 📌 Eliminar tag de un recurso comunitario
communityResourcesRouter.delete('/:resourceId/tags/:tagId', async (req: AuthRequest, res: Response) => {
  const resourceId = Number(req.params.resourceId);
  const tagId = Number(req.params.tagId);
  const userId = req.user?.userId;

  try {
    const resource = await prisma.communityResource.findUnique({ where: { id: resourceId } });

    if (!resource) {
      res.status(404).json({ error: 'Recurso no encontrado.' });
      return;
    }

    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: resource.communityId } },
    });

    if (!membership) {
      res.status(403).json({ error: 'Permisos insuficientes.' });
      return;
    }

    await prisma.communityResourceTag.delete({
      where: {
        communityResourceId_tagId: { communityResourceId: resourceId, tagId },
      },
    });

    res.json({ message: 'Etiqueta eliminada correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar etiqueta.' });
  }
});

export default communityResourcesRouter;
