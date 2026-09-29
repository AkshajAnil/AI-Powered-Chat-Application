const http = require('http');

const config = require('./config/env');
const createApp = require('./app');
const createMessageRepository = require('./repositories/messageRepository');
const createMessageService = require('./services/messageService');
const createAgentService = require('./services/agentService');
const createAuthService = require('./services/authService');
const createChatEvents = require('./sockets/chatEvents');
const createSocketServer = require('./sockets/socketServer');
const { createPresenceStore, createTypingStore } = require('./sockets/presence');
const { createGroqClient } = require('./agents/groqClient');
const { AGENTS } = require('./agents/registry');
const { createLogger } = require('./utils/logger');

/**
 * Wires the whole application together (composition root).
 * Only executed when the file is run directly (or awaited from tests).
 */
const createServer = async (overrides = {}) => {
  const resolvedConfig = { ...config, ...overrides.config };
  const logger = createLogger(resolvedConfig.logLevel, 'server');

  const events = createChatEvents();
  const presence = createPresenceStore();
  const typing = createTypingStore({ onChange: (users) => events.emitTyping(users) });

  const repository = (overrides.createRepository || createMessageRepository)(overrides.repository);
  await repository.init();
  const authService = createAuthService({
    repository,
    jwtSecret: resolvedConfig.jwtSecret,
    environment: resolvedConfig.env,
  });
  await authService.seedUser(resolvedConfig.seedUser);

  const hooks = {};
  const messageService = createMessageService({
    repository,
    events,
    presence,
    hooks,
    logger: logger.child('messages'),
  });

  const app = createApp({
    messageService,
    presence,
    config: resolvedConfig,
    agents: AGENTS,
    authService,
  });
  const httpServer = http.createServer(app);
  const io = createSocketServer({
    httpServer,
    messageService,
    presence,
    events,
    typing,
    authService,
    config: resolvedConfig,
    logger: logger.child('socket'),
  });

  const groq =
    overrides.groq ||
    createGroqClient({
      ...resolvedConfig.groq,
      logger: logger.child('groq'),
    });

  const agentService = createAgentService({
    groq,
    messageService,
    presence,
    typing,
    events,
    repository,
    logger: logger.child('agents'),
  });
  hooks.onMessage = agentService.handleIncoming;
  agentService.start();

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await new Promise((resolve) => io.close(() => httpServer.close(resolve)));
    await repository.close();
  };

  return {
    app,
    httpServer,
    io,
    repository,
    messageService,
    agentService,
    presence,
    events,
    logger,
    close,
  };
};

const start = async () => {
  const server = await createServer();
  const { httpServer, repository, logger, close } = server;

  await new Promise((resolve) => {
    httpServer.listen(config.port, config.host, resolve);
  });

  logger.info(
    `API + Socket.io listening on http://${config.host}:${config.port} (storage: ${repository.driver})`
  );

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down...`);
    await close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('uncaughtException', (err) => {
    logger.error('uncaughtException', err);
    shutdown('uncaughtException');
  });

  return server;
};

if (require.main === module) {
  start().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', err.message || err);
    process.exit(1);
  });
}

module.exports = { createServer, start };
