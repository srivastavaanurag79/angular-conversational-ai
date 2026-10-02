import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { ChatService, Message } from './chat.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnDestroy {
  messages: Message[] = [];
  input = '';
  loading = false;

  private activeSubscription?: Subscription;

  constructor(private readonly chat: ChatService) {}

  send(): void {
    const content = this.input.trim();
    if (!content || this.loading) return;

    this.messages = [...this.messages, { role: 'user', content }];
    this.input = '';
    this.loading = true;

    const assistant: Message = { role: 'assistant', content: '' };
    this.messages = [...this.messages, assistant];

    this.activeSubscription = this.chat.stream(this.messages.slice(0, -1)).subscribe({
      next: (chunk) => {
        assistant.content += chunk;
        this.messages = [...this.messages];
      },
      error: (error: Error) => {
        assistant.content = assistant.content || `Something went wrong: ${error.message}`;
        this.messages = [...this.messages];
        this.loading = false;
        this.activeSubscription = undefined;
      },
      complete: () => {
        this.loading = false;
        this.activeSubscription = undefined;
      }
    });
  }

  stop(): void {
    this.activeSubscription?.unsubscribe();
    this.activeSubscription = undefined;
    this.loading = false;
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  clear(): void {
    if (this.loading) return;
    this.messages = [];
  }

  ngOnDestroy(): void {
    this.activeSubscription?.unsubscribe();
  }
}
