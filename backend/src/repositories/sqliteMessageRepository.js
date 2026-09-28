const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { STATUS_RANK, normalizeStatus } = require('./messageStatus');

/**
 * SQLite-backed message store (better-sqlite3, synchronous and zero-config).
 * All statements are prepared once during init() for predictable performance.
 */
const createSqliteMessageRepository = ({ filePath }) => {
  let db;
  let stmt;

  const init = () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const Database = require('better-sqlite3');
    db = new Database(filePath);
    db.pragma('journal_mode = WAL');

    db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id         TEXT PRIMARY KEY,
        author     TEXT NOT NULL,
        text       TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'sent',
        client_id  TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at DESC);
    `);

    stmt = {
      insert: db.prepare(
        `INSERT INTO messages (id, author, text, status, client_id, created_at)
         VALUES (@id, @author, @text, @status, @clientId, @createdAt)`
      ),
      selectPage: db.prepare(
        `SELECT id, author, text, status, client_id AS clientId, created_at AS createdAt
           FROM messages
          WHERE (@before IS NULL OR created_at < @before)
          ORDER BY created_at DESC
          LIMIT @limit`
      ),
      selectById: db.prepare(
        `SELECT id, author, text, status, client_id AS clientId, created_at AS createdAt
           FROM messages WHERE id = ?`
      ),
      updateStatus: db.prepare(`UPDATE messages SET status = ? WHERE id = ?`),
      clearAll: db.prepare(`DELETE FROM messages`),
      count: db.prepare(`SELECT COUNT(*) AS total FROM messages`),
    };
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
    stmt.insert.run(message);
    return message;
  };

  const findAll = ({ limit = 50, before = null } = {}) => {
    const rows = stmt.selectPage.all({ limit, before });
    return rows.reverse();
  };

  const findByIds = (ids = []) => ids.map((id) => stmt.selectById.get(id)).filter(Boolean);

  const markStatus = (ids = [], status) => {
    const target = normalizeStatus(status);
    const changed = [];
    db.transaction(() => {
      for (const id of ids) {
        const row = stmt.selectById.get(id);
        if (!row) continue;
        if (STATUS_RANK[target] > STATUS_RANK[row.status]) {
          stmt.updateStatus.run(target, id);
          changed.push({ ...row, status: target });
        }
      }
    })();
    return changed;
  };

  const count = () => stmt.count.get().total;

  const clear = () => stmt.clearAll.run();

  const close = () => db?.close();

  return { driver: 'sqlite', init, create, findAll, findByIds, markStatus, count, clear, close };
};

module.exports = createSqliteMessageRepository;
