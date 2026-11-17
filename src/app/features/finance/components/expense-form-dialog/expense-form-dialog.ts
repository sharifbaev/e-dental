import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { toDateKey } from '../../../schedule/services/schedule.service';
import { EXPENSE_CATEGORIES, Expense, ExpenseCategory, ExpenseDraft, FINANCE_METHODS, FinanceMethod } from '../../models/finance.model';

export const EXPENSE_FORM_DIALOG_CONFIG: MatDialogConfig = {
  width: '480px',
  maxWidth: '95vw',
  autoFocus: false
};

// Без данных — новый расход, с данными — изменение
export interface ExpenseFormData {
  expense?: Expense;
}

@Component({
  selector: 'app-expense-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './expense-form-dialog.html'
})
export class ExpenseFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject<MatDialogRef<ExpenseFormDialog, ExpenseDraft>>(MatDialogRef);
  private readonly data = inject<ExpenseFormData | null>(MAT_DIALOG_DATA, { optional: true });

  protected readonly isEdit = !!this.data?.expense;
  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly methods = FINANCE_METHODS;

  protected readonly form = this.fb.nonNullable.group({
    date: [this.data?.expense?.date ?? toDateKey(new Date()), Validators.required],
    category: this.fb.nonNullable.control<ExpenseCategory>(this.data?.expense?.category ?? 'materials'),
    description: [this.data?.expense?.description ?? '', [Validators.required, Validators.minLength(3)]],
    amount: [this.data?.expense?.amount ?? 0, [Validators.required, Validators.min(1)]],
    method: this.fb.nonNullable.control<FinanceMethod>(this.data?.expense?.method ?? 'cash')
  });

  protected isInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({ ...value, description: value.description.trim(), amount: Number(value.amount) });
  }
}
