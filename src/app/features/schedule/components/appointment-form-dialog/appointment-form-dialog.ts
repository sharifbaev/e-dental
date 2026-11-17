import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, FormControl, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, distinctUntilChanged, map, of, switchMap } from 'rxjs';
import { PatientMode, PatientShort } from '../../models/appointment-form.model';
import { ScheduleAppointment } from '../../models/schedule.model';
import { AppointmentFormService } from '../../services/appointment-form.service';
import { ScheduleService, addMinutes, nextHalfHour, toDateKey } from '../../services/schedule.service';
import { PATIENT_RATINGS, PATIENT_RATING_DOT, PatientRating, mockPatientRating } from '../../../../shared/models/patient-rating';

// «Другое» в списке услуг: повод визита пишется вручную
export const OTHER_SERVICE_ID = 0;
const OTHER_SERVICE_MINUTES = 30;

// Продолжительность приёма, минуты: 30 мин, 1 ч, 1,5 ч, 2 ч, 3 ч, 4 ч
export const DURATION_PRESETS = [30, 60, 90, 120, 180, 240];
export type DurationOption = '30' | '60' | '90' | '120' | '180' | '240';

// Код страны перед номером телефона — пользователь вводит только 9 цифр
const PHONE_PREFIX = '+998';

// 9 цифр → '90 123-45-67' (по мере ввода)
function formatLocalPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 9);
  const parts = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)];
  let result = parts[0];
  if (parts[1]) result += ' ' + parts[1];
  if (parts[2]) result += '-' + parts[2];
  if (parts[3]) result += '-' + parts[3];
  return result;
}

// Рабочий день для подбора свободного времени и шаг сетки, минуты
const DAY_START_MINUTES = 9 * 60;
const DAY_END_MINUTES = 18 * 60;
const SLOT_STEP_MINUTES = 30;

// 'HH:mm' → минуты от начала дня
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

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
  date?: string;               // 'YYYY-MM-DD' — дата по умолчанию для новой записи
  doctorId?: number;           // врач по умолчанию (например, выбранный в фильтре расписания)
}

// Что возвращает форма при сохранении
export interface AppointmentFormResult {
  patientId: number | null;    // null — новый пациент
  patientName: string;
  phone: string;
  serviceId: number;
  serviceName: string;
  durationMinutes: number;
  date: string;                // 'YYYY-MM-DD'
  time: string;                // 'HH:mm'
  serviceIds?: number[];       // все выбранные услуги (serviceId — первая из них)
  doctorId?: number;           // выбранный врач
  rating?: PatientRating;      // рейтинг нового пациента
}

