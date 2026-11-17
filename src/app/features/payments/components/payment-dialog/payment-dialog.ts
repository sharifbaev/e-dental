import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PAYMENT_METHODS, PaymentDraft, PaymentKind, PaymentMethod } from '../../models/payment.model';
import { formatMoney } from '../../services/payments.service';

export interface PaymentDialogData {
  kind: PaymentKind;           // visit — оплата приёма, repayment — погашение долга
  patientId: number;
  patientName: string;
  appointmentId?: number;
  date: string;                // 'YYYY-MM-DD'
  service: string;
  suggestedAmount: number;     // для приёма — цена услуги, для погашения — сумма долга
}

export const PAYMENT_DIALOG_CONFIG: MatDialogConfig = {
  width: '420px',
  maxWidth: '95vw',
  autoFocus: false
};

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

const METHOD_ICONS: Record<PaymentMethod, string> = {
  cash: 'payments',
  card: 'credit_card',
  click: 'smartphone',
  payme: 'account_balance_wallet'
};

@Component({
  selector: 'app-payment-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './payment-dialog.html'
})
export class PaymentDialog {
  protected readonly data = inject<PaymentDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<PaymentDialog, PaymentDraft>>(MatDialogRef);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);

  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });
  private readonly locale = computed(() => LOCALES[this.lang()] ?? 'ru-RU');

  protected readonly isRepayment = this.data.kind === 'repayment';

  protected readonly methods = PAYMENT_METHODS.map(method => ({
    method,
    icon: METHOD_ICONS[method],
    key: `payments.methods.${method}`
  }));

  protected readonly form = this.fb.nonNullable.group({
    // Стоимость: для погашения долга не нужна
    amount: [this.isRepayment ? 0 : this.data.suggestedAmount, [Validators.required, Validators.min(0)]],
    // При оплате приёма можно внести 0 (всё в долг); погашение — минимум 1 сум
    paid: [this.data.suggestedAmount, [Validators.required, Validators.min(this.isRepayment ? 1 : 0)]],
    method: ['cash' as PaymentMethod]
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  // Сколько останется в долг после этой оплаты (для приёма)
  protected readonly debtLeft = computed(() => {
    const { amount = 0, paid = 0 } = this.value();
    return this.isRepayment ? 0 : Math.max(0, (amount ?? 0) - (paid ?? 0));
  });

  protected readonly debtLabel = computed(() => formatMoney(this.debtLeft(), this.locale()));
  protected readonly suggestedLabel = computed(() => formatMoney(this.data.suggestedAmount, this.locale()));

  protected readonly submitted = signal(false);

  protected selectMethod(method: PaymentMethod): void {
    this.form.controls.method.setValue(method);
  }

  protected isInvalid(name: 'amount' | 'paid'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected save(): void {
    this.submitted.set(true);
    const { amount, paid, method } = this.form.getRawValue();
    // Погашение не больше долга; оплата приёма не больше стоимости
    const limit = this.isRepayment ? this.data.suggestedAmount : amount;
    if (this.form.invalid || paid > limit) {
      this.form.markAllAsTouched();
      if (paid > limit) this.form.controls.paid.setErrors({ max: true });
      return;
    }

    this.dialogRef.close({
      kind: this.data.kind,
      patientId: this.data.patientId,
      patientName: this.data.patientName,
      appointmentId: this.data.appointmentId,
      date: this.data.date,
      service: this.data.service,
      amount: this.isRepayment ? 0 : amount,
      paid,
      method
    });
  }
}
