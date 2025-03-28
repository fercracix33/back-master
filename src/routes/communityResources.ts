import { Router, Request, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';
import { supabase } from '../index';
const communityResourcesRouter = Router();
const bucketName = process.env.SUPABASE_BUCKET || 'uploads';
// 📌 Añadir recurso a una comunidad (archivo, nota o carpeta)
communityResourcesRouter.post('/', (async (req: AuthRequest, res: Response) => {
  const { communityId, resourceId, resourceType, tags, title, description } = req.body;
  const userId = req.user?.userId;

  if (!communityId || !resourceId || !resourceType || !title) {
    return res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
  }

  try {
    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'No perteneces a esta comunidad.' });
    }

    if (resourceType === 'NOTE') {
      const note = await prisma.note.findUnique({ where: { id: resourceId } });
      if (!note || note.authorId !== userId) {
        return res.status(403).json({ error: 'No tienes acceso a esta nota.' });
      }
    } else if (resourceType === 'FILE') {
      const file = await prisma.file.findUnique({ where: { id: resourceId } });
      if (!file || file.ownerId !== userId) {
        return res.status(403).json({ error: 'No tienes acceso a este archivo.' });
      }
    } else if (resourceType === 'FOLDER') {
      const folder = await prisma.folder.findUnique({ where: { id: resourceId } });
      if (!folder || folder.ownerId !== userId) {
        return res.status(403).json({ error: 'No tienes acceso a esta carpeta.' });
      }
    }

    const resource = await prisma.communityResource.create({
      data: {
        communityId,
        resourceId,
        type: resourceType,
        title,
        description,
        authorId: userId,
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
}) as RequestHandler);

// 📌 Obtener recursos de una comunidad
communityResourcesRouter.get('/:communityId', (async (req: AuthRequest, res: Response) => {
  const communityId = Number(req.params.communityId);
  const userId = req.user?.userId;

  try {
    const community = await prisma.community.findUnique({ where: { id: communityId } });
    if (!community) return res.status(404).json({ error: 'Comunidad no encontrada.' });

    if (community.visibility === 'PRIVATE') {
      const membership = await prisma.communityMembership.findUnique({
        where: { userId_communityId: { userId, communityId } },
      });
      if (!membership) {
        return res.status(403).json({ error: 'No tienes acceso a los recursos de esta comunidad.' });
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
}) as RequestHandler);

// Función auxiliar para obtener carpetas de forma recursiva
// Función auxiliar para obtener carpetas de forma recursiva
async function getFolderRecursive(folderId: number): Promise<any> {
  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: {
      notes: true,
      files: true,
      children: true,
    },
  });

  if (!folder) return null;

  const filesWithUrls = await Promise.all(
    folder.files.map(async (file: any) => {
      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(file.path);
      return {
        ...file,
        downloadUrl: urlData.publicUrl,
      };
    })
  );

  const children = await Promise.all(
    folder.children.map(async (child: any) => await getFolderRecursive(child.id))
  );

  return {
    ...folder,
    files: filesWithUrls,
    children,
  };
}

// 📌 Obtener detalle completo del recurso (sin clonarlo)
const getCommunityResourceDetail: RequestHandler = async (req, res) => {
  const resourceId = Number(req.params.id);
  const userId = (req as AuthRequest).user?.userId;

  try {
    const communityResource = await prisma.communityResource.findUnique({
      where: { id: resourceId },
      include: {
        community: true,
        tags: { include: { tag: true } },
      },
    });

    if (!communityResource) {
      res.status(404).json({ error: 'Recurso comunitario no encontrado.' });
      return;
    }

    const community = communityResource.community;

    if (community.visibility === 'PRIVATE') {
      const membership = await prisma.communityMembership.findUnique({
        where: { userId_communityId: { userId, communityId: community.id } },
      });
      if (!membership) {
        res.status(403).json({ error: 'No perteneces a esta comunidad.' });
        return;
      }
    }

    let data: any = null;

    if (communityResource.type === 'NOTE') {
      const note = await prisma.note.findUnique({ where: { id: communityResource.resourceId } });
      if (!note) {
        res.status(404).json({ error: 'Nota no encontrada.' });
        return;
      }
      data = note;

    } else if (communityResource.type === 'FILE') {
      const file = await prisma.file.findUnique({ where: { id: communityResource.resourceId } });
      if (!file) {
        res.status(404).json({ error: 'Archivo no encontrado.' });
        return;
      }

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(file.path);
      data = {
        ...file,
        downloadUrl: urlData.publicUrl,
      };

    } else if (communityResource.type === 'FOLDER') {
      const folderData = await getFolderRecursive(communityResource.resourceId);
      if (!folderData) {
        res.status(404).json({ error: 'Carpeta no encontrada.' });
        return;
      }
      data = folderData;
    }

    res.json({
      id: communityResource.id,
      type: communityResource.type,
      title: communityResource.title,
      description: communityResource.description,
      tags: communityResource.tags,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener detalle del recurso.' });
  }
};

// 📌 Asociar la ruta
communityResourcesRouter.get('/:id/detail', getCommunityResourceDetail);



// 📌 Eliminar recurso de comunidad
communityResourcesRouter.delete('/:resourceId', (async (req: AuthRequest, res: Response) => {
  const resourceId = Number(req.params.resourceId);
  const userId = req.user?.userId;

  try {
    const resource = await prisma.communityResource.findUnique({ where: { id: resourceId } });
    if (!resource) return res.status(404).json({ error: 'Recurso no encontrado.' });

    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: resource.communityId } },
    });

    if (!membership || (membership.role === 'MEMBER' && resource.authorId !== userId)) {
      return res.status(403).json({ error: 'Permisos insuficientes para eliminar el recurso.' });
    }

    await prisma.communityResource.delete({ where: { id: resourceId } });

    res.json({ message: 'Recurso eliminado correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al eliminar recurso.' });
  }
}) as RequestHandler);

// 📌 Añadir tags a un recurso comunitario
communityResourcesRouter.post('/:resourceId/tags', (async (req: AuthRequest, res: Response) => {
  const resourceId = Number(req.params.resourceId);
  const userId = req.user?.userId;
  const { tags } = req.body;

  try {
    const resource = await prisma.communityResource.findUnique({ where: { id: resourceId } });
    if (!resource) return res.status(404).json({ error: 'Recurso no encontrado.' });

    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: resource.communityId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Permisos insuficientes.' });
    }

    await prisma.communityResource.update({
      where: { id: resourceId },
      data: {
        tags: {
          create: tags.map((tagId: number) => ({ tag: { connect: { id: tagId } } })),
        },
      },
    });

    res.json({ message: 'Etiquetas añadidas correctamente.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno al añadir etiquetas.' });
  }
}) as RequestHandler);

