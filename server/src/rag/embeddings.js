const { config } = require("../config");

const DIMENSIONS = 256;

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function hashToken(token) {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalize(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function localEmbed(text) {
  const vector = new Array(DIMENSIONS).fill(0);
  for (const token of tokenize(text)) {
    const hash = hashToken(token);
    vector[hash % DIMENSIONS] += (hash & 1) === 0 ? 1 : -1;
  }
  return normalize(vector);
}

async function embed(text) {
  if (!config.openai.apiKey || !config.rag.useRealEmbeddings) {
    return localEmbed(text);
  }

  const response = await fetch(`${config.openai.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.openai.apiKey}`
    },
    body: JSON.stringify({ model: config.openai.embeddingModel, input: text })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Embedding provider error ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  return payload.data?.[0]?.embedding || localEmbed(text);
}

function cosineSimilarity(a, b) {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
  }
  return dot;
}

module.exports = { embed, localEmbed, cosineSimilarity, DIMENSIONS };
