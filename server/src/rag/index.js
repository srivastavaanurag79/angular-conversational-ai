const { config } = require("../config");
const { chunkRepo, documentRepo } = require("../db/repositories");
const metrics = require("../observability/metrics");
const { embed, cosineSimilarity } = require("./embeddings");

function chunkText(text, maxLength = config.rag.chunkSize) {
  const paragraphs = String(text || "")
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const paragraph of paragraphs) {
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    for (const sentence of sentences) {
      if (sentence.length > maxLength) {
        flush();
        for (let index = 0; index < sentence.length; index += maxLength) {
          chunks.push(sentence.slice(index, index + maxLength).trim());
        }
        continue;
      }
      const candidate = current ? `${current} ${sentence}` : sentence;
      if (candidate.length > maxLength) flush();
      current = current ? `${current} ${sentence}` : sentence;
    }
    flush();
  }

  flush();
  return chunks.filter(Boolean);
}

async function ingestDocument({ userId, title, content }) {
  const document = documentRepo.create({ userId, title: title || "Untitled document" });
  const chunks = chunkText(content);

  for (const piece of chunks) {
    const embedding = await embed(piece);
    chunkRepo.create({ documentId: document.id, content: piece, embedding });
  }

  metrics.increment("rag_documents_ingested_total", {}, 1);
  metrics.increment("rag_chunks_ingested_total", {}, chunks.length);

  return { document, chunkCount: chunks.length };
}

async function search({ userId, query, topK = config.rag.topK }) {
  const queryVector = await embed(query);
  const chunks = chunkRepo.listByUser(userId);

  const matches = chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryVector, JSON.parse(chunk.embedding))
    }))
    .filter((chunk) => chunk.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  metrics.increment("rag_retrievals_total", {}, 1);
  return matches;
}

module.exports = { chunkText, ingestDocument, search };
