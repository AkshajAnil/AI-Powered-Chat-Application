const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io: ioClient } = require('socket.io-client');

const { createServer } = require('../src/server');
const { findAgent, isReservedName, AGENTS } = require('../src/agents/registry');

const FAKE_GROQ = {
  isConfigured: () => true,
  chat: async ({ system, messages }) => {
    assert.ok(system.includes('Nova') || system.length > 0, 'system prompt is sent');
    assert.ok(messages.length > 0, 'chat context is sent');
    return 'Fake Nova reply: 42.';
  },
};

const NO_GROQ = { isConfigured: () => false, chat: async () => 'unused' };

const startTestServer = async (groq) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-agents-'));
  const server = await createServer({
    config: { logLevel: 'silent', corsOrigins: ['*'], host: '127.0.0.1' },
    repository: { driver: 'file', filePath: path.join(dir, 'messages.json') },
    groq,
  });
  await new Promise((resolve) => server.httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = server.httpServer.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
    cleanup: async () => {
      await server.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
};

const connectSocket = async (baseUrl) => {
  const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  return socket;
};

const emitAck = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    socket.emit(event, payload, (response) => {
      if (response?.ok) resolve(response);
      else reject(new Error(response?.error?.message || 'ack failed'));
    });
  });

const waitFor = (socket, event, predicate = () => true, timeoutMs = 5000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    const handler = (data) => {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    };
    socket.on(event, handler);
  });

test('agent registry: names are reserved and findable', () => {
  assert.ok(AGENTS.length >= 3);
  assert.ok(findAgent('NOVA'), 'lookup is case-insensitive');
  assert.equal(findAgent('nobody'), null);
  assert.ok(isReservedName('nova'));
  assert.ok(!isReservedName('ada'));
});

test('agents cannot be impersonated via login, REST or socket join', async (t) => {
  const { baseUrl, cleanup } = await startTestServer(NO_GROQ);
  t.after(cleanup);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Nova' }),
  });
  assert.equal(login.status, 400);

  const post = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author: 'Atlas', text: 'impersonation' }),
  });
  assert.equal(post.status, 400);

  const socket = await connectSocket(baseUrl);
  t.after(() => socket.disconnect());
  await assert.rejects(emitAck(socket, 'join', { username: 'Sage' }), /AI agent/);
});

test('GET /api/agents lists the personas', async (t) => {
  const { baseUrl, cleanup } = await startTestServer(NO_GROQ);
  t.after(cleanup);

  const body = await fetch(`${baseUrl}/api/agents`).then((r) => r.json());
  assert.equal(body.success, true);
  assert.deepEqual(
    body.data.map((a) => a.name),
    AGENTS.map((a) => a.name)
  );
  assert.ok(body.data[0].description);
});

test('@mention triggers an agent reply through Groq', async (t) => {
  const { baseUrl, cleanup } = await startTestServer(FAKE_GROQ);
  t.after(cleanup);

  const alice = await connectSocket(baseUrl);
  t.after(() => alice.disconnect());
  await emitAck(alice, 'join', { username: 'Alice' });

  const agentReply = waitFor(alice, 'message:new', (m) => m.author === 'Nova');
  const readBack = waitFor(alice, 'message:status', (u) => u.status === 'read');
  const sent = await emitAck(alice, 'message:send', { text: '@Nova what is the answer?', clientId: 'm-1' });

  const reply = await agentReply;
  assert.equal(reply.text, 'Fake Nova reply: 42.');
  assert.ok(reply.id !== sent.message.id);

  const statusUpdate = await readBack;
  assert.equal(statusUpdate.id, sent.message.id, 'the triggering message is marked read');
});

test('no mention + another human online → agents stay quiet', async (t) => {
  const { baseUrl, cleanup } = await startTestServer(FAKE_GROQ);
  t.after(cleanup);

  const alice = await connectSocket(baseUrl);
  const bob = await connectSocket(baseUrl);
  t.after(() => {
    alice.disconnect();
    bob.disconnect();
  });
  await emitAck(alice, 'join', { username: 'Alice' });
  await emitAck(bob, 'join', { username: 'Bob' });

  let unexpected = null;
  alice.on('message:new', (m) => {
    if (m.author !== 'Alice' && m.author !== 'Bob') unexpected = m;
  });

  await emitAck(alice, 'message:send', { text: 'just chatting with humans', clientId: 'm-2' });
  await new Promise((resolve) => setTimeout(resolve, 500));

  assert.equal(unexpected, null, 'no agent message should be broadcast');
});

test('solo user + no mention → fallback agent answers', async (t) => {
  const { baseUrl, cleanup } = await startTestServer(FAKE_GROQ);
  t.after(cleanup);

  const alice = await connectSocket(baseUrl);
  t.after(() => alice.disconnect());
  await emitAck(alice, 'join', { username: 'Alice' });

  const fallbackReply = waitFor(alice, 'message:new', (m) => m.author === 'Sage');
  await emitAck(alice, 'message:send', { text: 'anyone there?', clientId: 'm-2b' });

  const reply = await fallbackReply;
  assert.equal(reply.text, 'Fake Nova reply: 42.');
});

test('agent answers show a typing indicator while thinking', async (t) => {
  let resolveChat;
  const slowGroq = {
    isConfigured: () => true,
    chat: () => new Promise((resolve) => (resolveChat = () => resolve('done thinking'))),
  };

  const { baseUrl, cleanup } = await startTestServer(slowGroq);
  t.after(cleanup);

  const alice = await connectSocket(baseUrl);
  t.after(() => alice.disconnect());
  await emitAck(alice, 'join', { username: 'Alice' });

  const typingSeen = waitFor(alice, 'typing:update', (u) => u.users.includes('Nova'));
  await emitAck(alice, 'message:send', { text: '@Nova slow question', clientId: 'm-3' });
  await typingSeen;

  for (let i = 0; i < 100 && !resolveChat; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.ok(resolveChat, 'groq.chat was invoked');

  const replySeen = waitFor(alice, 'message:new', (m) => m.author === 'Nova');
  resolveChat();
  assert.equal((await replySeen).text, 'done thinking');
});
