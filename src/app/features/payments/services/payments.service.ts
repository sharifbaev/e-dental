import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Observable, catchError, map, of, tap, throwError } from 'rxjs';
import { ScheduleService } from '../../schedule/services/schedule.service';
import { Payment, PaymentDraft } from '../models/payment.model';
import { AuthService } from '../../../core/auth/auth.service';
import { api, params } from '../../../core/api/api';

// Сумма в сумах для показа: 350000 → «350 000»
export function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

// Оплаты пациентов (GET /payments, POST /payments). Загружаются по пациенту (карточка) и по приёму
@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly scheduleService = inject(ScheduleService);

  private readonly _payments = signal<Payment[]>([]);

  readonly payments = this._payments.asReadonly();

  constructor() {
    effect(() => {
      this.auth.user();
      untracked(() => this._payments.set([]));
    });
  }

  // Оплата по приёму: appointmentId → оплата (из уже загруженных)
  readonly byAppointment = computed(() => {
    const result = new Map<number, Payment>();
    for (const payment of this._payments()) {
      if (payment.appointmentId) result.set(payment.appointmentId, payment);
    }
    return result;
  });

  // Долг пациента: начислено минус оплачено (с учётом погашений) — по загруженным оплатам пациента
  readonly debtByPatient = computed(() => {
    const result = new Map<number, number>();
    for (const p of this._payments()) {
      result.set(p.patientId, (result.get(p.patientId) ?? 0) + p.amount - p.paid);
    }
    return result;
  });

  forPatient(patientId: number): Payment[] {
    return this._payments()
      .filter(p => p.patientId === patientId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }

  debtOf(patientId: number): number {
    return Math.max(0, this.debtByPatient().get(patientId) ?? 0);
  }

  // Все оплаты пациента — для карточки
  loadForPatient(patientId: number): void {
    this.http.get<Payment[]>(api('/payments'), { params: params({ patientId }) }).subscribe({
      next: list => this._payments.update(current => [...current.filter(p => p.patientId !== patientId), ...list]),
      error: () => undefined
    });
  }

  // Оплата приёма; нет оплаты — null (сервер отвечает 404)
  loadForAppointment(appointmentId: number): Observable<Payment | null> {
    return this.http.get<Payment>(api(`/appointments/${appointmentId}/payment`)).pipe(
      tap(payment => this.upsert(payment)),
      catchError((error: unknown) => (error instanceof HttpErrorResponse && error.status === 404 ? of(null) : throwError(() => error)))
    );
  }

  // POST /payments. Повторная оплата того же приёма заменяет суммы существующей
  add(draft: PaymentDraft): Observable<Payment> {
    return this.http.post<Payment>(api('/payments'), draft).pipe(
      tap(created => {
        this.upsert(created);
        // Плашка «Оплачено / Долг» у приёма — сразу, не дожидаясь перезагрузки расписания
        if (created.kind === 'visit' && created.appointmentId) {
          const appointment = this.scheduleService.appointments().find(a => a.id === created.appointmentId);
          if (appointment) this.scheduleService.upsert({ ...appointment, paymentState: created.paid >= created.amount ? 'paid' : 'debt' });
        }
      }),
      map(created => created)
    );
  }

  private upsert(payment: Payment): void {
    this._payments.update(list => [
      ...list.filter(p => p.id !== payment.id && !(payment.kind === 'visit' && p.kind === 'visit' && p.appointmentId === payment.appointmentId)),
      payment
    ]);
  }
}
