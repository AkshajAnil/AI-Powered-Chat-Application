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

const registerUser = async (baseUrl, username, password = 'test-password') => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json();
  assert.equal(response.status, 201, body.error?.message);
  return body.data;
};

const connectSocket = async (baseUrl, username = `Socket${Math.random().toString(36).slice(2, 8)}`) => {
  const session = await registerUser(baseUrl, username);
  const socket = ioClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    auth: { token: session.token },
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
  const session = await registerUser(baseUrl, 'Ada');
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${session.token}`,
  };

  const created = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ author: 'Ada', text: 'Hello world', clientId: 'c-1' }),
  }).then((r) => r.json());
  assert.equal(created.success, true);
  assert.equal(created.data.author, 'Ada');
  // 'delivered' when someone else is online (including always-online AI agents)
  assert.ok(['sent', 'delivered'].includes(created.data.status));
  assert.ok(created.data.createdAt);

  const history = await fetch(`${baseUrl}/api/messages`, { headers }).then((r) => r.json());
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].text, 'Hello world');

  const invalid = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ author: 'Ada', text: '   ' }),
  });
  assert.equal(invalid.status, 400);
  assert.equal((await fetch(`${baseUrl}/api/messages`)).status, 401);

  const missing = await fetch(`${baseUrl}/api/unknown`);
  assert.equal(missing.status, 404);
});

test('new users only receive global history from account creation onward', async (t) => {
  const { baseUrl, cleanup } = await startTestServer();
  t.after(cleanup);

  const existingUser = await registerUser(baseUrl, 'ExistingUser');
  await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${existingUser.token}`,
    },
    body: JSON.stringify({ text: 'Before the new user joined' }),
  });
  await new Promise((resolve) => setTimeout(resolve, 20));

  const newUser = await registerUser(baseUrl, 'NewMember');
  const joinedAt = JSON.parse(Buffer.from(newUser.token.split('.')[1], 'base64url')).joinedAt;
  assert.ok(joinedAt, 'JWT records when the account joined');
  const socket = ioClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    auth: { token: newUser.token },
  });
  t.after(() => socket.disconnect());
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  await emitAck(socket, 'join', { username: 'NewMember' });
  const socketHistory = await emitAck(socket, 'conversation:join', {});
  assert.deepEqual(socketHistory.messages, [], 'socket history also hides messages from before signup');

  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${newUser.token}`,
  };
  const created = await fetch(`${baseUrl}/api/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'After the new user joined' }),
  }).then((response) => response.json());
  const history = await fetch(`${baseUrl}/api/messages`, { headers }).then((response) =>
    response.json()
  );

  assert.deepEqual(
    history.data.map((message) => message.text),
    ['After the new user joined']
  );
  assert.ok(Date.parse(history.data[0].createdAt) >= Date.parse(joinedAt));
  assert.ok(created.data);
});

test('REST: seed account login, JWT validation, and account registration', async (t) => {
  const { baseUrl, server, cleanup } = await startTestServer();
  t.after(cleanup);

  const seedUser = await server.repository.findUserByUsername('pilot_user');
  assert.equal(seedUser.username, 'pilot_user');
  assert.match(seedUser.passwordHash, /^scrypt\$/);

  const demo = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'pilot_user', password: '1234' }),
  }).then((r) => r.json());
  assert.equal(demo.data.username, 'pilot_user');
  assert.ok(demo.data.token.split('.').length === 3);

  const badPassword = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'pilot_user', password: 'wrong' }),
  });
  assert.equal(badPassword.status, 401);

  const created = await registerUser(baseUrl, 'Grace');
  assert.equal(created.username, 'Grace');
  assert.equal(created.token.split('.').length, 3, 'registration creates an authenticated JWT session');
  const registeredUser = await server.repository.findUserByUsername('Grace');
  assert.match(registeredUser.passwordHash, /^scrypt\$/, 'registration stores a password hash, not plaintext');
  const ok = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Grace', password: 'test-password' }),
  }).then((r) => r.json());
  assert.equal(ok.data.username, 'Grace');

  const bad = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'x', password: '1234' }),
  });
  assert.equal(bad.status, 400);
  const forgedJwt = await fetch(`${baseUrl}/api/messages`, {
    headers: { authorization: 'Bearer forged.jwt.token' },
  });
  assert.equal(forgedJwt.status, 401);

  const duplicate = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'grace', password: 'another-password' }),
  });
  assert.equal(duplicate.status, 409, 'usernames are unique regardless of letter case');
});

test('Socket.io: broadcast, presence, typing and read receipts', async (t) => {
  const { baseUrl, cleanup } = await startTestServer();
  t.after(cleanup);

  const alice = await connectSocket(baseUrl, 'Alice');
  const bob = await connectSocket(baseUrl, 'Bob');
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

test('Socket.io: invalid JWTs cannot connect', async (t) => {
  const { baseUrl, cleanup } = await startTestServer();
  t.after(cleanup);

  const socket = ioClient(baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    auth: { token: 'not.a.jwt' },
    reconnection: false,
  });
  t.after(() => socket.disconnect());
  await assert.rejects(
    new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    }),
    /Authentication required/
  );
});
