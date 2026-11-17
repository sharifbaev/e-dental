import { Injectable, computed, inject, signal, untracked } from '@angular/core';
import { Observable, delay, map, of, tap } from 'rxjs';
import { ScheduleService, toDateKey } from '../../schedule/services/schedule.service';
import { PATIENT_STATUSES, PatientStatus } from '../../../shared/models/patient-status';
import { PAYMENT_METHODS, Payment, PaymentDraft, SERVICE_PRICES } from '../models/payment.model';

// Имитация задержки ответа сервера
const MOCK_DELAY_MS = 300;

// Сумма в сумах для показа: 350000 → «350 000»
export function formatMoney(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

@Injectable({ providedIn: 'root' })
export class PaymentsService {
  private readonly scheduleService = inject(ScheduleService);

  // TODO: заменить на загрузку с API: GET /payments?patientId=… и GET /appointments/:id/payment
  private readonly _payments = signal<Payment[]>(untracked(() => this.buildMock()));

  readonly payments = this._payments.asReadonly();

  // Оплата по приёму: appointmentId → оплата
  readonly byAppointment = computed(() => {
    const result = new Map<number, Payment>();
    for (const payment of this._payments()) {
      if (payment.appointmentId) result.set(payment.appointmentId, payment);
    }
    return result;
  });

  // Долг пациента: начислено минус оплачено (с учётом погашений)
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

  // TODO: на API — POST /payments
  add(draft: PaymentDraft): Observable<Payment> {
    const payment: Payment = { ...draft, id: Date.now() };
    return of(payment).pipe(
      delay(MOCK_DELAY_MS),
      tap(created => this._payments.update(list => [...list, created])),
      map(created => created)
    );
  }

  // Mock: оплачены прошедшие и сегодняшние приёмы, по которым пациент был у врача; у каждого
  // пятого — оплачена половина (долг)
  private buildMock(): Payment[] {
    const todayKey = toDateKey(new Date());
    const visited: PatientStatus[] = PATIENT_STATUSES.filter(s => s !== 'primary' && s !== 'cancelled');

    return this.scheduleService.appointments()
      .filter(a => a.date <= todayKey && visited.includes(a.status))
      .map((a, index) => {
        const amount = SERVICE_PRICES[a.serviceId] ?? 100_000;
        return {
          id: index + 1,
          kind: 'visit' as const,
          patientId: a.patientId,
          patientName: a.patientName,
          appointmentId: a.id,
          date: a.date,
          service: a.service,
          amount,
          paid: index % 5 === 2 ? amount / 2 : amount,
          method: PAYMENT_METHODS[index % PAYMENT_METHODS.length]
        };
      });
  }
}
