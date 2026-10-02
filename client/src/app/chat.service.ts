import { Injectable } from '@angular/core';
import { Observable, Subscriber } from 'rxjs';

export type Role = 'user' | 'assistant';

export interface Message {
  role: Role;
  content: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly endpoint = '/api/chat';

  stream(messages: Message[]): Observable<string> {
    return new Observable<string>((subscriber) => {
      const controller = new AbortController();

      const run = async (): Promise<void> => {
        const response = await fetch(this.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
          signal: controller.signal
        });

        if (!response.ok || !response.body) {
          const detail = await response.text().catch(() => '');
          throw new Error(detail || `Request failed with status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          let boundary = buffer.indexOf('\n\n');
          while (boundary !== -1) {
            const rawEvent = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            this.handleEvent(rawEvent, subscriber);
            boundary = buffer.indexOf('\n\n');
          }
        }
      };

      run()
        .then(() => subscriber.complete())
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return;
          subscriber.error(error);
        });

      return () => controller.abort();
    });
  }

  private handleEvent(rawEvent: string, subscriber: Subscriber<string>): void {
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }

    if (!dataLines.length) return;

    const data = dataLines.join('\n');

    if (eventName === 'error') {
      subscriber.error(new Error(this.parseMessage(data)));
      return;
    }

    if (eventName === 'done' || data === '[DONE]') return;

    const content = this.parseContent(data);
    if (content) subscriber.next(content);
  }

  private parseContent(data: string): string {
    try {
      return JSON.parse(data)?.content ?? '';
    } catch {
      return '';
    }
  }

  private parseMessage(data: string): string {
    try {
      return JSON.parse(data)?.message || 'The server reported an error';
    } catch {
      return data || 'The server reported an error';
    }
  }
}
