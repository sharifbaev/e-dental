import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  APPOINTMENT_STATUSES,
  PATIENT_STATUS_CLASSES,
  PATIENT_STATUS_ICONS,
  PATIENT_STATUS_NEXT,
  PatientStatus
} from '../../../../shared/models/patient-status';
import { ScheduleAppointment } from '../../models/schedule.model';

export interface StatusChangeDialogData {
  appointment: ScheduleAppointment;
  overdue: boolean;            // приём прошёл, а статус всё ещё «Первичный»
  canNoShow: boolean;          // с начала приёма прошло 15 минут — можно отметить «Не пришёл»
}

export const STATUS_CHANGE_DIALOG_CONFIG: MatDialogConfig = {
  width: '440px',
  maxWidth: '95vw',
  autoFocus: false
};

@Component({
  selector: 'app-status-change-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './status-change-dialog.html'
})
export class StatusChangeDialog {
  protected readonly data = inject<StatusChangeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<StatusChangeDialog, PatientStatus>>(MatDialogRef);

  protected readonly appointment = this.data.appointment;
  protected readonly current = this.appointment.status;
  protected readonly currentKey = `schedule.status.${this.current}`;
  protected readonly currentClass = PATIENT_STATUS_CLASSES[this.current];

  // Сначала рекомендуемые для текущего статуса, затем остальные. Текущий и «Отменённый» не показываем —
  // отмена делается отдельной кнопкой
  protected readonly options = (() => {
    // «Не пришёл» — только если с начала приёма прошло 15 минут
    const allowed = (s: PatientStatus) => s !== this.current && s !== 'cancelled' && (s !== 'noShow' || this.data.canNoShow);
    const next = PATIENT_STATUS_NEXT[this.current].filter(allowed);
    const rest = APPOINTMENT_STATUSES.filter(s => allowed(s) && !next.includes(s));
    return [...next, ...rest].map(status => ({
      status,
      recommended: next.includes(status),
      // Перед первым «нерекомендуемым» — подпись «Другие статусы»
      firstOther: next.length > 0 && status === rest[0],
      icon: PATIENT_STATUS_ICONS[status],
      iconClass: PATIENT_STATUS_CLASSES[status],
      titleKey: `schedule.status.${status}`,
      hintKey: `schedule.statusDialog.hints.${status}`
    }));
  })();

  // Выбранный новый статус; сохраняется только по кнопке «Сохранить»
  protected readonly selected = signal<PatientStatus | null>(null);

  protected select(status: PatientStatus): void {
    this.selected.set(status);
  }

  protected save(): void {
    const status = this.selected();
    if (status) this.dialogRef.close(status);
  }
}
