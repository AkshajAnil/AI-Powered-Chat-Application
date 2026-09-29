const crypto = require('crypto');
const { promisify } = require('util');

const ApiError = require('../utils/ApiError');
const { isReservedName } = require('../agents/registry');
const { validateUsername } = require('../validators/chatValidators');

const scrypt = promisify(crypto.scrypt);
const PASSWORD_MIN_LENGTH = 4;
const PASSWORD_MAX_LENGTH = 128;
const TOKEN_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const DEVELOPMENT_JWT_SECRET = 'local-development-only-change-before-deploy';

const hashPassword = async (password) => {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
};

const verifyPassword = async (password, storedHash) => {
  const [algorithm, saltValue, hashValue] = String(storedHash || '').split('$');
  if (algorithm !== 'scrypt' || !saltValue || !hashValue) return false;

  const salt = Buffer.from(saltValue, 'base64url');
  const expected = Buffer.from(hashValue, 'base64url');
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};

const createAuthService = ({ repository, jwtSecret, environment }) => {
  if (
    typeof jwtSecret !== 'string' ||
    jwtSecret.length < 32 ||
    (environment === 'production' && jwtSecret === DEVELOPMENT_JWT_SECRET)
  ) {
    throw new Error('Set a JWT_SECRET of at least 32 characters; the local development key is not valid in production.');
  }

  const signToken = (user) => {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.username,
        joinedAt: user.createdAt,
        iat: now,
        exp: now + TOKEN_LIFETIME_SECONDS,
      })
    ).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const signature = crypto.createHmac('sha256', jwtSecret).update(unsigned).digest('base64url');
    return `${unsigned}.${signature}`;
  };

  const verifyToken = async (token) => {
    if (typeof token !== 'string') throw ApiError.unauthorized('A valid login is required.');
    const parts = token.split('.');
    if (parts.length !== 3) throw ApiError.unauthorized('Invalid or expired token.');

    const unsigned = `${parts[0]}.${parts[1]}`;
    const expected = crypto.createHmac('sha256', jwtSecret).update(unsigned).digest();
    let actual;
    let header;
    let payload;
    try {
      actual = Buffer.from(parts[2], 'base64url');
      header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    } catch {
      throw ApiError.unauthorized('Invalid or expired token.');
    }
    if (
      header.alg !== 'HS256' ||
      actual.length !== expected.length ||
      !crypto.timingSafeEqual(actual, expected) ||
      typeof payload.sub !== 'string' ||
      !Number.isInteger(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      throw ApiError.unauthorized('Invalid or expired token.');
    }
    const user = await repository.findUserByUsername(payload.sub);
    if (!user) throw ApiError.unauthorized('Invalid or expired token.');
    return { username: user.username, joinedAt: user.createdAt };
  };

  const validateCredentials = ({ username: value, password }) => {
    const username = validateUsername(value);
    if (isReservedName(username)) {
      throw ApiError.badRequest(`"${username}" is an AI agent. Pick a different username.`);
    }
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
      throw ApiError.badRequest(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      throw ApiError.badRequest(`Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);
    }
    return { username, password };
  };

  const createSession = (user) => ({
    username: user.username,
    token: signToken(user),
    expiresIn: TOKEN_LIFETIME_SECONDS,
  });

  const register = async (input) => {
    const { username, password } = validateCredentials(input || {});
    if (await repository.findUserByUsername(username)) {
      throw ApiError.conflict('That username is already registered.');
    }
    let user;
    try {
      user = await repository.createUser({ username, passwordHash: await hashPassword(password) });
    } catch (err) {
      if (err.code === '23505' || err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'USER_EXISTS') {
        throw ApiError.conflict('That username is already registered.');
      }
      throw err;
    }
    return createSession(user);
  };

  const login = async (input) => {
    const { username, password } = validateCredentials(input || {});
    const user = await repository.findUserByUsername(username);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw ApiError.unauthorized('Username or password is incorrect.');
    }
    return createSession(user);
  };

  const seedUser = async ({ username, password }) => {
    const existing = await repository.findUserByUsername(username);
    if (existing) return existing;
    try {
      return await repository.createUser({ username, passwordHash: await hashPassword(password) });
    } catch (err) {
      if (err.code === '23505' || err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'USER_EXISTS') {
        return repository.findUserByUsername(username);
      }
      throw err;
    }
  };

  return { login, register, verifyToken, seedUser };
};

module.exports = createAuthService;
