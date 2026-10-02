import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';
import {
  Conversation,
  ConversationDetail,
  HealthInfo,
  KnowledgeDocument,
  ToolInfo
} from './models';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly api = inject(ApiService);

  listConversations(): Promise<{ conversations: Conversation[] }> {
    return this.api.get<{ conversations: Conversation[] }>('/conversations');
  }

  getConversation(id: string): Promise<ConversationDetail> {
    return this.api.get<ConversationDetail>(`/conversations/${id}`);
  }

  deleteConversation(id: string): Promise<void> {
    return this.api.del<void>(`/conversations/${id}`);
  }

  listDocuments(): Promise<{ documents: KnowledgeDocument[] }> {
    return this.api.get<{ documents: KnowledgeDocument[] }>('/documents');
  }

  addDocument(
    title: string,
    content: string
  ): Promise<{ document: KnowledgeDocument; chunkCount: number }> {
    return this.api.post<{ document: KnowledgeDocument; chunkCount: number }>('/documents', {
      title,
      content
    });
  }

  deleteDocument(id: string): Promise<void> {
    return this.api.del<void>(`/documents/${id}`);
  }

  listTools(): Promise<{ tools: ToolInfo[] }> {
    return this.api.get<{ tools: ToolInfo[] }>('/tools', false);
  }

  health(): Promise<HealthInfo> {
    return this.api.get<HealthInfo>('/health', false);
  }
}
