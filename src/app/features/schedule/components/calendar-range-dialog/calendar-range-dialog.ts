import { Component, computed, inject, signal } from '@angular/core';
import { DateAdapter, provideNativeDateAdapter } from '@angular/material/core';
import { DateRange, DefaultMatCalendarRangeStrategy, MAT_DATE_RANGE_SELECTION_STRATEGY, MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogConfig, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

export interface CalendarRangeDialogData {
  start: Date | null;
  end: Date | null;
  minDate?: Date | null;      // ограничение снизу; не задано — можно выбрать и прошедшие даты
  locale: string;              // 'ru-RU' | 'uz-Latn-UZ' — язык календаря
}

export interface CalendarRangeResult {
  start: Date;
  end: Date;
}

export const CALENDAR_RANGE_DIALOG_CONFIG: MatDialogConfig = {
  width: '360px',
  maxWidth: '95vw',
  autoFocus: false
};

@Component({
  selector: 'app-calendar-range-dialog',
  imports: [MatDatepickerModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  providers: [
    provideNativeDateAdapter(),
    // Подсветка будущего интервала при наведении после выбора первой даты
    { provide: MAT_DATE_RANGE_SELECTION_STRATEGY, useClass: DefaultMatCalendarRangeStrategy }
  ],
  templateUrl: './calendar-range-dialog.html'
})
export class CalendarRangeDialog {
  protected readonly data = inject<CalendarRangeDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject<MatDialogRef<CalendarRangeDialog, CalendarRangeResult>>(MatDialogRef);
  private readonly dateAdapter = inject<DateAdapter<Date>>(DateAdapter);

  protected readonly range = signal(new DateRange<Date>(this.data.start, this.data.end));

  // Начальная дата, когда выбрана только она — для подсказки
  protected readonly startLabel = computed(() => {
    const { start, end } = this.range();
    if (!start || end) return '';
    return new Intl.DateTimeFormat(this.data.locale, { day: 'numeric', month: 'long' }).format(start);
  });

  constructor() {
    // Названия месяцев и дней недели на текущем языке
    this.dateAdapter.setLocale(this.data.locale);
  }

  protected onSelect(date: Date | null): void {
    if (!date) return;

    const { start, end } = this.range();

    // Начинаем новый интервал: если ещё нет начала, если интервал уже полный
    // или если кликнули раньше начала
    if (!start || end || date < start) {
      this.range.set(new DateRange<Date>(date, null));
      return;
    }

    // Вторая дата выбрана — применяем и закрываем
    this.range.set(new DateRange<Date>(start, date));
    this.dialogRef.close({ start, end: date });
  }
}
