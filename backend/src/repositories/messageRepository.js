const config = require('../config/env');
const createSqliteMessageRepository = require('./sqliteMessageRepository');
const createFileMessageRepository = require('./fileMessageRepository');
const createPostgresMessageRepository = require('./postgresMessageRepository');
const createRedisMessageRepository = require('./redisMessageRepository');

/**
 * Repository factory. The service layer only ever sees this interface:
 * init | create | findAll | findByIds | markStatus | count | clear | close
 *
 * Drivers: redis (default), postgres, sqlite, file (JSON fallback).
 */
const createMessageRepository = (overrides = {}) => {
  const driver = (overrides.driver || config.db.driver || 'sqlite').toLowerCase();
  const filePath = overrides.filePath || config.db.filePath;

  if (driver === 'file') {
    return createFileMessageRepository({ filePath: filePath.replace(/\.db$/, '.json') });
  }

  if (driver === 'postgres' || driver === 'pg') {
    return createPostgresMessageRepository({
      poolConfig: overrides.poolConfig || config.db.postgres,
      table: overrides.table,
    });
  }

  if (driver === 'redis') {
    return createRedisMessageRepository({
      redisConfig: overrides.redisConfig || config.db.redis,
    });
  }

  if (driver !== 'sqlite') {
    throw new Error(`Unknown DB_DRIVER "${driver}". Use "redis", "postgres", "sqlite" or "file".`);
  }

  return createSqliteMessageRepository({ filePath });
};

module.exports = createMessageRepository;
