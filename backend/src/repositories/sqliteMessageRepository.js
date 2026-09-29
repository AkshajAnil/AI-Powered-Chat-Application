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
        conversation_id TEXT NOT NULL DEFAULT 'global',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages (created_at DESC);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users (lower(username));
    `);
    const columns = db.prepare('PRAGMA table_info(messages)').all();
    if (!columns.some((column) => column.name === 'conversation_id')) {
      db.exec("ALTER TABLE messages ADD COLUMN conversation_id TEXT NOT NULL DEFAULT 'global'");
    }
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages (conversation_id, created_at DESC)'
    );

    stmt = {
      insert: db.prepare(
        `INSERT INTO messages (id, author, text, status, client_id, conversation_id, created_at)
         VALUES (@id, @author, @text, @status, @clientId, @conversationId, @createdAt)`
      ),
      selectPage: db.prepare(
        `SELECT id, author, text, status, client_id AS clientId,
                conversation_id AS conversationId, created_at AS createdAt
           FROM messages
          WHERE conversation_id = @conversationId
            AND (@before IS NULL OR created_at < @before)
            AND (@after IS NULL OR created_at >= @after)
          ORDER BY created_at DESC
          LIMIT @limit`
      ),
      selectById: db.prepare(
        `SELECT id, author, text, status, client_id AS clientId,
                conversation_id AS conversationId, created_at AS createdAt
           FROM messages WHERE id = ?`
      ),
      updateStatus: db.prepare(`UPDATE messages SET status = ? WHERE id = ?`),
      clearAll: db.prepare(`DELETE FROM messages`),
      count: db.prepare(`SELECT COUNT(*) AS total FROM messages`),
      findUser: db.prepare(
        'SELECT id, username, password_hash AS passwordHash, created_at AS createdAt FROM users WHERE lower(username) = lower(?)'
      ),
      insertUser: db.prepare(
        'INSERT INTO users (id, username, password_hash, created_at) VALUES (@id, @username, @passwordHash, @createdAt)'
      ),
    };
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
    stmt.insert.run(message);
    return message;
  };

  const findAll = ({ limit = 50, before = null, after = null, conversationId = 'global' } = {}) => {
    const rows = stmt.selectPage.all({ limit, before, after, conversationId });
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

  const findUserByUsername = (username) => stmt.findUser.get(username) || null;

  const createUser = ({ username, passwordHash }) => {
    const user = {
      id: crypto.randomUUID(),
      username,
      passwordHash,
      createdAt: new Date().toISOString(),
    };
    stmt.insertUser.run(user);
    return user;
  };

  const clear = () => stmt.clearAll.run();

  const close = () => db?.close();

  return {
    driver: 'sqlite',
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

module.exports = createSqliteMessageRepository;
