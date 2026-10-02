import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthResponse, User } from './models';

const TOKEN_KEY = 'acai.token';

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiService);

  private readonly userSignal = signal<User | null>(null);
  private readonly readySignal = signal(false);

  readonly user = this.userSignal.asReadonly();
  readonly ready = this.readySignal.asReadonly();
  readonly isAuthenticated = computed(() => this.userSignal() !== null);

  constructor() {
    void this.restore();
  }

  async login(email: string, password: string): Promise<void> {
    const result = await this.api.post<AuthResponse>('/auth/login', { email, password }, false);
    this.setToken(result.token);
    this.userSignal.set(result.user);
  }

  async register(name: string, email: string, password: string): Promise<void> {
    const result = await this.api.post<AuthResponse>('/auth/register', { name, email, password }, false);
    this.setToken(result.token);
    this.userSignal.set(result.user);
  }

  logout(): void {
    this.setToken(null);
    this.userSignal.set(null);
  }

  private async restore(): Promise<void> {
    if (!this.token) {
      this.readySignal.set(true);
      return;
    }

    try {
      const { user } = await this.api.get<{ user: User }>('/auth/me');
      this.userSignal.set(user);
    } catch {
      this.setToken(null);
    } finally {
      this.readySignal.set(true);
    }
  }

  private get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private setToken(token: string | null): void {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }
}
