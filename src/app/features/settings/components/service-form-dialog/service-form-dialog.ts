import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { VisitService } from '../../../schedule/models/appointment-form.model';
import { VisitServiceDraft } from '../../../../shared/services/clinic-services.service';

export const SERVICE_FORM_DIALOG_CONFIG: MatDialogConfig = {
  width: '460px',
  maxWidth: '95vw',
  autoFocus: false
};

export interface ServiceFormData {
  service?: VisitService;
}

@Component({
  selector: 'app-service-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './service-form-dialog.html'
})
export class ServiceFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject<MatDialogRef<ServiceFormDialog, VisitServiceDraft>>(MatDialogRef);
  private readonly data = inject<ServiceFormData | null>(MAT_DIALOG_DATA, { optional: true });

  protected readonly isEdit = !!this.data?.service;

  protected readonly form = this.fb.nonNullable.group({
    name: [this.data?.service?.name ?? '', [Validators.required, Validators.minLength(3)]],
    durationMinutes: [this.data?.service?.durationMinutes ?? 30, [Validators.required, Validators.min(5), Validators.max(480)]],
    price: [this.data?.service?.price ?? 0, [Validators.required, Validators.min(0)]],
    urgent: [!!this.data?.service?.urgent]
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
    this.dialogRef.close({
      name: value.name.trim(),
      durationMinutes: Number(value.durationMinutes),
      price: Number(value.price) || 0,
      ...(value.urgent ? { urgent: true } : {})
    });
  }
}
