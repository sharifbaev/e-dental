import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { filter, switchMap } from 'rxjs';
import { CONFIRM_DIALOG_CONFIG, ConfirmDialog, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog';
import { FeedbackService } from '../../shared/services/feedback.service';
import { PATIENT_STATUS_CLASSES } from '../../shared/models/patient-status';
import { PATIENT_RATING_DOT } from '../../shared/models/patient-rating';
import { APPOINTMENT_DETAILS_DIALOG_CONFIG, AppointmentDetailsAction, AppointmentDetailsData, AppointmentDetailsDialog } from './components/appointment-details-dialog/appointment-details-dialog';
import { APPOINTMENT_FORM_DIALOG_CONFIG, AppointmentFormData, AppointmentFormDialog, AppointmentFormResult } from './components/appointment-form-dialog/appointment-form-dialog';
import { CALENDAR_RANGE_DIALOG_CONFIG, CalendarRangeDialog, CalendarRangeDialogData, CalendarRangeResult } from './components/calendar-range-dialog/calendar-range-dialog';
import { PatientStatus, ScheduleAppointment } from './models/schedule.model';
import { ScheduleService, addMinutes, toDateKey } from './services/schedule.service';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

type Period = 'today' | 'week' | 'calendar';

const ALL_STATUSES: PatientStatus[] = ['primary', 'inTreatment', 'completed', 'cancelled'];

// Цвета статусов пациента — общие для всего приложения
const STATUS_CLASSES: Record<PatientStatus, string> = PATIENT_STATUS_CLASSES;

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
  imports: [MatIconModule, TranslocoPipe],
  templateUrl: './schedule.html'
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

  // ---- Врач ----

  // Выбранный врач: 'all' — все врачи, иначе doctorId
  protected readonly selectedDoctor = signal<string>('all');

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

  // Список врачей для селекта
  protected readonly doctorOptions = computed(() => this.doctors());

  // Выбор врача в селекте: 'all' — все врачи
  protected onDoctorChange(id: string): void {
    this.selectedDoctor.set(id || 'all');
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
        ratingDot: PATIENT_RATING_DOT[appointment.patientRating ?? 'good'],
        ratingKey: `rating.${appointment.patientRating ?? 'good'}`,
        dateLabel: showDate ? dateFormat.format(fromDateKey(appointment.date)) : ''
      }));
  });


  // ---- Действия ----

  // Новая запись: по умолчанию на выбранный день (или начало интервала), к выбранному врачу, если он выбран
  protected openNewAppointment(): void {
    const date = this.isRange() ? this.rangeStart()! : this.selectedDate();
    const doctorId = this.selectedDoctor() === 'all' ? undefined : Number(this.selectedDoctor());

    this.dialog
      .open<AppointmentFormDialog, AppointmentFormData, AppointmentFormResult>(AppointmentFormDialog, {
        ...APPOINTMENT_FORM_DIALOG_CONFIG,
        data: { date, doctorId }
      })
      .afterClosed()
      .pipe(
        filter((result): result is AppointmentFormResult => !!result),
        switchMap(result => this.scheduleService.add(result, result.date, result.doctorId ?? doctorId))
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
          date: result.date,
          start: result.time,
          ...(result.doctorId ? { doctorId: result.doctorId, doctorName: this.doctors().find(d => d.id === String(result.doctorId))?.name ?? appointment.doctorName } : {}),
          // Время окончания — по длительности выбранной услуги
          end: addMinutes(result.time, result.durationMinutes)
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
