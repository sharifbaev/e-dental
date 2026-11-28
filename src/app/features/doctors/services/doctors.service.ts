import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { Doctor, DoctorDraft } from '../models/doctor.model';
import { AuthService } from '../../../core/auth/auth.service';
import { api } from '../../../core/api/api';

// Логин для нового врача (POST /doctors) — сразу создаётся учётная запись с ролью «Врач»
export interface DoctorAccount {
  username: string;
  password: string;
}

// Справочник врачей (GET /doctors). Врачу сервер отдаёт только id и ФИО — для фильтров
@Injectable({ providedIn: 'root' })
export class DoctorsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _doctors = signal<Doctor[]>([]);
  private readonly _specialties = signal<string[]>([]);

  readonly doctors = this._doctors.asReadonly();
  readonly specialties = this._specialties.asReadonly();
  readonly loaded = signal(false);

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        this._doctors.set([]);
        this.loaded.set(false);
        if (userId) {
          this.reload();
          this.http.get<string[]>(api('/specialties')).subscribe({ next: list => this._specialties.set(list), error: () => undefined });
        }
      });
    });
  }

  reload(): void {
    this.http.get<Doctor[]>(api('/doctors')).subscribe({
      next: list => {
        this._doctors.set(list);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true)
    });
  }

  add(draft: DoctorDraft, account?: DoctorAccount): Observable<Doctor> {
    return this.http.post<Doctor>(api('/doctors'), { ...draft, account }).pipe(
      tap(created => this._doctors.update(list => [...list, created]))
    );
  }

  update(id: number, changes: Partial<DoctorDraft>): Observable<void> {
    return this.http.patch<Doctor>(api(`/doctors/${id}`), changes).pipe(
      tap(updated => this._doctors.update(list => list.map(d => (d.id === id ? updated : d)))),
      map(() => undefined)
    );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(api(`/doctors/${id}`)).pipe(
      tap(() => this._doctors.update(list => list.filter(d => d.id !== id)))
    );
  }
}
