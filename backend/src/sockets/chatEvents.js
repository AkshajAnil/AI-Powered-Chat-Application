/**
 * Thin event gateway so both REST controllers and Socket.io handlers can
 * broadcast the same domain events without importing each other.
 * `attach(io)` is called once the Socket.io server exists.
 */
const createChatEvents = () => {
  let io = null;
  const roomFor = (conversationId = 'global') =>
    conversationId === 'global' ? 'general' : conversationId;

  return {
    attach(instance) {
      io = instance;
    },
    emitNewMessage(message) {
      io?.to(roomFor(message.conversationId)).emit('message:new', message);
    },
    emitMessageStatus(update, conversationId = 'global') {
      io?.to(roomFor(conversationId)).emit('message:status', update);
    },
    emitPresence(update) {
      io?.emit('presence:update', update);
    },
    emitTyping(users, conversationId = 'global') {
      io
        ?.to(roomFor(conversationId))
        .emit('typing:update', { users, conversationId });
    },
  };
};

module.exports = createChatEvents;
