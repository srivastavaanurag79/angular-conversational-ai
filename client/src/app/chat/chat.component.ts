import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ApiService } from '../core/api.service';
import { SessionService } from '../core/session.service';
import { WorkspaceService } from '../core/workspace.service';
import {
  ChatEvent,
  ChatEventData,
  ChatMessage,
  Conversation,
  HealthInfo,
  KnowledgeDocument,
  RetrievalMatch,
  ToolInfo
} from '../core/models';

const STREAM_ID = '__stream__';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent {
  private readonly api = inject(ApiService);
  private readonly workspace = inject(WorkspaceService);
  readonly session = inject(SessionService);

  readonly conversations = signal<Conversation[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly messages = signal<ChatMessage[]>([]);
  readonly input = signal('');
  readonly streaming = signal(false);
  readonly useRag = signal(true);
  readonly useTools = signal(true);
  readonly documents = signal<KnowledgeDocument[]>([]);
  readonly tools = signal<ToolInfo[]>([]);
  readonly health = signal<HealthInfo | null>(null);
  readonly retrievals = signal<RetrievalMatch[]>([]);
  readonly error = signal<string | null>(null);
  readonly sidebarOpen = signal(false);
  readonly knowledgeOpen = signal(false);
  readonly docTitle = signal('');
  readonly docContent = signal('');
  readonly docBusy = signal(false);
  readonly docError = signal<string | null>(null);

  readonly activeTitle = computed(
    () => this.conversations().find((item) => item.id === this.activeId())?.title ?? 'New conversation'
  );

  readonly providerLabel = computed(() => {
    const health = this.health();
    if (!health) return 'connecting…';
    return health.provider === 'mock' ? 'mock provider' : health.model;
  });

  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  private subscription?: Subscription;

  constructor() {
    void this.bootstrap();
    effect(() => {
      this.messages();
      this.scrollToBottom();
    });
  }

  send(): void {
    const content = this.input().trim();
    if (!content || this.streaming()) return;

    this.error.set(null);
    this.retrievals.set([]);
    const timestamp = new Date().toISOString();

    this.messages.update((list) => [
      ...list,
      { id: `local-${Date.now()}`, role: 'user', content, createdAt: timestamp },
      { id: STREAM_ID, role: 'assistant', content: '', createdAt: timestamp }
    ]);
    this.input.set('');
    this.streaming.set(true);

    this.subscription = this.api
      .streamChat({
        conversationId: this.activeId() ?? undefined,
        content,
        useRag: this.useRag(),
        useTools: this.useTools()
      })
      .subscribe({
        next: (event) => this.onEvent(event),
        error: (error: unknown) => this.finishWithError(error),
        complete: () => this.streaming.set(false)
      });
  }

  stop(): void {
    this.subscription?.unsubscribe();
    this.streaming.set(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  newChat(): void {
    if (this.streaming()) return;
    this.activeId.set(null);
    this.messages.set([]);
    this.retrievals.set([]);
    this.error.set(null);
    this.sidebarOpen.set(false);
  }

  async select(conversation: Conversation): Promise<void> {
    if (this.streaming()) return;
    this.activeId.set(conversation.id);
    this.error.set(null);
    this.retrievals.set([]);
    this.sidebarOpen.set(false);

    try {
      const detail = await this.workspace.getConversation(conversation.id);
      const messages: ChatMessage[] = detail.messages.map((message) => ({ ...message }));
      for (const run of detail.toolRuns) {
        messages.push({
          id: run.id,
          role: 'tool',
          toolName: run.name,
          content: run.result,
          createdAt: run.createdAt
        });
      }
      messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      this.messages.set(messages);
    } catch (error) {
      this.error.set(this.messageOf(error));
    }
  }

  async remove(conversation: Conversation, event: Event): Promise<void> {
    event.stopPropagation();
    if (this.streaming()) return;

    try {
      await this.workspace.deleteConversation(conversation.id);
      this.conversations.update((list) => list.filter((item) => item.id !== conversation.id));
      if (this.activeId() === conversation.id) this.newChat();
    } catch (error) {
      this.error.set(this.messageOf(error));
    }
  }

  toggleKnowledge(): void {
    this.knowledgeOpen.update((value) => !value);
    this.docError.set(null);
  }

  async addDocument(): Promise<void> {
    const title = this.docTitle().trim();
    const content = this.docContent().trim();

    if (!title || content.length < 20) {
      this.docError.set('A title is required and the content must be at least 20 characters.');
      return;
    }

    this.docBusy.set(true);
    this.docError.set(null);

    try {
      const result = await this.workspace.addDocument(title, content);
      this.documents.update((list) => [result.document, ...list]);
      this.docTitle.set('');
      this.docContent.set('');
    } catch (error) {
      this.docError.set(this.messageOf(error));
    } finally {
      this.docBusy.set(false);
    }
  }

  async removeDocument(document: KnowledgeDocument): Promise<void> {
    try {
      await this.workspace.deleteDocument(document.id);
      this.documents.update((list) => list.filter((item) => item.id !== document.id));
    } catch (error) {
      this.docError.set(this.messageOf(error));
    }
  }

  private async bootstrap(): Promise<void> {
    try {
      const [conversations, documents, tools, health] = await Promise.all([
        this.workspace.listConversations(),
        this.workspace.listDocuments(),
        this.workspace.listTools(),
        this.workspace.health()
      ]);
      this.conversations.set(conversations.conversations);
      this.documents.set(documents.documents);
      this.tools.set(tools.tools);
      this.health.set(health);
    } catch (error) {
      this.error.set(this.messageOf(error));
    }
  }

  private onEvent(event: ChatEvent): void {
    switch (event.name) {
      case 'meta':
        this.handleMeta(event.data);
        break;
      case 'retrieval':
        this.retrievals.set(event.data.matches ?? []);
        break;
      case 'tool':
        this.insertToolMessage(event.data);
        break;
      case 'message':
        if (event.data.content) this.appendToStream(event.data.content);
        break;
      case 'done':
        this.completeStream(event.data.messageId);
        break;
      default:
        break;
    }
  }

  private handleMeta(data: ChatEventData): void {
    if (!data.conversationId) return;
    this.activeId.set(data.conversationId);

    if (!this.conversations().some((item) => item.id === data.conversationId)) {
      const timestamp = new Date().toISOString();
      this.conversations.update((list) => [
        {
          id: data.conversationId as string,
          userId: '',
          title: data.title ?? 'New conversation',
          createdAt: timestamp,
          updatedAt: timestamp
        },
        ...list
      ]);
    }
  }

  private insertToolMessage(data: ChatEventData): void {
    const toolMessage: ChatMessage = {
      id: data.id ?? `tool-${Date.now()}`,
      role: 'tool',
      toolName: data.name,
      content: data.result ?? '',
      createdAt: new Date().toISOString()
    };

    this.messages.update((list) => {
      const copy = [...list];
      let index = -1;
      for (let position = copy.length - 1; position >= 0; position -= 1) {
        if (copy[position].id === STREAM_ID) {
          index = position;
          break;
        }
      }
      if (index >= 0) copy.splice(index, 0, toolMessage);
      else copy.push(toolMessage);
      return copy;
    });
  }

  private appendToStream(chunk: string): void {
    this.messages.update((list) =>
      list.map((message) =>
        message.id === STREAM_ID ? { ...message, content: message.content + chunk } : message
      )
    );
  }

  private completeStream(messageId?: string): void {
    this.messages.update((list) =>
      list.map((message) =>
        message.id === STREAM_ID
          ? { ...message, id: messageId ?? `assistant-${Date.now()}` }
          : message
      )
    );
    this.streaming.set(false);
    void this.refreshConversations();
  }

  private finishWithError(error: unknown): void {
    const message = this.messageOf(error);
    this.error.set(message);
    this.messages.update((list) =>
      list.map((item) =>
        item.id === STREAM_ID && !item.content
          ? { ...item, content: `Something went wrong: ${message}` }
          : item
      )
    );
    this.streaming.set(false);
  }

  private async refreshConversations(): Promise<void> {
    try {
      const result = await this.workspace.listConversations();
      this.conversations.set(result.conversations);
    } catch {
      // Non-critical refresh.
    }
  }

  private scrollToBottom(): void {
    queueMicrotask(() => {
      const element = this.scroller()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    });
  }

  private messageOf(error: unknown): string {
    return error instanceof Error ? error.message : 'Unexpected error';
  }
}
