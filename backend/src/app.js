const express = require('express');

const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const createChatRoutes = require('./routes/chatRoutes');
const createMessageController = require('./controllers/messageController');
const createAuthController = require('./controllers/authController');
const { createLogger } = require('./utils/logger');

const createApp = ({ messageService, presence, config }) => {
  const app = express();
  const logger = createLogger(config.logLevel, 'http');

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(
    require('cors')({
      origin: config.corsOrigins.includes('*') ? '*' : config.corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    })
  );

  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on('finish', () => {
      if (req.path === '/api/health') return;
      logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`);
    });
    next();
  });

  const routes = createChatRoutes({
    messageController: createMessageController({ messageService }),
    authController: createAuthController(),
    presence,
  });

  app.use('/api', routes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

module.exports = createApp;
