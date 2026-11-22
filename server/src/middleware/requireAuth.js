const { tokenDigest } = require('../utils/tokenDigest');
const prisma = require('../config/db');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');

const requireAuth = asyncHandler(async (req, res, next) => {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    throw new AppError('Authentication required. Please log in.', 401);
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenDigest(token) },
    select: { expiresAt: true, user: { select: {
      id: true, name: true, email: true, phone: true, role: true,
      isActive: true, disabledReason: true, emailVerifiedAt: true,
    } } },
  });
  if (!session || session.expiresAt <= new Date()) throw new AppError('Session expired. Please log in again.', 401);
  const user = session.user;
  if (!user.isActive) {
    throw new AppError(
      user.disabledReason ? `Account disabled: ${user.disabledReason}` : 'Account disabled',
      403
    );
  }

  req.sessionTokenHash = tokenDigest(token);
  req.user = user;
  next();
});

module.exports = requireAuth;
