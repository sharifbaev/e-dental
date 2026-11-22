import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { uzPhoneValidator } from '../../../../shared/validators/uz-phone.validator';
import { DOCTOR_STATUSES, Doctor, DoctorFormResult, DoctorStatus } from '../../models/doctor.model';
import { AppointmentFormService } from '../../../schedule/services/appointment-form.service';
import { DoctorsService } from '../../services/doctors.service';
import { UzPhoneInputDirective } from '../../../../shared/directives/uz-phone-input.directive';

// «Другое» в списке услуг — та же договорённость, что и в форме записи
const OTHER_SERVICE_ID = 0;

// Необязательные данные: если передан врач — форма в режиме изменения
export interface DoctorFormData {
  doctor?: Doctor;
}

// На ПК окно, на мобилке — на весь экран (см. styles.scss)
export const DOCTOR_FORM_DIALOG_CONFIG: MatDialogConfig = {
  width: '560px',
  maxWidth: '100vw',
  height: '90vh',
  maxHeight: '100dvh',
  autoFocus: false,
  panelClass: 'doctor-form-dialog'
};

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// Хотя бы один рабочий день
function workDaysRequired(control: AbstractControl): ValidationErrors | null {
  return (control.value as number[])?.length ? null : { workDays: true };
}

// Конец рабочего дня позже начала
function timeRangeValidator(group: AbstractControl): ValidationErrors | null {
  const start = group.get('workStart')?.value as string;
  const end = group.get('workEnd')?.value as string;
  return start && end && end <= start ? { timeRange: true } : null;
}

// Логин врача: либо оба поля пустые, либо логин от 3 символов и пароль от 6
function accountValidator(group: AbstractControl): ValidationErrors | null {
  const username = String(group.get('username')?.value ?? '').trim();
  const password = String(group.get('password')?.value ?? '');
  if (!username && !password) return null;
  const errors: ValidationErrors = {};
  if (username.length < 3) errors['username'] = true;
  if (password.length < 6) errors['password'] = true;
  return Object.keys(errors).length ? errors : null;
}

