import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, delay, of, switchMap, tap, throwError, timer } from 'rxjs';
import { LoginRequest, LoginResponse, User } from '../models/auth.model';

const TOKEN_KEY = 'e-dental.token';
const USER_KEY = 'e-dental.user';

// Демо-доступ до подключения API: администратор и врач
const DEMO_USERS: { username: string; password: string; user: User }[] = [
  { username: 'admin', password: 'admin123', user: { id: 1, fullName: 'Administrator', username: 'admin', role: 'admin' } },
  {
    username: 'doctor',
    password: 'doctor123',
    user: { id: 2, fullName: 'Сидоров Алексей Петрович', username: 'doctor', role: 'doctor', doctorId: 1, doctorName: 'Сидоров А. П.' }
  }
];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(this.readUser());
  private readonly _token = signal<string | null>(this.readToken());

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.loginRequest(credentials).pipe(
      tap(response => this.saveSession(response))
    );
  }

  logout(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch {
      // localStorage недоступен — сессия очистится только в памяти
    }
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this._token();
  }

  // TODO: заменить на реальный запрос, когда будет API:
  // return this.http.post<LoginResponse>(`${apiUrl}/auth/login`, credentials);
  private loginRequest(credentials: LoginRequest): Observable<LoginResponse> {
    const username = credentials.username.trim();

    const demo = DEMO_USERS.find(u => u.username === username && u.password === credentials.password);
    if (demo) {
      return of<LoginResponse>({ token: 'mock-token', user: demo.user }).pipe(delay(500));
    }
    return timer(500).pipe(
      switchMap(() => throwError(() => new Error('INVALID_CREDENTIALS')))
    );
  }

  private saveSession(response: LoginResponse): void {
    try {
      localStorage.setItem(TOKEN_KEY, response.token);
      localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    } catch {
      // localStorage недоступен (например, приватный режим) — вход действует до перезагрузки
    }
    this._token.set(response.token);
    this._user.set(response.user);
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private readUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }
}
