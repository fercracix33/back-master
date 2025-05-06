import { Router, RequestHandler } from 'express';
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
    const newBoard = await prisma.board.create({ data: { title, ownerId: userId } });
    res.status(201).json(newBoard);
  } catch (error) {
    console.error('Error al crear el tablero:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 📌 Obtener todos los tableros del usuario
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

// 📌 Actualizar el título de un tablero
const updateBoard: RequestHandler = async (req, res) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.id);
  const { title } = req.body;

  if (!title) {
    res.status(400).json({ error: 'El título es obligatorio.' });
    return;
  }

  try {
    const board = await prisma.board.findFirst({ where: { id: boardId, ownerId: userId } });
    
    if (!board) {
      res.status(404).json({ error: 'Tablero no encontrado o sin permisos.' });
      return;
    }

    const updatedBoard = await prisma.board.update({
      where: { id: boardId },
      data: { title }
    });

    res.json(updatedBoard);
  } catch (error) {
    console.error('Error al actualizar el tablero:', error);
    res.status(500).json({ error: 'Error interno al actualizar el tablero.' });
  }
};

// 📌 Eliminar un tablero junto con sus tareas
const deleteBoard: RequestHandler = async (req, res) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.id);

  try {
    const board = await prisma.board.findFirst({ where: { id: boardId, ownerId: userId } });
    if (!board) {
      res.status(404).json({ error: 'Tablero no encontrado o sin permisos.' });
      return;
    }

    await prisma.task.deleteMany({ where: { boardId } });
    await prisma.board.delete({ where: { id: boardId } });

    res.json({ message: 'Tablero eliminado exitosamente.' });
  } catch (error) {
    console.error('Error al eliminar el tablero:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};

// 📌 Crear una tarea en un tablero
const createTask: RequestHandler = async (req, res) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.boardId);
  const { title, description, dueDate, tags } = req.body;

  if (!title) {
    res.status(400).json({ error: 'El título de la tarea es obligatorio.' });
    return;
  }

  try {
    const board = await prisma.board.findFirst({ where: { id: boardId, ownerId: userId } });
    if (!board) {
      res.status(404).json({ error: 'Tablero no encontrado o sin permiso.' });
      return;
    }

    const newTask = await prisma.task.create({
      data: {
        title,
        description: description || null,
        done: false,
        dueDate: dueDate ? new Date(dueDate) : null,
        boardId,
        tags: Array.isArray(tags) ? tags : []
      }
    });

    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error al crear tarea:', error);
    res.status(500).json({ error: 'Error interno al crear la tarea.' });
  }
};

// 📌 Obtener todas las tareas de un tablero
const getTasks: RequestHandler = async (req, res) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.boardId);

  try {
    const board = await prisma.board.findFirst({ where: { id: boardId, ownerId: userId } });
    if (!board) {
      res.status(404).json({ error: 'Tablero no encontrado o sin permiso.' });
      return;
    }

    const tasks = await prisma.task.findMany({ where: { boardId }, orderBy: { dueDate: 'asc' } });

    res.json(tasks);
  } catch (error) {
    console.error('Error al obtener tareas:', error);
    res.status(500).json({ error: 'Error interno al obtener las tareas.' });
  }
};

// 📌 Actualizar una tarea y permitir eliminar algunas etiquetas (`tags`)
const updateTask: RequestHandler = async (req, res) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.boardId);
  const taskId = Number(req.params.taskId);
  const { title, description, done, dueDate, tags } = req.body;

  try {
    const task = await prisma.task.findFirst({
      where: { id: taskId, board: { id: boardId, ownerId: userId } }
    });

    if (!task) {
      res.status(404).json({ error: 'Tarea no encontrada o sin permiso.' });
      return;
    }

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        title: title !== undefined ? title : task.title,
        description: description !== undefined ? description : task.description,
        done: done !== undefined ? !!done : task.done,
        dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : task.dueDate,
        tags: tags !== undefined ? (Array.isArray(tags) ? tags : []) : task.tags // Permitir eliminar tags
      }
    });

    res.json(updatedTask);
  } catch (error) {
    console.error('Error al actualizar tarea:', error);
    res.status(500).json({ error: 'Error interno al actualizar la tarea.' });
  }
};

// 📌 Eliminar una tarea
const deleteTask: RequestHandler = async (req, res) => {
  const userId = (req as AuthRequest).user?.userId || 0;
  const boardId = Number(req.params.boardId);
  const taskId = Number(req.params.taskId);

  try {
    const task = await prisma.task.findFirst({
      where: { id: taskId, board: { id: boardId, ownerId: userId } }
    });

    if (!task) {
      res.status(404).json({ error: 'Tarea no encontrada o sin permiso.' });
      return;
    }

    await prisma.task.delete({ where: { id: taskId } });

    res.json({ message: 'Tarea eliminada correctamente.' });
  } catch (error) {
    console.error('Error al eliminar tarea:', error);
    res.status(500).json({ error: 'Error interno al eliminar la tarea.' });
  }
};

// 📌 Registrar rutas de tableros
boardsRouter.post('/', createBoard);
boardsRouter.get('/', getBoards);
boardsRouter.patch('/:id', updateBoard);
boardsRouter.delete('/:id', deleteBoard);

// 📌 Registrar rutas de tareas
boardsRouter.post('/:boardId/tasks', createTask);
boardsRouter.get('/:boardId/tasks', getTasks);
boardsRouter.patch('/:boardId/tasks/:taskId', updateTask);
boardsRouter.delete('/:boardId/tasks/:taskId', deleteTask);

export default boardsRouter;
