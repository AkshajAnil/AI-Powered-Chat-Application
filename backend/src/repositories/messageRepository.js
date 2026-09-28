const config = require('../config/env');
const createSqliteMessageRepository = require('./sqliteMessageRepository');
const createFileMessageRepository = require('./fileMessageRepository');
const createPostgresMessageRepository = require('./postgresMessageRepository');

/**
 * Repository factory. The service layer only ever sees this interface:
 * init | create | findAll | findByIds | markStatus | count | clear | close
 *
 * Drivers: postgres (DB_DRIVER=postgres), sqlite (default), file (JSON fallback).
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

  if (driver !== 'sqlite') {
    throw new Error(`Unknown DB_DRIVER "${driver}". Use "postgres", "sqlite" or "file".`);
  }

  return createSqliteMessageRepository({ filePath });
};

module.exports = createMessageRepository;
