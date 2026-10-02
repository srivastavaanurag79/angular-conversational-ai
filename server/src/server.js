require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const allowedRoles = new Set(["system", "user", "assistant"]);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: process.env.OPENAI_API_KEY ? "openai" : "mock",
    model
  });
});

app.post("/api/chat", async (req, res) => {
  const messages = normalizeMessages(req.body?.messages);

  if (!messages) {
    return res
      .status(400)
      .json({ message: "messages must be a non-empty array of { role, content }" });
  }

  startEventStream(res);

  const controller = new AbortController();
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);

  res.on("close", () => {
    clearInterval(heartbeat);
    controller.abort();
  });

  try {
    if (process.env.OPENAI_API_KEY) {
      await providerStream(messages, res, controller.signal);
    } else {
      await mockStream(messages.at(-1).content, res, controller.signal);
    }

    if (!controller.signal.aborted) {
      sendEvent(res, "done", {});
      res.end();
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      sendEvent(res, "error", {
        message: error instanceof Error ? error.message : "Unexpected server error"
      });
      res.end();
    }
  } finally {
    clearInterval(heartbeat);
  }
});

function normalizeMessages(input) {
  if (!Array.isArray(input)) return null;

  const messages = input
    .filter(
      (message) =>
        message &&
        allowedRoles.has(message.role) &&
        typeof message.content === "string" &&
        message.content.trim().length > 0
    )
    .map((message) => ({ role: message.role, content: message.content }));

  return messages.length ? messages : null;
}

function startEventStream(res) {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

function sendEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function providerStream(messages, res, signal) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({ model, messages, stream: true }),
    signal
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Provider error ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      forwardProviderEvent(rawEvent, res);
      boundary = buffer.indexOf("\n\n");
    }
  }
}

function forwardProviderEvent(rawEvent, res) {
  for (const line of rawEvent.split("\n")) {
    if (!line.startsWith("data:")) continue;

    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;

    try {
      const content = JSON.parse(data).choices?.[0]?.delta?.content;
      if (content) sendEvent(res, "message", { content });
    } catch {
      // Ignore malformed provider chunks.
    }
  }
}

async function mockStream(prompt, res, signal) {
  const answer =
    `Mock response for: "${prompt}". ` +
    `Add OPENAI_API_KEY to server/.env to stream a real model response.`;

  for (const token of answer.match(/\S+\s*/g) || []) {
    if (signal.aborted) return;
    sendEvent(res, "message", { content: token });
    await new Promise((resolve) => setTimeout(resolve, 35));
  }
}

const server = app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  console.log(
    process.env.OPENAI_API_KEY
      ? `Chat provider: OpenAI (${model})`
      : "Chat provider: mock (set OPENAI_API_KEY to use a real model)"
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
