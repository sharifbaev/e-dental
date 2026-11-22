import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, finalize, map, of, shareReplay, tap } from 'rxjs';
import { LoginRequest, LoginResponse, TokenPair, User } from '../models/auth.model';
import { api } from '../api/api';

const TOKEN_KEY = 'e-dental.token';
const REFRESH_KEY = 'e-dental.refreshToken';
const USER_KEY = 'e-dental.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);

  private readonly _user = signal<User | null>(this.readUser());
  // Сессия из демо-версии (mock-токен без refresh-токена) — недействительна
  private readonly _token = signal<string | null>(read(REFRESH_KEY) ? read(TOKEN_KEY) : null);
  private refreshToken: string | null = read(REFRESH_KEY);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());

  // Один запрос обновления на все запросы, получившие 401 одновременно
  private refresh$: Observable<string> | null = null;

  login(credentials: LoginRequest): Observable<LoginResponse> {
    const body: LoginRequest = { username: credentials.username.trim(), password: credentials.password };
    return this.http.post<LoginResponse>(api('/auth/login'), body).pipe(
      tap(response => {
        this.saveTokens(response);
        this.setUser(response.user);
      })
    );
  }

  // После перезагрузки страницы — свежие данные пользователя (роль, блокировка)
  loadMe(): Observable<User | null> {
    if (!this._token()) return of(null);
    return this.http.get<User>(api('/auth/me')).pipe(tap(user => this.setUser(user)));
  }

  // Новый access-токен по refresh-токену (старый refresh сразу недействителен)
  refresh(): Observable<string> {
    if (!this.refreshToken) throw new Error('NO_REFRESH_TOKEN');
    if (!this.refresh$) {
      this.refresh$ = this.http.post<TokenPair>(api('/auth/refresh'), { refreshToken: this.refreshToken }).pipe(
        tap(pair => this.saveTokens(pair)),
        map(pair => pair.token),
        finalize(() => (this.refresh$ = null)),
        shareReplay(1)
      );
    }
    return this.refresh$;
  }

  hasRefreshToken(): boolean {
    return !!this.refreshToken;
  }

  changePassword(oldPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>(api('/auth/change-password'), { oldPassword, newPassword });
  }

  logout(): void {
    // Сообщаем серверу, чтобы аннулировать refresh-токен; ответ не ждём
    if (this.refreshToken && this._token()) {
      this.http.post(api('/auth/logout'), { refreshToken: this.refreshToken }).subscribe({ error: () => undefined });
    }
    this.clearSession();
    this.router.navigate(['/login']);
  }

  // Сессия закончилась (refresh не прошёл) — только очистка, без запроса на сервер
  expire(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this._token();
  }

  private clearSession(): void {
    for (const key of [TOKEN_KEY, REFRESH_KEY, USER_KEY]) remove(key);
    this.refreshToken = null;
    this._token.set(null);
    this._user.set(null);
  }

  private saveTokens(pair: TokenPair): void {
    write(TOKEN_KEY, pair.token);
    write(REFRESH_KEY, pair.refreshToken);
    this.refreshToken = pair.refreshToken;
    this._token.set(pair.token);
  }

  private setUser(user: User): void {
    write(USER_KEY, JSON.stringify(user));
    this._user.set(user);
  }

  private readUser(): User | null {
    try {
      const raw = read(USER_KEY);
      const user = raw ? (JSON.parse(raw) as User) : null;
      // Сессия из демо-версии (роли admin/receptionist, mock-токен) — недействительна
      return user && read(REFRESH_KEY) ? user : null;
    } catch {
      return null;
    }
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage недоступен (например, приватный режим) — вход действует до перезагрузки
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage недоступен
  }
}
