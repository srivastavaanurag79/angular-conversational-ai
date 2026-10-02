const { randomUUID } = require("crypto");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lastUserMessage(messages) {
  return [...messages].reverse().find((message) => message.role === "user")?.content || "";
}

function isBalanced(expression) {
  let depth = 0;
  for (const char of expression) {
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function extractExpression(text) {
  const match = text.match(/[(]?[0-9][0-9\s.+\-*/%()]*/);
  if (!match) return null;

  let candidate = match[0].trim();
  while (candidate && !(isBalanced(candidate) && /[0-9)]$/.test(candidate))) {
    candidate = candidate.slice(0, -1).trim();
  }

  return /[+\-*/%]/.test(candidate) ? candidate : null;
}

function planToolCalls(messages) {
  const text = lastUserMessage(messages);
  const calls = [];

  if (/\b(time|date|clock|today|now)\b/i.test(text)) {
    calls.push({ id: randomUUID(), name: "get_current_time", arguments: {} });
  }

  const expression = extractExpression(text);
  if (/(calculat|compute|what is|how much|equals)/i.test(text) && expression) {
    calls.push({
      id: randomUUID(),
      name: "calculator",
      arguments: { expression }
    });
  }

  if (
    /(knowledge|document|policy|handbook|faq|according to|refund|pto|paid time off|vacation|holiday|remote work|reimburse)/i.test(
      text
    )
  ) {
    calls.push({ id: randomUUID(), name: "search_knowledge_base", arguments: { query: text } });
  }

  return calls;
}

async function streamCompletion({ messages, signal, onDelta }) {
  const toolMessages = messages.filter((message) => message.role === "tool");
  const prompt = lastUserMessage(messages);

  const answer = toolMessages.length
    ? `Here is what ${toolMessages.map((message) => message.name).join(", ")} returned:\n` +
      toolMessages.map((message) => `- ${message.name}: ${message.content}`).join("\n") +
      "\n\n(Mock provider. Set OPENAI_API_KEY in server/.env for natural-language answers.)"
    : `Mock response to "${prompt}". This project runs without an API key so you can test streaming, ` +
      "retrieval, tool calling, and persistence end to end. Add OPENAI_API_KEY to server/.env for real model answers.";

  for (const token of answer.match(/\S+\s*/g) || []) {
    if (signal?.aborted) return "";
    onDelta(token);
    await delay(20);
  }

  return answer;
}

module.exports = { name: "mock", planToolCalls, streamCompletion };
