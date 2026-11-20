import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../core/auth/auth.service';
import { AppointmentDialog, AppointmentDialogData } from './components/appointment-dialog/appointment-dialog';
import { FreeSlotsDialog, FreeSlotsDialogData } from './components/free-slots-dialog/free-slots-dialog';
import { PatientsTodayDialog } from './components/patients-today-dialog/patients-today-dialog';
import { ShiftDoctorsDialog } from './components/shift-doctors-dialog/shift-doctors-dialog';
import { Appointment } from './models/dashboard.model';
import { DashboardService } from './services/dashboard.service';
import { DashboardPrefsService } from './services/dashboard-prefs.service';
import { APPOINTMENT_FORM_DIALOG_CONFIG, AppointmentFormDialog } from '../schedule/components/appointment-form-dialog/appointment-form-dialog';
import { filter, switchMap } from 'rxjs';
import { FeedbackService } from '../../shared/services/feedback.service';
import { AppointmentFormData, AppointmentFormResult } from '../schedule/components/appointment-form-dialog/appointment-form-dialog';
import { ScheduleService } from '../schedule/services/schedule.service';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// Сколько ближайших окон показывать в карточке
const MAX_VISIBLE_SLOTS = 2;

// Общие настройки больших модалок главной: фиксированная высота, чтобы окно не прыгало
const DIALOG_CONFIG = {
  width: '560px',
  maxWidth: '95vw',
  height: '85vh',
  maxHeight: '90vh',
  autoFocus: false
};

// Настройки модалки приёма: компактная, высота по содержимому
const APPOINTMENT_DIALOG_CONFIG = {
  width: '440px',
  maxWidth: '95vw',
  autoFocus: false
};

// 'HH:mm' → минуты от начала дня
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

@Component({
  selector: 'app-dashboard',
  imports: [NgTemplateOutlet, ReactiveFormsModule, MatAutocompleteModule, MatIconModule, TranslocoPipe],
  templateUrl: './dashboard.html'
})
export class Dashboard {
  private readonly auth = inject(AuthService);
  private readonly transloco = inject(TranslocoService);
  private readonly dashboardService = inject(DashboardService);
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scheduleService = inject(ScheduleService);
  private readonly feedback = inject(FeedbackService);

  // Мобилка: показывать ли карточки «Пациенты сегодня» и «Свободные слоты» (включается в настройках)
  protected readonly showKpiMobile = inject(DashboardPrefsService).showKpiMobile;

