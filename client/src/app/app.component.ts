import { Component, inject } from '@angular/core';
import { SessionService } from './core/session.service';
import { LoginComponent } from './login/login.component';
import { ChatComponent } from './chat/chat.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LoginComponent, ChatComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  readonly session = inject(SessionService);
}
