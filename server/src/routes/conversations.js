const express = require("express");
const { z } = require("zod");
const { conversationRepo, messageRepo, toolRunRepo } = require("../db/repositories");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/", (req, res) => {
  res.json({ conversations: conversationRepo.listByUser(req.user.id) });
});

router.post("/", (req, res, next) => {
  try {
    const body = z
      .object({ title: z.string().min(1).max(120).optional() })
      .parse(req.body || {});
    const conversation = conversationRepo.create({
      userId: req.user.id,
      title: body.title
    });
    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", (req, res) => {
  const conversation = conversationRepo.findById(req.params.id, req.user.id);
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  res.json({
    conversation,
    messages: messageRepo.listByConversation(conversation.id),
    toolRuns: toolRunRepo.listByConversation(conversation.id)
  });
});

router.patch("/:id", (req, res, next) => {
  try {
    const body = z.object({ title: z.string().min(1).max(120) }).parse(req.body);
    const conversation = conversationRepo.findById(req.params.id, req.user.id);
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }
    res.json({ conversation: conversationRepo.updateTitle(conversation.id, req.user.id, body.title) });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", (req, res) => {
  const removed = conversationRepo.remove(req.params.id, req.user.id);
  if (!removed) {
    return res.status(404).json({ message: "Conversation not found" });
  }
  res.status(204).end();
});

module.exports = router;
