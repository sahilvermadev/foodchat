const jwt = require('jsonwebtoken');
const { math, createMobileAuthService } = require('@librechat/api');
const { logger, DEFAULT_SESSION_EXPIRY } = require('@librechat/data-schemas');
const {
  getTOTPSecret,
  verifyTOTP,
  verifyBackupCode,
} = require('~/server/services/twoFactorService');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const {
  getUserById,
  createSession,
  generateToken,
  listMobileSessions,
  deleteMobileSession,
  rotateSessionRefreshToken,
} = require('~/models');

const safeUser = (source) => {
  const user = (typeof source?.toObject === 'function' ? source.toObject() : { ...source }) || {};
  delete user.password;
  delete user.__v;
  delete user.totpSecret;
  delete user.backupCodes;
  delete user.federatedTokens;
  user.id = (user.id ?? user._id)?.toString();
  return user;
};

const readDevice = (body = {}) => {
  const platform = body.platform;
  const values = [body.installationId, body.deviceName, body.appVersion];
  if (values.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
    return null;
  }
  if (platform !== 'ios' && platform !== 'android') {
    return null;
  }
  return {
    installationId: body.installationId.slice(0, 128),
    deviceName: body.deviceName.slice(0, 128),
    appVersion: body.appVersion.slice(0, 32),
    platform,
  };
};

const accessTokenLifetimeMs = math(process.env.SESSION_EXPIRY, DEFAULT_SESSION_EXPIRY);
const service = createMobileAuthService({
  createSession,
  rotateSessionRefreshToken,
  deleteMobileSession,
  refreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenLifetimeMs,
  issueAccessToken: async (userId) => {
    const user = await getUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    return generateToken(user, accessTokenLifetimeMs);
  },
});

const sendIssuedSession = async (res, user, device) => {
  const tokens = await service.issue(user._id.toString(), device);
  return res.status(200).json({ ...tokens, user: safeUser(user) });
};

const mobileLoginController = async (req, res) => {
  try {
    const device = readDevice(req.body);
    if (!device) {
      return res.status(400).json({ message: 'Valid mobile device metadata is required' });
    }
    if (!req.user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }
    if (req.user.twoFactorEnabled) {
      return res.status(200).json({
        twoFAPending: true,
        tempToken: generate2FATempToken(req.user._id),
      });
    }
    return sendIssuedSession(res, req.user, device);
  } catch (error) {
    logger.error('[mobileLoginController]', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

const mobileTwoFactorController = async (req, res) => {
  try {
    const device = readDevice(req.body);
    if (!device || typeof req.body.tempToken !== 'string') {
      return res.status(400).json({ message: 'Valid verification data is required' });
    }
    const hasToken = typeof req.body.token === 'string' && req.body.token.trim().length > 0;
    const hasBackupCode =
      typeof req.body.backupCode === 'string' && req.body.backupCode.trim().length > 0;
    if (!hasToken && !hasBackupCode) {
      return res.status(400).json({ message: 'Authentication code is required' });
    }
    let payload;
    try {
      payload = jwt.verify(req.body.tempToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired temporary token' });
    }
    const user = await getUserById(payload.userId, '+totpSecret +backupCodes');
    if (!user?.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is not enabled for this user' });
    }
    const secret = await getTOTPSecret(user.totpSecret);
    const verified = hasToken
      ? await verifyTOTP(secret, req.body.token)
      : await verifyBackupCode({ user, backupCode: req.body.backupCode });
    if (!verified) {
      return res.status(401).json({ message: 'Invalid 2FA code or backup code' });
    }
    return sendIssuedSession(res, user, device);
  } catch (error) {
    logger.error('[mobileTwoFactorController]', error);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

const mobileRefreshController = async (req, res) => {
  if (typeof req.body?.refreshToken !== 'string') {
    return res.status(400).json({ message: 'Refresh token is required' });
  }
  try {
    return res.status(200).json(await service.refresh(req.body.refreshToken));
  } catch (error) {
    logger.warn('[mobileRefreshController] Refresh rejected', { code: error?.code ?? error?.name });
    return res.status(401).json({ message: 'Session expired' });
  }
};

const mobileLogoutController = async (req, res) => {
  try {
    if (typeof req.body?.refreshToken === 'string') {
      await service.logout(req.user._id.toString(), req.body.refreshToken);
    }
    return res.status(200).json({ message: 'Logout successful' });
  } catch (error) {
    logger.warn('[mobileLogoutController] Session cleanup failed', {
      code: error?.code ?? error?.name,
    });
    return res.status(200).json({ message: 'Logout successful' });
  }
};

const mobileSessionsController = async (req, res) => {
  const sessions = await listMobileSessions(req.user._id.toString());
  const currentId = req.get('X-Mobile-Session-Id');
  return res.json(
    sessions.map((session) => ({
      id: session._id.toString(),
      installationId: session.installationId,
      deviceName: session.deviceName,
      platform: session.platform,
      appVersion: session.appVersion,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiration,
      current: session._id.toString() === currentId,
    })),
  );
};

const revokeMobileSessionController = async (req, res) => {
  const deleted = await deleteMobileSession({
    userId: req.user._id.toString(),
    sessionId: req.params.id,
  });
  return deleted ? res.sendStatus(204) : res.sendStatus(404);
};

module.exports = {
  mobileLoginController,
  mobileTwoFactorController,
  mobileRefreshController,
  mobileLogoutController,
  mobileSessionsController,
  revokeMobileSessionController,
};
