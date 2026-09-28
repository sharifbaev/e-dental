import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { Appointment } from '../../models/dashboard.model';

// Данные, которые передаёт главная при открытии модалки
export interface AppointmentDialogData {
  appointment: Appointment & { phoneHref: string };
  mode: 'details' | 'phone';   // details — подробно о приёме, phone — только номер
}

@Component({
  selector: 'app-appointment-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './appointment-dialog.html'
})
export class AppointmentDialog {
  protected readonly data = inject<AppointmentDialogData>(MAT_DIALOG_DATA);
  private readonly clipboard = inject(Clipboard);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly appointment = this.data.appointment;

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
}
