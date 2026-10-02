const { logger } = require("../observability/logger");

function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
}

function errorHandler(error, req, res, _next) {
  const isValidationError = error?.name === "ZodError" && Array.isArray(error.issues);
  const status = error.status || (isValidationError ? 400 : 500);
  const message =
    (isValidationError ? error.issues[0]?.message : error.message) || "Internal server error";

  if (status >= 500) {
    (req.log || logger).error("unhandled error", {
      message: error.message,
      stack: error.stack
    });
  }

  if (res.headersSent) {
    return res.end();
  }

  res.status(status).json({ message });
}

module.exports = { notFound, errorHandler };
