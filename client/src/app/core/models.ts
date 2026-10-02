export interface User {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  id: string;
  conversationId?: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  createdAt: string;
}

export interface ToolRun {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result: string;
  createdAt: string;
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: ChatMessage[];
  toolRuns: ToolRun[];
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  createdAt: string;
}

export interface ToolInfo {
  name: string;
  description: string;
}

export interface HealthInfo {
  ok: boolean;
  provider: string;
  model: string;
  embeddings: string;
  uptimeSeconds: number;
}

export interface RetrievalMatch {
  document: string;
  score: number;
  excerpt: string;
}

export interface ChatEventData {
  content?: string;
  conversationId?: string;
  userMessageId?: string;
  messageId?: string;
  provider?: string;
  title?: string;
  id?: string;
  name?: string;
  arguments?: Record<string, unknown>;
  result?: string;
  matches?: RetrievalMatch[];
  message?: string;
}

export interface ChatEvent {
  name: string;
  data: ChatEventData;
}
