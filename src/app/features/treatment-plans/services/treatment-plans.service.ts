import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ScheduleService } from '../../schedule/services/schedule.service';
import { AppointmentDto, fromAppointmentDto } from '../../schedule/models/schedule.model';
import { NextVisitDraft, TreatmentPlan, TreatmentPlanDraft } from '../models/treatment-plan.model';
import { AuthService } from '../../../core/auth/auth.service';
import { api } from '../../../core/api/api';

interface TreatmentPlanResult {
  plan: TreatmentPlan;
  appointments: AppointmentDto[];   // созданные визиты серии + исходный приём со статусом «В лечении»
}

// Планы лечения (GET/POST /patients/:id/treatment-plans)
@Injectable({ providedIn: 'root' })
export class TreatmentPlansService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly scheduleService = inject(ScheduleService);

  private readonly _plans = signal<TreatmentPlan[]>([]);

  readonly plans = this._plans.asReadonly();

  constructor() {
    effect(() => {
      this.auth.user();
      untracked(() => this._plans.set([]));
    });
  }

  // Планы пациента, новые сверху
  forPatient(patientId: number): TreatmentPlan[] {
    return this._plans()
      .filter(p => p.patientId === patientId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  }

  loadForPatient(patientId: number): void {
    this.http.get<TreatmentPlan[]>(api(`/patients/${patientId}/treatment-plans`)).subscribe({
      next: list => this._plans.update(current => [...current.filter(p => p.patientId !== patientId), ...list]),
      error: () => undefined
    });
  }

  // План + серия визитов одной транзакцией. Исходный приём сервер переводит в «В лечении».
  // Конфликт любого визита — 409 slotTaken, ничего не создаётся
  create(appointmentId: number, draft: TreatmentPlanDraft, series: NextVisitDraft[]): Observable<TreatmentPlan> {
    const body = {
      appointmentId,
      procedures: draft.procedures,
      visits: draft.visits,
      cost: draft.cost,
      notes: draft.notes,
      series: series.map(visit => ({ date: visit.date, time: visit.time, durationMinutes: visit.durationMinutes, serviceId: visit.serviceId }))
    };
    return this.http.post<TreatmentPlanResult>(api(`/patients/${draft.patientId}/treatment-plans`), body).pipe(
      tap(result => {
        this._plans.update(list => [...list.filter(p => p.id !== result.plan.id), result.plan]);
        this.scheduleService.upsert(...result.appointments.map(fromAppointmentDto));
      }),
      map(result => result.plan)
    );
  }
}
