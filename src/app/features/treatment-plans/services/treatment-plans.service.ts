import { Injectable, inject, signal, untracked } from '@angular/core';
import { Observable, delay, of, tap } from 'rxjs';
import { ScheduleService, toDateKey } from '../../schedule/services/schedule.service';
import { SERVICE_PRICES } from '../../payments/models/payment.model';
import { TreatmentPlan, TreatmentPlanDraft } from '../models/treatment-plan.model';

// Имитация задержки ответа сервера
const MOCK_DELAY_MS = 300;

@Injectable({ providedIn: 'root' })
export class TreatmentPlansService {
  private readonly scheduleService = inject(ScheduleService);

  // TODO: заменить на загрузку с API: GET /patients/:id/treatment-plans
  private readonly _plans = signal<TreatmentPlan[]>(untracked(() => this.buildMock()));

  readonly plans = this._plans.asReadonly();

  // Планы пациента, новые сверху
  forPatient(patientId: number): TreatmentPlan[] {
    return this._plans()
      .filter(p => p.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  }

  // TODO: на API — POST /patients/:id/treatment-plans
  add(draft: TreatmentPlanDraft, nextAppointmentId?: number, appointmentIds?: number[]): Observable<TreatmentPlan> {
    const plan: TreatmentPlan = { ...draft, id: Date.now(), createdAt: toDateKey(new Date()), nextAppointmentId, appointmentIds };
    return of(plan).pipe(
      delay(MOCK_DELAY_MS),
      tap(created => this._plans.update(list => [...list, created]))
    );
  }

  // Mock: у пациентов «в лечении» на сегодня уже есть план
  private buildMock(): TreatmentPlan[] {
    const todayKey = toDateKey(new Date());
    const seen = new Set<number>();

    return this.scheduleService.appointments()
      .filter(a => a.date === todayKey && a.status === 'inTreatment')
      .filter(a => !seen.has(a.patientId) && !!seen.add(a.patientId))
      .map((a, index) => ({
        id: index + 1,
        patientId: a.patientId,
        patientName: a.patientName,
        doctorId: a.doctorId,
        doctorName: a.doctorName,
        procedures: [a.service, 'Контрольный осмотр'],
        visits: 3,
        cost: (SERVICE_PRICES[a.serviceId] ?? 100_000) * 2 + 100_000,
        notes: 'Контрольный снимок после завершения лечения.',
        createdAt: todayKey
      }));
  }
}