  protected readonly summary = toSignal(this.dashboardService.getSummary());
  private readonly appointments = toSignal(this.dashboardService.getUpcomingAppointments());

  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang()
  });

  private readonly locale = computed(() => LOCALES[this.lang()] ?? 'ru-RU');

  // Текущее время — обновляется раз в минуту, чтобы прошедшие окна и приёмы исчезали сами
  private readonly now = signal(new Date());

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  private readonly nowMinutes = computed(() => this.now().getHours() * 60 + this.now().getMinutes());

  // Врача — по имени и отчеству («Алексей Петрович»), администратора — по первому слову
  protected readonly firstName = computed(() => {
    const user = this.auth.user();
    const parts = user?.fullName.split(' ') ?? [];
    return user?.role === 'doctor' && parts.length >= 3 ? `${parts[1]} ${parts[2]}` : parts[0] ?? '';
  });

  // Врач видит только свои окна и приёмы — выбор врача скрыт
  protected readonly isDoctor = computed(() => this.auth.user()?.role === 'doctor');

  protected readonly greetingKey = computed(() => {
    const hour = this.now().getHours();
    if (hour >= 5 && hour < 12) return 'dashboard.greeting.morning';
    if (hour >= 12 && hour < 18) return 'dashboard.greeting.day';
    if (hour >= 18 && hour < 23) return 'dashboard.greeting.evening';
    return 'dashboard.greeting.night';
  });

  protected readonly today = computed(() => {
    const text = new Intl.DateTimeFormat(this.locale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(this.now());
    return text.charAt(0).toUpperCase() + text.slice(1);
  });

  // ---- Выбор врача с поиском (фильтрует свободные слоты и ближайшие приёмы) ----

  // Выбранный врач: 'all' — все врачи, иначе doctorId
  protected readonly selectedDoctor = signal<string>(this.auth.user()?.role === 'doctor' && this.auth.user()?.doctorId ? String(this.auth.user()!.doctorId) : 'all');

  // Текст в поле поиска врача
  protected readonly doctorControl = new FormControl<string>('', { nonNullable: true });
  private readonly doctorQuery = toSignal(this.doctorControl.valueChanges, { initialValue: '' });

  protected readonly selectedDoctorName = computed(() => {
    const id = this.selectedDoctor();
    if (id === 'all') return '';
    return this.summary()?.freeSlots.find(d => String(d.doctorId) === id)?.doctorName ?? '';
  });

  // Врачи для выпадающего списка с учётом поиска
  protected readonly filteredDoctors = computed(() => {
    const doctors = this.summary()?.freeSlots ?? [];
    const query = this.doctorQuery().trim().toLowerCase();

    // Пустой запрос или в поле уже стоит выбранный врач — показываем всех
    if (!query || query === this.selectedDoctorName().toLowerCase()) {
      return doctors;
    }
    return doctors.filter(d => d.doctorName.toLowerCase().includes(query));
  });

  // ---- Свободные слоты ----

  // Оставшиеся (ещё не прошедшие) окна выбранного врача или всех врачей
  protected readonly visibleSlots = computed(() => {
    const doctors = this.summary()?.freeSlots ?? [];
    const selected = this.selectedDoctor();

    const slots = selected === 'all'
      ? [...new Set(doctors.flatMap(doctor => doctor.slots))]
      : doctors.find(doctor => String(doctor.doctorId) === selected)?.slots ?? [];

    return slots
      .filter(slot => toMinutes(slot) > this.nowMinutes())
      .sort((a, b) => toMinutes(a) - toMinutes(b));
  });

  // Ближайшие окна, которые помещаются в карточку
  protected readonly shownSlots = computed(() => this.visibleSlots().slice(0, MAX_VISIBLE_SLOTS));

  // Сколько окон не поместилось — для чипа «+N»
  protected readonly hiddenSlotsCount = computed(() =>
    Math.max(this.visibleSlots().length - MAX_VISIBLE_SLOTS, 0)
  );

  // ---- Ближайшие приёмы ----

  protected readonly appointmentsLoading = computed(() => this.appointments() === undefined);

  // Предстоящие приёмы выбранного врача с «через N мин» и ссылкой для звонка — всё считаем заранее
  protected readonly upcomingAppointments = computed(() => {
    const selected = this.selectedDoctor();
    const nowMinutes = this.nowMinutes();

    return (this.appointments() ?? [])
      .filter(appointment => selected === 'all' || String(appointment.doctorId) === selected)
      .filter(appointment => toMinutes(appointment.time) > nowMinutes)
      .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
      .map(appointment => {
        const minutesLeft = toMinutes(appointment.time) - nowMinutes;
        const hours = Math.floor(minutesLeft / 60);
        const minutes = minutesLeft % 60;

        return {
          ...appointment,
          leftKey: hours > 0 ? 'dashboard.appointments.inHours' : 'dashboard.appointments.inMinutes',
          leftParams: hours > 0 ? { hours, minutes } : { count: minutes },
          phoneHref: `tel:${appointment.phone.replace(/[^\d+]/g, '')}`
        };
      });
  });

  protected onDoctorSelected(event: MatAutocompleteSelectedEvent): void {
    const name = event.option.value as string;

    if (!name) {
      this.selectedDoctor.set('all');
      return;
    }

    const doctor = this.summary()?.freeSlots.find(d => d.doctorName === name);
    this.selectedDoctor.set(doctor ? String(doctor.doctorId) : 'all');
  }

  // Поле очистили вручную — снова все врачи
  protected onDoctorInput(): void {
    if (!this.doctorControl.value.trim()) {
      this.selectedDoctor.set('all');
    }
  }

  // ---- Модальные окна ----

  protected openPatientsDialog(): void {
    this.dialog.open(PatientsTodayDialog, DIALOG_CONFIG);
  }

  protected openSlotsDialog(): void {
    const summary = this.summary();
    if (!summary) {
      return;
    }

    this.dialog.open<FreeSlotsDialog, FreeSlotsDialogData>(FreeSlotsDialog, {
      ...DIALOG_CONFIG,
      data: {
        doctors: summary.freeSlots,
        selectedDoctorId: this.selectedDoctor()
      }
    });
  }

  protected openDoctorsDialog(): void {
    this.dialog.open(ShiftDoctorsDialog, DIALOG_CONFIG);
  }

  // Клик по карточке приёма — подробности
  protected openAppointmentDialog(appointment: Appointment & { phoneHref: string }): void {
    this.dialog.open<AppointmentDialog, AppointmentDialogData>(AppointmentDialog, {
      ...APPOINTMENT_DIALOG_CONFIG,
      data: { appointment, mode: 'details' }
    });
  }

  // Клик по трубке — только номер. stopPropagation, чтобы не открылись заодно подробности
  protected openPhoneDialog(appointment: Appointment & { phoneHref: string }, event: Event): void {
    event.stopPropagation();
    this.dialog.open<AppointmentDialog, AppointmentDialogData>(AppointmentDialog, {
      ...APPOINTMENT_DIALOG_CONFIG,
      data: { appointment, mode: 'phone' }
    });
  }

  // Быстрая запись: по умолчанию на сегодня, в ближайшие полчаса (дату и время можно поменять в форме)
  protected openAppointmentForm(): void {
    this.dialog
      .open<AppointmentFormDialog, AppointmentFormData, AppointmentFormResult>(AppointmentFormDialog, APPOINTMENT_FORM_DIALOG_CONFIG)
      .afterClosed()
      .pipe(
        filter((result): result is AppointmentFormResult => !!result),
        switchMap(result => this.scheduleService.add(result, result.date, result.doctorId))
      )
      .subscribe({
        next: created => this.feedback.success('feedback.created', 'feedback.createdMessage', {
          patient: created.patientName,
          // Дата записи из формы: «30 октября»
          date: new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'long' }).format(new Date(`${created.date}T00:00`)),
          time: created.start
        }),
        error: () => this.feedback.error()
      });
  }
}