@Component({
  selector: 'app-doctor-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe, UzPhoneInputDirective],
  templateUrl: './doctor-form-dialog.html',
  // Компонент на всю высоту окна: шапка сверху, форма прокручивается, кнопка внизу
  host: { class: 'flex flex-col h-full' }
})
export class DoctorFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly dialogRef = inject<MatDialogRef<DoctorFormDialog, DoctorFormResult>>(MatDialogRef);
  private readonly data = inject<DoctorFormData | null>(MAT_DIALOG_DATA, { optional: true });
  private readonly transloco = inject(TranslocoService);
  private readonly formService = inject(AppointmentFormService);

  private readonly doctor = this.data?.doctor;

  // Режим изменения: форма открыта для существующего врача
  protected readonly isEdit = !!this.doctor;

  protected readonly statuses = DOCTOR_STATUSES;

  private readonly doctorsService = inject(DoctorsService);

  // Специальности — с API (GET /specialties); если у врача своя, которой нет в справочнике, — добавляем её в список
  protected readonly specialties = computed(() => {
    const list = this.doctorsService.specialties();
    return this.doctor && this.doctor.specialty && !list.includes(this.doctor.specialty) ? [...list, this.doctor.specialty] : list;
  });

  protected readonly form = this.fb.nonNullable.group({
    fullName: [this.doctor?.fullName ?? '', [Validators.required, Validators.minLength(3)]],
    phone: [this.doctor?.phone ?? '', [Validators.required, uzPhoneValidator]],
    specialty: [this.doctor?.specialty ?? '', Validators.required],
    cabinet: [this.doctor?.cabinet ?? 1, [Validators.required, Validators.min(1), Validators.max(50)]],
    experienceYears: [this.doctor?.experienceYears ?? 0, [Validators.min(0), Validators.max(60)]],
    workDays: [this.doctor?.workDays ?? [1, 2, 3, 4, 5], workDaysRequired],
    workStart: [this.doctor?.workStart ?? '09:00', Validators.required],
    workEnd: [this.doctor?.workEnd ?? '18:00', Validators.required],
    status: [this.doctor?.status ?? ('offShift' as DoctorStatus)],
    // Услуги врача: можно несколько; «Другое» — своя услуга текстом
    serviceIds: [this.doctor?.serviceIds ?? ([] as number[])],
    // Логин и пароль врача — только при создании, необязательно (можно завести позже в «Пользователях»)
    account: this.fb.nonNullable.group({
      username: [''],
      password: ['']
    }, { validators: accountValidator }),
    otherService: [{ value: this.doctor?.otherService ?? '', disabled: !this.doctor?.serviceIds?.includes(OTHER_SERVICE_ID) }, [Validators.required, Validators.minLength(3)]]
  }, { validators: timeRangeValidator });

  constructor() {
    // Поле своей услуги — только при выбранном «Другое»
    this.form.controls.serviceIds.valueChanges.pipe(takeUntilDestroyed()).subscribe(ids => {
      const other = this.form.controls.otherService;
      if (ids.includes(OTHER_SERVICE_ID)) {
        other.enable();
      } else {
        other.disable();
      }
    });
  }

  // ---- Услуги врача (несколько) ----

  protected readonly services = toSignal(this.formService.getVisitServices());
  protected readonly otherServiceId = OTHER_SERVICE_ID;
  protected readonly servicesOpen = signal(false);

  private readonly selectedServiceIds = toSignal(this.form.controls.serviceIds.valueChanges, {
    initialValue: this.form.controls.serviceIds.value
  });

  protected readonly selectedServices = computed(() => {
    const ids = this.selectedServiceIds();
    const chips = (this.services() ?? []).filter(service => ids.includes(service.id)).map(service => ({ id: service.id, name: service.name }));
    return ids.includes(OTHER_SERVICE_ID) ? [{ id: OTHER_SERVICE_ID, name: '' }, ...chips] : chips;
  });

  protected readonly isOtherSelected = computed(() => this.selectedServiceIds().includes(OTHER_SERVICE_ID));

  protected isServiceSelected(id: number): boolean {
    return this.selectedServiceIds().includes(id);
  }

  protected toggleService(id: number): void {
    const ids = this.form.controls.serviceIds.value;
    this.form.controls.serviceIds.setValue(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  protected toggleServicesList(): void {
    this.servicesOpen.update(open => !open);
  }

  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected readonly canSubmit = computed(() => this.formStatus() === 'VALID');

  // ---- Рабочие дни ----

  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang()
  });

  private readonly selectedDays = toSignal(this.form.controls.workDays.valueChanges, {
    initialValue: this.form.controls.workDays.value
  });

  // Кнопки «Пн … Вс» на текущем языке; 2024-01-01 — понедельник
  protected readonly weekDays = computed(() => {
    const format = new Intl.DateTimeFormat(LOCALES[this.lang()] ?? 'ru-RU', { weekday: 'short' });
    const selected = this.selectedDays();

    return [1, 2, 3, 4, 5, 6, 7].map(day => {
      const text = format.format(new Date(2024, 0, day)).replace('.', '');
      return { day, label: text.charAt(0).toUpperCase() + text.slice(1), active: selected.includes(day) };
    });
  });

  protected toggleDay(day: number): void {
    const control = this.form.controls.workDays;
    const days = control.value;
    control.setValue(days.includes(day) ? days.filter(d => d !== day) : [...days, day].sort((a, b) => a - b));
    control.markAsTouched();
  }

  protected isInvalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected accountError(field: 'username' | 'password'): boolean {
    const group = this.form.controls.account;
    return !!this.formStatus() && group.hasError(field) && group.controls[field].touched;
  }

  protected readonly timeRangeInvalid = computed(() =>
    this.formStatus() && this.form.hasError('timeRange') && (this.form.controls.workStart.touched || this.form.controls.workEnd.touched)
  );

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { account, ...value } = this.form.getRawValue();
    const username = account.username.trim();
    this.dialogRef.close({
      ...value,
      ...(!this.isEdit && username ? { account: { username, password: account.password } } : {}),
      fullName: value.fullName.trim(),
      phone: value.phone.trim(),
      cabinet: Number(value.cabinet),
      experienceYears: Number(value.experienceYears) || 0,
      otherService: value.serviceIds.includes(OTHER_SERVICE_ID) ? value.otherService.trim() : ''
    });
  }
}
