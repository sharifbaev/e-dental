import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { User, UserRole } from '../../../core/models/auth.model';
import { api } from '../../../core/api/api';

export interface UserCreate {
  fullName: string;
  username: string;            // без кода клиники: сервер сам добавит префикс клиники
  password: string;
  role: UserRole;
  doctorId?: number;
}

export interface UserUpdate {
  fullName?: string;
  role?: UserRole;
  doctorId?: number;
  password?: string;           // сброс пароля владельцем
  active?: boolean;            // блокировка / разблокировка
}

// Учётные записи клиники (GET/POST/PATCH /users) — только владелец
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);

  private readonly _users = signal<User[]>([]);

  readonly users = this._users.asReadonly();

  reload(): void {
    this.http.get<User[]>(api('/users')).subscribe({ next: list => this._users.set(list), error: () => undefined });
  }

  create(draft: UserCreate): Observable<User> {
    return this.http.post<User>(api('/users'), draft).pipe(tap(created => this._users.update(list => [...list, created])));
  }

  update(id: number, changes: UserUpdate): Observable<User> {
    return this.http.patch<User>(api(`/users/${id}`), changes).pipe(
      tap(updated => this._users.update(list => list.map(u => (u.id === id ? updated : u))))
    );
  }
}
