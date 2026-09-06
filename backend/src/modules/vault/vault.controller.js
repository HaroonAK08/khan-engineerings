const vaultService = require("./vault.service");

function vaultTokenFromReq(req) {
  return (
    req.headers["x-vault-token"] ||
    req.headers["X-Vault-Token"] ||
    req.body?.vaultToken ||
    null
  );
}

async function requireVaultUnlock(req, res, next) {
  try {
    vaultService.verifyVaultToken(vaultTokenFromReq(req));
    next();
  } catch (err) {
    next(err);
  }
}

async function status(req, res, next) {
  try {
    const status = await vaultService.getStatus();
    res.json({ status });
  } catch (err) {
    next(err);
  }
}

async function setup(req, res, next) {
  try {
    const result = await vaultService.setup(req.body || {});
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function unlock(req, res, next) {
  try {
    const userId = req.user?.sub;
    const result = await vaultService.unlock({ ...(req.body || {}), userId });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function changePin(req, res, next) {
  try {
    const result = await vaultService.changePin(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function resetPin(req, res, next) {
  try {
    const result = await vaultService.resetWithAppPin(req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function listAssets(req, res, next) {
  try {
    const report = await vaultService.listAssets();
    res.json(report);
  } catch (err) {
    next(err);
  }
}

async function createAsset(req, res, next) {
  try {
    const asset = await vaultService.createAsset(req.body || {});
    res.status(201).json({ asset });
  } catch (err) {
    next(err);
  }
}

async function updateAsset(req, res, next) {
  try {
    const asset = await vaultService.updateAsset(req.params.id, req.body || {});
    res.json({ asset });
  } catch (err) {
    next(err);
  }
}

async function removeAsset(req, res, next) {
  try {
    await vaultService.removeAsset(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

async function yearSummary(req, res, next) {
  try {
    const report = await vaultService.getYearSummary(req.query.year);
    res.json(report);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireVaultUnlock,
  status,
  setup,
  unlock,
  changePin,
  resetPin,
  listAssets,
  createAsset,
  updateAsset,
  removeAsset,
  yearSummary,
};