// 📌 Eliminar tag de un recurso comunitario
communityResourcesRouter.delete('/:resourceId/tags/:tagId', (async (req: AuthRequest, res: Response) => {
  const resourceId = Number(req.params.resourceId);
  const tagId = Number(req.params.tagId);
  const userId = req.user?.userId;

  try {
    const resource = await prisma.communityResource.findUnique({ where: { id: resourceId } });
    if (!resource) return res.status(404).json({ error: 'Recurso no encontrado.' });

    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: resource.communityId } },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Permisos insuficientes.' });
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
}) as RequestHandler);



function asyncHandler(fn: Function): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}


// Función auxiliar para clonar una carpeta de forma recursiva
async function cloneFolderRecursively(originalId: number, userId: number, parentId: number | null): Promise<number> {
  const originalFolder = await prisma.folder.findUnique({
    where: { id: originalId },
    include: {
      notes: true,
      files: true,
      children: true,
    },
  });

  if (!originalFolder) throw new Error('Carpeta no encontrada');

  const newFolder = await prisma.folder.create({
    data: {
      name: originalFolder.name + ' (clonada)',
      ownerId: userId,
      parentId,
    },
  });

  // Clonar notas
  for (const note of originalFolder.notes) {
    await prisma.note.create({
      data: {
        title: note.title,
        content: note.content,
        authorId: userId,
        isPublic: false,
        folderId: newFolder.id,
      },
    });
  }

  // Clonar archivos
  for (const file of originalFolder.files) {
    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(file.path);

    if (!fileData || downloadError) continue;

    const buffer = await fileData.arrayBuffer();
    const newFileName = `${Date.now()}-${file.name}`;
    const newPath = `user-${userId}/${newFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(newPath, buffer, { contentType: file.mimeType });

    if (!uploadError) {
      await prisma.file.create({
        data: {
          name: newFileName,
          path: newPath,
          size: file.size,
          mimeType: file.mimeType,
          ownerId: userId,
          folderId: newFolder.id,
        },
      });
    }
  }

  // Clonar subcarpetas recursivamente
  for (const child of originalFolder.children) {
    await cloneFolderRecursively(child.id, userId, newFolder.id);
  }

  return newFolder.id;
}


// 📌 Clonar un recurso comunitario a tu espacio personal
communityResourcesRouter.post('/:id/clone', asyncHandler(async (req: AuthRequest, res: Response) => {
  const resourceId = Number(req.params.id);
  const userId = req.user?.userId;

  if (!userId) return res.status(401).json({ error: 'No autenticado.' });

  const resource = await prisma.communityResource.findUnique({
    where: { id: resourceId },
    include: {
      community: true,
      tags: { include: { tag: true } },
    },
  });

  if (!resource) return res.status(404).json({ error: 'Recurso no encontrado.' });

  if (resource.community.visibility === 'PRIVATE') {
    const membership = await prisma.communityMembership.findUnique({
      where: { userId_communityId: { userId, communityId: resource.communityId } },
    });

    if (!membership) return res.status(403).json({ error: 'No perteneces a esta comunidad.' });
  }

  let cloned;
  let clonedTags = resource.tags.map((t: any) => t.tagId);

  if (resource.type === 'NOTE') {
    const note = await prisma.note.findUnique({ where: { id: resource.resourceId } });
    if (!note) return res.status(404).json({ error: 'Nota no encontrada.' });

    cloned = await prisma.note.create({
      data: {
        title: note.title + ' (clonada)',
        content: note.content,
        authorId: userId,
        isPublic: false,
      },
    });

  } else if (resource.type === 'FILE') {
    const file = await prisma.file.findUnique({ where: { id: resource.resourceId } });
    if (!file) return res.status(404).json({ error: 'Archivo no encontrado.' });

    const { data: fileData, error: downloadError } = await supabase.storage
      .from(bucketName)
      .download(file.path);

    if (!fileData || downloadError) {
      return res.status(500).json({ error: 'Error al descargar el archivo original.' });
    }

    const buffer = await fileData.arrayBuffer();
    const newFileName = `${Date.now()}-${file.name}`;
    const newPath = `user-${userId}/${newFileName}`;

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(newPath, buffer, { contentType: file.mimeType });

    if (uploadError) {
      return res.status(500).json({ error: 'Error al subir el archivo clonado.' });
    }

    cloned = await prisma.file.create({
      data: {
        name: newFileName,
        path: newPath,
        size: file.size,
        mimeType: file.mimeType,
        ownerId: userId,
        folderId: null,
      },
    });

  } else if (resource.type === 'FOLDER') {
    const folderId = await cloneFolderRecursively(resource.resourceId, userId, null);
    cloned = await prisma.folder.findUnique({ where: { id: folderId } });
  }

  // 🔁 Aplicar tags al recurso clonado (si aplica)
  if (cloned && clonedTags.length && resource.type !== 'FOLDER') {
    if (resource.type === 'NOTE') {
      await prisma.noteTag.createMany({
        data: clonedTags.map((tagId: any) => ({
          noteId: cloned.id,
          tagId,
        })),
      });
    } else if (resource.type === 'FILE') {
      await prisma.fileTag.createMany({
        data: clonedTags.map((tagId: any)=> ({
          fileId: cloned.id,
          tagId,
        })),
      });
    }
  }

  res.status(201).json({ message: 'Recurso clonado correctamente.', cloned });
}));


export default communityResourcesRouter;
