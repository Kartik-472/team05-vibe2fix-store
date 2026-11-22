const express = require('express');
const rateLimit = require('express-rate-limit');
const asyncHandler = require('../utils/asyncHandler');
const requireAuth = require('../middleware/requireAuth');
const authController = require('../controllers/auth.controller');

const router = express.Router();

// OWASP A04: Rate limiting on authentication and sensitive endpoints
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  skipSuccessfulRequests: true,
  message: { message: 'Too many login attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { message: 'Too many account creation attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Generous limit for shared networks
  message: { message: 'Too many password reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, skipSuccessfulRequests: true,
  keyGenerator: req => String(req.body?.email || '').trim().toLowerCase().slice(0, 320),
  standardHeaders: true, legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again later.' },
});
const verification = require('../services/emailVerification.service');
const verificationLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  keyGenerator: req => req.user.id, standardHeaders: true, legacyHeaders: false });
router.post('/verification/request', requireAuth, verificationLimiter, asyncHandler(async (req, res) => {
  await verification.requestCode(req.user);
  res.sendStatus(204);
}));
router.post('/verification/confirm', requireAuth, asyncHandler(async (req, res) => {
  await verification.confirmCode(req.user, req.body?.code);
  res.sendStatus(204);
}));
router.post('/logout', requireAuth, asyncHandler(authController.logout));
router.post('/register', registerLimiter, asyncHandler(authController.register));
router.post('/login', loginLimiter, accountLimiter, asyncHandler(authController.login));
router.get('/me', requireAuth, asyncHandler(authController.me));
router.put('/me', requireAuth, asyncHandler(authController.updateProfile));
router.put('/profile', requireAuth, asyncHandler(authController.updateProfile));
router.post('/forgot-password', passwordResetLimiter, asyncHandler(authController.forgotPassword));
router.post('/reset-password', passwordResetLimiter, asyncHandler(authController.resetPassword));

module.exports = router;
