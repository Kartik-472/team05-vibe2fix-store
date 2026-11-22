const crypto = require('node:crypto');
const prisma = require('../config/db');
const AppError = require('../utils/AppError');
const { tokenDigest } = require('../utils/tokenDigest');

async function requestCode(user) {
  if (user.emailVerifiedAt) return;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.VERIFICATION_FROM;
  if (!apiKey || !from) throw new AppError('Email verification is unavailable. Please contact the store.', 503);
  const code = crypto.randomBytes(12).toString('hex');
  const hash = tokenDigest(code);
  await prisma.user.update({ where: { id: user.id }, data: {
    verifyTokenHash: hash, verifyExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
  } });
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [user.email], subject: 'Verify your Vibe2Fix email',
        text: 'Enter this code in your Vibe2Fix account profile within 15 minutes: ' + code }),
    });
    if (!response.ok) throw new Error('Email delivery failed');
  } catch {
    await prisma.user.updateMany({ where: { id: user.id, verifyTokenHash: hash },
      data: { verifyTokenHash: null, verifyExpiresAt: null } });
    throw new AppError('Verification email could not be sent. Please retry.', 503);
  }
}

async function confirmCode(user, code) {
  if (typeof code !== 'string' || !/^[0-9a-f]{24}$/.test(code)) throw new AppError('Invalid verification code', 400);
  const now = new Date();
  const result = await prisma.user.updateMany({
    where: { id: user.id, verifyTokenHash: tokenDigest(code), verifyExpiresAt: { gt: now } },
    data: { emailVerifiedAt: now, verifyTokenHash: null, verifyExpiresAt: null },
  });
  if (!result.count) throw new AppError('Code is invalid or has expired', 400);
}
module.exports = { requestCode, confirmCode };
