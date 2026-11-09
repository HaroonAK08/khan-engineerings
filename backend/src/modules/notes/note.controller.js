const notesService = require("./note.service");

async function list(req, res, next) {
  try {
    res.json({ notes: await notesService.list(req.user.sub) });
  } catch (err) {
    next(err);
  }
}

async function create(req, res, next) {
  try {
    res.status(201).json({ note: await notesService.create(req.user.sub, req.body) });
  } catch (err) {
    next(err);
  }
}

async function update(req, res, next) {
  try {
    res.json({ note: await notesService.update(req.user.sub, req.params.id, req.body) });
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    res.json(await notesService.remove(req.user.sub, req.params.id));
  } catch (err) {
    next(err);
  }
}

module.exports = { list, create, update, remove };
