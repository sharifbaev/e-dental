import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { filter, switchMap } from 'rxjs';
import { CONFIRM_DIALOG_CONFIG, ConfirmDialog, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog';
import { FeedbackService } from '../../shared/services/feedback.service';
import { APPOINTMENT_DETAILS_DIALOG_CONFIG, AppointmentDetailsAction, AppointmentDetailsData, AppointmentDetailsDialog } from './components/appointment-details-dialog/appointment-details-dialog';
import { APPOINTMENT_FORM_DIALOG_CONFIG, AppointmentFormData, AppointmentFormDialog, AppointmentFormResult } from './components/appointment-form-dialog/appointment-form-dialog';
import { CALENDAR_RANGE_DIALOG_CONFIG, CalendarRangeDialog, CalendarRangeDialogData, CalendarRangeResult } from './components/calendar-range-dialog/calendar-range-dialog';
import { PatientStatus, ScheduleAppointment } from './models/schedule.model';
import { ScheduleService, addMinutes, toDateKey } from './services/schedule.service';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

type Period = 'today' | 'week' | 'calendar';

const ALL_STATUSES: PatientStatus[] = ['primary', 'inTreatment', 'completed', 'cancelled'];

// Цвета статусов пациента
const STATUS_CLASSES: Record<PatientStatus, string> = {
  primary: 'bg-sky-50 text-sky-700',
  inTreatment: 'bg-brand-50 text-brand-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-600'
};

// 'YYYY-MM-DD' → Date по местному времени
function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// «Савина А. И.» → «СА»
function getInitials(name: string): string {
  return name
    .replace(/\./g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
}

@Component({
  selector: 'app-schedule',
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatIconModule, TranslocoPipe],
  templateUrl: './schedule.html',
  styleUrl: './schedule.scss'
})
export class Schedule {
  private readonly scheduleService = inject(ScheduleService);
  private readonly feedback = inject(FeedbackService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);

  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang()
  });

  private readonly locale = computed(() => LOCALES[this.lang()] ?? 'ru-RU');

  // ---- Период и дата ----

  private readonly todayKey = toDateKey(new Date());

  // Прошедшие даты в календаре недоступны
  private readonly minDate = fromDateKey(this.todayKey);

  protected readonly period = signal<Period>('today');

  // Выбранный день — для «Сегодня» и «Неделя»
  protected readonly selectedDate = signal<string>(this.todayKey);

  // Выбранный интервал — для «Календаря»
  private readonly rangeStart = signal<string | null>(null);
  private readonly rangeEnd = signal<string | null>(null);

  private readonly isRange = computed(() =>
    this.period() === 'calendar' && !!this.rangeStart() && !!this.rangeEnd()
  );

  // Выбранный интервал для плашки после вкладок: «17 октября – 24 октября» или один день
  protected readonly rangeLabel = computed(() => {
    const start = this.rangeStart();
    const end = this.rangeEnd();
    if (!this.isRange() || !start || !end) return '';

    const format = new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'long' });
    return start === end
      ? format.format(fromDateKey(start))
      : `${format.format(fromDateKey(start))} – ${format.format(fromDateKey(end))}`;
  });

  // Дата или период в заголовке
  protected readonly titleDate = computed(() => {
    const start = this.rangeStart();
    const end = this.rangeEnd();

    if (this.isRange() && start && end && start !== end) {
      const format = new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'long' });
      return `${format.format(fromDateKey(start))} – ${format.format(fromDateKey(end))}`;
    }

    const key = this.isRange() && start ? start : this.selectedDate();
    const text = new Intl.DateTimeFormat(this.locale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(fromDateKey(key));
    return text.charAt(0).toUpperCase() + text.slice(1);
  });

  protected setPeriod(period: Period): void {
    if (period === 'calendar') {
      this.openCalendar();
      return;
    }

    this.period.set(period);

    if (period === 'today') {
      this.selectedDate.set(this.todayKey);
    }
    // В режиме недели дата должна попадать в ближайшие 7 дней
    if (period === 'week' && !this.weekDays().some(day => day.key === this.selectedDate())) {
      this.selectedDate.set(this.todayKey);
    }
  }

  protected selectDay(key: string): void {
    this.selectedDate.set(key);
  }

  // Модалка календаря: закрывается сама после выбора второй даты
  private openCalendar(): void {
    const start = this.rangeStart();
    const end = this.rangeEnd();

    this.dialog
      .open<CalendarRangeDialog, CalendarRangeDialogData, CalendarRangeResult>(CalendarRangeDialog, {
        ...CALENDAR_RANGE_DIALOG_CONFIG,
        data: {
          start: start ? fromDateKey(start) : null,
          end: end ? fromDateKey(end) : null,
          minDate: this.minDate,
          locale: this.locale()
        }
      })
      .afterClosed()
      .pipe(filter((result): result is CalendarRangeResult => !!result))
      .subscribe(result => {
        this.rangeStart.set(toDateKey(result.start));
        this.rangeEnd.set(toDateKey(result.end));
        this.period.set('calendar');
      });
  }

  // Клик по плашке периода — выбрать другой интервал
  protected editRange(): void {
    this.openCalendar();
  }

  // Крестик на плашке — сбросить период и вернуться к «Сегодня»
  protected clearRange(): void {
    this.rangeStart.set(null);
    this.rangeEnd.set(null);
    this.setPeriod('today');
  }

  // ---- Врач: выбор с поиском ----

  // Выбранный врач: 'all' — все врачи, иначе doctorId
  protected readonly selectedDoctor = signal<string>('all');

  protected readonly doctorControl = new FormControl<string>('', { nonNullable: true });
  private readonly doctorQuery = toSignal(this.doctorControl.valueChanges, { initialValue: '' });

  // Все врачи из расписания, по алфавиту
  private readonly doctors = computed(() => {
    const map = new Map<number, string>();
    for (const appointment of this.scheduleService.appointments()) {
      map.set(appointment.doctorId, appointment.doctorName);
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id: String(id), name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  });

  private readonly selectedDoctorName = computed(() =>
    this.doctors().find(doctor => doctor.id === this.selectedDoctor())?.name ?? ''
  );

  protected readonly filteredDoctors = computed(() => {
    const query = this.doctorQuery().trim().toLowerCase();
    if (!query || query === this.selectedDoctorName().toLowerCase()) {
      return this.doctors();
    }
    return this.doctors().filter(doctor => doctor.name.toLowerCase().includes(query));
  });

  protected onDoctorSelected(event: MatAutocompleteSelectedEvent): void {
    const name = event.option.value as string;
    this.selectedDoctor.set(this.doctors().find(doctor => doctor.name === name)?.id ?? 'all');
  }

  // Поле очистили вручную — снова все врачи
  protected onDoctorInput(): void {
    if (!this.doctorControl.value.trim()) {
      this.selectedDoctor.set('all');
    }
  }

  // Приёмы выбранного врача (за все даты)
  private readonly doctorAppointments = computed(() => {
    const doctor = this.selectedDoctor();
    return this.scheduleService.appointments()
      .filter(appointment => doctor === 'all' || String(appointment.doctorId) === doctor);
  });

  // ---- Лента недели ----

  // Количество записей по датам (без отменённых), с учётом врача
  private readonly countsByDate = computed(() => {
    const counts = new Map<string, number>();
    for (const appointment of this.doctorAppointments()) {
      if (appointment.status !== 'cancelled') {
        counts.set(appointment.date, (counts.get(appointment.date) ?? 0) + 1);
      }
    }
    return counts;
  });

  // 7 дней начиная с сегодняшнего
  protected readonly weekDays = computed(() => {
    const weekdayFormat = new Intl.DateTimeFormat(this.locale(), { weekday: 'short' });
    const today = fromDateKey(this.todayKey);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + index);
      const key = toDateKey(date);
      return {
        key,
        weekday: weekdayFormat.format(date).replace('.', '').toUpperCase(),
        day: date.getDate(),
        count: this.countsByDate().get(key) ?? 0
      };
    });
  });

  // ---- Приёмы выбранного дня или интервала (до фильтра по статусу) ----

  private readonly periodAppointments = computed(() => {
    if (this.isRange()) {
      const start = this.rangeStart()!;
      const end = this.rangeEnd()!;
      return this.doctorAppointments().filter(a => a.date >= start && a.date <= end);
    }
    return this.doctorAppointments().filter(a => a.date === this.selectedDate());
  });

  // ---- Статусы ----

  // Пустой список — все статусы
  protected readonly selectedStatuses = signal<PatientStatus[]>([]);

  protected readonly statusChips = computed(() => {
    const selected = this.selectedStatuses();
    return ALL_STATUSES.map(status => ({
      status,
      key: `schedule.status.${status}`,
      count: this.periodAppointments().filter(appointment => appointment.status === status).length,
      active: selected.includes(status),
      activeClass: STATUS_CLASSES[status]
    }));
  });

  protected readonly allStatusesActive = computed(() => this.selectedStatuses().length === 0);

  protected toggleStatus(status: PatientStatus): void {
    this.selectedStatuses.update(list =>
      list.includes(status) ? list.filter(s => s !== status) : [...list, status]
    );
  }

  protected clearStatuses(): void {
    this.selectedStatuses.set([]);
  }

  // ---- Список приёмов ----

  // Приёмы с учётом всех фильтров: статус, цвета, инициалы врача и дата — всё считаем заранее
  protected readonly items = computed(() => {
    const statuses = this.selectedStatuses();
    const showDate = this.isRange() && this.rangeStart() !== this.rangeEnd();
    const dateFormat = new Intl.DateTimeFormat(this.locale(), { weekday: 'short', day: 'numeric', month: 'short' });

    return this.periodAppointments()
      .filter(appointment => statuses.length === 0 || statuses.includes(appointment.status))
      .map(appointment => ({
        ...appointment,
        isCancelled: appointment.status === 'cancelled',
        statusKey: `schedule.status.${appointment.status}`,
        statusClass: STATUS_CLASSES[appointment.status],
        doctorInitials: getInitials(appointment.doctorName),
        dateLabel: showDate ? dateFormat.format(fromDateKey(appointment.date)) : ''
      }));
  });

  // Сколько приёмов за выбранный день или период без отменённых
  protected readonly activeCount = computed(() =>
    this.periodAppointments().filter(appointment => appointment.status !== 'cancelled').length
  );

  // ---- Действия ----

  // Новая запись: на выбранный день (или начало интервала), к выбранному врачу, если он выбран
  protected openNewAppointment(): void {
    const date = this.isRange() ? this.rangeStart()! : this.selectedDate();
    const doctorId = this.selectedDoctor() === 'all' ? undefined : Number(this.selectedDoctor());

    this.dialog
      .open<AppointmentFormDialog, AppointmentFormData, AppointmentFormResult>(AppointmentFormDialog, APPOINTMENT_FORM_DIALOG_CONFIG)
      .afterClosed()
      .pipe(
        filter((result): result is AppointmentFormResult => !!result),
        switchMap(result => this.scheduleService.add(result, date, doctorId))
      )
      .subscribe({
        next: created => {
          const dateText = new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'long' }).format(fromDateKey(created.date));
          this.feedback.success('feedback.created', 'feedback.createdMessage', {
            patient: created.patientName,
            date: dateText,
            time: created.start
          });
        },
        error: () => this.feedback.error()
      });
  }

  // Клик по карточке — общие данные приёма. Кнопки внутри модалки возвращают действие
  protected openDetails(appointment: ScheduleAppointment & { statusKey: string; statusClass: string }): void {
    const dateText = new Intl.DateTimeFormat(this.locale(), {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }).format(fromDateKey(appointment.date));

    this.dialog
      .open<AppointmentDetailsDialog, AppointmentDetailsData, AppointmentDetailsAction>(AppointmentDetailsDialog, {
        ...APPOINTMENT_DETAILS_DIALOG_CONFIG,
        data: {
          appointment,
          dateLabel: dateText.charAt(0).toUpperCase() + dateText.slice(1),
          statusKey: appointment.statusKey,
          statusClass: appointment.statusClass,
          phoneHref: `tel:${appointment.phone.replace(/[^\d+]/g, '')}`
        }
      })
      .afterClosed()
      .subscribe(action => {
        if (action === 'edit') this.edit(appointment);
        if (action === 'cancel') this.cancel(appointment);
      });
  }

  // Изменение приёма: та же форма записи, но с данными приёма
  protected edit(appointment: ScheduleAppointment): void {
    this.dialog
      .open<AppointmentFormDialog, AppointmentFormData, AppointmentFormResult>(AppointmentFormDialog, {
        ...APPOINTMENT_FORM_DIALOG_CONFIG,
        data: { appointment }
      })
      .afterClosed()
      .pipe(
        filter((result): result is AppointmentFormResult => !!result),
        switchMap(result => this.scheduleService.update(appointment.id, {
          // TODO: новый пациент получит id с API; пока временный
          patientId: result.patientId ?? Date.now(),
          patientName: result.patientName,
          phone: result.phone,
          serviceId: result.serviceId,
          service: result.serviceName,
          // Время окончания — по длительности выбранной услуги
          end: addMinutes(appointment.start, result.durationMinutes)
        }))
      )
      .subscribe({
        next: () => this.feedback.success('feedback.updated'),
        error: () => this.feedback.error()
      });
  }

  protected cancel(appointment: ScheduleAppointment): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        ...CONFIRM_DIALOG_CONFIG,
        data: {
          titleKey: 'schedule.cancelDialog.title',
          messageKey: 'schedule.cancelDialog.message',
          messageParams: { patient: appointment.patientName, time: appointment.start },
          confirmKey: 'schedule.cancelDialog.confirm',
          cancelKey: 'schedule.cancelDialog.back',
          danger: true
        }
      })
      .afterClosed()
      .pipe(
        filter(Boolean),
        switchMap(() => this.scheduleService.cancel(appointment.id))
      )
      .subscribe({
        next: () => this.feedback.success('feedback.cancelled'),
        error: () => this.feedback.error()
      });
  }
}
