import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, concatMap, filter, forkJoin, from, map, of, switchMap, toArray } from 'rxjs';
import { FeedbackService } from '../../../shared/services/feedback.service';
import { PatientStatus } from '../../../shared/models/patient-status';
import { STATUS_CHANGE_DIALOG_CONFIG, StatusChangeDialog, StatusChangeDialogData } from '../components/status-change-dialog/status-change-dialog';
import { ScheduleAppointment } from '../models/schedule.model';
import { ScheduleService, canMarkNoShow, isStatusOverdue } from './schedule.service';
import { TREATMENT_PLAN_DIALOG_CONFIG, TreatmentPlanDialog, TreatmentPlanDialogData } from '../../treatment-plans/components/treatment-plan-dialog/treatment-plan-dialog';
import { TreatmentPlanDialogResult } from '../../treatment-plans/models/treatment-plan.model';
import { TreatmentPlansService } from '../../treatment-plans/services/treatment-plans.service';

// Смена статуса приёма: окно выбора → (для «В лечении» — план лечения) → сохранение → сообщение.
// Вызывается из карточки расписания, из модалки приёма и из уведомления «Обновите статус»
@Injectable({ providedIn: 'root' })
export class StatusChangeService {
  private readonly dialog = inject(MatDialog);
  private readonly scheduleService = inject(ScheduleService);
  private readonly plansService = inject(TreatmentPlansService);
  private readonly feedback = inject(FeedbackService);

  open(appointment: ScheduleAppointment): void {
    const now = new Date();

    this.dialog
      .open<StatusChangeDialog, StatusChangeDialogData, PatientStatus>(StatusChangeDialog, {
        ...STATUS_CHANGE_DIALOG_CONFIG,
        data: { appointment, overdue: isStatusOverdue(appointment, now), canNoShow: canMarkNoShow(appointment, now) }
      })
      .afterClosed()
      .pipe(
        filter((status): status is PatientStatus => !!status && status !== appointment.status),
        switchMap(status => status === 'inTreatment'
          ? this.withTreatmentPlan(appointment)
          : this.scheduleService.changeStatus(appointment.id, status).pipe(map(() => 'feedback.statusChanged')))
      )
      .subscribe({
        next: messageKey => this.feedback.success(messageKey),
        error: () => this.feedback.error()
      });
  }

  // «В лечении»: сначала план лечения. Закрыли окно крестиком — ничего не меняем;
  // «Пропустить» — только статус; «Сохранить план» — статус, план и все визиты серии
  private withTreatmentPlan(appointment: ScheduleAppointment): Observable<string> {
    return this.dialog
      .open<TreatmentPlanDialog, TreatmentPlanDialogData, TreatmentPlanDialogResult>(TreatmentPlanDialog, {
        ...TREATMENT_PLAN_DIALOG_CONFIG,
        data: { appointment }
      })
      .afterClosed()
      .pipe(
        filter((result): result is TreatmentPlanDialogResult => !!result),
        switchMap(result => {
          const status$ = this.scheduleService.changeStatus(appointment.id, 'inTreatment');
          if (result === 'skip') return status$.pipe(map(() => 'feedback.statusChanged'));

          // Визиты серии — к тому же врачу, сразу со статусом «В лечении».
          // По одному (concatMap): так у каждой записи свой id
          // TODO: на API — один запрос POST /treatment-plans/:id/visits
          const visits = result.series ?? (result.next ? [result.next] : []);
          const created$ = visits.length
            ? from(visits).pipe(
                concatMap(visit => this.scheduleService.add({
                  patientId: appointment.patientId,
                  patientName: appointment.patientName,
                  phone: appointment.phone,
                  serviceId: visit.serviceId,
                  serviceName: visit.serviceName,
                  durationMinutes: visit.durationMinutes,
                  time: visit.time,
                  rating: appointment.patientRating,
                  status: 'inTreatment'
                }, visit.date, appointment.doctorId)),
                map(created => created.id),
                toArray()
              )
            : of([] as number[]);

          return status$.pipe(
            switchMap(() => created$),
            switchMap(ids => this.plansService.add(result.plan, ids[0], ids).pipe(
              // Визитам — ссылка на план и «Визит N из M»
              switchMap(plan => ids.length
                ? forkJoin(ids.map((id, index) => this.scheduleService.update(id, { planId: plan.id, visitIndex: index + 1, visitTotal: ids.length })))
                : of([]))
            )),
            map(() => 'feedback.planSaved')
          );
        })
      );
  }
}
