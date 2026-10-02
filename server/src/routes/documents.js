const express = require("express");
const { z } = require("zod");
const { documentRepo } = require("../db/repositories");
const { requireAuth } = require("../middleware/auth");
const { ingestDocument } = require("../rag");

const router = express.Router();

router.use(requireAuth);

router.get("/", (req, res) => {
  res.json({ documents: documentRepo.listByUser(req.user.id) });
});

router.post("/", async (req, res, next) => {
  try {
    const body = z
      .object({
        title: z.string().min(1).max(120),
        content: z.string().min(20, "Document content must be at least 20 characters")
      })
      .parse(req.body);

    const result = await ingestDocument({
      userId: req.user.id,
      title: body.title,
      content: body.content
    });

    res.status(201).json({ document: result.document, chunkCount: result.chunkCount });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", (req, res) => {
  const removed = documentRepo.remove(req.params.id, req.user.id);
  if (!removed) {
    return res.status(404).json({ message: "Document not found" });
  }
  res.status(204).end();
});

module.exports = router;
