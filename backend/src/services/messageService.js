const ApiError = require('../utils/ApiError');

/**
 * Business logic for chat messages. Storage is abstracted behind a repository
 * and broadcasting behind an event gateway, so this module stays transport-free.
 * All repository calls are awaited (PostgreSQL driver is asynchronous).
 *
 * `hooks.onMessage` fires for every persisted message (REST *and* socket paths);
 * the agent runtime subscribes to it. `hooks` is mutable so subscribers can be
 * attached after construction without a circular dependency. Messages are scoped
 * to the global room or a private conversation.
 */
const createMessageService = ({ repository, events, presence, logger, hooks = {} }) => {
  const notify = (message) => {
    try {
      const result = hooks.onMessage?.(message);
      if (result && typeof result.catch === 'function') {
        result.catch((err) => logger.error('onMessage hook failed', err));
      }
    } catch (err) {
      logger.error('onMessage hook threw', err);
    }
  };

  const sendMessage = async ({ author, text, clientId, conversationId = 'global' }) => {
    const message = await repository.create({ author, text, clientId, conversationId });

    const someoneElseOnline =
      conversationId !== 'global' || presence.onlineUsers().some((user) => user !== author);
    if (someoneElseOnline) {
      const [updated] = await repository.markStatus([message.id], 'delivered');
      if (updated) message.status = updated.status;
    }

    events.emitNewMessage(message);
    logger.debug(`message ${message.id} from ${author} (${message.status})`);
    notify(message);
    return message;
  };

  const listMessages = (query) => repository.findAll(query);

  /**
   * Marks messages as read. `reader` filters out the reader's own messages;
   * pass `null` for system-side reads (e.g. an agent reading what it replied to).
   */
  const markMessagesRead = async ({ ids, reader = null, conversationId }) => {
    const rows = await repository.findByIds(ids);
    const eligible = rows
      .filter(
        (row) =>
          (!reader || row.author !== reader) &&
          (!conversationId || row.conversationId === conversationId)
      )
      .map((row) => row.id);
    if (eligible.length === 0) return [];

    const changed = await repository.markStatus(eligible, 'read');
    changed.forEach((row) =>
      events.emitMessageStatus(
        { id: row.id, status: row.status, updatedAt: new Date().toISOString() },
        row.conversationId
      )
    );
    return changed;
  };

  const markMessagesDelivered = async (ids) => {
    const changed = await repository.markStatus(ids, 'delivered');
    changed.forEach((row) =>
      events.emitMessageStatus(
        { id: row.id, status: row.status, updatedAt: new Date().toISOString() },
        row.conversationId
      )
    );
    return changed;
  };

  const getStats = async () => ({ storedMessages: await repository.count() });

  return {
    sendMessage,
    listMessages,
    markMessagesRead,
    markMessagesDelivered,
    getStats,
    assertExists: async (id) => {
      const rows = await repository.findByIds([id]);
      if (!rows.length) throw ApiError.notFound('Message not found');
    },
  };
};

module.exports = createMessageService;
