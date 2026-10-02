import { Injectable } from '@angular/core';
import { Observable, Subscriber } from 'rxjs';
import { ChatEvent } from './models';

const TOKEN_KEY = 'acai.token';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl = '/api';

  get<T>(path: string, withAuth = true): Promise<T> {
    return this.handle<T>(fetch(`${this.baseUrl}${path}`, { headers: this.headers(withAuth) }));
  }

  post<T>(path: string, body: unknown, withAuth = true): Promise<T> {
    return this.handle<T>(
      fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: this.headers(withAuth),
        body: JSON.stringify(body)
      })
    );
  }

  del<T>(path: string, withAuth = true): Promise<T> {
    return this.handle<T>(
      fetch(`${this.baseUrl}${path}`, { method: 'DELETE', headers: this.headers(withAuth) })
    );
  }

  streamChat(body: {
    conversationId?: string;
    content: string;
    useRag: boolean;
    useTools: boolean;
  }): Observable<ChatEvent> {
    return new Observable<ChatEvent>((subscriber) => {
      const controller = new AbortController();
      void this.runStream(body, controller, subscriber);
      return () => controller.abort();
    });
  }

  private headers(withAuth: boolean): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const token = localStorage.getItem(TOKEN_KEY);
    if (withAuth && token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
  }

  private async handle<T>(response: Promise<Response>): Promise<T> {
    const resolved = await response;
    if (!resolved.ok) {
      const detail = await resolved.json().catch(() => ({ message: '' }));
      throw new Error(detail.message || `Request failed (${resolved.status})`);
    }
    if (resolved.status === 204) return undefined as T;
    return (await resolved.json()) as T;
  }

  private async runStream(
    body: { conversationId?: string; content: string; useRag: boolean; useTools: boolean },
    controller: AbortController,
    subscriber: Subscriber<ChatEvent>
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/chat`, {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok || !response.body) {
        const detail = await response.json().catch(() => ({ message: '' }));
        throw new Error(detail.message || `Request failed (${response.status})`);
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

          const event = this.parseEvent(rawEvent);
          if (event?.name === 'error') {
            subscriber.error(new Error(event.data.message || 'The server reported an error'));
          } else if (event) {
            subscriber.next(event);
          }

          boundary = buffer.indexOf('\n\n');
        }
      }

      subscriber.complete();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      subscriber.error(error);
    }
  }

  private parseEvent(rawEvent: string): ChatEvent | null {
    let name = 'message';
    const dataLines: string[] = [];

    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }

    if (!dataLines.length) return null;

    try {
      return { name, data: JSON.parse(dataLines.join('\n')) };
    } catch {
      return { name, data: {} };
    }
  }
}
