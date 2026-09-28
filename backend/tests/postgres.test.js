const test = require('node:test');
const assert = require('node:assert/strict');

const createMessageRepository = require('../src/repositories/messageRepository');

test('postgres repository: full contract', async (t) => {
  const repository = createMessageRepository({ driver: 'postgres', table: 'messages_test' });

  try {
    await repository.init();
  } catch (err) {
    t.skip(`PostgreSQL unavailable: ${err.message}`);
    return;
  }

  t.after(async () => {
    await repository.clear();
    await repository.close();
  });
  await repository.clear();

  const created = await repository.create({ author: 'Ada', text: 'pg works', clientId: 't-1' });
  assert.equal(created.status, 'sent');
  assert.ok(created.id);
  assert.ok(!Number.isNaN(Date.parse(created.createdAt)));

  const page = await repository.findAll({ limit: 10 });
  assert.equal(page.length, 1);
  assert.equal(page[0].text, 'pg works');

  const [found] = await repository.findByIds([created.id]);
  assert.equal(found.clientId, 't-1');

  const [delivered] = await repository.markStatus([created.id], 'delivered');
  assert.equal(delivered.status, 'delivered');

  const [read] = await repository.markStatus([created.id], 'read');
  assert.equal(read.status, 'read');

  const downgrade = await repository.markStatus([created.id], 'delivered');
  assert.equal(downgrade.length, 0, 'statuses never move backwards');

  assert.equal(await repository.count(), 1);

  const emptyPage = await repository.findAll({ limit: 10, before: created.createdAt });
  assert.equal(emptyPage.length, 0, 'before-cursor excludes the message itself');
});
