const { logger, webSearchKeys } = require('@librechat/data-schemas');
const {
  getNewS3URL,
  needsRefresh,
  normalizeHttpError,
  extractWebSearchEnvVars,
} = require('@librechat/api');
const { Tools, FileSources } = require('librechat-data-provider');
const { updateUserPluginAuth, deleteUserPluginAuth } = require('~/server/services/PluginService');
const { verifyOTPOrBackupCode } = require('~/server/services/twoFactorService');
const { verifyEmail, resendVerificationEmail } = require('~/server/services/AuthService');
const { processDeleteRequest } = require('~/server/services/Files/process');
const { getAppConfig } = require('~/server/services/Config');
const db = require('~/models');

const getUserController = async (req, res) => {
  const appConfig = await getAppConfig({ role: req.user?.role, tenantId: req.user?.tenantId });
  /** @type {IUser} */
  const userData = req.user.toObject != null ? req.user.toObject() : { ...req.user };
  /**
   * These fields should not exist due to secure field selection, but deletion
   * is done in case of alternate database incompatibility with Mongo API
   * */
  delete userData.password;
  delete userData.totpSecret;
  delete userData.backupCodes;
  if (appConfig.fileStrategy === FileSources.s3 && userData.avatar) {
    const avatarNeedsRefresh = needsRefresh(userData.avatar, 3600);
    if (!avatarNeedsRefresh) {
      return res.status(200).send(userData);
    }
    const originalAvatar = userData.avatar;
    try {
      userData.avatar = await getNewS3URL(userData.avatar);
      await db.updateUser(userData.id, { avatar: userData.avatar });
    } catch (error) {
      userData.avatar = originalAvatar;
      logger.error('Error getting new S3 URL for avatar:', error);
    }
  }
  res.status(200).send(userData);
};

const getTermsStatusController = async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id, 'termsAccepted');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ termsAccepted: !!user.termsAccepted });
  } catch (error) {
    logger.error('Error fetching terms acceptance status:', error);
    res.status(500).json({ message: 'Error fetching terms acceptance status' });
  }
};

const acceptTermsController = async (req, res) => {
  try {
    const user = await db.updateUser(req.user.id, { termsAccepted: true });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ message: 'Terms accepted successfully' });
  } catch (error) {
    logger.error('Error accepting terms:', error);
    res.status(500).json({ message: 'Error accepting terms' });
  }
};

const deleteUserFiles = async (req) => {
  try {
    const userFiles = await db.getFiles({ user: req.user.id });
    await processDeleteRequest({
      req,
      files: userFiles,
    });
  } catch (error) {
    logger.error('[deleteUserFiles]', error);
  }
};

