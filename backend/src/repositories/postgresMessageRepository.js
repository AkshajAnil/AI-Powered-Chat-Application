const crypto = require('crypto');

const { normalizeStatus } = require('./messageStatus');

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const ROW_MAP = `
  id,
  author,
  text,
  status,
  client_id AS "clientId",
  conversation_id AS "conversationId",
  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
`;

/**
 * PostgreSQL message store (node-postgres Pool).
 * Implements the same repository contract as the sqlite/file stores, but
 * asynchronously - the service layer always awaits repository results.
 */
const createPostgresMessageRepository = ({ poolConfig, table = 'messages' }) => {
  if (!IDENTIFIER.test(table)) {
    throw new Error(`Unsafe table name: ${table}`);
  }

  let pool;

  const init = async () => {
    const { Pool } = require('pg');
    pool = new Pool({ ...poolConfig, application_name: 'chat-backend' });
    pool.on('error', (err) => {
      // emitted for idle clients; keep the process alive
      // eslint-disable-next-line no-console
      console.error('[postgres] idle client error:', err.message);
    });

    await pool.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        id         TEXT PRIMARY KEY,
        author     TEXT NOT NULL,
        text       TEXT NOT NULL,
        status     TEXT NOT NULL DEFAULT 'sent',
        client_id  TEXT,
        conversation_id TEXT NOT NULL DEFAULT 'global',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS conversation_id TEXT NOT NULL DEFAULT 'global'`
    );
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${table}_created_at ON ${table} (created_at DESC)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_${table}_conversation_created_at ON ${table} (conversation_id, created_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_ci ON users (lower(username))
    `);
  };

  const create = async ({ author, text, clientId, conversationId = 'global' }) => {
    const message = {
      id: crypto.randomUUID(),
      author,
      text,
      status: 'sent',
      clientId: clientId || null,
      conversationId,
      createdAt: new Date().toISOString(),
    };

    const { rows } = await pool.query(
      `INSERT INTO ${table} (id, author, text, status, client_id, conversation_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, author, text, status, client_id AS "clientId",
                  conversation_id AS "conversationId",
                  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`,
      [
        message.id,
        message.author,
        message.text,
        message.status,
        message.clientId,
        message.conversationId,
        message.createdAt,
      ]
    );
    return rows[0];
  };

  const findAll = async ({ limit = 50, before = null, after = null, conversationId = 'global' } = {}) => {
    const { rows } = await pool.query(
      `SELECT ${ROW_MAP} FROM ${table}
        WHERE conversation_id = $1
          AND ($2::timestamptz IS NULL OR created_at < $2::timestamptz)
          AND ($3::timestamptz IS NULL OR created_at >= $3::timestamptz)
        ORDER BY created_at DESC
        LIMIT $4`,
      [conversationId, before, after, limit]
    );
    return rows.reverse();
  };

  const findByIds = async (ids = []) => {
    if (ids.length === 0) return [];
    const { rows } = await pool.query(
      `SELECT ${ROW_MAP} FROM ${table} WHERE id = ANY($1::text[])`,
      [ids]
    );
    return rows;
  };

  const markStatus = async (ids = [], status) => {
    if (ids.length === 0) return [];
    const target = normalizeStatus(status);

    const guard = {
      delivered: `status = 'sent'`,
      read: `status IN ('sent', 'delivered')`,
    }[target];

    if (!guard) return [];

    const { rows } = await pool.query(
      `UPDATE ${table} SET status = $1
        WHERE id = ANY($2::text[]) AND ${guard}
        RETURNING id, author, text, status, client_id AS "clientId",
                  conversation_id AS "conversationId",
                  to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`,
      [target, ids]
    );
    return rows;
  };

  const count = async () => {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
    return rows[0].total;
  };

  const findUserByUsername = async (username) => {
    const { rows } = await pool.query(
      `SELECT id, username, password_hash AS "passwordHash",
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
         FROM users WHERE lower(username) = lower($1)`,
      [username]
    );
    return rows[0] || null;
  };

  const createUser = async ({ username, passwordHash }) => {
    const { rows } = await pool.query(
      `INSERT INTO users (id, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, password_hash AS "passwordHash",
                 to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"`,
      [crypto.randomUUID(), username, passwordHash]
    );
    return rows[0];
  };

  const clear = async () => pool.query(`DELETE FROM ${table}`);

  const close = async () => pool?.end();

  return {
    driver: 'postgres',
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

module.exports = createPostgresMessageRepository;
