const express = require("express");
const { config } = require("../config");
const metrics = require("../observability/metrics");
const { providerName } = require("../providers");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    provider: providerName,
    model: config.openai.apiKey ? config.openai.model : "mock",
    embeddings: config.rag.useRealEmbeddings && config.openai.apiKey ? "openai" : "local",
    uptimeSeconds: Math.round(process.uptime())
  });
});

router.get("/metrics", (_req, res) => {
  res.type("text/plain; charset=utf-8").send(metrics.renderPrometheus());
});

router.get("/stats", (_req, res) => {
  res.json(metrics.snapshot());
});

module.exports = router;
