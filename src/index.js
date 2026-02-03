const { registerFid } = require('./register-fid');
const { addSigner } = require('./add-signer');
const { postCast } = require('./post-cast');
const { swapEthToUsdc } = require('./swap-to-usdc');
const { autoSetup, checkAllBalances, determineFundingStrategy } = require('./auto-setup');
const { checkFidSync, checkSignerSync, getCast } = require('./x402');
const config = require('./config');

module.exports = {
  // Full autonomous setup
  autoSetup,
  checkAllBalances,
  determineFundingStrategy,

  // Core functions
  registerFid,
  addSigner,
  postCast,
  swapEthToUsdc,

  // Utilities
  checkFidSync,
  checkSignerSync,
  getCast,

  // Config
  config
};
