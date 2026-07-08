const { findBalanceByUser } = require('~/models');

async function balanceController(req, res) {
  const balanceData = await findBalanceByUser(req.user.id);

  if (!balanceData) {
    return res.status(200).json({
      tokenCredits: 0,
      autoRefillEnabled: false,
    });
  }

  const { _id: _, ...result } = balanceData;

  if (!result.autoRefillEnabled) {
    delete result.refillIntervalValue;
    delete result.refillIntervalUnit;
    delete result.lastRefill;
    delete result.refillAmount;
  }

  res.status(200).json(result);
}

module.exports = balanceController;
