import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';

// Definir el tipo extendido para Request
export interface AuthRequest extends Request {
  user?: { userId: number };
}

// Middleware para autenticación de rutas HTTP
export const authenticateToken: RequestHandler = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET as string;
    const payload: any = jwt.verify(token, secret);
    
    req.user = { userId: payload.userId };
    next(); // Token válido, continuar hacia la ruta
  } catch (err) {
    res.status(403).json({ error: 'Token inválido o expirado.' });
  }
};

// Middleware para autenticación en WebSockets
export const socketAuthMiddleware = (socket: any, next: (err?: any) => void) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Acceso denegado. Token no proporcionado.'));
  }

  try {
    const secret = process.env.JWT_SECRET as string;
    const payload: any = jwt.verify(token, secret);
    
    socket.data.userId = payload.userId; // Adjuntamos el ID de usuario en los datos del socket
    next();
  } catch (err) {
    return next(new Error('Token inválido o expirado.'));
  }
};
