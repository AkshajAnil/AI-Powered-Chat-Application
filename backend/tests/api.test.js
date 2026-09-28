const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io: ioClient } = require('socket.io-client');

const { createServer } = require('../src/server');

const startTestServer = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-test-'));
  const server = await createServer({
    config: { logLevel: 'silent', corsOrigins: ['*'], host: '127.0.0.1' },
    repository: { driver: 'file', filePath: path.join(dir, 'messages.json') },
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

const waitFor = (socket, event, timeoutMs = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), timeoutMs);
    socket.once(event, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

test('REST: health, message creation, history and validation', async (t) => {
  const { baseUrl, cleanup } = await startTestServer();
  t.after(cleanup);

  const health = await fetch(`${baseUrl}/api/health`).then((r) => r.json());
  assert.equal(health.success, true);

  const created = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author: 'Ada', text: 'Hello world', clientId: 'c-1' }),
  }).then((r) => r.json());
  assert.equal(created.success, true);
  assert.equal(created.data.author, 'Ada');
  // 'delivered' when someone else is online (including always-online AI agents)
  assert.ok(['sent', 'delivered'].includes(created.data.status));
  assert.ok(created.data.createdAt);

  const history = await fetch(`${baseUrl}/api/messages`).then((r) => r.json());
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].text, 'Hello world');

  const invalid = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ author: 'Ada', text: '   ' }),
  });
  assert.equal(invalid.status, 400);

  const missing = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(missing.status, 404);
});

test('REST: dummy login validates username', async (t) => {
  const { baseUrl, cleanup } = await startTestServer();
  t.after(cleanup);

  const ok = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Grace' }),
  }).then((r) => r.json());
  assert.equal(ok.data.username, 'Grace');
  assert.ok(ok.data.token);

  const bad = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'x' }),
  });
  assert.equal(bad.status, 400);
});

test('Socket.io: broadcast, presence, typing and read receipts', async (t) => {
  const { baseUrl, cleanup } = await startTestServer();
  t.after(cleanup);

  const alice = await connectSocket(baseUrl);
  const bob = await connectSocket(baseUrl);
  t.after(() => {
    alice.disconnect();
    bob.disconnect();
  });

  const bobSeesAliceOnline = waitFor(bob, 'presence:update');
  await emitAck(alice, 'join', { username: 'Alice' });
  await emitAck(bob, 'join', { username: 'Bob' });
  const presenceUpdate = await bobSeesAliceOnline;
  assert.equal(presenceUpdate.username, 'Alice');
  assert.equal(presenceUpdate.status, 'online');
  assert.ok(presenceUpdate.onlineUsers.includes('Alice'));

  const bobReceives = waitFor(bob, 'message:new');
  const sent = await emitAck(alice, 'message:send', { text: 'Hi Bob', clientId: 'c-1' });
  assert.equal(sent.message.text, 'Hi Bob');
  assert.equal(sent.message.status, 'delivered');

  const received = await bobReceives;
  assert.equal(received.id, sent.message.id);
  assert.equal(received.author, 'Alice');

  const typingSeen = waitFor(bob, 'typing:update');
  alice.emit('typing', { isTyping: true });
  const typingUpdate = await typingSeen;
  assert.deepEqual(typingUpdate.users, ['Alice']);

  const statusSeen = waitFor(alice, 'message:status');
  await emitAck(bob, 'message:read', { ids: [received.id] });
  const statusUpdate = await statusSeen;
  assert.equal(statusUpdate.id, received.id);
  assert.equal(statusUpdate.status, 'read');

  const offlineSeen = waitFor(bob, 'presence:update');
  alice.disconnect();
  const offline = await offlineSeen;
  assert.equal(offline.username, 'Alice');
  assert.equal(offline.status, 'offline');
});

test('Socket.io: sending before join is rejected gracefully', async (t) => {
  const { baseUrl, cleanup } = await startTestServer();
  t.after(cleanup);

  const socket = await connectSocket(baseUrl);
  t.after(() => socket.disconnect());

  await assert.rejects(
    emitAck(socket, 'message:send', { text: 'nope' }),
    /Join the chat before sending messages/
  );
});
