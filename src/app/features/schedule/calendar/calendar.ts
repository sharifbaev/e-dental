import { NgTemplateOutlet } from '@angular/common';
import { AfterViewInit, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MatDialog } from '@angular/material/dialog';
import { filter, switchMap } from 'rxjs';
import { APPOINTMENT_FORM_DIALOG_CONFIG, AppointmentFormData, AppointmentFormDialog, AppointmentFormResult } from '../components/appointment-form-dialog/appointment-form-dialog';
import { FeedbackService } from '../../../shared/services/feedback.service';
import { Schedule } from '../schedule';
import { ScheduleService, isStatusOverdue, toDateKey } from '../services/schedule.service';
import { DoctorsService } from '../../doctors/services/doctors.service';
import { PatientStatus } from '../../../shared/models/patient-status';
import { PATIENT_RATING_DOT } from '../../../shared/models/patient-rating';
import { ScheduleAppointment } from '../models/schedule.model';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// Высота одного часа на шкале, px (мобилка — ниже, чтобы на экран помещалось больше часов)
const HOUR_PX = 100;
const MOBILE_HOUR_PX = 40;
// Мобилка: меньше этого час не делаем, даже если часов много (шкала тогда прокручивается)
const MOBILE_MIN_HOUR_PX = 24;

// Минимальный горизонтальный сдвиг пальцем по ленте дней для смены недели, px
const SWIPE_PX = 50;

const MOBILE_QUERY = '(max-width: 767px)';

// Сколько врачей можно выбрать в фильтре одновременно (шкала делится на столько колонок)
const MAX_DOCTORS = 3;

// Шаг времени при клике по пустому месту шкалы, мин
const CLICK_STEP_MINUTES = 15;

// Режим работы по умолчанию — если врач не найден в справочнике
const DEFAULT_START = '09:00';
const DEFAULT_END = '18:00';

// Цвета приёмов на шкале: в светлой теме насыщеннее общих цветов статусов (на белом фоне блоки плохо видны),
// тёмная тема — как везде
const EVENT_STATUS_CLASSES: Record<PatientStatus, string> = {
  primary: 'bg-sky-200 text-sky-900 dark:bg-sky-500/15 dark:text-sky-300',
  awaitingDecision: 'bg-amber-200 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300',
  inTreatment: 'bg-brand-200 text-brand-900 dark:bg-brand-50 dark:text-brand-300',
  completed: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-500/15 dark:text-emerald-300',
  archived: 'bg-slate-200 text-slate-800 dark:bg-slate-500/15 dark:text-slate-300',
  noShow: 'bg-orange-200 text-orange-900 dark:bg-orange-500/15 dark:text-orange-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'
};

// 'YYYY-MM-DD' → Date по местному времени
function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// 'HH:mm' → минуты от начала суток
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// Понедельник недели, в которую входит дата
function startOfWeek(date: Date): Date {
  const shift = (date.getDay() + 6) % 7; // пн — 0 … вс — 6
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - shift);
}

