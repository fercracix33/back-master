import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../prisma/client';
import { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';

export interface AuthRequest extends Request {
  user?: { userId: number };
}

const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET as string;

// 📌 Ruta: Registro de usuarios
authRouter.post('/register', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    // Validar que todos los campos estén presentes
    if (!name || !email || !password) {
      res.status(400).json({ error: 'Nombre, email y contraseña son obligatorios.' });
      return;
    }

    // Verificar si el usuario ya existe
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'El email ya está en uso.' });
      return;
    }

    // Hashear contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // Crear usuario en la base de datos con nombre
    const newUser = await prisma.user.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        password: hashedPassword,
      },
    });

    // Generar token JWT al registrar
    const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '24h' });

    res.status(201).json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email } });
  } catch (error) {
    console.error('Error en /register:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 📌 Ruta: Inicio de sesión
authRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email y contraseña son obligatorios.' });
      return;
    }

    // Buscar usuario en la base de datos
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ error: 'Credenciales inválidas.' });
      return;
    }

    // Generar token JWT
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Error en /login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 📌 Ruta: Obtener información del usuario autenticado
authRouter.get('/me', authenticateToken, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      select: { id: true, name: true, email: true } // Campos que queremos devolver
    });

    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error('Error en /me:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});



export default authRouter;
