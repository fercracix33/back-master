import { Server as SocketIOServer } from 'socket.io';
import { socketAuthMiddleware } from '../middleware/auth';
import prisma from '../prisma/client';
import eventBus from './eventBus';

export default function configureSockets(io: SocketIOServer) {
  // Middleware de autenticación para sockets
  io.use(socketAuthMiddleware);

  // Conexión de sockets
  io.on('connection', (socket) => {
    console.log(`⚡️ [Socket.IO] Usuario conectado: ${socket.data.userId}`);

    socket.join(`user_${socket.data.userId}`);

    socket.on('joinChat', (chatId: string) => {
      socket.join(`chat_${chatId}`);
    });

    socket.on('sendMessage', async (payload) => {
      try {
        const userId = socket.data.userId;
        const { chatId, content, fileUrl, noteId } = payload;

        if (!chatId || (!content && !fileUrl && !noteId)) {
          return socket.emit('error', 'Datos de mensaje incompletos.');
        }

        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          include: { users: { select: { id: true } }, isGroup: true, name: true }
        });

        if (!chat) return socket.emit('error', 'Chat no encontrado.');

        const isMember = chat.users.some((u: { id: number }) => u.id === userId);
        if (!isMember) return socket.emit('error', 'No perteneces a este chat.');

        const newMessage = await prisma.message.create({
          data: {
            content: content || '',
            fileUrl: fileUrl || null,
            noteId: noteId || null,
            chatId,
            senderId: userId
          },
          include: { sender: { select: { id: true, name: true } } }
        });

        io.to(`chat_${chatId}`).emit('newMessage', newMessage);

        const senderName = newMessage.sender.name;
        const notifMessage = chat.isGroup
          ? `Nuevo mensaje en el grupo "${chat.name || 'grupo'}"`
          : `Nuevo mensaje de ${senderName}`;

        for (const member of chat.users) {
          if (member.id === userId) continue;

          const notification = await prisma.notification.create({
            data: {
              userId: member.id,
              message: notifMessage,
              type: 'CHAT'
            }
          });

          io.to(`user_${member.id}`).emit('notification', notification);
        }
      } catch (error) {
        console.error('Error en sendMessage:', error);
        socket.emit('error', 'Error al enviar mensaje.');
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Usuario desconectado: ${socket.id}`);
    });
  });

  // Suscripción a eventos del sistema
  eventBus.on('friendRequestCreated', async ({ fromUserId, toUserId, requestId }) => {
    try {
      const sender = await prisma.user.findUnique({ where: { id: fromUserId }, select: { name: true } });
      const senderName = sender?.name || 'Usuario';

      io.to(`user_${toUserId}`).emit('friendRequest', {
        requestId,
        fromUserId,
        fromUserName: senderName
      });
    } catch (error) {
      console.error('Error en friendRequestCreated:', error);
    }
  });

  eventBus.on('friendRequestAccepted', async ({ requesterId, accepterId }) => {
    try {
      const accepter = await prisma.user.findUnique({ where: { id: accepterId }, select: { name: true } });
      const accepterName = accepter?.name || 'Usuario';

      io.to(`user_${requesterId}`).emit('friendRequestAccepted', {
        userId: accepterId,
        userName: accepterName
      });
    } catch (error) {
      console.error('Error en friendRequestAccepted:', error);
    }
  });

  eventBus.on('chatCreated', async ({ chat, creatorId }) => {
    for (const user of chat.users) {
      if (user.id !== creatorId) {
        io.to(`user_${user.id}`).emit('chatCreated', chat);
      }
    }
  });

  eventBus.on('eventCreated', async ({ event, creatorId }) => {
    try {
      const creator = await prisma.user.findUnique({ where: { id: creatorId }, select: { name: true } });
      const creatorName = creator?.name || 'Alguien';
      const eventDate = event.date instanceof Date ? event.date.toISOString().split('T')[0] : event.date;
      const timeStr = event.startTime ? ` a las ${event.startTime}` : '';
      const messageText = `${creatorName} te ha invitado al evento "${event.title}" el ${eventDate}${timeStr}.`;

      for (const participant of event.participants) {
        if (participant.id === creatorId) continue;

        const notification = await prisma.notification.create({
          data: {
            userId: participant.id,
            message: messageText,
            type: 'EVENT'
          }
        });

        io.to(`user_${participant.id}`).emit('notification', notification);
      }
    } catch (error) {
      console.error('Error en eventCreated:', error);
    }
  });

  eventBus.on('resourceAdded', async ({ resource, authorId }) => {
    try {
      const author = await prisma.user.findUnique({ where: { id: authorId }, select: { name: true } });
      const community = await prisma.community.findUnique({ where: { id: resource.communityId }, select: { name: true } });
      const authorName = author?.name || 'Alguien';
      const communityName = community?.name || 'una comunidad';
      const messageText = `${authorName} añadió un recurso "${resource.title}" en la comunidad ${communityName}.`;

      const members = await prisma.communityMembership.findMany({ where: { communityId: resource.communityId } });

      for (const member of members) {
        if (member.userId === authorId) continue;

        const notification = await prisma.notification.create({
          data: {
            userId: member.userId,
            message: messageText,
            type: 'RESOURCE'
          }
        });

        io.to(`user_${member.userId}`).emit('notification', notification);
      }
    } catch (error) {
      console.error('Error en resourceAdded:', error);
    }
  });

  eventBus.on('threadCommentCreated', async ({ threadId, commenterId }) => {
    try {
      const thread = await prisma.communityThread.findUnique({
        where: { id: threadId },
        include: { author: true }
      });

      const commenter = await prisma.user.findUnique({ where: { id: commenterId }, select: { name: true } });
      const commenterName = commenter?.name || 'Alguien';

      const comments = await prisma.threadComment.findMany({
        where: { threadId },
        select: { authorId: true }
      });

      const participantIds = new Set<number>();
      for (const comment of comments) {
        participantIds.add(comment.authorId);
      }
      participantIds.add(thread!.authorId);
      participantIds.delete(commenterId);

      const messageText = `${commenterName} comentó en el hilo "${thread?.title}".`;

      for (const userId of participantIds) {
        const notification = await prisma.notification.create({
          data: {
            userId,
            message: messageText,
            type: 'THREAD'
          }
        });

        io.to(`user_${userId}`).emit('notification', notification);
      }
    } catch (error) {
      console.error('Error en threadCommentCreated:', error);
    }
  });
}
