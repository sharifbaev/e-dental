import { NgTemplateOutlet } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Subscription, debounceTime, distinctUntilChanged, map } from 'rxjs';
import { SmsLogItem, SmsStatus, SmsType } from '../../models/sms.model';
import { SmsLogService } from '../../services/sms-log.service';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// Сколько SMS на странице (ПК) и сколько добавляет «Показать ещё» (мобилка)
const PAGE_SIZE = 20;

const STATUS_CLASSES: Record<SmsStatus, string> = {
  sent: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  failed: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300'
};

const TYPE_ICONS: Record<SmsType, string> = { reminder: 'event', birthday: 'cake' };

// Отправленные SMS: на ПК — таблица со страницами, на мобилке — карточки с «Показать ещё» (как «Пациенты»)
@Component({
  selector: 'app-sms-list',
  imports: [NgTemplateOutlet, ReactiveFormsModule, MatIconModule, TranslocoPipe],
  templateUrl: './sms-list.html'
})
export class SmsList {
  private readonly smsLog = inject(SmsLogService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });

  // ---- Фильтры ----

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly query = signal('');
  protected readonly status = signal<SmsStatus | null>(null);
  protected readonly type = signal<SmsType | null>(null);

  protected readonly statusChips: { value: SmsStatus | null; key: string }[] = [
    { value: null, key: 'sms.filters.allStatuses' },
    { value: 'sent', key: 'sms.status.sent' },
    { value: 'failed', key: 'sms.status.failed' }
  ];
  protected readonly typeChips: { value: SmsType | null; key: string }[] = [
    { value: null, key: 'sms.filters.allTypes' },
    { value: 'reminder', key: 'sms.type.reminder' },
    { value: 'birthday', key: 'sms.type.birthday' }
  ];

  protected readonly filtersActive = computed(() => this.status() !== null || this.type() !== null);
  protected readonly filtersOpen = signal(false);

  protected setStatus(value: SmsStatus | null): void {
    this.status.set(value);
    this.load(1);
  }

  protected setType(value: SmsType | null): void {
    this.type.set(value);
    this.load(1);
  }

  protected clearSearch(): void {
    this.searchControl.setValue('');
  }

  // ---- Данные ----

  private readonly items = signal<SmsLogItem[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loaded = signal(false);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);
  private request?: Subscription;

  constructor() {
    this.searchControl.valueChanges
      .pipe(map(value => value.trim()), debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(value => {
        this.query.set(value);
        this.load(1);
      });
    this.load(1);
    this.destroyRef.onDestroy(() => this.request?.unsubscribe());
  }

  // append — мобилка «Показать ещё»: следующая страница добавляется к списку; иначе список заменяется
  private load(page: number, append = false): void {
    this.request?.unsubscribe();
    this.loading.set(true);
    this.failed.set(false);
    this.request = this.smsLog
      .list({ page, size: PAGE_SIZE, q: this.query(), status: this.status() ?? undefined, type: this.type() ?? undefined })
      .subscribe({
        next: result => {
          this.items.update(list => (append ? [...list, ...result.items] : result.items));
          this.total.set(result.total);
          this.page.set(page);
          this.loaded.set(true);
          this.loading.set(false);
        },
        error: () => {
          this.loaded.set(true);
          this.loading.set(false);
          this.failed.set(true);
        }
      });
  }

  protected retry(): void {
    this.load(1);
  }

  // Готовые подписи: дата, тип, статус
  protected readonly rows = computed(() => {
    const locale = LOCALES[this.lang()] ?? 'ru-RU';
    const sentFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const visitFormat = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
    return this.items().map(sms => ({
      ...sms,
      sentLabel: sentFormat.format(new Date(sms.createdAt)),
      visitLabel: sms.appointmentDate
        ? `${visitFormat.format(new Date(`${sms.appointmentDate}T00:00`))}${sms.appointmentTime ? `, ${sms.appointmentTime}` : ''}`
        : '',
      typeKey: `sms.type.${sms.type}`,
      typeIcon: TYPE_ICONS[sms.type] ?? 'sms',
      statusKey: `sms.status.${sms.status}`,
      statusClass: STATUS_CLASSES[sms.status] ?? 'bg-page text-soft'
    }));
  });

  // Полный текст и причина ошибки — по нажатию на строку / карточку
  protected readonly expandedId = signal<number | null>(null);

  protected toggle(id: number): void {
    this.expandedId.update(current => (current === id ? null : id));
  }

  // ---- ПК: страницы ----

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  protected readonly shownFrom = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1));
  protected readonly shownTo = computed(() => Math.min(this.page() * PAGE_SIZE, this.total()));

  // Номера страниц вокруг текущей (не больше 7 кнопок)
  protected readonly pages = computed(() => {
    const total = this.totalPages();
    const start = Math.max(1, Math.min(this.page() - 3, total - 6));
    return Array.from({ length: Math.min(7, total) }, (_, i) => start + i);
  });

  protected goToPage(page: number): void {
    const target = Math.min(Math.max(page, 1), this.totalPages());
    if (target !== this.page()) this.load(target);
  }

  // ---- Мобилка: «Показать ещё» ----

  protected readonly hasMore = computed(() => this.items().length < this.total());

  protected showMore(): void {
    if (!this.loading()) this.load(this.page() + 1, true);
  }
}
