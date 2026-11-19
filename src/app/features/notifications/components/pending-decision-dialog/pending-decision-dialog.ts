import { Component, computed, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { ScheduleService, toDateKey } from '../../../schedule/services/schedule.service';
import { StatusChangeService } from '../../../schedule/services/status-change.service';
import { ScheduleAppointment } from '../../../schedule/models/schedule.model';

export interface PendingDecisionDialogData {
  doctorId: number;
}

export const PENDING_DECISION_DIALOG_CONFIG: MatDialogConfig = {
  width: '480px',
  maxWidth: '95vw',
  autoFocus: false
};

// Сегодняшние пациенты врача со статусом «Ожидает решения».
// Список живой: после смены статуса пациент сразу пропадает из списка
@Component({
  selector: 'app-pending-decision-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './pending-decision-dialog.html'
})
export class PendingDecisionDialog {
  private readonly data = inject<PendingDecisionDialogData>(MAT_DIALOG_DATA);
  private readonly scheduleService = inject(ScheduleService);
  private readonly statusChange = inject(StatusChangeService);

  private readonly todayKey = toDateKey(new Date());

  protected readonly items = computed(() =>
    this.scheduleService.appointments().filter(a =>
      a.date === this.todayKey && a.doctorId === this.data.doctorId && a.status === 'awaitingDecision'
    )
  );

  protected readonly doctorName = computed(() =>
    this.items()[0]?.doctorName
    ?? this.scheduleService.appointments().find(a => a.doctorId === this.data.doctorId)?.doctorName
    ?? ''
  );

  // То же окно «Изменить статус», что в расписании (для «В лечении» — с планом лечения)
  protected change(appointment: ScheduleAppointment): void {
    this.statusChange.open(appointment);
  }
}
