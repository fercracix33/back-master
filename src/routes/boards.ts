import { Router, Response, RequestHandler } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const boardsRouter = Router();

// Crear un nuevo tablero
const createBoard: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const { title } = req.body;

  if (!title) {
    res.status(400).json({ error: 'El título es obligatorio.' });
    return;
  }

  try {
    const newBoard = await prisma.board.create({
      data: { title, ownerId: userId }
    });
    res.status(201).json(newBoard);
  } catch (error) {
    console.error('Error al crear el tablero:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Listar tableros del usuario
const getBoards: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;

  try {
    const boards = await prisma.board.findMany({
      where: { ownerId: userId },
      include: { tasks: { orderBy: { dueDate: 'asc' } } }
    });
    res.json(boards);
  } catch (error) {
    console.error('Error al obtener los tableros:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Obtener un tablero específico con sus tareas
const getBoardById: RequestHandler = async (req, res): Promise<void> => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.id);

  try {
    const board = await prisma.board.findFirst({
      where: { id: boardId, ownerId: userId },
      include: { tasks: { orderBy: { dueDate: 'asc' } } }
    });

    if (!board) {
      res.status(404).json({ error: 'Tablero no encontrado.' });
      return;
    }

    res.json(board);
  } catch (error) {
    console.error('Error al obtener el tablero:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// Asignar las funciones a las rutas
boardsRouter.post('/', createBoard);
boardsRouter.get('/', getBoards);
boardsRouter.get('/:id', getBoardById);

export default boardsRouter;
