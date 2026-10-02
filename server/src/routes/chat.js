const express = require("express");
const { z } = require("zod");
const { config } = require("../config");
const { conversationRepo, messageRepo, toolRunRepo } = require("../db/repositories");
const { requireAuth } = require("../middleware/auth");
const { startEventStream, sendEvent, sendComment } = require("../util/sse");
const { provider, providerName } = require("../providers");
const { definitions, executeTool, parseArguments } = require("../tools");
const { search } = require("../rag");
const metrics = require("../observability/metrics");

const router = express.Router();

const chatSchema = z.object({
  conversationId: z.string().optional(),
  content: z.string().min(1, "content is required").max(8000),
  useRag: z.boolean().optional().default(false),
  useTools: z.boolean().optional().default(true)
});

router.post("/", requireAuth, async (req, res) => {
  const log = req.log;

  let body;
  try {
    body = chatSchema.parse(req.body);
  } catch (error) {
    return res.status(400).json({ message: error.issues?.[0]?.message || "Invalid request" });
  }

  const conversation = body.conversationId
    ? conversationRepo.findById(body.conversationId, req.user.id)
    : conversationRepo.create({ userId: req.user.id, title: body.content.slice(0, 60) });

  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const userMessage = messageRepo.create({
    conversationId: conversation.id,
    role: "user",
    content: body.content
  });

  startEventStream(res);

  const controller = new AbortController();
  const heartbeat = setInterval(() => sendComment(res, "ping"), 15000);
  const startedAt = process.hrtime.bigint();

  res.on("close", () => {
    clearInterval(heartbeat);
    controller.abort();
  });

  const send = (event, data) => {
    if (!controller.signal.aborted) sendEvent(res, event, data);
  };

  try {
    send("meta", {
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      provider: providerName,
      title: conversation.title
    });

    const history = messageRepo
      .listByConversation(conversation.id, config.agent.historyLimit)
      .map((message) => ({ role: message.role, content: message.content }));

    let work = [...history];

    if (body.useRag) {
      const matches = await search({ userId: req.user.id, query: body.content });
      if (matches.length) {
        const context = matches
          .map((match, index) => `[${index + 1}] ${match.documentTitle}: ${match.content}`)
          .join("\n");
        work = [
          {
            role: "system",
            content:
              "Use the knowledge base excerpts below when they are relevant. " +
              `If the answer is not present, say you do not know.\n\n${context}`
          },
          ...work
        ];
        send("retrieval", {
          matches: matches.map((match) => ({
            document: match.documentTitle,
            score: Number(match.score.toFixed(3)),
            excerpt: match.content
          }))
        });
      }
    }

    if (body.useTools) {
      for (let step = 0; step < config.agent.maxToolSteps; step += 1) {
        const calls = await provider.planToolCalls(work, definitions, controller.signal);
        if (!calls.length) break;

        work.push({ role: "assistant", content: "", tool_calls: calls });

        for (const call of calls) {
          const args = parseArguments(call.arguments);
          let resultText;

          try {
            const result = await executeTool(call.name, args, { userId: req.user.id, log });
            resultText = typeof result === "string" ? result : JSON.stringify(result);
          } catch (error) {
            resultText = JSON.stringify({ error: error.message });
          }

          const run = toolRunRepo.create({
            conversationId: conversation.id,
            name: call.name,
            args,
            result: resultText
          });

          metrics.increment("tool_calls_total", { tool: call.name });
          send("tool", { id: run.id, name: call.name, arguments: args, result: resultText });
          work.push({ role: "tool", tool_call_id: call.id, name: call.name, content: resultText });
        }
      }
    }

    const answer = await provider.streamCompletion({
      messages: work,
      signal: controller.signal,
      onDelta: (delta) => send("message", { content: delta })
    });

    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    metrics.observe("chat_stream_duration_seconds", durationSeconds, { provider: providerName });

    if (controller.signal.aborted) {
      if (answer) {
        messageRepo.create({
          conversationId: conversation.id,
          role: "assistant",
          content: answer
        });
      }
      metrics.increment("chat_streams_total", { provider: providerName, status: "aborted" });
      return;
    }

    const assistantMessage = messageRepo.create({
      conversationId: conversation.id,
      role: "assistant",
      content: answer
    });
    conversationRepo.touch(conversation.id);

    metrics.increment("chat_streams_total", { provider: providerName, status: "ok" });
    metrics.increment("tokens_total", { provider: providerName }, Math.ceil(answer.length / 4));

    send("done", { conversationId: conversation.id, messageId: assistantMessage.id });
  } catch (error) {
    if (controller.signal.aborted) return;
    metrics.increment("chat_streams_total", { provider: providerName, status: "error" });
    log.error("chat stream failed", { message: error.message });
    send("error", { message: error.message || "Unexpected server error" });
  } finally {
    clearInterval(heartbeat);
    if (!controller.signal.aborted) res.end();
  }
});

module.exports = router;
