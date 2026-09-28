const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { isReservedName } = require('../agents/registry');
const { validateMessageInput, validateListQuery, validateReadInput } = require('../validators/chatValidators');

const createMessageController = ({ messageService }) => ({
  list: asyncHandler(async (req, res) => {
    const query = validateListQuery(req.query);
    const messages = await messageService.listMessages(query);
    res.json({ success: true, data: messages, meta: { count: messages.length } });
  }),

  create: asyncHandler(async (req, res) => {
    const input = validateMessageInput(req.body || {});
    if (isReservedName(input.author)) {
      throw ApiError.badRequest(`"${input.author}" is reserved for an AI agent.`);
    }
    const message = await messageService.sendMessage(input);
    res.status(201).json({ success: true, data: message });
  }),

  markRead: asyncHandler(async (req, res) => {
    const input = validateReadInput(req.body || {});
    const updated = await messageService.markMessagesRead(input);
    res.json({ success: true, data: { updatedIds: updated.map((m) => m.id) } });
  }),

  stats: asyncHandler(async (req, res) => {
    res.json({ success: true, data: await messageService.getStats() });
  }),
});

module.exports = createMessageController;
