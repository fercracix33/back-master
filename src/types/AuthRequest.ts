import { Request } from 'express';

 export interface AuthRequest extends Request {
  userId?: number; // O el tipo que realmente uses para el userId
}
