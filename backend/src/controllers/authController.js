const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { isReservedName } = require('../agents/registry');
const { validateUsername } = require('../validators/chatValidators');

/**
 * Dummy authentication: no passwords, no persistence.
 * The returned token is a deterministic, unsigned placeholder for demo purposes.
 */
const createAuthController = () => ({
  login: asyncHandler(async (req, res) => {
    const username = validateUsername(req.body?.username);
    if (isReservedName(username)) {
      throw ApiError.badRequest(`"${username}" is an AI agent. Pick a different username.`);
    }
    const token = Buffer.from(`demo:${username}`).toString('base64url');
    res.json({
      success: true,
      data: {
        username,
        token,
        loggedInAt: new Date().toISOString(),
        note: 'Dummy authentication - token is not verified.',
      },
    });
  }),
});

module.exports = createAuthController;
