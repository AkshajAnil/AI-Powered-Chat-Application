const { STATUS_RANK, normalizeStatus } = require('../repositories/messageStatus');

/**
 * Tracks which usernames are connected (a user may have several sockets open).
 * "Virtual" users (AI agents) are always online but hold no sockets.
 */
const createPresenceStore = () => {
  const socketsByUsername = new Map();
  const virtualUsers = new Set();

  const add = (username, socketId) => {
    const sockets = socketsByUsername.get(username) || new Set();
    const firstConnection = sockets.size === 0;
    sockets.add(socketId);
    socketsByUsername.set(username, sockets);
    return { username, isNewUser: firstConnection };
  };

  const remove = (socketId) => {
    for (const [username, sockets] of socketsByUsername) {
      if (!sockets.has(socketId)) continue;
      sockets.delete(socketId);
      if (sockets.size === 0) {
        socketsByUsername.delete(username);
        return { username, isOffline: true };
      }
      return { username, isOffline: false };
    }
    return null;
  };

  const addVirtual = (username) => virtualUsers.add(username);
  const removeVirtual = (username) => virtualUsers.delete(username);

  const isOnline = (username) =>
    virtualUsers.has(username) || Boolean(socketsByUsername.get(username)?.size);

  const onlineUsers = () =>
    [...new Set([...socketsByUsername.keys(), ...virtualUsers])].sort((a, b) => a.localeCompare(b));

  const reset = () => {
    socketsByUsername.clear();
    virtualUsers.clear();
  };

  return { add, remove, addVirtual, removeVirtual, isOnline, onlineUsers, reset };
};

/** In-memory typing state with automatic timeout (users rarely press "stop"). */
const createTypingStore = ({ onChange, timeoutMs = 3000 } = {}) => {
  const timers = new Map();
  const typing = new Map();

  const sync = (conversationId) =>
    onChange?.([...(typing.get(conversationId) || [])].sort((a, b) => a.localeCompare(b)), conversationId);

  const start = (username, conversationId = 'global') => {
    if (!username) return;
    const users = typing.get(conversationId) || new Set();
    users.add(username);
    typing.set(conversationId, users);
    const key = `${conversationId}:${username}`;
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);
    timers.set(key, setTimeout(() => stop(username, conversationId), timeoutMs));
    sync(conversationId);
  };

  const stop = (username, conversationId = 'global') => {
    const key = `${conversationId}:${username}`;
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
    const users = typing.get(conversationId);
    if (users?.delete(username)) {
      if (!users.size) typing.delete(conversationId);
      sync(conversationId);
    }
  };

  const users = (conversationId = 'global') => [...(typing.get(conversationId) || [])];

  return { start, stop, users };
};

module.exports = { createPresenceStore, createTypingStore, STATUS_RANK, normalizeStatus };
