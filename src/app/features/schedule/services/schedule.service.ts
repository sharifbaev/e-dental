import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, forkJoin, map, of, tap } from 'rxjs';
import { AppointmentConfirmation, AppointmentDraft, AppointmentDto, PatientStatus, ScheduleAppointment, fromAppointmentDto } from '../models/schedule.model';
import { NO_SHOW_AFTER_MINUTES, STATUS_OVERDUE_AFTER_MINUTES } from '../../../shared/models/patient-status';
import { AuthService } from '../../../core/auth/auth.service';
import { api, params } from '../../../core/api/api';

// Date → 'YYYY-MM-DD' по местному времени
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// 'HH:mm' + минуты → 'HH:mm'
export function addMinutes(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const total = Math.min(hours * 60 + mins + minutes, 24 * 60 - 1);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// После окончания приёма прошло 30 минут, а статус всё ещё «Первичный» — нужно поменять статус
export function isStatusOverdue(appointment: ScheduleAppointment, now: Date): boolean {
  if (appointment.status !== 'primary') return false;
  const [year, month, day] = appointment.date.split('-').map(Number);
  const [hours, minutes] = appointment.end.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes + STATUS_OVERDUE_AFTER_MINUTES).getTime() <= now.getTime();
}

// С начала приёма прошло 15 минут — можно отметить «Не пришёл» (раньше вариант не показываем)
export function canMarkNoShow(appointment: ScheduleAppointment, now: Date): boolean {
  const [year, month, day] = appointment.date.split('-').map(Number);
  const [hours, minutes] = appointment.start.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes + NO_SHOW_AFTER_MINUTES).getTime() <= now.getTime();
}

// Ближайшие полчаса от текущего времени: 14:10 → 14:30
export function nextHalfHour(): string {
  const now = new Date();
  const total = Math.min(Math.ceil((now.getHours() * 60 + now.getMinutes()) / 30) * 30, 23 * 60 + 30);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Месяц 'YYYY-MM' → первый и последний день (сервер отдаёт приёмы за период до 31 дня)
function monthRange(month: string): { from: string; to: string } {
  const [year, m] = month.split('-').map(Number);
  return { from: toDateKey(new Date(year, m - 1, 1)), to: toDateKey(new Date(year, m, 0)) };
}

// Все месяцы 'YYYY-MM', которые захватывает интервал дат
function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  for (let y = fy, m = fm; y < ty || (y === ty && m <= tm); m === 12 ? (y++, m = 1) : m++) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  return result;
}

// Как часто перезагружать уже открытые месяцы — чтобы видеть записи, сделанные с других устройств
const RELOAD_MS = 60_000;

// Изменение записи (PATCH /appointments/:id): пациента сменить нельзя
export interface AppointmentChanges {
  doctorId?: number;
  date?: string;
  start?: string;
  durationMinutes?: number;
  serviceIds?: number[];
  otherReason?: string;
  cabinet?: number;
}

export interface TimeSlot {
  start: string;
  end: string;
}

