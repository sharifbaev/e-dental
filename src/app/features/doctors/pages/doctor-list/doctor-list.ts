import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { filter, switchMap } from 'rxjs';
import { CONFIRM_DIALOG_CONFIG, ConfirmDialog, ConfirmDialogData } from '../../../../shared/components/confirm-dialog/confirm-dialog';
import { FeedbackService } from '../../../../shared/services/feedback.service';
import { DOCTOR_FORM_DIALOG_CONFIG, DoctorFormData, DoctorFormDialog } from '../../components/doctor-form-dialog/doctor-form-dialog';
import { DOCTOR_STATUS_CLASSES, DOCTOR_STATUSES, Doctor, DoctorDraft, DoctorStatus } from '../../models/doctor.model';
import { DoctorsService } from '../../services/doctors.service';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// Сколько врачей на странице (ПК) и сколько добавляет «Показать ещё» (мобилка)
const PAGE_SIZE = 20;

// «Сидоров Андрей Петрович» → «СА»
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
}

// [1,2,3,4,5] → «Пн–Пт», [1,3,5] → «Пн, Ср, Пт»
function formatWorkDays(days: number[], locale: string): string {
  const format = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  // 2024-01-01 — понедельник: берём его как точку отсчёта для названий дней
  const name = (day: number) => {
    const text = format.format(new Date(2024, 0, day)).replace('.', '');
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const sorted = [...days].sort((a, b) => a - b);
  const consecutive = sorted.every((day, i) => i === 0 || day === sorted[i - 1] + 1);

  if (sorted.length > 2 && consecutive) {
    return `${name(sorted[0])}–${name(sorted[sorted.length - 1])}`;
  }
  return sorted.map(name).join(', ');
}

@Component({
  selector: 'app-doctor-list',
  imports: [ReactiveFormsModule, MatIconModule, TranslocoPipe, NgTemplateOutlet],
  templateUrl: './doctor-list.html'
})
export class DoctorList {
  private readonly doctorsService = inject(DoctorsService);
  private readonly feedback = inject(FeedbackService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);

  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang()
  });

  private readonly locale = computed(() => LOCALES[this.lang()] ?? 'ru-RU');

  protected readonly total = computed(() => this.doctorsService.doctors().length);

  // ---- Поиск ----

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  protected readonly query = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  constructor() {
    // Новый поиск — с первой страницы
    this.searchControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.resetPaging());
  }

  protected clearSearch(): void {
    this.searchControl.setValue('');
  }

  // Врачи с учётом поиска (до фильтра по статусу) — для счётчиков в чипах
  private readonly searched = computed(() => {
    const text = this.query().trim().toLowerCase();
    const digits = this.query().replace(/\D/g, '');
    if (!text) return this.doctorsService.doctors();

    return this.doctorsService.doctors().filter(doctor =>
      doctor.fullName.toLowerCase().includes(text) ||
      doctor.specialty.toLowerCase().includes(text) ||
      (digits.length >= 2 && doctor.phone.replace(/\D/g, '').includes(digits))
    );
  });

  // ---- Статусы ----

  // Пустой список — все статусы
  protected readonly selectedStatuses = signal<DoctorStatus[]>([]);

  protected readonly statusChips = computed(() => {
    const selected = this.selectedStatuses();
    return DOCTOR_STATUSES.map(status => ({
      status,
      key: `doctors.status.${status}`,
      count: this.searched().filter(doctor => doctor.status === status).length,
      active: selected.includes(status),
      activeClass: DOCTOR_STATUS_CLASSES[status]
    }));
  });

  protected readonly allStatusesActive = computed(() => this.selectedStatuses().length === 0);

  // Мобилка: модалка фильтров (статусы); точка на кнопке — если фильтр включён
  protected readonly filtersOpen = signal(false);
  protected readonly filtersActive = computed(() => !this.allStatusesActive());

  protected toggleStatus(status: DoctorStatus): void {
    this.selectedStatuses.update(list =>
      list.includes(status) ? list.filter(s => s !== status) : [...list, status]
    );
    this.resetPaging();
  }

  // Мобилка: статус выбирается в селекте ('' — все)
  protected onStatusSelect(value: string): void {
    this.selectedStatuses.set(value ? [value as DoctorStatus] : []);
  }

  protected clearStatuses(): void {
    this.selectedStatuses.set([]);
    this.resetPaging();
  }

  // ---- Итоговый список: инициалы, график, статус — всё считаем заранее ----

  private readonly filtered = computed(() => {
    const statuses = this.selectedStatuses();
    const locale = this.locale();

    return this.searched()
      .filter(doctor => statuses.length === 0 || statuses.includes(doctor.status))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
      .map(doctor => ({
        ...doctor,
        initials: getInitials(doctor.fullName),
        workDaysLabel: formatWorkDays(doctor.workDays, locale),
        workHoursLabel: `${doctor.workStart}–${doctor.workEnd}`,
        statusKey: `doctors.status.${doctor.status}`,
        statusClass: DOCTOR_STATUS_CLASSES[doctor.status]
      }));
  });

  protected readonly filteredCount = computed(() => this.filtered().length);

  // ---- ПК: страницы ----

  private readonly page = signal(1);

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredCount() / PAGE_SIZE)));

  // Текущая страница не больше последней (если после фильтра страниц стало меньше)
  protected readonly currentPage = computed(() => Math.min(this.page(), this.totalPages()));

  protected readonly pageItems = computed(() => {
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.filtered().slice(start, start + PAGE_SIZE);
  });

  // «Показано 1–14 из 14»
  protected readonly shownFrom = computed(() => (this.filteredCount() === 0 ? 0 : (this.currentPage() - 1) * PAGE_SIZE + 1));
  protected readonly shownTo = computed(() => Math.min(this.currentPage() * PAGE_SIZE, this.filteredCount()));

  // Номера страниц для кнопок
  protected readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));

  protected goToPage(page: number): void {
    this.page.set(Math.min(Math.max(page, 1), this.totalPages()));
  }

  // ---- Мобилка: «Показать ещё» ----

  private readonly mobileLimit = signal(PAGE_SIZE);

  protected readonly mobileItems = computed(() => this.filtered().slice(0, this.mobileLimit()));

  // Мобилка: подробности врача — в нижней панели по нажатию на карточку
  private readonly detailsId = signal<number | null>(null);
  protected readonly detailsDoctor = computed(() => this.filtered().find(doctor => doctor.id === this.detailsId()) ?? null);

  protected openDetails(id: number): void {
    this.detailsId.set(id);
  }

  protected closeDetails(): void {
    this.detailsId.set(null);
  }
  protected readonly hasMore = computed(() => this.mobileLimit() < this.filteredCount());

  protected showMore(): void {
    this.mobileLimit.update(limit => limit + PAGE_SIZE);
  }

  private resetPaging(): void {
    this.page.set(1);
    this.mobileLimit.set(PAGE_SIZE);
  }

  // ---- Действия ----

  protected openCreate(): void {
    this.dialog
      .open<DoctorFormDialog, DoctorFormData, DoctorDraft>(DoctorFormDialog, DOCTOR_FORM_DIALOG_CONFIG)
      .afterClosed()
      .pipe(
        filter((draft): draft is DoctorDraft => !!draft),
        switchMap(draft => this.doctorsService.add(draft))
      )
      .subscribe({
        next: () => this.feedback.success('feedback.doctorCreated'),
        error: () => this.feedback.error()
      });
  }

  protected openEdit(doctor: Doctor): void {
    this.dialog
      .open<DoctorFormDialog, DoctorFormData, DoctorDraft>(DoctorFormDialog, {
        ...DOCTOR_FORM_DIALOG_CONFIG,
        data: { doctor }
      })
      .afterClosed()
      .pipe(
        filter((draft): draft is DoctorDraft => !!draft),
        switchMap(draft => this.doctorsService.update(doctor.id, draft))
      )
      .subscribe({
        next: () => this.feedback.success('feedback.doctorUpdated'),
        error: () => this.feedback.error()
      });
  }

  protected remove(doctor: Doctor): void {
    this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        ...CONFIRM_DIALOG_CONFIG,
        data: {
          titleKey: 'doctors.deleteDialog.title',
          messageKey: 'doctors.deleteDialog.message',
          messageParams: { name: doctor.fullName },
          confirmKey: 'doctors.deleteDialog.confirm',
          cancelKey: 'doctors.deleteDialog.back',
          danger: true
        }
      })
      .afterClosed()
      .pipe(
        filter(Boolean),
        switchMap(() => this.doctorsService.remove(doctor.id))
      )
      .subscribe({
        next: () => this.feedback.success('feedback.doctorDeleted'),
        error: () => this.feedback.error()
      });
  }
}
