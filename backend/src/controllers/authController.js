const asyncHandler = require('../utils/asyncHandler');
const createAuthController = ({ authService }) => ({
  register: asyncHandler(async (req, res) => {
    const session = await authService.register(req.body);
    res.status(201).json({ success: true, data: session });
  }),
  login: asyncHandler(async (req, res) => {
    const session = await authService.login(req.body);
    res.json({ success: true, data: session });
  }),
});

module.exports = createAuthController;
