const service = require("./sync.service");

function deviceId(req) {
  return req.get("x-desktop-device") || req.body?.deviceId || req.query?.deviceId;
}

async function begin(req, res, next) {
  try {
    const upload = await service.begin({ user: req.user, deviceId: deviceId(req), manifest: req.body });
    res.status(201).json({ uploadId: upload._id, manifest: upload });
  } catch (err) { next(err); }
}

async function chunk(req, res, next) {
  try {
    const data = Buffer.from(String(req.body?.data || ""), "base64");
    const result = await service.putChunk({
      user: req.user,
      uploadId: req.params.uploadId,
      index: Number(req.params.index),
      data,
      sha256: req.body?.sha256,
    });
    res.json(result);
  } catch (err) { next(err); }
}

async function complete(req, res, next) {
  try {
    const upload = await service.complete({ user: req.user, uploadId: req.params.uploadId });
    res.json({ upload });
  } catch (err) { next(err); }
}

async function latest(req, res, next) {
  try { res.json({ upload: await service.latest({ user: req.user, deviceId: deviceId(req) }) }); }
  catch (err) { next(err); }
}

async function download(req, res, next) {
  try {
    const chunk = await service.getChunk({ user: req.user, uploadId: req.params.uploadId, index: Number(req.params.index) });
    res.json({ index: chunk.index, sha256: chunk.sha256, data: chunk.data.toString("base64") });
  } catch (err) { next(err); }
}

module.exports = { begin, chunk, complete, latest, download };
