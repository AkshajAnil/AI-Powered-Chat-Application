/**
 * Thin event gateway so both REST controllers and Socket.io handlers can
 * broadcast the same domain events without importing each other.
 * `attach(io)` is called once the Socket.io server exists.
 */
const createChatEvents = () => {
  let io = null;

  return {
    attach(instance) {
      io = instance;
    },
    emitNewMessage(message) {
      io?.emit('message:new', message);
    },
    emitMessageStatus(update) {
      io?.emit('message:status', update);
    },
    emitPresence(update) {
      io?.emit('presence:update', update);
    },
    emitTyping(users) {
      io?.emit('typing:update', { users });
    },
  };
};

module.exports = createChatEvents;
