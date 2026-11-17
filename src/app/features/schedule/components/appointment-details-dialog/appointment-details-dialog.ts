import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { toSignal } from '@angular/core/rxjs-interop';
import { AppointmentConfirmation, ScheduleAppointment } from '../../models/schedule.model';
import { ScheduleService } from '../../services/schedule.service';
import { PaymentsService, formatMoney } from '../../../payments/services/payments.service';

// Что выбрал пользователь в модалке — обрабатывает страница расписания
export type AppointmentDetailsAction = 'edit' | 'status' | 'cancel' | 'payment';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

export interface AppointmentDetailsData {
  appointment: ScheduleAppointment;
  dateLabel: string;           // «Пятница, 17 октября»
  statusKey: string;
  statusClass: string;
  phoneHref: string;           // 'tel:+998901234567'
}

export const APPOINTMENT_DETAILS_DIALOG_CONFIG: MatDialogConfig = {
  width: '500px',
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
  private readonly scheduleService = inject(ScheduleService);
  private readonly paymentsService = inject(PaymentsService);
  private readonly transloco = inject(TranslocoService);

  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  protected readonly appointment = this.data.appointment;
  protected readonly isCancelled = this.appointment.status === 'cancelled';
  // «Не пришёл»: можно только сменить статус, изменять/отменять/оплачивать нечего
  protected readonly isNoShow = this.appointment.status === 'noShow';

  // ---- Подтверждение записи (сохраняется сразу, окно не закрывается) ----

  protected readonly confirmation = signal<AppointmentConfirmation | undefined>(this.appointment.confirmation);
  protected readonly confirming = signal(false);

  protected setConfirmation(value: AppointmentConfirmation | null): void {
    this.confirming.set(true);
    this.scheduleService.confirm(this.appointment.id, value).subscribe({
      next: () => {
        this.confirmation.set(value ?? undefined);
        this.confirming.set(false);
      },
      error: () => this.confirming.set(false)
    });
  }

  // ---- Оплата приёма ----

  protected readonly payment = computed(() => {
    const payment = this.paymentsService.byAppointment().get(this.appointment.id);
    if (!payment) return null;
    const locale = LOCALES[this.lang()] ?? 'ru-RU';
    return {
      ...payment,
      owes: payment.amount > payment.paid,
      paidLabel: formatMoney(payment.paid, locale),
      debtLabel: formatMoney(payment.amount - payment.paid, locale),
      methodKey: `payments.methods.${payment.method}`
    };
  });

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
