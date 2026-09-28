const ApiError = require('../utils/ApiError');

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const isKnown = err instanceof ApiError || err?.isOperational;
  const status = err?.statusCode || err?.status || 500;
  const message = isKnown ? err.message : 'Something went wrong on the server.';

  const payload = {
    success: false,
    error: {
      message,
      code: err?.code || (isKnown ? 'ERROR' : 'INTERNAL_ERROR'),
    },
  };
  if (err?.details) payload.error.details = err.details;

  if (status >= 500) {
    // eslint-disable-next-line no-console
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json(payload);
};

module.exports = errorHandler;
