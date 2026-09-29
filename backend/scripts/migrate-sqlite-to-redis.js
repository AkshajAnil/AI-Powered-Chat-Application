const Database = require('better-sqlite3');

const config = require('../src/config/env');
const createRedisMessageRepository = require('../src/repositories/redisMessageRepository');

const migrate = async () => {
  const database = new Database(config.db.filePath, { readonly: true });
  const repository = createRedisMessageRepository({ redisConfig: config.db.redis });
  let importedMessages = 0;
  let importedUsers = 0;
  let existingUsers = 0;

  try {
    await repository.init();
    const messages = database
      .prepare(
        `SELECT id, author, text, status, client_id AS clientId,
                conversation_id AS conversationId, created_at AS createdAt
           FROM messages`
      )
      .all();
    const users = database
      .prepare(
        `SELECT id, username, password_hash AS passwordHash, created_at AS createdAt
           FROM users`
      )
      .all();

    for (const message of messages) {
      if (await repository.importMessage(message)) importedMessages += 1;
    }
    for (const user of users) {
      if (await repository.findUserByUsername(user.username)) {
        existingUsers += 1;
        continue;
      }
      await repository.importUser(user);
      importedUsers += 1;
    }

    console.log(
      `Redis migration complete: ${importedMessages} messages imported, ${importedUsers} users imported, ${existingUsers} existing users preserved.`
    );
  } finally {
    database.close();
    await repository.close();
  }
};

migrate().catch((err) => {
  console.error('SQLite to Redis migration failed:', err.message || err);
  process.exitCode = 1;
});
