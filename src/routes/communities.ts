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
// Obtener comunidad específica con isMember
communitiesRouter.get('/:id', (async (req: Request, res: Response) => {
  const communityId = Number(req.params.id);
  const userId = (req as AuthRequest).user?.userId;

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

    const isMember = community.members.some((m: any) => m.user.id === userId);

    res.json({ ...community, isMember });
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


// 📌 Enviar solicitud de unión a una comunidad
communitiesRouter.post('/:id/join-request', (async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  const communityId = Number(req.params.id);

  try {
    const existingMembership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (existingMembership) {
      return res.status(400).json({ error: 'Ya eres miembro de esta comunidad.' });
    }

    const existingRequest = await prisma.communityJoinRequest.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (existingRequest) {
      return res.status(400).json({ error: 'Ya has solicitado unirte a esta comunidad.' });
    }

    const request = await prisma.communityJoinRequest.create({
      data: { userId, communityId },
    });

    res.status(201).json(request);
  } catch (error) {
    console.error('Error al solicitar unirse a la comunidad:', error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);

// 📌 Ver solicitudes pendientes (solo admins)
communitiesRouter.get('/:id/join-requests', (async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  const communityId = Number(req.params.id);

  try {
    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const requests = await prisma.communityJoinRequest.findMany({
      where: { communityId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    res.json(requests);
  } catch (error) {
    console.error('Error al obtener solicitudes de unión:', error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);

// 📌 Aceptar solicitud de unión
communitiesRouter.post('/:id/join-requests/:requestId/accept', (async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  const communityId = Number(req.params.id);
  const requestId = Number(req.params.requestId);

  try {
    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const request = await prisma.communityJoinRequest.findUnique({
      where: { id: requestId },
    });

    if (!request || request.communityId !== communityId) {
      return res.status(404).json({ error: 'Solicitud no encontrada.' });
    }

    await prisma.communityMembership.create({
      data: {
        userId: request.userId,
        communityId,
        role: 'MEMBER',
      },
    });

    await prisma.communityJoinRequest.delete({
      where: { id: requestId },
    });

    res.json({ message: 'Solicitud aceptada correctamente.' });
  } catch (error) {
    console.error('Error al aceptar solicitud:', error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);

// 📌 Rechazar solicitud de unión
communitiesRouter.delete('/:id/join-requests/:requestId', (async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  const communityId = Number(req.params.id);
  const requestId = Number(req.params.requestId);

  try {
    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (!membership || membership.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No autorizado' });
    }

    await prisma.communityJoinRequest.delete({
      where: { id: requestId },
    });

    res.json({ message: 'Solicitud rechazada correctamente.' });
  } catch (error) {
    console.error('Error al rechazar solicitud:', error);
    res.status(500).json({ error: 'Error interno' });
  }
}) as RequestHandler);



// 📌 Unirse a una comunidad (automáticamente si es pública, solicitud si es privada)
communitiesRouter.post('/:id/join', (async (req: AuthRequest, res: Response) => {
  const userId = req.user?.userId;
  const communityId = Number(req.params.id);

  try {
    // 1. ¿Ya es miembro?
    const isMember = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (isMember) {
      return res.status(200).json({ message: 'Ya eres miembro de esta comunidad.' });
    }

    // 2. ¿Existe la comunidad?
    const community = await prisma.community.findUnique({
      where: { id: communityId },
      select: { visibility: true },
    });

    if (!community) {
      return res.status(404).json({ error: 'Comunidad no encontrada.' });
    }

    // 3. Si es pública, unir directamente
    if (community.visibility === 'PUBLIC') {
      const membership = await prisma.communityMembership.create({
        data: {
          userId,
          communityId,
          role: 'MEMBER',
        },
      });

      return res.status(201).json({ message: 'Te has unido a la comunidad.', membership });
    }

    // 4. Si es privada, ¿ya ha solicitado unirse?
    const existingRequest = await prisma.communityJoinRequest.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (existingRequest) {
      return res.status(200).json({ message: 'Ya has solicitado unirte a esta comunidad privada.' });
    }

    // 5. Crear nueva solicitud
    const newRequest = await prisma.communityJoinRequest.create({
      data: { userId, communityId },
    });

    return res.status(201).json({ message: 'Solicitud enviada correctamente.', request: newRequest });
  } catch (error) {
    console.error('Error al procesar la unión:', error);
    res.status(500).json({ error: 'Error interno al intentar unirse a la comunidad.' });
  }
}) as RequestHandler);








export default communitiesRouter;
