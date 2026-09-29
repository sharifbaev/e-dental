import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { ScheduleAppointment } from '../../models/schedule.model';

// Что выбрал пользователь в модалке — обрабатывает страница расписания
export type AppointmentDetailsAction = 'edit' | 'cancel';

export interface AppointmentDetailsData {
  appointment: ScheduleAppointment;
  dateLabel: string;           // «Пятница, 17 октября»
  statusKey: string;
  statusClass: string;
  phoneHref: string;           // 'tel:+998901234567'
}

export const APPOINTMENT_DETAILS_DIALOG_CONFIG: MatDialogConfig = {
  width: '460px',
  maxWidth: '95vw',
  autoFocus: false
};

@Component({
  selector: 'app-appointment-details-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './appointment-details-dialog.html'
})
export class AppointmentDetailsDialog {
  protected readonly data = inject<AppointmentDetailsData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<AppointmentDetailsDialog, AppointmentDetailsAction>>(MatDialogRef);
  private readonly clipboard = inject(Clipboard);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly appointment = this.data.appointment;
  protected readonly isCancelled = this.appointment.status === 'cancelled';

  // Короткая подсказка «Скопировано» после копирования номера
  protected readonly copied = signal(false);
  private copiedTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.destroyRef.onDestroy(() => clearTimeout(this.copiedTimer));
  }

  protected copyPhone(): void {
    this.clipboard.copy(this.appointment.phone);
    this.copied.set(true);
    clearTimeout(this.copiedTimer);
    this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
  }

  protected close(action: AppointmentDetailsAction): void {
    this.dialogRef.close(action);
  }
}
