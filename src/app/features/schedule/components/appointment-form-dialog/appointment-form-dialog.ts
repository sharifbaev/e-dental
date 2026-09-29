import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { Gender, PatientMode, PatientShort } from '../../models/appointment-form.model';
import { ScheduleAppointment } from '../../models/schedule.model';
import { AppointmentFormService } from '../../services/appointment-form.service';

// Настройки модалки записи: на ПК окно 640px, на мобилке — на весь экран (см. styles.scss)
export const APPOINTMENT_FORM_DIALOG_CONFIG: MatDialogConfig = {
  width: '640px',
  maxWidth: '100vw',
  height: '90vh',
  maxHeight: '100dvh',
  autoFocus: false,
  panelClass: 'appointment-form-dialog'
};

// Необязательные данные: если передан приём — форма в режиме изменения
export interface AppointmentFormData {
  appointment?: ScheduleAppointment;
}

// Что возвращает форма при сохранении
export interface AppointmentFormResult {
  patientId: number | null;    // null — новый пациент
  patientName: string;
  phone: string;
  serviceId: number;
  serviceName: string;
  durationMinutes: number;
}

// Номер Узбекистана: 998 + 9 цифр (или просто 9 цифр без кода страны)
function uzPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const digits = String(control.value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const valid = (digits.length === 12 && digits.startsWith('998')) || digits.length === 9;
  return valid ? null : { phone: true };
}

// 'YYYY-MM-DD' → 'DD.MM.YYYY'
function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}.${month}.${year}` : '';
}

@Component({
  selector: 'app-appointment-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './appointment-form-dialog.html',
  // Компонент на всю высоту окна: шапка сверху, форма прокручивается, кнопка внизу
  host: { class: 'flex flex-col h-full' }
})
export class AppointmentFormDialog {
  private readonly fb = inject(FormBuilder);
  private readonly formService = inject(AppointmentFormService);
  private readonly dialogRef = inject<MatDialogRef<AppointmentFormDialog, AppointmentFormResult>>(MatDialogRef);
  private readonly data = inject<AppointmentFormData | null>(MAT_DIALOG_DATA, { optional: true });

  // Режим изменения: форма открыта для существующего приёма
  protected readonly isEdit = !!this.data?.appointment;

  // ---- Форма ----

  protected readonly form = this.fb.group({
    patientId: this.fb.control<number | null>(null, Validators.required),
    newPatient: this.fb.nonNullable.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      phone: ['', [Validators.required, uzPhoneValidator]],
      birthDate: [''],
      gender: this.fb.nonNullable.control<Gender | ''>('')
    }),
    serviceId: this.fb.control<number | null>(null, Validators.required)
  });

  protected readonly newPatient = this.form.controls.newPatient.controls;

  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected readonly canSubmit = computed(() => this.formStatus() === 'VALID');

  // ---- Пациент: режим ----

  protected readonly mode = signal<PatientMode>('search');

  constructor() {
    // Стартуем с поиска: поля нового пациента не участвуют в проверке
    this.form.controls.newPatient.disable();

    // Режим изменения: подставляем пациента и услугу из приёма
    const appointment = this.data?.appointment;
    if (appointment) {
      this.selectPatient({
        id: appointment.patientId,
        fullName: appointment.patientName,
        phone: appointment.phone,
        birthDate: ''
      });
      this.form.controls.serviceId.setValue(appointment.serviceId);
    }
  }

  protected setMode(mode: PatientMode): void {
    this.mode.set(mode);

    if (mode === 'search') {
      this.form.controls.newPatient.disable();
      this.form.controls.patientId.enable();
    } else {
      this.form.controls.patientId.disable();
      this.form.controls.newPatient.enable();
    }
  }

  // ---- Пациент: поиск в базе ----

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });

  private readonly searchQuery = toSignal(
    this.searchControl.valueChanges.pipe(map(value => value.trim())),
    { initialValue: '' }
  );

  protected readonly searchResults = toSignal(
    this.searchControl.valueChanges.pipe(
      map(value => value.trim()),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => (query.length < 2 ? of([]) : this.formService.searchPatients(query)))
    ),
    { initialValue: [] as PatientShort[] }
  );

  protected readonly showMinChars = computed(() => this.searchQuery().length > 0 && this.searchQuery().length < 2);
  protected readonly showNotFound = computed(() => this.searchQuery().length >= 2 && this.searchResults().length === 0);

  protected readonly selectedPatient = signal<PatientShort | null>(null);

  protected readonly selectedBirthDate = computed(() => formatDate(this.selectedPatient()?.birthDate ?? ''));

  protected selectPatient(patient: PatientShort): void {
    this.selectedPatient.set(patient);
    this.form.controls.patientId.setValue(patient.id);
  }

  protected clearPatient(): void {
    this.selectedPatient.set(null);
    this.form.controls.patientId.setValue(null);
    this.searchControl.setValue('');
  }

  // ---- Пациент: новый ----

  protected setGender(gender: Gender): void {
    this.newPatient.gender.setValue(gender);
  }

  protected isInvalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // ---- Услуга или повод визита ----

  protected readonly services = toSignal(this.formService.getVisitServices());

  protected readonly selectedServiceId = toSignal(this.form.controls.serviceId.valueChanges, {
    initialValue: this.form.controls.serviceId.value
  });

  protected selectService(id: number): void {
    this.form.controls.serviceId.setValue(id);
    this.form.controls.serviceId.markAsTouched();
  }

  // ---- Отправка ----

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const serviceId = this.form.controls.serviceId.value!;
    const service = this.services()?.find(s => s.id === serviceId);
    const patient = this.selectedPatient();
    const isSearch = this.mode() === 'search';

    // TODO: на следующих шагах — врач, дата, слот, комментарий и сохранение через API
    this.dialogRef.close({
      patientId: isSearch ? patient?.id ?? null : null,
      patientName: isSearch ? patient?.fullName ?? '' : this.newPatient.fullName.value.trim(),
      phone: isSearch ? patient?.phone ?? '' : this.newPatient.phone.value.trim(),
      serviceId,
      serviceName: service?.name ?? '',
      durationMinutes: service?.durationMinutes ?? 30
    });
  }
}
