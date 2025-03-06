import { Router } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const usersRouter = Router();

// Obtener todos los usuarios (excepto el usuario actual)
usersRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const userId = req.user?.userId;
    const users = await prisma.user.findMany({
      where: {
        NOT: { id: userId }
      },
      select: { id: true, name: true }
    });
    res.json(users);
  } catch (error) {
    console.error('Error al obtener usuarios:', error);
    res.status(500).json({ error: 'Error interno al obtener usuarios' });
  }
});

export default usersRouter;
