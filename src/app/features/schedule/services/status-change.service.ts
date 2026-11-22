import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, filter, map, switchMap } from 'rxjs';
import { FeedbackService } from '../../../shared/services/feedback.service';
import { PatientStatus } from '../../../shared/models/patient-status';
import { STATUS_CHANGE_DIALOG_CONFIG, StatusChangeDialog, StatusChangeDialogData } from '../components/status-change-dialog/status-change-dialog';
import { ScheduleAppointment } from '../models/schedule.model';
import { ScheduleService, canMarkNoShow, isStatusOverdue } from './schedule.service';
import { TREATMENT_PLAN_DIALOG_CONFIG, TreatmentPlanDialog, TreatmentPlanDialogData } from '../../treatment-plans/components/treatment-plan-dialog/treatment-plan-dialog';
import { TreatmentPlanDialogResult } from '../../treatment-plans/models/treatment-plan.model';
import { TreatmentPlansService } from '../../treatment-plans/services/treatment-plans.service';
import { PatientsService } from '../../patients/services/patients.service';

// Смена статуса приёма: окно выбора → (для «В лечении» — план лечения) → сохранение → сообщение.
// Вызывается из карточки расписания, из модалки приёма и из уведомления «Обновите статус»
@Injectable({ providedIn: 'root' })
export class StatusChangeService {
  private readonly dialog = inject(MatDialog);
  private readonly scheduleService = inject(ScheduleService);
  private readonly plansService = inject(TreatmentPlansService);
  private readonly feedback = inject(FeedbackService);
  private readonly patientsService = inject(PatientsService);

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
        next: messageKey => {
          this.feedback.success(messageKey);
          // Статус пациента = статус последнего приёма — сервер уже пересчитал
          this.patientsService.reload();
        },
        error: err => this.feedback.error(err)
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
          if (result === 'skip') {
            return this.scheduleService.changeStatus(appointment.id, 'inTreatment').pipe(map(() => 'feedback.statusChanged'));
          }
          // План, визиты серии и статус «В лечении» — одним запросом
          const visits = result.series ?? (result.next ? [result.next] : []);
          return this.plansService.create(appointment.id, result.plan, visits).pipe(map(() => 'feedback.planSaved'));
        })
      );
  }
}
