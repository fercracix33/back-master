import { Router, Response, RequestHandler, Request } from 'express';
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

// Listar tableros del usuario con sus tareas
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

// Crear tarea en un tablero
boardsRouter.post('/:boardId/tasks', (async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.boardId);
  const { title, description, dueDate, tags } = req.body;

  if (isNaN(boardId)) {
    return res.status(400).json({ error: 'ID de tablero inválido.' });
  }
  if (!title) {
    return res.status(400).json({ error: 'El título de la tarea es obligatorio.' });
  }
  try {
    const board = await prisma.board.findFirst({ where: { id: boardId, ownerId: userId } });
    if (!board) {
      return res.status(404).json({ error: 'Tablero no encontrado o sin permiso.' });
    }
    const newTask = await prisma.task.create({
      data: {
        title,
        description: description || null,
        done: false,
        dueDate: dueDate ? new Date(dueDate) : null,
        boardId: boardId,
        tags: Array.isArray(tags) ? tags : undefined
      }
    });
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error al crear tarea:', error);
    res.status(500).json({ error: 'Error interno al crear la tarea.' });
  }
}) as RequestHandler);

// Actualizar una tarea
boardsRouter.patch('/:boardId/tasks/:taskId', (async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.boardId);
  const taskId = Number(req.params.taskId);

  if (isNaN(boardId) || isNaN(taskId)) {
    return res.status(400).json({ error: 'IDs inválidos.' });
  }

  const { title, description, done, dueDate, tags } = req.body;

  try {
    const task = await prisma.task.findFirst({
      where: { id: taskId, board: { id: boardId, ownerId: userId } }
    });
    if (!task) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permiso.' });
    }
    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: title !== undefined ? title : task.title,
        description: description !== undefined ? description : task.description,
        done: done !== undefined ? !!done : task.done,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : task.dueDate,
        tags: tags !== undefined ? (Array.isArray(tags) ? tags : task.tags) : task.tags
      }
    });
    res.json(updatedTask);
  } catch (error) {
    console.error('Error al actualizar tarea:', error);
    res.status(500).json({ error: 'Error interno al actualizar la tarea.' });
  }
}) as RequestHandler);

// Eliminar una tarea
boardsRouter.delete('/:boardId/tasks/:taskId', (async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.boardId);
  const taskId = Number(req.params.taskId);

  if (isNaN(boardId) || isNaN(taskId)) {
    return res.status(400).json({ error: 'IDs inválidos.' });
  }
  try {
    const task = await prisma.task.findFirst({
      where: { id: taskId, board: { id: boardId, ownerId: userId } }
    });
    if (!task) {
      return res.status(404).json({ error: 'Tarea no encontrada o sin permiso.' });
    }
    await prisma.task.delete({ where: { id: taskId } });
    res.json({ message: 'Tarea eliminada.' });
  } catch (error) {
    console.error('Error al eliminar tarea:', error);
    res.status(500).json({ error: 'Error interno al eliminar la tarea.' });
  }
}) as RequestHandler);

boardsRouter.post('/', createBoard);
boardsRouter.get('/', getBoards);
boardsRouter.get('/:id', getBoardById);

export default boardsRouter;
