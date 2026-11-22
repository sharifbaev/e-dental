import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ScheduleAppointment } from '../../../schedule/models/schedule.model';
import { AppointmentFormService } from '../../../schedule/services/appointment-form.service';
import { ScheduleService, addMinutes, toDateKey } from '../../../schedule/services/schedule.service';
import { formatMoney } from '../../../payments/services/payments.service';
import { NextVisitDraft, TreatmentPlanDialogResult } from '../../models/treatment-plan.model';
import { DoctorsService } from '../../../doctors/services/doctors.service';

export interface TreatmentPlanDialogData {
  appointment: ScheduleAppointment;
}

// На ПК окно, на мобилке — на весь экран (как карточка пациента, см. styles.scss)
export const TREATMENT_PLAN_DIALOG_CONFIG: MatDialogConfig = {
  width: '560px',
  maxWidth: '100vw',
  maxHeight: '100dvh',
  autoFocus: false,
  panelClass: 'patient-details-dialog'
};

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// Рабочий день для свободных окон следующего приёма
const DAY_START = 9 * 60;
const DAY_END = 20 * 60;
const SLOT_STEP = 30;

const DURATIONS = [30, 45, 60];

// Повтор серии визитов
export type SeriesRepeat = 'daily' | 'everyOther' | 'weekly' | 'weekdays';
const REPEATS: SeriesRepeat[] = ['daily', 'everyOther', 'weekly', 'weekdays'];
// Шаг до следующей даты при «Добавить визит»
const REPEAT_STEP: Record<SeriesRepeat, number> = { daily: 1, everyOther: 2, weekly: 7, weekdays: 1 };

// Сколько ближайших свободных вариантов предлагать для визита с конфликтом
const SUGGESTIONS = 3;
// Сколько вариантов «частично свободно» показывать, если общего времени нет
const PARTIAL_LIMIT = 6;
// Сколько дней максимум просматриваем вперёд при подборе дат
const SEARCH_DAYS = 365;

// Визит серии: время null — ещё не выбрано
interface SeriesRow {
  key: number;
  date: string;
  time: string | null;
}