// Приёмы клиники. Загружаются с API помесячно — по мере того, как экраны открывают даты (ensureRange)
@Injectable({ providedIn: 'root' })
export class ScheduleService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _appointments = signal<ScheduleAppointment[]>([]);

  // Загруженные месяцы 'YYYY-MM'
  private readonly loadedMonths = new Set<string>();

  readonly loading = signal(false);

  // По дате, затем по времени начала
  readonly appointments = computed(() =>
    [...this._appointments()].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
  );

  constructor() {
    // Другой пользователь — другие данные: очищаем и грузим текущий месяц заново
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        this.loadedMonths.clear();
        this._appointments.set([]);
        if (userId) this.ensureRange(toDateKey(new Date()), toDateKey(new Date()));
      });
    });
    setInterval(() => this.reload(), RELOAD_MS);
  }

  // Подгрузить приёмы за интервал (уже загруженные месяцы повторно не запрашиваются)
  ensureRange(from: string, to: string): void {
    if (!this.auth.isAuthenticated()) return;
    const months = monthsBetween(from, to).filter(month => !this.loadedMonths.has(month));
    if (months.length) this.loadMonths(months);
  }

  // Перезагрузить все открытые месяцы
  reload(): void {
    if (!this.auth.isAuthenticated() || !this.loadedMonths.size) return;
    this.loadMonths([...this.loadedMonths]);
  }

  private loadMonths(months: string[]): void {
    months.forEach(month => this.loadedMonths.add(month));
    this.loading.set(true);
    forkJoin(months.map(month => this.http
      .get<AppointmentDto[]>(api('/appointments'), { params: params(monthRange(month)) })
      .pipe(map(list => ({ month, list: list.map(fromAppointmentDto) })))))
      .subscribe({
        next: results => {
          this._appointments.update(current => {
            const replaced = new Set(results.map(r => r.month));
            const kept = current.filter(a => !replaced.has(a.date.slice(0, 7)));
            return [...kept, ...results.flatMap(r => r.list)];
          });
          this.loading.set(false);
        },
        error: () => {
          // Не загрузилось — попробуем снова при следующем открытии
          months.forEach(month => this.loadedMonths.delete(month));
          this.loading.set(false);
        }
      });
  }

  // Ответ сервера → в список (новый или заменить по id)
  upsert(...items: ScheduleAppointment[]): void {
    this._appointments.update(list => {
      const ids = new Set(items.map(a => a.id));
      return [...list.filter(a => !ids.has(a.id)), ...items.filter(a => this.loadedMonths.has(a.date.slice(0, 7)))];
    });
  }

  // Новая запись: POST /appointments. Новый пациент создаётся сервером в той же транзакции
  add(draft: AppointmentDraft, date: string, doctorId?: number): Observable<ScheduleAppointment> {
    const serviceIds = draft.serviceIds?.length ? draft.serviceIds : [draft.serviceId];
    const body = {
      ...(draft.patientId
        ? { patientId: draft.patientId }
        : {
            newPatient: {
              fullName: draft.patientName,
              phone: draft.phone,
              birthDate: draft.birthDate || undefined,
              gender: draft.gender,
              rating: draft.rating
            }
          }),
      doctorId,
      date,
      start: draft.time ?? (date === toDateKey(new Date()) ? nextHalfHour() : '09:00'),
      durationMinutes: draft.durationMinutes,
      serviceIds,
      otherReason: serviceIds.includes(0) ? draft.otherReason : undefined,
      cabinet: draft.cabinet
    };
    return this.http.post<AppointmentDto>(api('/appointments'), body).pipe(
      map(fromAppointmentDto),
      tap(created => this.upsert(created))
    );
  }

  // PATCH /appointments/:id
  update(id: number, changes: AppointmentChanges): Observable<ScheduleAppointment> {
    return this.http.patch<AppointmentDto>(api(`/appointments/${id}`), changes).pipe(
      map(fromAppointmentDto),
      tap(updated => this.upsert(updated))
    );
  }

  // PATCH /appointments/:id/status (кроме «Отменён» — для него cancel)
  changeStatus(id: number, status: PatientStatus): Observable<ScheduleAppointment> {
    return this.http.patch<AppointmentDto>(api(`/appointments/${id}/status`), { status }).pipe(
      map(fromAppointmentDto),
      tap(updated => this.upsert(updated))
    );
  }

  // Подтверждение записи; null — сбросить
  confirm(id: number, confirmation: AppointmentConfirmation | null): Observable<ScheduleAppointment> {
    return this.http.patch<AppointmentDto>(api(`/appointments/${id}/confirmation`), { confirmation }).pipe(
      map(fromAppointmentDto),
      tap(updated => this.upsert(updated))
    );
  }

  // POST /appointments/:id/cancel
  cancel(id: number, reason?: string): Observable<ScheduleAppointment> {
    return this.http.post<AppointmentDto>(api(`/appointments/${id}/cancel`), { reason }).pipe(
      map(fromAppointmentDto),
      tap(updated => this.upsert(updated))
    );
  }

  // Один приём (например, из уведомления, если его месяц ещё не загружен)
  get(id: number): Observable<ScheduleAppointment> {
    const cached = this._appointments().find(a => a.id === id);
    if (cached) return of(cached);
    return this.http.get<AppointmentDto>(api(`/appointments/${id}`)).pipe(map(fromAppointmentDto));
  }

  // История приёмов пациента, новые сверху
  forPatient(patientId: number): Observable<ScheduleAppointment[]> {
    return this.http.get<AppointmentDto[]>(api(`/patients/${patientId}/appointments`)).pipe(
      map(list => list.map(fromAppointmentDto))
    );
  }

  // Свободное время врача на дату нужной длительности
  freeSlots(doctorId: number, date: string, minutes: number): Observable<TimeSlot[]> {
    return this.http.get<TimeSlot[]>(api(`/doctors/${doctorId}/free-slots`), { params: params({ date, minutes }) });
  }
}