// День недели в формате справочника врачей: 1 — пн … 7 — вс
function isoWeekday(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

// Календарь дня как у iPhone: сверху неделя, снизу шкала времени с приёмами.
// Окна просмотра, изменения, оплаты и отмены — те же, что в «Расписании» (наследуем Schedule)
@Component({
  selector: 'app-schedule-calendar',
  imports: [MatIconModule, TranslocoPipe, NgTemplateOutlet],
  templateUrl: './calendar.html'
})
export class ScheduleCalendar extends Schedule implements AfterViewInit {
  private readonly calendarSchedule = inject(ScheduleService);
  private readonly doctorsService = inject(DoctorsService);
  private readonly calendarTransloco = inject(TranslocoService);
  private readonly calendarDialog = inject(MatDialog);
  private readonly calendarFeedback = inject(FeedbackService);

  private readonly calendarLang = toSignal(this.calendarTransloco.langChanges$, {
    initialValue: this.calendarTransloco.getActiveLang()
  });
  private readonly calendarLocale = computed(() => LOCALES[this.calendarLang()] ?? 'ru-RU');

  // Мобилка (ширина < 768px) — следим за изменением ширины окна
  private readonly calMobile = signal(typeof matchMedia === 'function' && matchMedia(MOBILE_QUERY).matches);
  // Мобилка: высота области шкалы (без отступов) — по ней час растягивается так, чтобы шкала заполняла всю секцию
  private readonly timelineBox = signal(0);
  private readonly calDestroyRef = inject(DestroyRef);

  protected readonly hourPx = computed(() => {
    if (!this.calMobile()) return HOUR_PX;
    const box = this.timelineBox();
    if (!box) return MOBILE_HOUR_PX;
    const hours = (this.range().to - this.range().from) / 60;
    return Math.max(box / hours, MOBILE_MIN_HOUR_PX);
  });
  protected readonly todayDateKey = toDateKey(new Date());

  // Прокручиваемая шкала — чтобы при открытии показать текущее время / первый приём
  private readonly timeline = viewChild<ElementRef<HTMLElement>>('timeline');

  // Текущее время для красной линии — раз в минуту
  private readonly clock = signal(new Date());

  constructor() {
    super();
    const timer = setInterval(() => this.clock.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    if (typeof matchMedia === 'function') {
      const media = matchMedia(MOBILE_QUERY);
      const onMediaChange = (event: MediaQueryListEvent) => this.calMobile.set(event.matches);
      media.addEventListener('change', onMediaChange);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onMediaChange));
    }

    // Выбран интервал — выбранный день должен быть внутри него (иначе берём первый день интервала).
    // rangeDay держим равным выбранному дню — «Добавить запись» создаёт запись на этот день
    effect(() => {
      const days = this.isRange() ? this.rangeDays() : [];
      untracked(() => {
        if (!days.length) return;
        if (!days.some(day => day.key === this.selectedDate())) {
          this.selectDay(days[0].key);
          setTimeout(() => this.scrollToFocus());
        }
        this.rangeDay.set(this.selectedDate());
      });
    });
  }

  // ---- Мобилка: свайпы с анимацией ----
  // Лента дней — соседняя неделя, шкала — соседний день (влево — следующие, вправо — предыдущие).
  // Содержимое едет за пальцем; если жест короткий — возвращается на место, иначе уезжает
  // за край, меняется неделя/день и новое содержимое въезжает с другой стороны.
  // Вертикальный жест не трогаем — он прокручивает шкалу

  private readonly stripContent = viewChild<ElementRef<HTMLElement>>('stripContent');
  private readonly timelineContent = viewChild<ElementRef<HTMLElement>>('timelineContent');

  private swipe: { target: 'strip' | 'timeline'; x: number; y: number; dx: number; axis: 'x' | 'y' | null } | null = null;
  private swipeBusy = false;

  private swipeElement(target: 'strip' | 'timeline'): HTMLElement | undefined {
    return (target === 'strip' ? this.stripContent() : this.timelineContent())?.nativeElement;
  }

  protected onSwipeStart(event: TouchEvent, target: 'strip' | 'timeline'): void {
    const touch = event.touches[0];
    if (!touch || this.swipeBusy || (target === 'strip' && this.isRange())) return;
    this.swipe = { target, x: touch.clientX, y: touch.clientY, dx: 0, axis: null };
  }

  protected onSwipeMove(event: TouchEvent): void {
    const swipe = this.swipe;
    const touch = event.touches[0];
    if (!swipe || !touch) return;
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (!swipe.axis && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      swipe.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
    }
    if (swipe.axis !== 'x') return;
    swipe.dx = dx;
    const element = this.swipeElement(swipe.target);
    if (!element) return;
    // Нет соседнего дня (край интервала) — тянется с сопротивлением
    const direction = dx < 0 ? 1 : -1;
    const shift = swipe.target === 'timeline' && !this.canShiftDay(direction) ? dx / 4 : dx;
    element.style.transform = `translateX(${shift}px)`;
    element.style.opacity = String(1 - Math.min(Math.abs(shift) / element.offsetWidth, 1) * 0.6);
  }

  protected onSwipeEnd(): void {
    const swipe = this.swipe;
    this.swipe = null;
    if (!swipe || swipe.axis !== 'x') return;
    const element = this.swipeElement(swipe.target);
    if (!element) return;
    const direction = swipe.dx < 0 ? 1 : -1;
    const allowed = swipe.target === 'strip' || this.canShiftDay(direction);
    if (Math.abs(swipe.dx) < SWIPE_PX || !allowed) {
      this.animateBack(element);
      return;
    }
    const change = swipe.target === 'strip'
      ? () => (direction > 0 ? this.nextWeek() : this.prevWeek())
      : () => this.shiftDay(direction);
    void this.slide(element, direction, change);
  }

  private animateBack(element: HTMLElement): void {
    const from = { transform: element.style.transform || 'translateX(0)', opacity: element.style.opacity || '1' };
    element.style.transform = '';
    element.style.opacity = '';
    element.animate([from, { transform: 'translateX(0)', opacity: '1' }], { duration: 180, easing: 'ease-out' });
  }

  private async slide(element: HTMLElement, direction: number, change: () => void): Promise<void> {
    this.swipeBusy = true;
    const width = element.offsetWidth;
    const from = { transform: element.style.transform || 'translateX(0)', opacity: element.style.opacity || '1' };
    element.style.transform = '';
    element.style.opacity = '';
    try {
      // Уезжает за край по ходу жеста
      const leave = element.animate([from, { transform: `translateX(${-direction * width}px)`, opacity: '0' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
      await leave.finished;
      change();
      // Ждём перерисовку с новой неделей/днём
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      leave.cancel();
      // Новое содержимое въезжает с другой стороны
      await element.animate(
        [{ transform: `translateX(${direction * width * 0.4}px)`, opacity: '0' }, { transform: 'translateX(0)', opacity: '1' }],
        { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      ).finished;
    } finally {
      this.swipeBusy = false;
    }
  }

  // Есть ли соседний день: при интервале — только в его пределах
  private canShiftDay(delta: number): boolean {
    if (!this.isRange()) return true;
    const days = this.stripDays();
    const index = days.findIndex(day => day.key === this.selectedDate());
    return index + delta >= 0 && index + delta < days.length;
  }

  // Соседний день; при выбранном интервале — только в его пределах, иначе неделя в ленте подстраивается
  private shiftDay(delta: number): void {
    if (this.isRange()) {
      const days = this.stripDays();
      const next = days[days.findIndex(day => day.key === this.selectedDate()) + delta];
      if (next) this.pickDay(next.key);
      return;
    }
    const current = fromDateKey(this.selectedDate());
    const date = new Date(current.getFullYear(), current.getMonth(), current.getDate() + delta);
    this.weekStart.set(startOfWeek(date));
    this.pickDay(toDateKey(date));
  }

  // Интервал: то же окно выбора, что в «Расписании»
  protected openInterval(): void {
    this.editRange();
  }

  // Сброс интервала — обратно к текущей неделе и сегодняшнему дню
  protected resetInterval(): void {
    this.clearRange();
    this.goToday();
  }

  ngAfterViewInit(): void {
    this.scrollToFocus();

    // Следим за высотой области шкалы (поворот экрана, изменение окна)
    const element = this.timeline()?.nativeElement;
    if (!element || typeof ResizeObserver !== 'function') return;
    const measure = () => {
      const style = getComputedStyle(element);
      this.timelineBox.set(Math.max(element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - 1, 0));
    };
    // ResizeObserver сам вызывает measure сразу после observe (асинхронно — без ошибок проверки изменений)
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    this.calDestroyRef.onDestroy(() => observer.disconnect());
  }

  // ---- Неделя ----

  // Понедельник показываемой недели
  protected readonly weekStart = signal<Date>(startOfWeek(new Date()));

  // Календарь показывает неделю: подгружаем приёмы её дней (и выбранного дня)
  protected override visibleRange(): [string, string] {
    if (this.isRange()) return super.visibleRange();
    const start = this.weekStart();
    const from = toDateKey(start);
    const to = toDateKey(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
    const day = this.selectedDate();
    return [day < from ? day : from, day > to ? day : to];
  }

  protected prevWeek(): void {
    const start = this.weekStart();
    this.weekStart.set(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 7));
    this.selectDay(toDateKey(this.weekStart()));
  }

  protected nextWeek(): void {
    const start = this.weekStart();
    this.weekStart.set(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7));
    this.selectDay(toDateKey(this.weekStart()));
  }

  protected goToday(): void {
    this.weekStart.set(startOfWeek(new Date()));
    this.selectDay(this.todayDateKey);
    setTimeout(() => this.scrollToFocus());
  }

  // Выбор дня в ленте — дата берётся и для «Добавить запись»
  protected pickDay(key: string): void {
    this.selectDay(key);
    if (this.isRange()) this.rangeDay.set(key);
    setTimeout(() => this.scrollToFocus());
  }

  // Заголовок: «Ноябрь 2026» (или «Ноябрь – Декабрь 2026», если неделя на стыке)
  protected readonly monthTitle = computed(() => {
    if (this.isRange()) {
      const selected = fromDateKey(this.selectedDate());
      const text = new Intl.DateTimeFormat(this.calendarLocale(), { month: 'long', year: 'numeric' }).format(selected).replace(/\s?г\.?$/, '');
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
    const first = this.weekStart();
    const last = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 6);
    const month = new Intl.DateTimeFormat(this.calendarLocale(), { month: 'long' });
    const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
    return first.getMonth() === last.getMonth()
      ? `${cap(month.format(first))} ${first.getFullYear()}`
      : `${cap(month.format(first))} – ${cap(month.format(last))} ${last.getFullYear()}`;
  });

  // ---- Врачи: до 3 сразу ----

  // Выбранные врачи (id строкой): пусто — все врачи; 2–3 — шкала делится на колонки по врачам
  protected readonly maxDoctors = MAX_DOCTORS;
  protected readonly selectedDoctorIds = signal<string[]>(this.selectedDoctor() === 'all' ? [] : [this.selectedDoctor()]);
  protected readonly doctorMenuOpen = signal(false);

  protected isDoctorSelected(id: string): boolean {
    return this.selectedDoctorIds().includes(id);
  }

  // Отметить / снять врача; больше MAX_DOCTORS выбрать нельзя
  protected toggleDoctor(id: string): void {
    const ids = this.selectedDoctorIds();
    if (ids.includes(id)) {
      this.setDoctorIds(ids.filter(x => x !== id));
    } else if (ids.length < MAX_DOCTORS) {
      this.setDoctorIds([...ids, id]);
    }
  }

  protected clearDoctors(): void {
    this.setDoctorIds([]);
  }

  // Один врач — он же в общем фильтре (новая запись сразу к нему); никого или несколько — «Все врачи»
  private setDoctorIds(ids: string[]): void {
    this.selectedDoctorIds.set(ids);
    this.selectedDoctor.set(ids.length === 1 ? ids[0] : 'all');
  }

  // Имя единственного выбранного врача — для кнопки фильтра
  protected readonly singleDoctorName = computed(() => {
    const ids = this.selectedDoctorIds();
    return ids.length === 1 ? this.doctorOptions().find(d => d.id === ids[0])?.name ?? '' : '';
  });

  // Приёмы выбранных врачей (все даты, без отменённых — для точек в ленте)
  private readonly visibleAppointments = computed(() => {
    const ids = this.selectedDoctorIds();
    return this.calendarSchedule.appointments()
      .filter(a => ids.length === 0 || ids.includes(String(a.doctorId)));
  });

  protected readonly days = computed(() => {
    const weekdayFormat = new Intl.DateTimeFormat(this.calendarLocale(), { weekday: 'short' });
    const counts = new Map<string, number>();
    for (const a of this.visibleAppointments()) {
      if (a.status !== 'cancelled') counts.set(a.date, (counts.get(a.date) ?? 0) + 1);
    }
    const start = this.weekStart();

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = toDateKey(date);
      return {
        key,
        weekday: weekdayFormat.format(date).replace('.', '').toUpperCase(),
        day: date.getDate(),
        isToday: key === this.todayDateKey,
        isWeekend: index >= 5,
        count: counts.get(key) ?? 0
      };
    });
  });

  // Лента дней: при выбранном интервале — дни интервала, иначе — текущая неделя
  protected readonly stripDays = computed(() => {
    if (!this.isRange()) return this.days().map(day => ({ ...day, month: '' }));
    return this.rangeDays().map(day => {
      const weekday = isoWeekday(fromDateKey(day.key));
      return {
        key: day.key,
        weekday: day.weekday,
        day: day.day,
        month: day.month,
        isToday: day.key === this.todayDateKey,
        isWeekend: weekday >= 6,
        count: day.count
      };
    });
  });

  // «Вторник, 17 ноября»
  protected readonly dayTitle = computed(() => {
    const text = new Intl.DateTimeFormat(this.calendarLocale(), { weekday: 'long', day: 'numeric', month: 'long' })
      .format(fromDateKey(this.selectedDate()));
    return text.charAt(0).toUpperCase() + text.slice(1);
  });

  // ---- Режим работы ----

  // Приёмы выбранного дня
  private readonly dayAppointments = computed(() =>
    this.visibleAppointments().filter(a => a.date === this.selectedDate())
  );

  // Режим работы на выбранный день: врач — его часы, «Все врачи» — от самого раннего до самого позднего
  // среди врачей расписания, работающих в этот день
  protected readonly workHours = computed(() => {
    const selected = this.selectedDoctorIds();
    const ids = selected.length ? selected.map(Number) : this.doctorOptions().map(d => Number(d.id));
    return this.hoursFor(ids, selected.length === 1);
  });

  // Режим работы группы врачей на выбранный день; single — выбран один врач (для запасных часов)
  private hoursFor(ids: number[], single: boolean): { start: string; end: string; dayOff: boolean } {
    const weekday = isoWeekday(fromDateKey(this.selectedDate()));
    // Врачу сервер отдаёт справочник без графика — таких не учитываем (часы по умолчанию)
    const all = this.doctorsService.doctors().filter(d => !!d.workDays);
    const doctors = all.filter(d => ids.includes(d.id));
    const working = doctors.filter(d => d.workDays.includes(weekday));

    if (working.length === 0) {
      // Врач не найден в справочнике — 09:00–18:00; найден, но не работает — выходной
      const fallback = single && doctors[0] ? doctors[0] : null;
      return {
        start: fallback?.workStart ?? DEFAULT_START,
        end: fallback?.workEnd ?? DEFAULT_END,
        dayOff: doctors.length > 0
      };
    }

    const start = working.map(d => d.workStart).sort()[0];
    const end = working.map(d => d.workEnd).sort().at(-1)!;
    return { start, end, dayOff: false };
  }

  // Границы шкалы в минутах: по умолчанию 09:00–18:00, расширяется до приёмов вне этого времени, по целым часам
  private readonly range = computed(() => {
    let from = toMinutes(DEFAULT_START);
    let to = toMinutes(DEFAULT_END);
    for (const a of this.dayAppointments()) {
      from = Math.min(from, toMinutes(a.start));
      to = Math.max(to, toMinutes(a.end));
    }
    from = Math.floor(from / 60) * 60;
    to = Math.max(Math.ceil(to / 60) * 60, from + 60);
    return { from, to };
  });

  protected readonly timelineHeight = computed(() => ((this.range().to - this.range().from) / 60) * this.hourPx());

  // Подписи часов: 09:00, 10:00 …
  protected readonly hours = computed(() => {
    const { from, to } = this.range();
    // Подпись часа рядом с красной линией «сейчас» скрываем — иначе они налезают друг на друга
    const now = this.nowLine();
    const list: { label: string; top: number; hidden: boolean }[] = [];
    for (let m = from; m <= to; m += 60) {
      const top = ((m - from) / 60) * this.hourPx();
      list.push({ label: `${String(m / 60).padStart(2, '0')}:00`, top, hidden: !!now && Math.abs(now.top - top) < 18 });
    }
    return list;
  });

  // Нерабочее время внутри шкалы — затемняем (до начала и после конца режима работы)
  protected readonly offHours = computed(() => this.offBlocks(this.workHours()));

  private offBlocks(work: { start: string; end: string; dayOff: boolean }): { top: number; height: number }[] {
    const { from, to } = this.range();
    if (work.dayOff) return [{ top: 0, height: this.timelineHeight() }];
    const start = toMinutes(work.start);
    const end = toMinutes(work.end);
    const blocks: { top: number; height: number }[] = [];
    if (start > from) blocks.push({ top: 0, height: ((start - from) / 60) * this.hourPx() });
    if (end < to) blocks.push({ top: ((end - from) / 60) * this.hourPx(), height: ((to - end) / 60) * this.hourPx() });
    return blocks;
  }

  // Красная линия «сейчас» — только на сегодняшнем дне и в пределах шкалы
  protected readonly nowLine = computed(() => {
    if (this.selectedDate() !== this.todayDateKey) return null;
    const now = this.clock();
    const minutes = now.getHours() * 60 + now.getMinutes();
    const { from, to } = this.range();
    if (minutes < from || minutes > to) return null;
    return {
      top: ((minutes - from) / 60) * this.hourPx(),
      label: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    };
  });

  // ---- Приёмы на шкале ----

  // Позиция блоков; пересекающиеся приёмы встают в колонки рядом друг с другом
  protected readonly events = computed(() => this.layout(this.dayAppointments()));

  // Выбрано 2–3 врача: шкала делится по вертикали на колонки — у каждого врача свои приёмы и своё нерабочее время
  protected readonly lanes = computed(() => {
    const ids = this.selectedDoctorIds();
    if (ids.length < 2) return [];
    const day = this.dayAppointments();
    return this.doctorOptions()
      .filter(d => ids.includes(d.id))
      .map(doctor => ({
        id: Number(doctor.id),
        name: doctor.name,
        events: this.layout(day.filter(a => String(a.doctorId) === doctor.id)),
        offHours: this.offBlocks(this.hoursFor([Number(doctor.id)], true))
      }));
  });

  private layout(appointments: ScheduleAppointment[]) {
    const { from } = this.range();
    const now = this.clock();
    const list = [...appointments].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));

    type Placed = { appointment: ScheduleAppointment; column: number; group: number };
    const placed: Placed[] = [];
    const groupColumns: number[] = [];
    let group = -1;
    let groupEnd = -1;
    let columnsEnd: number[] = [];

    for (const appointment of list) {
      const start = toMinutes(appointment.start);
      const end = toMinutes(appointment.end);
      // Новая группа, если приём не пересекается ни с одним из текущей группы
      if (start >= groupEnd) {
        group++;
        columnsEnd = [];
        groupColumns[group] = 0;
      }
      let column = columnsEnd.findIndex(columnEnd => columnEnd <= start);
      if (column === -1) {
        column = columnsEnd.length;
        columnsEnd.push(end);
      } else {
        columnsEnd[column] = end;
      }
      groupEnd = Math.max(start >= groupEnd ? end : groupEnd, end);
      groupColumns[group] = Math.max(groupColumns[group], columnsEnd.length);
      placed.push({ appointment, column, group });
    }

    return placed.map(({ appointment, column, group: g }) => {
      const start = toMinutes(appointment.start);
      const end = toMinutes(appointment.end);
      const columns = groupColumns[g];
      // Мобилка: высота точно по времени (только имя пациента), ПК — не меньше 22px
      const height = Math.max(((end - start) / 60) * this.hourPx() - 2, this.calMobile() ? 4 : 22);
      return {
        ...appointment,
        top: ((start - from) / 60) * this.hourPx() + 1,
        height,
        left: (column / columns) * 100,
        width: 100 / columns,
        // < 44px — одна строка, < 64px — имя и время, иначе — полностью
        compact: this.calMobile() || height < 44,
        medium: height >= 44 && height < 64,
        isCancelled: appointment.status === 'cancelled',
        // 30 мин после приёма, а статус всё ещё «Первичный» — подсвечиваем
        overdue: isStatusOverdue(appointment, now),
        statusKey: `schedule.status.${appointment.status}`,
        statusClass: EVENT_STATUS_CLASSES[appointment.status],
        ratingDot: PATIENT_RATING_DOT[appointment.patientRating ?? 'good']
      };
    });
  }

  // ---- Новая запись кликом по шкале ----

  // Клик по пустому месту: время — по позиции клика (с шагом 15 мин), дата — выбранный день,
  // врач — выбранный в фильтре. Продолжительность выбирают в форме вручную
  // laneDoctorId — клик в колонке конкретного врача (выбрано несколько врачей)
  protected addAtPosition(event: MouseEvent, laneDoctorId?: number): void {
    const area = event.currentTarget as HTMLElement;
    const y = event.clientY - area.getBoundingClientRect().top;
    const { from, to } = this.range();
    const raw = from + (y / this.hourPx()) * 60;
    const minutes = Math.min(Math.max(Math.floor(raw / CLICK_STEP_MINUTES) * CLICK_STEP_MINUTES, from), to - CLICK_STEP_MINUTES);
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

    const date = this.selectedDate();
    const doctorId = laneDoctorId ?? (this.selectedDoctor() === 'all' ? undefined : Number(this.selectedDoctor()));

    this.calendarDialog
      .open<AppointmentFormDialog, AppointmentFormData, AppointmentFormResult>(AppointmentFormDialog, {
        ...APPOINTMENT_FORM_DIALOG_CONFIG,
        data: { date, doctorId, time }
      })
      .afterClosed()
      .pipe(
        filter((result): result is AppointmentFormResult => !!result),
        switchMap(result => this.calendarSchedule.add(result, result.date, result.doctorId ?? doctorId))
      )
      .subscribe({
        next: created => {
          const dateText = new Intl.DateTimeFormat(this.calendarLocale(), { day: 'numeric', month: 'long' }).format(fromDateKey(created.date));
          this.calendarFeedback.success('feedback.created', 'feedback.createdMessage', {
            patient: created.patientName,
            date: dateText,
            time: created.start
          });
        },
        error: () => this.calendarFeedback.error()
      });
  }

  // Прокрутить шкалу к текущему времени (сегодня) или к первому приёму
  private scrollToFocus(): void {
    const element = this.timeline()?.nativeElement;
    if (!element) return;
    const target = this.nowLine()?.top ?? this.events()[0]?.top ?? 0;
    element.scrollTo({ top: Math.max(target - this.hourPx(), 0), behavior: 'smooth' });
  }
}
