function notFound(req, res, next) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function errorHandler(err, req, res, next) {
  const status = err.statusCode || 500;
  console.error("API request failed:", {
    method: req.method,
    path: req.originalUrl,
    status,
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  const body = {
    message: err.message || "Internal server error",
  };
  if (err.code) body.code = err.code;
  if (err.existingId) body.existingId = err.existingId;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
