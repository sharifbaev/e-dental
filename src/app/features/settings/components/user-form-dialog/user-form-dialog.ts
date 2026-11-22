import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { User, UserRole } from '../../../../core/models/auth.model';
import { DoctorsService } from '../../../doctors/services/doctors.service';
import { UserCreate, UserUpdate } from '../../services/users.service';

export const USER_FORM_DIALOG_CONFIG: MatDialogConfig = {
  width: '480px',
  maxWidth: '95vw',
  autoFocus: false
};

export interface UserFormData {
  user?: User;
}

// Создание: UserCreate; изменение: UserUpdate
export type UserFormResult = UserCreate | UserUpdate;

// Владелец в клинике один — его роль здесь не выбирается
const ROLES: UserRole[] = ['admin', 'doctor'];

@Component({
  selector: 'app-user-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './user-form-dialog.html'
})
export class UserFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject<MatDialogRef<UserFormDialog, UserFormResult>>(MatDialogRef);
  private readonly data = inject<UserFormData | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly doctorsService = inject(DoctorsService);

  protected readonly user = this.data?.user;
  protected readonly isEdit = !!this.user;
  protected readonly isOwnerAccount = this.user?.role === 'owner';
  protected readonly roles = ROLES;
  protected readonly doctors = computed(() => [...this.doctorsService.doctors()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru')));

  protected readonly form = this.fb.nonNullable.group({
    fullName: [this.user?.fullName ?? '', [Validators.required, Validators.minLength(3)]],
    username: [{ value: this.user?.username ?? '', disabled: this.isEdit }, [Validators.required, Validators.minLength(3)]],
    // При изменении — новый пароль необязателен (пусто — пароль не меняется)
    password: ['', this.isEdit ? [Validators.minLength(6)] : [Validators.required, Validators.minLength(6)]],
    role: [(this.user?.role ?? 'admin') as UserRole],
    doctorId: [this.user?.doctorId ?? (null as number | null)]
  });

  private readonly roleValue = toSignal(this.form.controls.role.valueChanges, { initialValue: this.form.controls.role.value });
  protected readonly isDoctorRole = computed(() => this.roleValue() === 'doctor');

  protected isInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected save(): void {
    const value = this.form.getRawValue();
    const needDoctor = value.role === 'doctor' && !value.doctorId;
    if (this.form.invalid || needDoctor) {
      this.form.markAllAsTouched();
      if (needDoctor) this.form.controls.doctorId.setErrors({ required: true });
      return;
    }

    const doctorId = value.role === 'doctor' ? Number(value.doctorId) : undefined;
    if (this.isEdit) {
      this.dialogRef.close({
        fullName: value.fullName.trim(),
        ...(this.isOwnerAccount ? {} : { role: value.role, doctorId }),
        ...(value.password ? { password: value.password } : {})
      });
      return;
    }
    this.dialogRef.close({
      fullName: value.fullName.trim(),
      username: value.username.trim(),
      password: value.password,
      role: value.role,
      doctorId
    });
  }
}
