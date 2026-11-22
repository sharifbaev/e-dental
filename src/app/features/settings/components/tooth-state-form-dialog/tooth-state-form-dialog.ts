import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { TOOTH_COLORS, TOOTH_COLOR_CLASSES, ToothStateColor, ToothStateDraft, ToothStateItem } from '../../../../shared/services/tooth-states.service';

export const TOOTH_STATE_FORM_DIALOG_CONFIG: MatDialogConfig = {
  width: '460px',
  maxWidth: '95vw',
  autoFocus: false
};

export interface ToothStateFormData {
  state?: ToothStateItem;
}

// Добавление / изменение состояния зуба: название и цвет
@Component({
  selector: 'app-tooth-state-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './tooth-state-form-dialog.html'
})
export class ToothStateFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly transloco = inject(TranslocoService);
  private readonly dialogRef = inject<MatDialogRef<ToothStateFormDialog, ToothStateDraft>>(MatDialogRef);
  private readonly data = inject<ToothStateFormData | null>(MAT_DIALOG_DATA, { optional: true });

  protected readonly isEdit = !!this.data?.state;

  // Стандартное состояние без своего названия — подставляем перевод
  private readonly initialName: string = this.data?.state
    ? this.data.state.name || this.transloco.translate(`dentalChart.states.${this.data.state.id}`)
    : '';

  protected readonly form = this.fb.nonNullable.group({
    name: [this.initialName, [Validators.required, Validators.minLength(2)]],
    color: this.fb.nonNullable.control<ToothStateColor>(this.data?.state?.color ?? 'red')
  });

  protected readonly colors = TOOTH_COLORS.map(color => ({ color, classes: TOOTH_COLOR_CLASSES[color] }));

  protected readonly colorValue = toSignal(this.form.controls.color.valueChanges, { initialValue: this.form.controls.color.value });

  protected readonly nameValue = toSignal(this.form.controls.name.valueChanges, { initialValue: this.form.controls.name.value });

  protected readonly previewClasses = (color: ToothStateColor) => TOOTH_COLOR_CLASSES[color];

  protected setColor(color: ToothStateColor): void {
    this.form.controls.color.setValue(color);
  }

  protected isInvalid(): boolean {
    const control = this.form.controls.name;
    return control.invalid && control.touched;
  }

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({ name: value.name.trim(), color: value.color });
  }
}
