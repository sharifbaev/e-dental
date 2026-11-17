import { Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { toDateKey } from '../../../schedule/services/schedule.service';
import { DEBT_DIRECTIONS, Debt, DebtDirection, DebtDraft } from '../../models/finance.model';

export const DEBT_FORM_DIALOG_CONFIG: MatDialogConfig = {
  width: '520px',
  maxWidth: '95vw',
  autoFocus: false
};

export interface DebtFormData {
  debt?: Debt;
}

// Погашено не больше суммы долга
function paidNotMoreThanAmount(group: AbstractControl): ValidationErrors | null {
  const amount = Number(group.get('amount')?.value) || 0;
  const paid = Number(group.get('paid')?.value) || 0;
  return paid > amount ? { paidTooMuch: true } : null;
}

@Component({
  selector: 'app-debt-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './debt-form-dialog.html'
})
export class DebtFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject<MatDialogRef<DebtFormDialog, DebtDraft>>(MatDialogRef);
  private readonly data = inject<DebtFormData | null>(MAT_DIALOG_DATA, { optional: true });

  protected readonly isEdit = !!this.data?.debt;
  protected readonly directions = DEBT_DIRECTIONS;

  private readonly debt = this.data?.debt;

  protected readonly form = this.fb.nonNullable.group({
    direction: this.fb.nonNullable.control<DebtDirection>(this.debt?.direction ?? 'incoming'),
    counterparty: [this.debt?.counterparty ?? '', [Validators.required, Validators.minLength(3)]],
    phone: [this.debt?.phone ?? ''],
    date: [this.debt?.date ?? toDateKey(new Date()), Validators.required],
    dueDate: [this.debt?.dueDate ?? ''],
    amount: [this.debt?.amount ?? 0, [Validators.required, Validators.min(1)]],
    paid: [this.debt?.paid ?? 0, [Validators.min(0)]],
    note: [this.debt?.note ?? '']
  }, { validators: paidNotMoreThanAmount });

  protected isInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected get paidTooMuch(): boolean {
    return this.form.hasError('paidTooMuch') && this.form.controls.paid.touched;
  }

  // Погасить полностью: погашено = сумма долга
  protected payInFull(): void {
    this.form.controls.paid.setValue(Number(this.form.controls.amount.value) || 0);
    this.form.controls.paid.markAsTouched();
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({
      ...value,
      counterparty: value.counterparty.trim(),
      phone: value.phone.trim(),
      note: value.note.trim(),
      amount: Number(value.amount),
      paid: Number(value.paid) || 0
    });
  }
}
