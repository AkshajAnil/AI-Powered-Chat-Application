const { Router } = require('express');

const { publicAgents } = require('../agents/registry');

const createChatRoutes = ({ messageController, authController, presence }) => {
  const router = Router();

  router.get('/health', (req, res) => {
    res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } });
  });

  router.post('/auth/login', authController.login);

  router.get('/agents', (req, res) => {
    res.json({ success: true, data: publicAgents() });
  });

  router.get('/messages', messageController.list);
  router.post('/messages', messageController.create);
  router.post('/messages/read', messageController.markRead);
  router.get('/messages/stats', messageController.stats);

  router.get('/users/online', (req, res) => {
    res.json({ success: true, data: { onlineUsers: presence.onlineUsers() } });
  });

  return router;
};

module.exports = createChatRoutes;
