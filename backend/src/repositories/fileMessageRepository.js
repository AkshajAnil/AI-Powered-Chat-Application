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
        messages = Array.isArray(raw) ? raw : [];
      } catch {
        messages = [];
      }
    }
  };

  const create = ({ author, text, clientId }) => {
    const message = {
      id: crypto.randomUUID(),
      author,
      text,
      status: 'sent',
      clientId: clientId || null,
      createdAt: new Date().toISOString(),
    };
    messages.push(message);
    persist();
    return message;
  };

  const findAll = ({ limit = 50, before = null } = {}) => {
    let result = messages;
    if (before) result = result.filter((m) => m.createdAt < before);
    return result.slice(-limit).reverse();
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

  return { driver: 'file', init, create, findAll, findByIds, markStatus, count, clear, close };
};

module.exports = createFileMessageRepository;
