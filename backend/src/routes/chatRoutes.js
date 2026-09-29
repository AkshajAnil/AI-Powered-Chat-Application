const { Router } = require('express');

const { publicAgents } = require('../agents/registry');

const createChatRoutes = ({ messageController, authController, presence, requireAuth }) => {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
  });

  router.post('/auth/login', authController.login);
  router.post('/auth/register', authController.register);

  router.get('/agents', (req, res) => {
    res.json({ success: true, data: publicAgents() });
  });

  router.get('/messages', requireAuth, messageController.list);
  router.post('/messages', requireAuth, messageController.create);
  router.post('/messages/read', requireAuth, messageController.markRead);
  router.get('/messages/stats', requireAuth, messageController.stats);

  router.get('/users/online', requireAuth, (req, res) => {
    res.json({ success: true, data: { onlineUsers: presence.onlineUsers() } });
  });

  return router;
};

module.exports = createChatRoutes;