const updateUserPluginsController = async (req, res) => {
  const appConfig = await getAppConfig({ role: req.user?.role, tenantId: req.user?.tenantId });
  const { user } = req;
  const { pluginKey, action, auth, isEntityTool } = req.body;
  try {
    if (!isEntityTool) {
      await db.updateUserPlugins(user._id, user.plugins, pluginKey, action);
    }

    if (auth == null) {
      return res.status(200).send();
    }

    let keys = Object.keys(auth);
    const values = Object.values(auth); // Used in 'install' block

    if (keys.length === 0 && pluginKey !== Tools.web_search) {
      return res.status(200).send();
    }

    /** @type {number} */
    let status = 200;
    /** @type {string} */
    let message;
    /** @type {IPluginAuth | Error} */
    let authService;

    if (pluginKey === Tools.web_search) {
      /** @type  {TCustomConfig['webSearch']} */
      const webSearchConfig = appConfig?.webSearch;
      keys = extractWebSearchEnvVars({
        keys: action === 'install' ? keys : webSearchKeys,
        config: webSearchConfig,
      });
    }

    if (action === 'install') {
      for (let i = 0; i < keys.length; i++) {
        authService = await updateUserPluginAuth(user.id, keys[i], pluginKey, values[i]);
        if (authService instanceof Error) {
          logger.error('[authService]', authService);
          ({ status, message } = normalizeHttpError(authService));
        }
      }
    } else if (action === 'uninstall') {
      for (let i = 0; i < keys.length; i++) {
        authService = await deleteUserPluginAuth(user.id, keys[i]);
        if (authService instanceof Error) {
          logger.error('[authService] Error deleting specific auth key:', authService);
          ({ status, message } = normalizeHttpError(authService));
        }
      }
    }

    if (status === 200) {
      return res.status(status).send();
    }

    const normalized = normalizeHttpError({ status, message });
    return res.status(normalized.status).send({ message: normalized.message });
  } catch (err) {
    logger.error('[updateUserPluginsController]', err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const deleteUserController = async (req, res) => {
  const { user } = req;

  try {
    const existingUser = await db.getUserById(
      user.id,
      '+totpSecret +backupCodes _id twoFactorEnabled',
    );
    if (existingUser && existingUser.twoFactorEnabled) {
      const { token, backupCode } = req.body;
      const result = await verifyOTPOrBackupCode({ user: existingUser, token, backupCode });

      if (!result.verified) {
        const msg =
          result.message ??
          'TOTP token or backup code is required to delete account with 2FA enabled';
        return res.status(result.status ?? 400).json({ message: msg });
      }
    }

    await db.deleteMessages({ user: user.id });
    await db.deleteAllUserSessions({ userId: user.id });
    await db.deleteTransactions({ user: user.id });
    await db.deleteUserKey({ userId: user.id, all: true });
    await db.deleteBalances({ user: user._id });
    await db.deletePresets(user.id);
    try {
      await db.deleteConvos(user.id);
    } catch (error) {
      logger.error('[deleteUserController] Error deleting user convos, likely no convos', error);
    }
    await deleteUserPluginAuth(user.id, null, true);
    await db.deleteUserById(user.id);
    await db.deleteAllSharedLinks(user.id);
    await deleteUserFiles(req);
    await db.deleteFiles(null, user.id);
    await db.deleteToolCalls(user.id);
    await db.deleteUserAgents(user.id);
    await db.deleteAllAgentApiKeys(user._id);
    await db.deleteAssistants({ user: user.id });
    await db.deleteConversationTags({ user: user.id });
    await db.deleteAllUserMemories(user.id);
    await db.deleteUserPrompts(user.id);
    await db.deleteUserSkills(user.id);
    await db.deleteActions({ user: user.id });
    await db.deleteTokens({ userId: user.id });
    await db.removeUserFromAllGroups(user.id);
    await db.deleteAclEntries({ principalId: user._id });
    logger.info(`User deleted account. Email: ${user.email} ID: ${user.id}`);
    res.status(200).send({ message: 'User deleted' });
  } catch (err) {
    logger.error('[deleteUserController]', err);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const verifyEmailController = async (req, res) => {
  try {
    const verifyEmailService = await verifyEmail(req);
    if (verifyEmailService instanceof Error) {
      return res.status(400).json(verifyEmailService);
    } else {
      return res.status(200).json(verifyEmailService);
    }
  } catch (e) {
    logger.error('[verifyEmailController]', e);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const resendVerificationController = async (req, res) => {
  try {
    const result = await resendVerificationEmail(req);
    if (result instanceof Error) {
      return res.status(400).json(result);
    } else {
      return res.status(200).json(result);
    }
  } catch (e) {
    logger.error('[verifyEmailController]', e);
    return res.status(500).json({ message: 'Something went wrong.' });
  }
};

const dismissTourController = async (req, res) => {
  try {
    const user = await db.updateUser(req.user.id, { showTour: false });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ message: 'Tour dismissed successfully', showTour: false });
  } catch (error) {
    logger.error('Error dismissing tour:', error);
    res.status(500).json({ message: 'Error dismissing tour' });
  }
};

module.exports = {
  getUserController,
  getTermsStatusController,
  acceptTermsController,
  deleteUserController,
  verifyEmailController,
  updateUserPluginsController,
  resendVerificationController,
  dismissTourController,
};
