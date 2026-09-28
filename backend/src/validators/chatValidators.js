const ApiError = require('../utils/ApiError');

const USERNAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]{1,23}$/;
const MAX_TEXT_LENGTH = 2000;

const validateUsername = (value) => {
  const username = typeof value === 'string' ? value.trim() : '';
  if (!USERNAME_PATTERN.test(username)) {
    throw ApiError.badRequest(
      'Username must be 2-24 characters and use only letters, numbers, spaces, ".", "_" or "-".'
    );
  }
  return username;
};

const validateMessageInput = ({ author, text, clientId }) => {
  const cleanAuthor = validateUsername(author);
  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!cleanText) throw ApiError.badRequest('Message text cannot be empty.');
  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw ApiError.badRequest(`Message must be at most ${MAX_TEXT_LENGTH} characters.`);
  }
  return {
    author: cleanAuthor,
    text: cleanText,
    clientId: typeof clientId === 'string' && clientId ? clientId.slice(0, 64) : null,
  };
};

const validateListQuery = (query = {}) => {
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 50, 1), 200);
  const before = query.before ? String(query.before) : null;
  return { limit, before };
};

const validateReadInput = ({ ids, reader }) => {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest('Provide a non-empty array of message ids.');
  }
  if (ids.length > 200) throw ApiError.badRequest('Too many ids in one request.');
  return { ids: ids.map(String), reader: validateUsername(reader) };
};

module.exports = {
  MAX_TEXT_LENGTH,
  validateUsername,
  validateMessageInput,
  validateListQuery,
  validateReadInput,
};
