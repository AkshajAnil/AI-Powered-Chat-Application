/**
 * Wraps an async route handler so rejections reach the Express error handler.
 * (Kept explicit so the pattern stays obvious and framework-agnostic.)
 */
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

module.exports = asyncHandler;
