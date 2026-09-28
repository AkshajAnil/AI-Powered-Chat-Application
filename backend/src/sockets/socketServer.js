const { Server } = require('socket.io');

const ApiError = require('../utils/ApiError');
const { isReservedName } = require('../agents/registry');
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
        const username = validateUsername(payload?.username);
        if (isReservedName(username)) {
          throw ApiError.badRequest(`"${username}" is an AI agent. Pick a different username.`);
        }
        socket.data.username = username;
        const { isNewUser } = presence.add(username, socket.id);
        typing.stop(username);
        reply(callback, { ok: true, username, onlineUsers: presence.onlineUsers() });
        if (isNewUser) broadcastPresence({ username, status: 'online' });
        logger.info(`${username} joined (${socket.id})`);
      } catch (err) {
        fail(callback, err, 'join');
      }
    });

    socket.on('message:send', async (payload, callback) => {
      try {
        const username = socket.data.username;
        if (!username) throw ApiError.badRequest('Join the chat before sending messages.');
        const input = validateMessageInput({ ...(payload || {}), author: username });
        const message = await messageService.sendMessage(input);
        typing.stop(username);
        reply(callback, { ok: true, message });
      } catch (err) {
        fail(callback, err, 'message:send');
      }
    });

    socket.on('typing', (payload) => {
      try {
        const username = socket.data.username;
        if (!username) return;
        if (payload?.isTyping) typing.start(username);
        else typing.stop(username);
      } catch (err) {
        logger.warn(`typing handler error: ${err.message}`);
      }
    });

    socket.on('message:read', async (payload, callback) => {
      try {
        const username = socket.data.username;
        if (!username) throw ApiError.badRequest('Join the chat before marking messages as read.');
        const { ids } = validateReadInput({ ids: payload?.ids, reader: username });
        const updated = await messageService.markMessagesRead({ ids, reader: username });
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
        typing.stop(change.username);
        broadcastPresence({ username: change.username, status: 'offline' });
      }
    });
  });

  return io;
};

module.exports = createSocketServer;
