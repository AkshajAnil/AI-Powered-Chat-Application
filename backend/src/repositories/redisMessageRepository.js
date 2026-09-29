const crypto = require('crypto');

const { normalizeStatus } = require('./messageStatus');

const UPDATE_STATUS_SCRIPT = `
  local ranks = { sent = 0, delivered = 1, read = 2 }
  local target = ARGV[1]
  local changed = {}
  for _, key in ipairs(KEYS) do
    local status = redis.call('HGET', key, 'status')
    if status and ranks[target] > ranks[status] then
      redis.call('HSET', key, 'status', target)
      table.insert(changed, key)
    end
  end
  return changed
`;

const createRedisMessageRepository = ({ redisConfig }) => {
  const { url, keyPrefix = 'chatapp' } = redisConfig;
  const prefix = keyPrefix.replace(/:+$/, '');
  const messageIndex = `${prefix}:messages:all`;
  const conversationsKey = `${prefix}:messages:conversations`;
  const userNameKey = (username) => `${prefix}:users:username:${username.toLowerCase()}`;
  const messageKey = (id) => `${prefix}:messages:item:${id}`;
  const conversationIndex = (conversationId) =>
    `${prefix}:messages:conversation:${Buffer.from(conversationId).toString('base64url')}`;
  let client;

  const messageFromHash = (row) =>
    row.id
      ? {
          id: row.id,
          author: row.author,
          text: row.text,
          status: row.status,
          clientId: row.clientId || null,
          conversationId: row.conversationId || 'global',
          createdAt: row.createdAt,
        }
      : null;

  const userFromHash = (row) =>
    row.id
      ? {
          id: row.id,
          username: row.username,
          passwordHash: row.passwordHash,
          createdAt: row.createdAt,
        }
      : null;

  const storeMessage = async (message) => {
    const normalized = {
      id: message.id || crypto.randomUUID(),
      author: message.author,
      text: message.text,
      status: normalizeStatus(message.status),
      clientId: message.clientId || '',
      conversationId: message.conversationId || 'global',
      createdAt: message.createdAt || new Date().toISOString(),
    };
    const member = `${normalized.createdAt}|${normalized.id}`;
    const index = conversationIndex(normalized.conversationId);
    await client
      .multi()
      .hSet(messageKey(normalized.id), normalized)
      .zAdd(messageIndex, { score: 0, value: member })
      .zAdd(index, { score: 0, value: member })
      .sAdd(conversationsKey, index)
      .exec();
    return normalized;
  };

  const init = async () => {
    const { createClient } = require('redis');
    client = createClient({
      url,
      socket: {
        reconnectStrategy: (retries) =>
          retries < 10 ? Math.min(100 * (retries + 1), 2000) : new Error('Redis reconnect limit reached'),
      },
    });
    client.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[redis] client error:', err.message);
    });
    await client.connect();
  };

  const create = async ({ author, text, clientId, conversationId = 'global' }) =>
    storeMessage({ author, text, clientId, conversationId, status: 'sent' });

  const findAll = async ({ limit = 50, before = null, after = null, conversationId = 'global' } = {}) => {
    if (limit <= 0) return [];
    const max = before ? `(${before}|` : '+';
    const min = after ? `[${after}|` : '-';
    const members = await client.sendCommand([
      'ZREVRANGEBYLEX',
      conversationIndex(conversationId),
      max,
      min,
      'LIMIT',
      '0',
      String(limit),
    ]);
    const ids = members.map((member) => member.slice(member.lastIndexOf('|') + 1));
    const rows = await Promise.all(ids.map((id) => client.hGetAll(messageKey(id))));
    return rows.map(messageFromHash).filter(Boolean).reverse();
  };

  const findByIds = async (ids = []) => {
    const rows = await Promise.all(ids.map((id) => client.hGetAll(messageKey(id))));
    return rows.map(messageFromHash).filter(Boolean);
  };

  const markStatus = async (ids = [], status) => {
    if (!ids.length) return [];
    const target = normalizeStatus(status);
    const keys = ids.map(messageKey);
    const updatedKeys = await client.eval(UPDATE_STATUS_SCRIPT, {
      keys,
      arguments: [target],
    });
    if (!updatedKeys.length) return [];
    const updatedIds = updatedKeys.map((key) => key.slice(key.lastIndexOf(':') + 1));
    return findByIds(updatedIds);
  };

  const count = () => client.zCard(messageIndex);

  const findUserByUsername = async (username) => {
    const id = await client.get(userNameKey(username));
    if (!id) return null;
    return userFromHash(await client.hGetAll(`${prefix}:users:item:${id}`));
  };

  const storeUser = async (user) => {
    const normalized = {
      id: user.id || crypto.randomUUID(),
      username: user.username,
      passwordHash: user.passwordHash,
      createdAt: user.createdAt || new Date().toISOString(),
    };
    const usernameIndex = userNameKey(normalized.username);
    const existingId = await client.get(usernameIndex);
    if (existingId && existingId !== normalized.id) {
      const err = new Error('Username already exists.');
      err.code = 'USER_EXISTS';
      throw err;
    }
    if (!existingId) {
      const claimed = await client.set(usernameIndex, normalized.id, { NX: true });
      if (!claimed) {
        const err = new Error('Username already exists.');
        err.code = 'USER_EXISTS';
        throw err;
      }
    }
    try {
      await client.hSet(`${prefix}:users:item:${normalized.id}`, normalized);
    } catch (err) {
      if (!existingId) await client.del(usernameIndex);
      throw err;
    }
    return normalized;
  };

  const createUser = ({ username, passwordHash }) => storeUser({ username, passwordHash });

  const importMessage = async (message) => {
    if (await client.exists(messageKey(message.id))) return false;
    await storeMessage(message);
    return true;
  };

  const importUser = async (user) => storeUser(user);

  const clear = async () => {
    const members = await client.zRange(messageIndex, 0, -1);
    const indexes = await client.sMembers(conversationsKey);
    const keys = [
      ...members.map((member) => messageKey(member.slice(member.lastIndexOf('|') + 1))),
      messageIndex,
      conversationsKey,
      ...indexes,
    ];
    if (keys.length) await client.del(keys);
  };

  const close = async () => {
    if (client?.isOpen) await client.quit();
  };

  return {
    driver: 'redis',
    init,
    create,
    findAll,
    findByIds,
    markStatus,
    count,
    clear,
    findUserByUsername,
    createUser,
    importMessage,
    importUser,
    close,
  };
};

module.exports = createRedisMessageRepository;
