const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { STATUS_RANK, normalizeStatus } = require('./messageStatus');

/**
 * Fallback store that keeps messages in a JSON file.
 * Useful when native SQLite bindings are unavailable (DB_DRIVER=file).
 */
const createFileMessageRepository = ({ filePath }) => {
  let messages = [];
  let users = [];
  const usersPath = `${filePath}.users.json`;

  const persist = () => {
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(messages, null, 2), 'utf8');
    fs.renameSync(tmpPath, filePath);
  };

  const init = () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        messages = Array.isArray(raw)
          ? raw.map((message) => ({ ...message, conversationId: message.conversationId || 'global' }))
          : [];
      } catch {
        messages = [];
      }
    }
    if (fs.existsSync(usersPath)) {
      try {
        const rawUsers = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        users = Array.isArray(rawUsers) ? rawUsers : [];
      } catch (err) {
        throw new Error(`Could not read users store "${usersPath}": ${err.message}`);
      }
    }
  };

  const persistUsers = () => {
    const tmpPath = `${usersPath}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(users, null, 2), 'utf8');
    fs.renameSync(tmpPath, usersPath);
  };

  const findUserByUsername = (username) =>
    users.find((user) => user.username.toLowerCase() === username.toLowerCase()) || null;

  const createUser = ({ username, passwordHash }) => {
    if (findUserByUsername(username)) {
      const err = new Error('Username already exists.');
      err.code = 'USER_EXISTS';
      throw err;
    }
    const user = {
      id: crypto.randomUUID(),
      username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    persistUsers();
    return user;
  };

  const create = ({ author, text, clientId, conversationId = 'global' }) => {
    const message = {
      id: crypto.randomUUID(),
      author,
      text,
      status: 'sent',
      clientId: clientId || null,
      conversationId,
      createdAt: new Date().toISOString(),
    };
    messages.push(message);
    persist();
    return message;
  };

  const findAll = ({ limit = 50, before = null, after = null, conversationId = 'global' } = {}) => {
    let result = messages.filter((message) => (message.conversationId || 'global') === conversationId);
    if (before) result = result.filter((m) => m.createdAt < before);
    if (after) result = result.filter((m) => m.createdAt >= after);
    return result.slice(-limit);
  };

  const findByIds = (ids = []) => messages.filter((m) => ids.includes(m.id));

  const markStatus = (ids = [], status) => {
    const target = normalizeStatus(status);
    const changed = [];
    for (const message of messages) {
      if (!ids.includes(message.id)) continue;
      if (STATUS_RANK[target] > STATUS_RANK[message.status]) {
        message.status = target;
        changed.push({ ...message });
      }
    }
    if (changed.length) persist();
    return changed;
  };

  const count = () => messages.length;

  const clear = () => {
    messages = [];
    persist();
  };

  const close = () => {};

  return {
    driver: 'file',
    init,
    create,
    findAll,
    findByIds,
    markStatus,
    count,
    clear,
    findUserByUsername,
    createUser,
    close,
  };
};

module.exports = createFileMessageRepository;
