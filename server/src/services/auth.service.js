const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { tokenDigest } = require('../utils/tokenDigest');
const prisma = require('../config/db');
const AppError = require('../utils/AppError');

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  createdAt: true,
};

const normalizeEmail = (email) =>
  typeof email === 'string' ? email.trim().toLowerCase() : '';

const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError('Password must be at least 8 characters long', 400);
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  if (!hasLetter || !hasNumber) {
    throw new AppError('Password must contain both letters and numbers', 400);
  }
};

const validateIdentity = ({ name, email, password }) => {
  if (typeof name !== 'string' || !name.trim()) {
    throw new AppError('Name is required', 400);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) {
    throw new AppError('A valid email is required', 400);
  }

  validatePassword(password);
};

const createSession = async (user) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);
  try {
    await prisma.$transaction(async tx => {
      const current = await tx.user.findUnique({ where: { id: user.id }, select: { passwordHash: true, isActive: true } });
      if (!current?.isActive || current.passwordHash !== user.passwordHash) throw new AppError('Please sign in again', 401);
      await tx.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
      await tx.session.create({ data: { userId: user.id, tokenHash: tokenDigest(token), expiresAt } });
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error.code === 'P2034') throw new AppError('Please retry sign-in', 409);
    throw error;
  }
  return token;
};

const register = async ({ name, email, password, phone }) => {
  validateIdentity({ name, email, password });
  const normalizedEmail = normalizeEmail(email);
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        phone: typeof phone === 'string' && phone.trim() ? phone.trim() : null,
        role: 'user',
      },
      select: publicUserSelect,
    });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
  }
  return { message: 'Registration received. You can sign in with your account credentials.' };
};

const login = async ({ email, password }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || typeof password !== 'string') {
    throw new AppError('Invalid email or password', 401);
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new AppError(
      user.disabledReason
        ? 'Account disabled: ' + user.disabledReason
        : 'Account disabled',
      403
    );
  }

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
    emailVerified: Boolean(user.emailVerifiedAt),
  };

  return { user: safeUser, token: await createSession(user) };
};

const getCurrentUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  emailVerified: Boolean(user.emailVerifiedAt),
  tier: 'retail',
});

const forgotPassword = async ({ email }) => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail) {
    throw new AppError('Email is required', 400);
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (user) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const expiryMinutes = Number(process.env.RESET_TOKEN_MINUTES) || 30;

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
      },
    });

    if (process.env.NODE_ENV !== 'production') {
      console.log(
        '[DEV ONLY] Reset Link:',
        process.env.CLIENT_URL +
          '/reset-password?token=' +
          encodeURIComponent(rawToken)
      );
    }
  }

  return {
    message: 'If that email is registered, a reset link has been generated.',
  };
};

const resetPassword = async ({ token, password }) => {
  validatePassword(password);

  if (typeof token !== 'string' || !token) {
    throw new AppError('Invalid or expired reset link', 400);
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (
    !resetToken ||
    resetToken.isUsed ||
    resetToken.expiresAt.getTime() <= Date.now()
  ) {
    throw new AppError('Invalid or expired reset link', 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const claimedToken = await tx.passwordResetToken.updateMany({
      where: {
        id: resetToken.id,
        isUsed: false,
        expiresAt: { gt: now },
      },
      data: { isUsed: true },
    });

    if (claimedToken.count !== 1) {
      throw new AppError('Invalid or expired reset link', 400);
    }

    await tx.session.deleteMany({ where: { userId: resetToken.userId } });
    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, passwordChangedAt: now },
    });
  });

  return { message: 'Password has been reset. Please log in again.' };
};


const updateProfile = async (userId, updateData) => {
  const data = {};
  for (const key of ['name', 'phone']) {
    if (updateData[key] !== undefined) {
      if (typeof updateData[key] !== 'string') throw new AppError('Invalid profile field', 400);
      data[key] = updateData[key].trim();
    }
  }
  if (data.name === '') throw new AppError('Name is required', 400);
  const updated = await prisma.user.update({ where: { id: userId }, data, select: publicUserSelect });
  return { ...updated, tier: 'retail', isWholesale: false, wholesaleDiscount: '0%' };
};

module.exports = {
  updateProfile,
  register,
  login,
  getCurrentUser,
  forgotPassword,
  resetPassword,
};
