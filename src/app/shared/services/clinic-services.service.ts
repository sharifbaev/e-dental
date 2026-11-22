import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { VisitService } from '../../features/schedule/models/appointment-form.model';
import { AuthService } from '../../core/auth/auth.service';
import { api } from '../../core/api/api';

export type VisitServiceDraft = Omit<VisitService, 'id'>;

// Справочник услуг клиники (GET/POST/PATCH/DELETE /services): «Настройки → Услуги», форма записи и форма врача.
// «Другое» (id 0) сервер не отдаёт — его добавляют формы сами
@Injectable({ providedIn: 'root' })
export class ClinicServicesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _services = signal<VisitService[]>([]);

  readonly services = this._services.asReadonly();

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        this._services.set([]);
        if (userId) this.reload();
      });
    });
  }

  reload(): void {
    this.http.get<VisitService[]>(api('/services')).subscribe({
      next: list => this._services.set(list),
      error: () => undefined
    });
  }

  add(draft: VisitServiceDraft): Observable<VisitService> {
    return this.http.post<VisitService>(api('/services'), draft).pipe(
      tap(created => this._services.update(list => [...list, created].sort((a, b) => a.name.localeCompare(b.name, 'ru'))))
    );
  }

  update(id: number, changes: VisitServiceDraft): Observable<void> {
    return this.http.patch<VisitService>(api(`/services/${id}`), changes).pipe(
      tap(updated => this._services.update(list => list.map(s => (s.id === id ? updated : s)))),
      map(() => undefined)
    );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(api(`/services/${id}`)).pipe(
      tap(() => this._services.update(list => list.filter(s => s.id !== id)))
    );
  }
}
