const { config } = require("../config");

function safeParse(raw) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

function toProviderMessages(messages) {
  return messages.map((message) => {
    if (message.role === "tool") {
      return { role: "tool", tool_call_id: message.tool_call_id, content: message.content };
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      return {
        role: "assistant",
        content: message.content || null,
        tool_calls: message.tool_calls.map((call) => ({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: JSON.stringify(call.arguments || {}) }
        }))
      };
    }
    return { role: message.role, content: message.content };
  });
}

async function planToolCalls(messages, tools, signal) {
  if (!tools?.length) return [];

  const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify({
      model: config.openai.model,
      messages: toProviderMessages(messages),
      tools,
      tool_choice: "auto"
    }),
    signal
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Provider error ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const payload = await response.json();
  const calls = payload.choices?.[0]?.message?.tool_calls || [];

  return calls.map((call) => ({
    id: call.id,
    name: call.function.name,
    arguments: safeParse(call.function.arguments)
  }));
}

async function streamCompletion({ messages, signal, onDelta }) {
  const response = await fetch(`${config.openai.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify({
      model: config.openai.model,
      messages: toProviderMessages(messages),
      stream: true
    }),
    signal
  });

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Provider error ${response.status}${detail ? `: ${detail}` : ""}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      for (const line of rawEvent.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
          // Ignore malformed provider chunks.
        }
      }

      boundary = buffer.indexOf("\n\n");
    }
  }

  return full;
}

module.exports = { name: "openai", planToolCalls, streamCompletion };
