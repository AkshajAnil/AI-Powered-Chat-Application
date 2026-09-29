const ApiError = require('../utils/ApiError');

const bearerToken = (header = '') => {
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : null;
};

const requireAuth = (authService) => (req, _res, next) =>
  authService
    .verifyToken(bearerToken(req.get('authorization')))
    .then((user) => {
      req.user = user;
      next();
    })
    .catch((err) => next(err instanceof ApiError ? err : ApiError.unauthorized()));

module.exports = { requireAuth, bearerToken };
