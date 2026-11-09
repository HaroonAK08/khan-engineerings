const Note = require("./note.model");

function httpError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function ownerId(userId) {
  return userId;
}

function normalizeInput({ title, content }) {
  const normalizedTitle = String(title ?? "").trim();
  const normalizedContent = String(content ?? "");
  if (!normalizedTitle) throw httpError("Title is required", 400);
  if (normalizedTitle.length > 160) throw httpError("Title must be 160 characters or fewer", 400);
  if (normalizedContent.length > 50000) {
    throw httpError("Note content must be 50,000 characters or fewer", 400);
  }
  return { title: normalizedTitle, content: normalizedContent };
}

function toNote(note) {
  return {
    id: note._id,
    title: note.title,
    content: note.content,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
  };
}

async function list(userId) {
  const notes = await Note.find({ owner: ownerId(userId) }).sort({ updatedAt: -1 }).lean();
  return notes.map(toNote);
}

async function create(userId, input) {
  const note = await Note.create({ owner: ownerId(userId), ...normalizeInput(input) });
  return toNote(note);
}

async function update(userId, id, input) {
  const note = await Note.findOne({ _id: id, owner: ownerId(userId) });
  if (!note) throw httpError("Note not found", 404);
  Object.assign(note, normalizeInput(input));
  await note.save();
  return toNote(note);
}

async function remove(userId, id) {
  const result = await Note.deleteOne({ _id: id, owner: ownerId(userId) });
  if (!result.deletedCount) throw httpError("Note not found", 404);
  return { deleted: true };
}

module.exports = { list, create, update, remove };
