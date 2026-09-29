const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

const parseList = (value = '') =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const dataDir = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data'));

const config = {
  env: process.env.NODE_ENV || 'development',
  host: process.env.HOST || '0.0.0.0',
  port: toInt(process.env.PORT, 5000),
  corsOrigins: parseList(process.env.CORS_ORIGINS).length
    ? parseList(process.env.CORS_ORIGINS)
    : ['*'],
  jwtSecret: process.env.JWT_SECRET || 'local-development-only-change-before-deploy',
  seedUser: {
    username: process.env.SEED_USERNAME || 'pilot_user',
    password: process.env.SEED_PASSWORD || '1234',
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
    temperature: Number.parseFloat(process.env.GROQ_TEMPERATURE || '0.7') || 0.7,
  },
  db: {
    driver: (process.env.DB_DRIVER || 'redis').toLowerCase(),
    dataDir,
    filePath: path.resolve(process.env.DATABASE_PATH || path.join(dataDir, 'chat.db')),
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'chatapp',
    },
    postgres: {
      host: process.env.PGHOST || 'localhost',
      port: toInt(process.env.PGPORT, 5432),
      user: process.env.PGUSER || 'postgres',
      password: process.env.PGPASSWORD || '',
      database: process.env.PGDATABASE || 'Chat-Application',
      max: toInt(process.env.PG_POOL_MAX, 10),
      connectionTimeoutMillis: toInt(process.env.PG_CONNECT_TIMEOUT_MS, 5000),
    },
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
