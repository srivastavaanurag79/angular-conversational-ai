const { randomUUID } = require("crypto");
const { db } = require("./index");

const now = () => new Date().toISOString();

const mapUser = (row) =>
  row && { id: row.id, email: row.email, name: row.name, createdAt: row.created_at };

const mapConversation = (row) =>
  row && {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };

const mapMessage = (row) =>
  row && {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  };

const mapDocument = (row) =>
  row && { id: row.id, userId: row.user_id, title: row.title, createdAt: row.created_at };

const mapChunk = (row) =>
  row && {
    id: row.id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    content: row.content,
    embedding: row.embedding,
    createdAt: row.created_at
  };

const mapToolRun = (row) =>
  row && {
    id: row.id,
    conversationId: row.conversation_id,
    messageId: row.message_id,
    name: row.name,
    arguments: row.arguments ? JSON.parse(row.arguments) : {},
    result: row.result,
    createdAt: row.created_at
  };

const userRepo = {
  create({ email, name, passwordHash }) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO users (id, email, name, password_hash, created_at)
       VALUES (@id, @email, @name, @passwordHash, @createdAt)`
    ).run({ id, email, name, passwordHash, createdAt: now() });
    return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
  },

  findByEmail(email) {
    return db.prepare("SELECT * FROM users WHERE email = ?").get(email) || null;
  },

  findById(id) {
    return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
  },

  count() {
    return db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  }
};

const conversationRepo = {
  create({ userId, title }) {
    const id = randomUUID();
    const timestamp = now();
    db.prepare(
      `INSERT INTO conversations (id, user_id, title, created_at, updated_at)
       VALUES (@id, @userId, @title, @createdAt, @updatedAt)`
    ).run({ id, userId, title: title || "New conversation", createdAt: timestamp, updatedAt: timestamp });
    return this.findById(id, userId);
  },

  findById(id, userId) {
    return mapConversation(
      db
        .prepare("SELECT * FROM conversations WHERE id = ? AND user_id = ?")
        .get(id, userId)
    );
  },

  listByUser(userId) {
    return db
      .prepare("SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC")
      .all(userId)
      .map(mapConversation);
  },

  updateTitle(id, userId, title) {
    db.prepare(
      "UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?"
    ).run(title, now(), id, userId);
    return this.findById(id, userId);
  },

  touch(id) {
    db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(now(), id);
  },

  remove(id, userId) {
    return db
      .prepare("DELETE FROM conversations WHERE id = ? AND user_id = ?")
      .run(id, userId).changes;
  }
};

const messageRepo = {
  create({ conversationId, role, content }) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at)
       VALUES (@id, @conversationId, @role, @content, @createdAt)`
    ).run({ id, conversationId, role, content, createdAt: now() });
    return this.findById(id);
  },

  findById(id) {
    return mapMessage(db.prepare("SELECT * FROM messages WHERE id = ?").get(id));
  },

  listByConversation(conversationId, limit = 100) {
    return db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ?
         ORDER BY created_at ASC LIMIT ?`
      )
      .all(conversationId, limit)
      .map(mapMessage);
  },

  updateContent(id, content) {
    db.prepare("UPDATE messages SET content = ? WHERE id = ?").run(content, id);
    return this.findById(id);
  }
};

const documentRepo = {
  create({ userId, title }) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO documents (id, user_id, title, created_at)
       VALUES (@id, @userId, @title, @createdAt)`
    ).run({ id, userId, title, createdAt: now() });
    return mapDocument(db.prepare("SELECT * FROM documents WHERE id = ?").get(id));
  },

  findById(id, userId) {
    return mapDocument(
      db.prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?").get(id, userId)
    );
  },

  listByUser(userId) {
    return db
      .prepare("SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId)
      .map(mapDocument);
  },

  remove(id, userId) {
    return db
      .prepare("DELETE FROM documents WHERE id = ? AND user_id = ?")
      .run(id, userId).changes;
  }
};

const chunkRepo = {
  create({ documentId, content, embedding }) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO chunks (id, document_id, content, embedding, created_at)
       VALUES (@id, @documentId, @content, @embedding, @createdAt)`
    ).run({
      id,
      documentId,
      content,
      embedding: JSON.stringify(embedding),
      createdAt: now()
    });
    return id;
  },

  listByUser(userId) {
    return db
      .prepare(
        `SELECT chunks.*, documents.title AS document_title
         FROM chunks
         JOIN documents ON documents.id = chunks.document_id
         WHERE documents.user_id = ?`
      )
      .all(userId)
      .map(mapChunk);
  },

  countByUser(userId) {
    return db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM chunks
         JOIN documents ON documents.id = chunks.document_id
         WHERE documents.user_id = ?`
      )
      .get(userId).count;
  }
};

const toolRunRepo = {
  create({ conversationId, messageId, name, args, result }) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO tool_runs (id, conversation_id, message_id, name, arguments, result, created_at)
       VALUES (@id, @conversationId, @messageId, @name, @arguments, @result, @createdAt)`
    ).run({
      id,
      conversationId,
      messageId: messageId || null,
      name,
      arguments: JSON.stringify(args || {}),
      result,
      createdAt: now()
    });
    return mapToolRun(db.prepare("SELECT * FROM tool_runs WHERE id = ?").get(id));
  },

  listByConversation(conversationId) {
    return db
      .prepare("SELECT * FROM tool_runs WHERE conversation_id = ? ORDER BY created_at ASC")
      .all(conversationId)
      .map(mapToolRun);
  }
};

module.exports = {
  userRepo,
  conversationRepo,
  messageRepo,
  documentRepo,
  chunkRepo,
  toolRunRepo
};
