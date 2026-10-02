import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SessionService } from '../core/session.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly session = inject(SessionService);

  readonly mode = signal<'login' | 'register'>('login');
  readonly name = signal('');
  readonly email = signal('demo@example.com');
  readonly password = signal('password123');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  toggle(): void {
    this.mode.update((value) => (value === 'login' ? 'register' : 'login'));
    this.error.set(null);
  }

  useDemo(): void {
    this.mode.set('login');
    this.email.set('demo@example.com');
    this.password.set('password123');
  }

  async submit(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);

    try {
      if (this.mode() === 'login') {
        await this.session.login(this.email().trim(), this.password());
      } else {
        await this.session.register(
          this.name().trim() || this.email().split('@')[0],
          this.email().trim(),
          this.password()
        );
      }
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      this.busy.set(false);
    }
  }
}
