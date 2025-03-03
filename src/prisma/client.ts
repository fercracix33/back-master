import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'error', 'warn']  // Opcional: log de consultas para depuración
});

export default prisma;
