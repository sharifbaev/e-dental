import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, delay, of, switchMap, tap, throwError, timer } from 'rxjs';
import { LoginRequest, LoginResponse, User } from '../models/auth.model';

const TOKEN_KEY = 'e-dental.token';
const USER_KEY = 'e-dental.user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(this.readUser());
  private readonly _token = signal<string | null>(localStorage.getItem(TOKEN_KEY));

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => !!this._token());

  login(credentials: LoginRequest): Observable<LoginResponse> {
    return this.loginRequest(credentials).pipe(
      tap(response => this.saveSession(response))
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
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
    if (credentials.username === 'admin' && credentials.password === 'admin') {
      return of<LoginResponse>({
        token: 'mock-token',
        user: { id: 1, fullName: 'Administrator', username: 'admin', role: 'admin' }
      }).pipe(delay(500));
    }
    return timer(500).pipe(
      switchMap(() => throwError(() => new Error('INVALID_CREDENTIALS')))
    );
  }

  private saveSession(response: LoginResponse): void {
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this._token.set(response.token);
    this._user.set(response.user);
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
