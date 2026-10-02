const { randomUUID } = require("crypto");
const { logger } = require("../observability/logger");
const metrics = require("../observability/metrics");

function requestContext(req, res, next) {
  const requestId = req.get("x-request-id") || randomUUID();
  req.id = requestId;
  req.log = logger.child({ requestId });
  res.setHeader("x-request-id", requestId);

  const startedAt = process.hrtime.bigint();

  res.on("finish", () => {
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const route = req.route?.path ? `${req.baseUrl || ""}${req.route.path}` : req.path;
    const labels = { method: req.method, route, status: String(res.statusCode) };

    metrics.increment("http_requests_total", labels);
    metrics.observe("http_request_duration_seconds", durationSeconds, {
      method: req.method,
      route
    });

    req.log.info("request completed", {
      method: req.method,
      route,
      status: res.statusCode,
      durationMs: Math.round(durationSeconds * 1000)
    });
  });

  next();
}

module.exports = { requestContext };
