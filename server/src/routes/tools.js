const express = require("express");
const { listTools } = require("../tools");

const router = express.Router();

router.get("/", (_req, res) => {
  res.json({ tools: listTools() });
});

module.exports = router;
