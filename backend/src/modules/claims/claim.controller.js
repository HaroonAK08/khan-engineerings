const claimService = require("./claim.service");

async function list(req, res, next) {
  try {
    const claims = await claimService.list(req.query);
    res.json({ claims });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const claim = await claimService.getById(req.params.id);
    res.json({ claim });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    const claim = await claimService.create(req.body);
    res.status(201).json({ claim });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const claim = await claimService.update(req.params.id, req.body);
    res.json({ claim });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, getOne, create, update };
