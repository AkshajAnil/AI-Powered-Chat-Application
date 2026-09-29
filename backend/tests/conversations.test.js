const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const createSqliteMessageRepository = require('../src/repositories/sqliteMessageRepository');

test('SQLite migrates existing messages and scopes global and agent histories', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-conversations-'));
  const filePath = path.join(directory, 'messages.db');
  const Database = require('better-sqlite3');
  const legacyDb = new Database(filePath);
  legacyDb.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      client_id TEXT,
      created_at TEXT NOT NULL
    )
  `);
  legacyDb
    .prepare(
      'INSERT INTO messages (id, author, text, status, client_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run('legacy-message', 'Ada', 'Old global message', 'sent', null, new Date().toISOString());
  legacyDb.close();

  let repository;
  t.after(() => {
    repository?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  repository = createSqliteMessageRepository({ filePath });
  repository.init();
  assert.equal(repository.findAll()[0].conversationId, 'global');
  assert.deepEqual(
    repository.findAll({ after: repository.findAll()[0].createdAt }).map((message) => message.id),
    ['legacy-message'],
    'the account-creation timestamp is included in global history'
  );
  assert.deepEqual(
    repository.findAll({ after: '2099-01-01T00:00:00.000Z' }),
    [],
    'messages before the account-creation timestamp are filtered out'
  );
  repository.createUser({ username: 'pilot_user', passwordHash: 'scrypt$test$hash' });
  assert.equal(repository.findUserByUsername('PILOT_USER').username, 'pilot_user');

  const directMessage = repository.create({
    author: 'Ada',
    text: 'Private message',
    conversationId: 'agent:Ada:nova',
  });
  assert.deepEqual(repository.findAll().map((message) => message.id), ['legacy-message']);
  assert.deepEqual(
    repository.findAll({ conversationId: 'agent:Ada:nova' }).map((message) => message.id),
    [directMessage.id]
  );

  repository.close();
  repository = createSqliteMessageRepository({ filePath });
  repository.init();
  assert.equal(repository.findAll({ conversationId: 'agent:Ada:nova' })[0].text, 'Private message');
  assert.equal(repository.findUserByUsername('pilot_user').passwordHash, 'scrypt$test$hash');
});
