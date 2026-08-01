const partyGroupService = require("./party-group.service");

async function create(req, res, next) {
  try {
    const group = await partyGroupService.create(req.body);
    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const groups = await partyGroupService.list(req.query);
    res.json({ groups });
  } catch (err) {
    next(err);
  }
}

async function getOne(req, res, next) {
  try {
    const group = await partyGroupService.getWithMembers(req.params.id);
    res.json({ group });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    const group = await partyGroupService.update(req.params.id, req.body);
    res.json({ group });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await partyGroupService.remove(req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

module.exports = { create, list, getOne, update, remove };
