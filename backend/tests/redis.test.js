const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const createMessageRepository = require('../src/repositories/messageRepository');

test('redis repository: messages, conversations, status, and users', async (t) => {
  const keyPrefix = `chat-test-${crypto.randomUUID()}`;
  const repository = createMessageRepository({
    driver: 'redis',
    redisConfig: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix,
    },
  });

  try {
    await repository.init();
  } catch (err) {
    await repository.close();
    t.skip(`Redis unavailable: ${err.message}`);
    return;
  }

  t.after(async () => {
    await repository.clear();
    await repository.close();
    const { createClient } = require('redis');
    const cleanup = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
    await cleanup.connect();
    const keys = await cleanup.keys(`${keyPrefix}:*`);
    if (keys.length) await cleanup.del(keys);
    await cleanup.quit();
  });

  const first = await repository.create({ author: 'Ada', text: 'first', clientId: 'redis-1' });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const second = await repository.create({ author: 'Ada', text: 'second', clientId: 'redis-2' });
  const privateMessage = await repository.create({
    author: 'Ada',
    text: 'private',
    conversationId: 'agent:Ada:nova',
  });

  assert.equal(first.status, 'sent');
  assert.equal(first.clientId, 'redis-1');
  assert.deepEqual(
    (await repository.findAll({ limit: 10 })).map((message) => message.text),
    ['first', 'second']
  );
  assert.deepEqual(
    (await repository.findAll({ limit: 10, before: second.createdAt })).map((message) => message.id),
    [first.id]
  );
  assert.deepEqual(
    (await repository.findAll({ limit: 10, after: second.createdAt })).map((message) => message.id),
    [second.id]
  );
  assert.equal((await repository.findAll({ conversationId: 'agent:Ada:nova' }))[0].id, privateMessage.id);

  assert.equal((await repository.markStatus([first.id], 'delivered'))[0].status, 'delivered');
  assert.equal((await repository.markStatus([first.id], 'read'))[0].status, 'read');
  assert.deepEqual(await repository.markStatus([first.id], 'delivered'), []);
  assert.equal((await repository.findByIds([first.id, 'missing'])).length, 1);
  assert.equal(await repository.count(), 3);

  const user = await repository.createUser({ username: 'pilot_user', passwordHash: 'test-hash' });
  assert.equal((await repository.findUserByUsername('PILOT_USER')).id, user.id);
  await assert.rejects(
    repository.createUser({ username: 'PILOT_USER', passwordHash: 'other-hash' }),
    { code: 'USER_EXISTS' }
  );

  await repository.clear();
  assert.equal(await repository.count(), 0);
  assert.equal((await repository.findUserByUsername('pilot_user')).id, user.id);
});
