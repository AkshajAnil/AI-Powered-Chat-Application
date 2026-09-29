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

const connectSocket = async (
  baseUrl,
  username = `Tester${Math.random().toString(36).slice(2, 8)}`
) => {
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'test-password' }),
  }).then((response) => response.json());
  const socket = ioClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    auth: { token: registration.data.token },
  });
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

  const regularSession = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'NormalUser', password: 'test-password' }),
  }).then((response) => response.json());
  const post = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${regularSession.data.token}`,
    },
    body: JSON.stringify({ author: 'Atlas', text: 'impersonation' }),
  });
  assert.equal(post.status, 201);
  assert.equal((await post.json()).data.author, 'NormalUser');

  const socket = await connectSocket(baseUrl);
  t.after(() => socket.disconnect());
  await assert.rejects(emitAck(socket, 'join', { username: 'Sage' }), /another user/);
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

  const alice = await connectSocket(baseUrl, 'Alice');
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

  const alice = await connectSocket(baseUrl, 'Alice');
  const bob = await connectSocket(baseUrl, 'Bob');
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

test('solo user + no mention → agents stay quiet in the global chat', async (t) => {
  const { baseUrl, cleanup } = await startTestServer(FAKE_GROQ);
  t.after(cleanup);

  const alice = await connectSocket(baseUrl, 'Alice');
  t.after(() => alice.disconnect());
  await emitAck(alice, 'join', { username: 'Alice' });

  let agentReply = null;
  const typingAgents = new Set();
  alice.on('message:new', (message) => {
    if (isReservedName(message.author)) agentReply = message;
  });
  alice.on('typing:update', ({ users }) => {
    users.filter(isReservedName).forEach((name) => typingAgents.add(name));
  });
  await emitAck(alice, 'message:send', { text: '@Alice can you help me?', clientId: 'm-2b' });
  await new Promise((resolve) => setTimeout(resolve, 400));

  assert.equal(agentReply, null);
  assert.deepEqual([...typingAgents], []);
});

test('the active global agent answers follow-ups until another agent is mentioned', async (t) => {
  const { baseUrl, cleanup } = await startTestServer(FAKE_GROQ);
  t.after(cleanup);

  const alice = await connectSocket(baseUrl, 'Alice');
  t.after(() => alice.disconnect());
  await emitAck(alice, 'join', { username: 'Alice' });

  const agentReplies = [];
  const agentTyping = new Set();
  alice.on('message:new', (message) => {
    if (isReservedName(message.author)) agentReplies.push(message.author);
  });
  alice.on('typing:update', ({ users }) => {
    users.filter(isReservedName).forEach((name) => agentTyping.add(name));
  });

  const firstNovaReply = waitFor(alice, 'message:new', (message) => message.author === 'Nova');
  await emitAck(alice, 'message:send', {
    text: '@Nova please help with this',
    clientId: 'm-targeted-agent',
  });
  await firstNovaReply;

  const novaFollowUp = waitFor(alice, 'message:new', (message) => message.author === 'Nova');
  await emitAck(alice, 'message:send', {
    text: 'Can you give me one more detail?',
    clientId: 'm-active-agent-follow-up',
  });
  await novaFollowUp;

  const switchToSage = waitFor(alice, 'message:new', (message) => message.author === 'Sage');
  await emitAck(alice, 'message:send', {
    text: '@Sage answer this instead',
    clientId: 'm-switch-active-agent',
  });
  await switchToSage;

  const sageFollowUp = waitFor(alice, 'message:new', (message) => message.author === 'Sage');
  await emitAck(alice, 'message:send', {
    text: 'And can you clarify that?',
    clientId: 'm-new-active-agent-follow-up',
  });
  await sageFollowUp;

  assert.deepEqual(agentReplies, ['Nova', 'Nova', 'Sage', 'Sage']);
  assert.deepEqual([...agentTyping], ['Nova', 'Sage']);
});

test('agent one-to-one chats respond privately and keep separate history', async (t) => {
  const { baseUrl, cleanup } = await startTestServer(FAKE_GROQ);
  t.after(cleanup);

  const alice = await connectSocket(baseUrl, 'Alice');
  const bob = await connectSocket(baseUrl, 'Bob');
  t.after(() => {
    alice.disconnect();
    bob.disconnect();
  });
  await emitAck(alice, 'join', { username: 'Alice' });
  await emitAck(bob, 'join', { username: 'Bob' });

  let bobReceivedDirectMessage = false;
  bob.on('message:new', (message) => {
    if (message.conversationId !== 'global') bobReceivedDirectMessage = true;
  });

  const opened = await emitAck(alice, 'conversation:join', { agent: 'Nova' });
  assert.match(opened.conversationId, /^agent:Alice:nova$/);
  assert.deepEqual(opened.messages, []);

  const replySeen = waitFor(alice, 'message:new', (message) => message.author === 'Nova');
  const sent = await emitAck(alice, 'message:send', {
    text: 'Please help me with this privately.',
    clientId: 'm-dm-1',
  });
  const reply = await replySeen;
  assert.equal(reply.conversationId, opened.conversationId);
  assert.equal(reply.text, 'Fake Nova reply: 42.');
  assert.equal(sent.message.conversationId, opened.conversationId);

  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(bobReceivedDirectMessage, false);
  const auth = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Alice', password: 'test-password' }),
  }).then((response) => response.json());
  const globalHistory = await fetch(`${baseUrl}/api/messages`, {
    headers: { authorization: `Bearer ${auth.data.token}` },
  }).then((response) => response.json());
  assert.equal(globalHistory.data.length, 0);

  const reopened = await emitAck(alice, 'conversation:join', { agent: 'Nova' });
  assert.deepEqual(
    reopened.messages.map((message) => message.text).sort(),
    ['Fake Nova reply: 42.', 'Please help me with this privately.'].sort()
  );
  const bobHistory = await emitAck(bob, 'conversation:join', { agent: 'Nova' });
  assert.deepEqual(bobHistory.messages, []);
  assert.equal(
    reopened.messages.find((message) => message.text === 'Please help me with this privately.').status,
    'read'
  );
});

test('agent answers show a typing indicator while thinking', async (t) => {
  let resolveChat;
  const slowGroq = {
    isConfigured: () => true,
    chat: () => new Promise((resolve) => (resolveChat = () => resolve('done thinking'))),
  };

  const { baseUrl, cleanup } = await startTestServer(slowGroq);
  t.after(cleanup);

  const alice = await connectSocket(baseUrl, 'Alice');
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