// Номер без кода страны: ровно 9 цифр (+998 подставляется сам)
function uzPhoneValidator(control: AbstractControl): ValidationErrors | null {
  const digits = String(control.value ?? '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length === 9 ? null : { phone: true };
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
  private readonly scheduleService = inject(ScheduleService);

  // Режим изменения: форма открыта для существующего приёма
  protected readonly isEdit = !!this.data?.appointment;

  // ---- Форма ----

  protected readonly form = this.fb.group({
    patientId: this.fb.control<number | null>(null, Validators.required),
    newPatient: this.fb.nonNullable.group({
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      phone: ['', [Validators.required, uzPhoneValidator]],
      birthDate: ['']
    }),
    serviceId: this.fb.control<number | null>(null, Validators.required),
    // Свой повод визита — только при выборе «Другое»
    otherReason: this.fb.nonNullable.control({ value: '', disabled: true }, [Validators.required, Validators.minLength(3)]),
    date: this.fb.nonNullable.control(this.defaultDate(), Validators.required),
    time: this.fb.nonNullable.control('', Validators.required),
    // Несколько услуг сразу; serviceId выше — первая из них (для совместимости)
    serviceIds: this.fb.nonNullable.control<number[]>([]),
    duration: this.fb.nonNullable.control<DurationOption>('30'),
    doctorId: this.fb.control<number | null>(null),
    // Рейтинг — только для нового пациента
    rating: this.fb.nonNullable.control<PatientRating>('good')
  });

  protected readonly newPatient = this.form.controls.newPatient.controls;

  private readonly formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected readonly canSubmit = computed(() => this.formStatus() === 'VALID');

  // ---- Пациент: режим ----

  protected readonly mode = signal<PatientMode>('search');

  constructor() {
    // Стартуем с поиска: поля нового пациента не участвуют в проверке
    this.form.controls.newPatient.disable();

    // Выбранные услуги: первая — в serviceId, «Другое» — включает поле повода визита,
    // продолжительность — сумма услуг
    this.form.controls.serviceIds.valueChanges.pipe(takeUntilDestroyed()).subscribe(ids => {
      const first = ids.find(id => id !== OTHER_SERVICE_ID) ?? (ids.includes(OTHER_SERVICE_ID) ? OTHER_SERVICE_ID : null);
      this.form.controls.serviceId.setValue(first);
      this.form.controls.serviceId.markAsTouched();

      const other = this.form.controls.otherReason;
      if (ids.includes(OTHER_SERVICE_ID)) {
        other.enable();
      } else {
        other.disable();
      }

      this.applyDuration(this.servicesMinutes(ids));
    });

    // Врач по умолчанию: переданный или первый из расписания
    this.form.controls.doctorId.setValue(this.data?.doctorId ?? this.doctors()[0]?.id ?? null);

    // Время по умолчанию: сегодня — ближайшие полчаса, другой день — 09:00
    this.form.controls.time.setValue(this.defaultTime(this.form.controls.date.value));

    // Режим изменения: подставляем пациента и услугу из приёма
    const appointment = this.data?.appointment;
    if (appointment) {
      this.selectPatient({
        id: appointment.patientId,
        fullName: appointment.patientName,
        phone: appointment.phone,
        birthDate: ''
      });
      this.form.controls.serviceIds.setValue([appointment.serviceId]);
      if (appointment.serviceId === OTHER_SERVICE_ID) {
        this.form.controls.otherReason.setValue(appointment.service);
      }
      this.form.controls.doctorId.setValue(appointment.doctorId);
      this.applyDuration(toMinutes(appointment.end) - toMinutes(appointment.start));
      this.form.controls.date.setValue(appointment.date);
      this.form.controls.time.setValue(appointment.start);
    }
  }

  private defaultDate(): string {
    return this.data?.date ?? toDateKey(new Date());
  }

  private defaultTime(date: string): string {
    return date === toDateKey(new Date()) ? nextHalfHour() : '09:00';
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

  protected readonly phonePrefix = PHONE_PREFIX;

  // Телефон: только цифры после +998, формат '90 123-45-67'. Вставленный номер с 998 — без кода
  protected onPhoneInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let digits = input.value.replace(/\D/g, '');
    if (digits.length > 9 && digits.startsWith('998')) digits = digits.slice(3);
    const formatted = formatLocalPhone(digits);
    input.value = formatted;
    this.newPatient.phone.setValue(formatted);
  }

  protected isInvalid(control: AbstractControl): boolean {
    return control.invalid && control.touched;
  }

  // ---- Услуга или повод визита ----

  protected readonly services = toSignal(this.formService.getVisitServices());

  protected readonly otherServiceId = OTHER_SERVICE_ID;

  protected readonly selectedServiceId = toSignal(this.form.controls.serviceId.valueChanges, {
    initialValue: this.form.controls.serviceId.value
  });

  // «Другое» среди выбранных услуг — показываем поле повода визита
  protected readonly isOtherService = computed(() => this.selectedServiceIds().includes(OTHER_SERVICE_ID));

  // ---- Несколько услуг ----

  protected readonly servicesOpen = signal(false);

  protected toggleServicesList(): void {
    this.servicesOpen.update(open => !open);
  }

  private readonly selectedServiceIds = toSignal(this.form.controls.serviceIds.valueChanges, {
    initialValue: this.form.controls.serviceIds.value
  });

  // Выбранные услуги для тегов: «Другое» — первым, как в списке
  protected readonly selectedServices = computed(() => {
    const ids = this.selectedServiceIds();
    const list = this.services() ?? [];
    const chips = list.filter(service => ids.includes(service.id)).map(service => ({ id: service.id, name: service.name, urgent: !!service.urgent }));
    return ids.includes(OTHER_SERVICE_ID) ? [{ id: OTHER_SERVICE_ID, name: '', urgent: false }, ...chips] : chips;
  });

  protected isServiceSelected(id: number): boolean {
    return this.selectedServiceIds().includes(id);
  }

  protected toggleService(id: number): void {
    const ids = this.form.controls.serviceIds.value;
    this.form.controls.serviceIds.setValue(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  }

  // Сумма длительностей выбранных услуг; только «Другое» — 30 минут
  private servicesMinutes(ids: number[]): number {
    const list = this.services() ?? [];
    const total = ids.reduce((sum, id) => sum + (list.find(service => service.id === id)?.durationMinutes ?? 0), 0);
    return total || OTHER_SERVICE_MINUTES;
  }

  // ---- Продолжительность ----

  protected readonly durationOptions = DURATION_PRESETS.map(minutes => ({
    value: String(minutes) as DurationOption,
    key: `appointmentForm.dateTime.duration${minutes}`
  }));

  // Ближайший вариант не меньше нужного времени (больше 4 ч — 4 ч)
  private applyDuration(minutes: number): void {
    const preset = DURATION_PRESETS.find(p => p >= minutes) ?? DURATION_PRESETS[DURATION_PRESETS.length - 1];
    this.form.controls.duration.setValue(String(preset) as DurationOption);
  }

  private readonly durationValue = toSignal(this.form.controls.duration.valueChanges, {
    initialValue: this.form.controls.duration.value
  });

  protected readonly minutes = computed(() => Number(this.durationValue()) || 0);

  // ---- Врач и свободное время ----

  // Врачи из расписания, по алфавиту
  protected readonly doctors = computed(() => {
    const map = new Map<number, string>();
    for (const appointment of this.scheduleService.appointments()) {
      map.set(appointment.doctorId, appointment.doctorName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  });

  private readonly doctorIdValue = toSignal(this.form.controls.doctorId.valueChanges, {
    initialValue: this.form.controls.doctorId.value
  });
  private readonly dateValue = toSignal(this.form.controls.date.valueChanges, {
    initialValue: this.form.controls.date.value
  });
  protected readonly timeValue = toSignal(this.form.controls.time.valueChanges, {
    initialValue: this.form.controls.time.value
  });

  // Свободные интервалы выбранного врача на дату — с учётом продолжительности
  // TODO: на API — GET /doctors/:id/free-slots?date=&minutes=
  protected readonly freeSlots = computed(() => {
    const doctorId = this.doctorIdValue();
    const date = this.dateValue();
    const minutes = this.minutes();
    if (!doctorId || !date || minutes <= 0) return [];

    const editId = this.data?.appointment?.id;
    const busy = this.scheduleService.appointments()
      .filter(a => a.doctorId === doctorId && a.date === date && a.status !== 'cancelled' && a.id !== editId)
      .map(a => [toMinutes(a.start), toMinutes(a.end)]);

    const now = new Date();
    const nowMinutes = date === toDateKey(now) ? now.getHours() * 60 + now.getMinutes() : 0;

    const slots: { start: string; end: string }[] = [];
    for (let t = DAY_START_MINUTES; t + minutes <= DAY_END_MINUTES; t += SLOT_STEP_MINUTES) {
      if (t < nowMinutes) continue;
      if (busy.some(([start, end]) => t < end && t + minutes > start)) continue;
      const start = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      slots.push({ start, end: addMinutes(start, minutes) });
    }
    return slots;
  });

  protected selectSlot(start: string): void {
    this.form.controls.time.setValue(start);
    this.form.controls.time.markAsTouched();
  }

  // ---- Рейтинг пациента ----

  protected readonly ratings = PATIENT_RATINGS;
  protected readonly ratingDot = PATIENT_RATING_DOT;

  private readonly ratingValue = toSignal(this.form.controls.rating.valueChanges, {
    initialValue: this.form.controls.rating.value
  });

  protected isRating(rating: PatientRating): boolean {
    return this.ratingValue() === rating;
  }

  protected setRating(rating: PatientRating): void {
    this.form.controls.rating.setValue(rating);
  }

  // Рейтинг выбранного из базы пациента (пока mock)
  protected readonly selectedPatientRating = computed(() => {
    const patient = this.selectedPatient();
    return patient ? mockPatientRating(patient.id) : null;
  });

  // ---- Отправка ----

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const serviceId = this.form.controls.serviceId.value!;
    const serviceIds = this.form.controls.serviceIds.value;
    const list = this.services() ?? [];
    // Название приёма: все выбранные услуги через запятую, «Другое» — текстом пользователя
    const serviceNames = serviceIds
      .filter(id => id !== OTHER_SERVICE_ID)
      .map(id => list.find(s => s.id === id)?.name ?? '')
      .filter(Boolean);
    if (serviceIds.includes(OTHER_SERVICE_ID)) {
      serviceNames.unshift(this.form.controls.otherReason.value.trim());
    }
    const patient = this.selectedPatient();
    const isSearch = this.mode() === 'search';

    // TODO: на следующих шагах — врач, слот, комментарий и сохранение через API
    this.dialogRef.close({
      patientId: isSearch ? patient?.id ?? null : null,
      patientName: isSearch ? patient?.fullName ?? '' : this.newPatient.fullName.value.trim(),
      phone: isSearch ? patient?.phone ?? '' : `${PHONE_PREFIX} ${this.newPatient.phone.value.trim()}`,
      serviceId,
      serviceName: serviceNames.join(', '),
      durationMinutes: this.minutes() || OTHER_SERVICE_MINUTES,
      date: this.form.controls.date.value,
      time: this.form.controls.time.value,
      serviceIds,
      doctorId: this.form.controls.doctorId.value ?? undefined,
      rating: isSearch ? undefined : this.form.controls.rating.value
    });
  }
}
