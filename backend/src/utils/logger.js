const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };

const createLogger = (level = 'info', scope = 'app') => {
  const threshold = LEVELS[level] ?? LEVELS.info;
  const emit = (lvl, args) => {
    if (LEVELS[lvl] < threshold) return;
    const stamp = new Date().toISOString();
    const prefix = `[${stamp}] ${lvl.toUpperCase().padEnd(5)} [${scope}]`;
    // eslint-disable-next-line no-console
    console[lvl === 'debug' ? 'log' : lvl](prefix, ...args);
  };

  return {
    debug: (...args) => emit('debug', args),
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
    child: (childScope) => createLogger(level, `${scope}:${childScope}`),
  };
};

module.exports = { createLogger };
