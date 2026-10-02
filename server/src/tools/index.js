const vm = require("vm");
const { logger } = require("../observability/logger");
const { search } = require("../rag");

const definitions = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current date and time in ISO 8601 format.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "calculator",
      description: "Evaluate a basic arithmetic expression using +, -, *, /, % and parentheses.",
      parameters: {
        type: "object",
        properties: {
          expression: { type: "string", description: "For example: (12 + 8) * 3" }
        },
        required: ["expression"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "search_knowledge_base",
      description:
        "Search the user's uploaded knowledge base of documents for relevant excerpts.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "The search query" } },
        required: ["query"],
        additionalProperties: false
      }
    }
  }
];

const handlers = {
  async get_current_time() {
    return {
      now: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    };
  },

  async calculator(args) {
    const expression = String(args?.expression || "").trim();
    if (!/^[\d+\-*/%().\s]+$/.test(expression)) {
      throw new Error("Only numbers and the operators + - * / % ( ) are allowed");
    }
    const result = vm.runInNewContext(`(${expression})`, {}, { timeout: 200 });
    if (typeof result !== "number" || !Number.isFinite(result)) {
      throw new Error("Expression did not evaluate to a number");
    }
    return { expression, result };
  },

  async search_knowledge_base(args, context) {
    const matches = await search({
      userId: context.userId,
      query: String(args?.query || "")
    });
    return {
      query: args?.query,
      matches: matches.map((match) => ({
        document: match.documentTitle,
        score: Number(match.score.toFixed(3)),
        excerpt: match.content
      }))
    };
  }
};

function listTools() {
  return definitions.map((definition) => ({
    name: definition.function.name,
    description: definition.function.description,
    parameters: definition.function.parameters
  }));
}

function parseArguments(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function executeTool(name, args, context = {}) {
  const handler = handlers[name];
  if (!handler) throw new Error(`Unknown tool: ${name}`);

  const startedAt = process.hrtime.bigint();
  const result = await handler(args, context);
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  (context.log || logger).info("tool executed", { tool: name, durationMs: Math.round(durationMs) });
  return result;
}

module.exports = { definitions, listTools, executeTool, parseArguments };
