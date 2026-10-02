const path = require("path");

require("dotenv").config();

function bool(value, fallback = false) {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === "true";
}

const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || "development",
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
    tokenTtl: process.env.JWT_TTL || "7d"
  },
  db: {
    file: process.env.DATABASE_FILE || path.join(__dirname, "..", "data", "app.db")
  },
  rag: {
    chunkSize: Number(process.env.RAG_CHUNK_SIZE || 320),
    topK: Number(process.env.RAG_TOP_K || 4),
    useRealEmbeddings: bool(process.env.RAG_REAL_EMBEDDINGS, false)
  },
  agent: {
    maxToolSteps: Number(process.env.AGENT_MAX_TOOL_STEPS || 3),
    historyLimit: Number(process.env.AGENT_HISTORY_LIMIT || 20)
  }
};

module.exports = { config };
