import { Router, Response, RequestHandler, Request } from 'express';
import prisma from '../prisma/client';
import { AuthRequest } from '../middleware/auth';

const boardsRouter = Router();

// 📌 Crear un nuevo tablero
const createBoard: RequestHandler = async (req, res) => {
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

// 📌 Listar todos los tableros del usuario
const getBoards: RequestHandler = async (req, res) => {
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

// 📌 Obtener un tablero específico con sus tareas
const getBoardById: RequestHandler = async (req, res) => {
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

// 📌 Actualizar un tablero
// 📌 Actualizar un tablero
const updateBoard: RequestHandler = async (req, res) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.id);
  const { title } = req.body;

  if (!title) {
    res.status(400).json({ error: 'El título es obligatorio.' });
    return;
  }

  try {
    const board = await prisma.board.findFirst({
      where: { id: boardId, ownerId: userId }
    });

    if (!board) {
      res.status(404).json({ error: 'Tablero no encontrado o sin permisos.' });
      return;
    }

    await prisma.board.update({
      where: { id: boardId },
      data: { title }
    });

    res.json({ message: 'Tablero actualizado exitosamente.' });
  } catch (error) {
    console.error('Error al actualizar el tablero:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 📌 Eliminar un tablero
const deleteBoard: RequestHandler = async (req, res) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.id);

  try {
    const board = await prisma.board.findFirst({
      where: { id: boardId, ownerId: userId }
    });

    if (!board) {
      res.status(404).json({ error: 'Tablero no encontrado o sin permisos.' });
      return;
    }

    // Eliminar las tareas antes de borrar el tablero
    await prisma.task.deleteMany({ where: { boardId } });

    await prisma.board.delete({ where: { id: boardId } });

    res.json({ message: 'Tablero eliminado exitosamente.' });
  } catch (error) {
    console.error('Error al eliminar el tablero:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};


// 📌 Crear tarea en un tablero
boardsRouter.post('/:boardId/tasks', (async (req: Request, res: Response) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.boardId);
  const { title, description, dueDate, tags } = req.body;

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

// 📌 Registrar rutas
boardsRouter.post('/', createBoard);
boardsRouter.get('/', getBoards);
boardsRouter.get('/:id', getBoardById);
boardsRouter.patch('/:id', updateBoard);
boardsRouter.delete('/:id', deleteBoard);

export default boardsRouter;
