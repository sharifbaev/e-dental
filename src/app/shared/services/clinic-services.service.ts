import { Injectable, signal } from '@angular/core';
import { Observable, delay, map, of, tap } from 'rxjs';
import { VisitService } from '../../features/schedule/models/appointment-form.model';

const STORAGE_KEY = 'e-dental.services';

// Имитация задержки ответа сервера
const MOCK_DELAY_MS = 300;

// Справочник услуг по умолчанию (как было в форме записи)
const DEFAULT_SERVICES: VisitService[] = [
  { id: 1, name: 'Лечение кариеса', durationMinutes: 45, price: 350_000 },
  { id: 2, name: 'Профессиональная гигиена AirFlow', durationMinutes: 60, price: 400_000 },
  { id: 3, name: 'Консультация и осмотр', durationMinutes: 30, price: 100_000 },
  { id: 4, name: 'Удаление зуба', durationMinutes: 40, price: 250_000 },
  { id: 5, name: 'Острая боль', durationMinutes: 30, urgent: true, price: 150_000 }
];

export type VisitServiceDraft = Omit<VisitService, 'id'>;

// Справочник услуг клиники: CRUD в «Настройки → Услуги», список — в форме записи и форме врача
// TODO: на API — GET/POST/PATCH/DELETE /services. Пока храним в браузере
@Injectable({ providedIn: 'root' })
export class ClinicServicesService {
  private readonly _services = signal<VisitService[]>(this.read());

  readonly services = this._services.asReadonly();

  add(draft: VisitServiceDraft): Observable<VisitService> {
    const service: VisitService = { ...draft, id: Date.now() };
    return of(service).pipe(
      delay(MOCK_DELAY_MS),
      tap(created => this.write([...this._services(), created]))
    );
  }

  update(id: number, changes: VisitServiceDraft): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this.write(this._services().map(s => (s.id === id ? { ...changes, id } : s)))),
      map(() => undefined)
    );
  }

  remove(id: number): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this.write(this._services().filter(s => s.id !== id))),
      map(() => undefined)
    );
  }

  private write(list: VisitService[]): void {
    this._services.set(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // localStorage недоступен — список действует до перезагрузки
    }
  }

  private read(): VisitService[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as VisitService[];
    } catch {
      // повреждённые данные — берём список по умолчанию
    }
    return DEFAULT_SERVICES;
  }
}