// 'YYYY-MM-DD' → Date по местному времени
function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shiftDays(key: string, days: number): string {
  const date = fromDateKey(key);
  return toDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

// 1 — пн … 7 — вс (как в справочнике врачей)
function isoWeekday(key: string): number {
  const day = fromDateKey(key).getDay();
  return day === 0 ? 7 : day;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

@Component({
  selector: 'app-treatment-plan-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './treatment-plan-dialog.html',
  host: { class: 'flex flex-col h-full' }
})
export class TreatmentPlanDialog {
  protected readonly data = inject<TreatmentPlanDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<TreatmentPlanDialog, TreatmentPlanDialogResult>>(MatDialogRef);
  private readonly scheduleService = inject(ScheduleService);
  private readonly formService = inject(AppointmentFormService);
  private readonly transloco = inject(TranslocoService);
  private readonly fb = inject(FormBuilder);
  private readonly doctorsService = inject(DoctorsService);

  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });
  private readonly locale = computed(() => LOCALES[this.lang()] ?? 'ru-RU');

  protected readonly appointment = this.data.appointment;
  protected readonly durations = DURATIONS;
  protected readonly todayKey = toDateKey(new Date());

  // Услуги клиники — плитки процедур (без «Острой боли»: это повод визита, а не процедура)
  private readonly allServices = toSignal(this.formService.getVisitServices(), { initialValue: [] });
  protected readonly services = computed(() => this.allServices().filter(s => !s.urgent));

  // Выбранные процедуры: по умолчанию — услуга текущего приёма
  protected readonly selected = signal<number[]>([this.appointment.serviceId]);

  protected readonly form = this.fb.nonNullable.group({
    other: [''],                                   // свои процедуры через запятую
    visits: [3, [Validators.required, Validators.min(1), Validators.max(30)]],
    cost: [0, [Validators.required, Validators.min(0)]],
    notes: [''],
    withNext: [true],
    nextDate: [toDateKey(new Date(Date.now() + 7 * 86_400_000))],
    duration: [45],
    nextTime: [''],
    // Серия визитов: дата первого визита и правило повтора
    firstDate: [toDateKey(new Date(Date.now() + 86_400_000))],
    repeat: this.fb.nonNullable.control<SeriesRepeat>('daily')
  });

  private readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  // Стоимость подставляется по выбранным процедурам, пока её не изменили руками
  private costEdited = false;

  constructor() {
    this.updateCost();

    // Занятость врача на даты серии — подгружаем приёмы этих месяцев с API
    effect(() => {
      const dates = [...this.rows().map(row => row.date), this.value().nextDate ?? ''].filter(Boolean).sort();
      if (dates.length) untracked(() => this.scheduleService.ensureRange(dates[0], dates[dates.length - 1]));
    });

    // Правило серии изменилось — пересобираем даты; выбранное общее время сохраняем
    effect(() => {
      const { visits, firstDate, repeat } = this.seriesParams();
      const weekdays = this.weekdays();
      untracked(() => {
        const dates = this.buildDates(firstDate, repeat as SeriesRepeat, weekdays, Math.min(Math.max(visits, 0), 30));
        const time = this.commonTime();
        this.rows.set(dates.map(date => ({ key: this.nextKey++, date, time })));
      });
    });
  }

  protected isSelected(id: number): boolean {
    return this.selected().includes(id);
  }

  protected toggleService(id: number): void {
    this.selected.update(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]));
    this.updateCost();
  }

  protected onCostInput(): void {
    this.costEdited = true;
  }

  private updateCost(): void {
    if (this.costEdited) return;
    // Цены — из справочника услуг («Настройки → Услуги»)
    const sum = this.selected().reduce((total, id) => total + (this.allServices().find(s => s.id === id)?.price ?? 0), 0);
    this.form.controls.cost.setValue(sum);
  }

  protected readonly costLabel = computed(() => formatMoney(this.value().cost ?? 0, this.locale()));

  // Свободные окна врача на выбранную дату под выбранную длительность
  protected readonly freeSlots = computed(() => {
    const { nextDate, duration = 45 } = this.value();
    if (!nextDate) return [];

    const now = new Date();
    const nowMinutes = nextDate === toDateKey(now) ? now.getHours() * 60 + now.getMinutes() : -1;
    const busy = this.scheduleService.appointments()
      .filter(a => a.doctorId === this.appointment.doctorId && a.date === nextDate && a.status !== 'cancelled' && a.status !== 'noShow')
      .map(a => [toMinutes(a.start), toMinutes(a.end)] as const);

    const slots: string[] = [];
    for (let start = DAY_START; start + duration <= DAY_END; start += SLOT_STEP) {
      const end = start + duration;
      if (start <= nowMinutes) continue;
      if (busy.some(([from, to]) => start < to && end > from)) continue;
      slots.push(fromMinutes(start));
    }
    return slots;
  });

  protected selectTime(time: string): void {
    this.form.controls.nextTime.setValue(time);
  }

  // ---- Серия визитов ----

  // Только то, от чего зависят даты серии: заметки, стоимость и т. п. серию не пересобирают
  private readonly seriesParams = computed(
    () => {
      const { visits = 0, firstDate = '', repeat = 'daily' } = this.value();
      return { visits, firstDate, repeat: repeat as SeriesRepeat };
    },
    { equal: (a, b) => a.visits === b.visits && a.firstDate === b.firstDate && a.repeat === b.repeat }
  );

  protected readonly repeats = REPEATS;

  // Дни недели для «По дням недели»: 1 — пн … 6 — сб (по умолчанию пн/ср/пт)
  protected readonly weekdays = signal<number[]>([1, 3, 5]);
  protected readonly weekdayOptions = computed(() => {
    const format = new Intl.DateTimeFormat(this.locale(), { weekday: 'short' });
    // 2024-01-01 — понедельник
    return [1, 2, 3, 4, 5, 6, 7].map(day => ({
      day,
      label: format.format(new Date(2024, 0, day)).replace('.', ''),
      // День, когда врач не работает, — недоступен
      disabled: !!this.doctor() && !this.doctor()!.workDays.includes(day)
    }));
  });

  protected toggleWeekday(day: number): void {
    this.weekdays.update(list => (list.includes(day) ? list.filter(d => d !== day) : [...list, day].sort()));
  }

  protected setRepeat(repeat: SeriesRepeat): void {
    this.form.controls.repeat.setValue(repeat);
  }

  // Врач приёма из справочника — режим работы и рабочие дни
  // (врачу сервер отдаёт справочник без графика — тогда считаем по рабочему дню клиники, проверит сервер)
  private readonly doctor = computed(() => {
    const doctor = this.doctorsService.doctors().find(d => d.id === this.appointment.doctorId);
    return doctor?.workDays && doctor.workStart && doctor.workEnd ? doctor : null;
  });

  // Рабочие часы врача в этот день (минуты); null — выходной
  private workHours(date: string): { start: number; end: number } | null {
    const doctor = this.doctor();
    if (!doctor) return { start: DAY_START, end: DAY_END };
    if (!doctor.workDays.includes(isoWeekday(date))) return null;
    return { start: toMinutes(doctor.workStart), end: toMinutes(doctor.workEnd) };
  }

  private isWorkingDay(date: string): boolean {
    return this.workHours(date) !== null;
  }

  // Даты серии по правилу; выходные врача пропускаются
  private buildDates(first: string, repeat: SeriesRepeat, weekdays: number[], count: number): string[] {
    const dates: string[] = [];
    if (!first || count <= 0) return dates;
    const limit = shiftDays(first, SEARCH_DAYS);

    if (repeat === 'daily' || repeat === 'weekdays') {
      for (let date = first; dates.length < count && date <= limit; date = shiftDays(date, 1)) {
        if (!this.isWorkingDay(date)) continue;
        if (repeat === 'weekdays' && !weekdays.includes(isoWeekday(date))) continue;
        dates.push(date);
      }
      return dates;
    }

    // «Через день» и «Раз в неделю»: шаг от предыдущего визита; выпал выходной — следующий рабочий день
    let cursor = first;
    while (dates.length < count && cursor <= limit) {
      while (!this.isWorkingDay(cursor) && cursor <= limit) cursor = shiftDays(cursor, 1);
      if (cursor > limit) break;
      dates.push(cursor);
      cursor = shiftDays(cursor, REPEAT_STEP[repeat]);
    }
    return dates;
  }

  private nextKey = 1;
  protected readonly rows = signal<SeriesRow[]>([]);

  // Общее время, выбранное для всех визитов
  protected readonly commonTime = signal<string | null>(null);

  private duration(): number {
    return this.value().duration ?? 45;
  }

  // Время свободно: в рабочих часах, не в прошлом, не пересекается с приёмами врача
  // и с другими визитами серии в тот же день (ignoreRows — не учитывать визиты серии)
  private isFree(date: string, time: string, rowKey: number | null, ignoreRows = false): boolean {
    const hours = this.workHours(date);
    if (!hours) return false;
    const duration = this.duration();
    const start = toMinutes(time);
    const end = start + duration;
    if (start < hours.start || end > hours.end) return false;

    const now = new Date();
    if (date < this.todayKey || (date === this.todayKey && start <= now.getHours() * 60 + now.getMinutes())) return false;

    const busy = this.scheduleService.appointments()
      .some(a => a.doctorId === this.appointment.doctorId && a.date === date && a.status !== 'cancelled' && a.status !== 'noShow'
        && start < toMinutes(a.end) && end > toMinutes(a.start));
    if (busy) return false;

    if (ignoreRows) return true;
    return !this.rows().some(row => row.key !== rowKey && row.date === date && row.time
      && start < toMinutes(row.time) + duration && end > toMinutes(row.time));
  }

  // Все свободные начала в этот день (шаг 30 мин)
  private slotsFor(date: string, rowKey: number | null): string[] {
    const hours = this.workHours(date);
    if (!hours) return [];
    const slots: string[] = [];
    for (let start = hours.start; start + this.duration() <= hours.end; start += SLOT_STEP) {
      const time = fromMinutes(start);
      if (this.isFree(date, time, rowKey)) slots.push(time);
    }
    return slots;
  }

  // Общее время: свободно во всех днях серии. Если такого нет — лучшие варианты «N из M»
  protected readonly commonOptions = computed(() => {
    this.value();
    const rows = this.rows();
    if (rows.length === 0) return { full: [] as string[], partial: [] as { time: string; free: number }[] };

    const hours = rows.map(row => this.workHours(row.date)).filter(h => !!h) as { start: number; end: number }[];
    if (hours.length === 0) return { full: [], partial: [] };
    const from = Math.min(...hours.map(h => h.start));
    const to = Math.max(...hours.map(h => h.end));

    const full: string[] = [];
    const partial: { time: string; free: number }[] = [];
    for (let start = from; start + this.duration() <= to; start += SLOT_STEP) {
      const time = fromMinutes(start);
      const free = rows.filter(row => this.isFree(row.date, time, row.key, true)).length;
      if (free === rows.length) full.push(time);
      else if (free > 0) partial.push({ time, free });
    }
    partial.sort((a, b) => b.free - a.free || a.time.localeCompare(b.time));
    return { full, partial: full.length ? [] : partial.slice(0, PARTIAL_LIMIT) };
  });

  // Выбрать одно время для всех визитов (дни, где оно занято, подсветятся — там выберут своё)
  protected applyCommonTime(time: string): void {
    this.commonTime.set(time);
    this.rows.update(rows => rows.map(row => ({ ...row, time })));
  }

  // Визиты для списка: день недели, конец, состояние и ближайшие свободные варианты
  protected readonly rowsView = computed(() => {
    this.value();
    const weekdayFormat = new Intl.DateTimeFormat(this.locale(), { weekday: 'short', day: 'numeric', month: 'short' });
    return this.rows().map(row => {
      const dayOff = !this.isWorkingDay(row.date);
      const state: 'ok' | 'noTime' | 'busy' | 'dayOff' = dayOff
        ? 'dayOff'
        : !row.time ? 'noTime' : this.isFree(row.date, row.time, row.key) ? 'ok' : 'busy';

      // Ближайшие к выбранному (или общему) времени свободные варианты
      let suggestions: string[] = [];
      if (state === 'busy' || state === 'noTime') {
        const target = toMinutes(row.time ?? this.commonTime() ?? '10:00');
        suggestions = this.slotsFor(row.date, row.key)
          .sort((a, b) => Math.abs(toMinutes(a) - target) - Math.abs(toMinutes(b) - target))
          .slice(0, SUGGESTIONS)
          .sort();
      }

      return {
        ...row,
        label: weekdayFormat.format(fromDateKey(row.date)).replace('.', ''),
        end: row.time ? addMinutes(row.time, this.duration()) : '',
        state,
        suggestions
      };
    });
  });

  protected readonly seriesOk = computed(() => this.rowsView().length > 0 && this.rowsView().every(row => row.state === 'ok'));

  protected setRowDate(key: number, date: string): void {
    if (!date) return;
    this.rows.update(rows => rows.map(row => (row.key === key ? { ...row, date } : row)));
  }

  protected setRowTime(key: number, time: string): void {
    this.rows.update(rows => rows.map(row => (row.key === key ? { ...row, time: time || null } : row)));
  }

  protected removeRow(key: number): void {
    this.rows.update(rows => rows.filter(row => row.key !== key));
  }

  // Ещё один визит — следующая дата по правилу после последнего
  protected addRow(): void {
    const rows = this.rows();
    const repeat = this.form.controls.repeat.value;
    const last = rows.length ? rows.map(r => r.date).sort().at(-1)! : '';
    const start = last ? shiftDays(last, REPEAT_STEP[repeat]) : this.form.controls.firstDate.value;
    const [date] = this.buildDates(start, repeat, this.weekdays(), 1);
    if (!date) return;
    this.rows.update(list => [...list, { key: this.nextKey++, date, time: this.commonTime() }]);
  }

  protected readonly submitted = signal(false);

  // Процедуры: выбранные плитки + свои через запятую
  private procedures(): string[] {
    const fromTiles = this.services().filter(s => this.selected().includes(s.id)).map(s => s.name);
    const own = this.form.controls.other.value.split(',').map(s => s.trim()).filter(Boolean);
    return [...fromTiles, ...own];
  }

  protected readonly proceduresMissing = computed(() => this.submitted() && this.selected().length === 0 && !(this.value().other ?? '').trim());
  protected readonly timeMissing = computed(() => this.submitted() && !!this.value().withNext && !this.value().nextTime);
  protected readonly seriesMissing = computed(() => this.submitted() && !!this.value().withNext && !this.seriesOk());

  protected skip(): void {
    this.dialogRef.close('skip');
  }

  protected save(): void {
    this.submitted.set(true);
    const value = this.form.getRawValue();
    const procedures = this.procedures();

    if (this.form.invalid || procedures.length === 0 || (value.withNext && !this.seriesOk())) {
      this.form.markAllAsTouched();
      return;
    }

    // Услуга следующего приёма — первая выбранная плитка, иначе «Другое» (сервер подставит процедуры плана)
    const firstService = this.services().find(s => this.selected().includes(s.id));

    // Визиты серии — по дате и времени
    const series: NextVisitDraft[] = value.withNext
      ? [...this.rows()]
          .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
          .map(row => ({
            date: row.date,
            time: row.time!,
            durationMinutes: value.duration,
            serviceId: firstService?.id ?? 0,
            serviceName: firstService?.name ?? procedures[0]
          }))
      : [];

    this.dialogRef.close({
      plan: {
        patientId: this.appointment.patientId,
        patientName: this.appointment.patientName,
        doctorId: this.appointment.doctorId,
        doctorName: this.appointment.doctorName,
        procedures,
        visits: value.visits,
        cost: value.cost,
        notes: value.notes.trim()
      },
      next: series[0] ?? null,
      series
    });
  }

  // Время окончания выбранного окна — для подписи
  protected readonly nextEnd = computed(() => {
    const { nextTime, duration = 45 } = this.value();
    return nextTime ? addMinutes(nextTime, duration) : '';
  });
}
