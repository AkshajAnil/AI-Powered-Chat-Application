const { Server } = require('socket.io');

const ApiError = require('../utils/ApiError');
const { findAgent, isReservedName } = require('../agents/registry');
const { GLOBAL_CONVERSATION, agentConversationId } = require('../agents/conversations');
const {
  validateUsername,
  validateMessageInput,
  validateReadInput,
} = require('../validators/chatValidators');

const ROOM = 'general';

const createSocketServer = ({
  httpServer,
  messageService,
  presence,
  events,
  typing,
  authService,
  config,
  logger,
}) => {
  const io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  });

  events.attach(io);

  io.use((socket, next) => {
    authService
      .verifyToken(socket.handshake.auth?.token)
      .then((user) => {
        socket.data.authUser = user;
        next();
      })
      .catch(() => next(new Error('Authentication required. Please log in again.')));
  });

  const reply = (callback, payload) => {
    if (typeof callback === 'function') callback(payload);
    else if (!payload.ok) socketFallback(payload);
  };

  const socketFallback = (payload) => logger.warn('unacknowledged error', payload);

  const broadcastPresence = (update) =>
    io.to(ROOM).emit('presence:update', { ...update, onlineUsers: presence.onlineUsers() });

  io.on('connection', (socket) => {
    logger.info(`client connected ${socket.id}`);
    socket.join(ROOM);
    socket.data.conversationId = GLOBAL_CONVERSATION;
    socket.emit('presence:list', { onlineUsers: presence.onlineUsers() });

    const fail = (callback, err, context) => {
      const known = err instanceof ApiError || err?.isOperational;
      if (known) logger.warn(`${context}: ${err.message}`);
      else logger.error(`${context} failed`, err);
      const payload = {
        ok: false,
        error: {
          message: known ? err.message : 'Unexpected server error.',
          code: err?.code || (known ? 'ERROR' : 'INTERNAL_ERROR'),
        },
      };
      if (typeof callback === 'function') callback(payload);
      else socket.emit('chat:error', payload.error);
    };

    socket.on('join', (payload, callback) => {
      try {
        const username = socket.data.authUser?.username;
        if (!username) throw ApiError.unauthorized();
        if (
          payload?.username &&
          validateUsername(payload.username).toLowerCase() !== username.toLowerCase()
        ) {
          throw ApiError.unauthorized('You cannot join as another user.');
        }
        if (isReservedName(username)) {
          throw ApiError.unauthorized('AI agent accounts cannot join as people.');
        }
        socket.data.username = username;
        socket.data.joinedAt = socket.data.authUser.joinedAt || null;
        const { isNewUser } = presence.add(username, socket.id);
        typing.stop(username);
        reply(callback, { ok: true, username, onlineUsers: presence.onlineUsers() });
        if (isNewUser) broadcastPresence({ username, status: 'online' });
        logger.info(`${username} joined (${socket.id})`);
      } catch (err) {
        fail(callback, err, 'join');
      }
    });

    socket.on('conversation:join', async (payload, callback) => {
      try {
        const username = socket.data.username;
        if (!username) throw ApiError.badRequest('Join the chat before opening a conversation.');

        const agentName = typeof payload?.agent === 'string' ? payload.agent.trim() : '';
        const agent = agentName ? findAgent(agentName) : null;
        if (agentName && !agent) throw ApiError.badRequest('Unknown AI agent.');

        const previousConversation = socket.data.conversationId || GLOBAL_CONVERSATION;
        const nextConversation = agent
          ? agentConversationId(username, agent.name)
          : GLOBAL_CONVERSATION;
        if (previousConversation !== nextConversation) {
          if (previousConversation !== GLOBAL_CONVERSATION) {
            socket.leave(previousConversation);
            typing.stop(username, previousConversation);
          }
          if (nextConversation !== GLOBAL_CONVERSATION) socket.join(nextConversation);
          socket.data.conversationId = nextConversation;
        }
        const messages = await messageService.listMessages({
          limit: 100,
          conversationId: nextConversation,
          after: nextConversation === GLOBAL_CONVERSATION ? socket.data.joinedAt : null,
        });
        reply(callback, { ok: true, conversationId: nextConversation, messages });
      } catch (err) {
        fail(callback, err, 'conversation:join');
      }
    });

    socket.on('message:send', async (payload, callback) => {
      try {
        const username = socket.data.username;
        if (!username) throw ApiError.badRequest('Join the chat before sending messages.');
        const input = validateMessageInput({ ...(payload || {}), author: username });
        input.conversationId = socket.data.conversationId || GLOBAL_CONVERSATION;
        const message = await messageService.sendMessage(input);
        typing.stop(username, socket.data.conversationId || GLOBAL_CONVERSATION);
        reply(callback, { ok: true, message });
      } catch (err) {
        fail(callback, err, 'message:send');
      }
    });

    socket.on('typing', (payload) => {
      try {
        const username = socket.data.username;
        if (!username) return;
        const conversationId = socket.data.conversationId || GLOBAL_CONVERSATION;
        if (payload?.isTyping) typing.start(username, conversationId);
        else typing.stop(username, conversationId);
      } catch (err) {
        logger.warn(`typing handler error: ${err.message}`);
      }
    });

    socket.on('message:read', async (payload, callback) => {
      try {
        const username = socket.data.username;
        if (!username) throw ApiError.badRequest('Join the chat before marking messages as read.');
        const { ids } = validateReadInput({ ids: payload?.ids, reader: username });
        const updated = await messageService.markMessagesRead({
          ids,
          reader: username,
          conversationId: socket.data.conversationId || GLOBAL_CONVERSATION,
        });
        reply(callback, { ok: true, updatedIds: updated.map((m) => m.id) });
      } catch (err) {
        fail(callback, err, 'message:read');
      }
    });

    socket.on('disconnect', (reason) => {
      const username = socket.data.username;
      const change = presence.remove(socket.id);
      if (username) logger.info(`${username} disconnected (${reason})`);
      if (change?.isOffline) {
        typing.stop(change.username, socket.data.conversationId || GLOBAL_CONVERSATION);
        broadcastPresence({ username: change.username, status: 'offline' });
      }
    });
  });

  return io;
};

module.exports = createSocketServer;
