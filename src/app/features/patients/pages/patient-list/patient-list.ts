import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PATIENT_STATUS_CLASSES, PATIENT_STATUSES, PatientStatus } from '../../../../shared/models/patient-status';
import { PATIENT_RATING_DOT, mockPatientRating } from '../../../../shared/models/patient-rating';
import { PatientsService } from '../../services/patients.service';
import { MatDialog } from '@angular/material/dialog';
import { PATIENT_DETAILS_DIALOG_CONFIG, PatientDetailsDialog, PatientDetailsDialogData } from '../../components/patient-details-dialog/patient-details-dialog';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

// Сколько пациентов на странице (ПК) и сколько добавляет «Показать ещё» (мобилка)
const PAGE_SIZE = 20;

// 'YYYY-MM-DD' → Date по местному времени
function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Полных лет на сегодня
function getAge(birthDate: string): number {
  const birth = fromDateKey(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hadBirthday = today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (!hadBirthday) age--;
  return age;
}

// «Ковалёв Максим Дмитриевич» → «КМ»
function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
}

@Component({
  selector: 'app-patient-list',
  imports: [ReactiveFormsModule, MatIconModule, TranslocoPipe],
  templateUrl: './patient-list.html'
})
export class PatientList {
  private readonly patientsService = inject(PatientsService);
  private readonly transloco = inject(TranslocoService);
  private readonly dialog = inject(MatDialog);

  private readonly lang = toSignal(this.transloco.langChanges$, {
    initialValue: this.transloco.getActiveLang()
  });

  private readonly locale = computed(() => LOCALES[this.lang()] ?? 'ru-RU');

  protected readonly total = computed(() => this.patientsService.patients().length);

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

  // Пациенты с учётом поиска (до фильтра по статусу) — для счётчиков в чипах
  private readonly searched = computed(() => {
    const text = this.query().trim().toLowerCase();
    const digits = this.query().replace(/\D/g, '');
    if (!text) return this.patientsService.patients();

    return this.patientsService.patients().filter(patient =>
      patient.fullName.toLowerCase().includes(text) ||
      (digits.length >= 2 && patient.phone.replace(/\D/g, '').includes(digits))
    );
  });

  // ---- Статусы ----

  // Пустой список — все статусы
  protected readonly selectedStatuses = signal<PatientStatus[]>([]);

  protected readonly statusChips = computed(() => {
    const selected = this.selectedStatuses();
    return PATIENT_STATUSES.map(status => ({
      status,
      key: `schedule.status.${status}`,
      count: this.searched().filter(patient => patient.status === status).length,
      active: selected.includes(status),
      activeClass: PATIENT_STATUS_CLASSES[status]
    }));
  });

  protected readonly allStatusesActive = computed(() => this.selectedStatuses().length === 0);

  protected toggleStatus(status: PatientStatus): void {
    this.selectedStatuses.update(list =>
      list.includes(status) ? list.filter(s => s !== status) : [...list, status]
    );
    this.resetPaging();
  }

  // Мобилка: статус выбирается в селекте ('' — все)
  protected onStatusSelect(value: string): void {
    this.selectedStatuses.set(value ? [value as PatientStatus] : []);
  }

  protected clearStatuses(): void {
    this.selectedStatuses.set([]);
    this.resetPaging();
  }

  // ---- Итоговый список: даты, возраст, статус, инициалы — всё считаем заранее ----

  private readonly filtered = computed(() => {
    const statuses = this.selectedStatuses();
    const dateFormat = new Intl.DateTimeFormat(this.locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
    // Короткая дата для мобильной карточки: «12 ноя.»
    const shortFormat = new Intl.DateTimeFormat(this.locale(), { day: 'numeric', month: 'short' });

    return this.searched()
      .filter(patient => statuses.length === 0 || statuses.includes(patient.status))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'ru'))
      .map(patient => ({
        ...patient,
        initials: getInitials(patient.fullName),
        age: getAge(patient.birthDate),
        statusKey: `schedule.status.${patient.status}`,
        statusClass: PATIENT_STATUS_CLASSES[patient.status],
        lastVisitLabel: patient.lastVisit ? dateFormat.format(fromDateKey(patient.lastVisit)) : '',
        nextVisitLabel: patient.nextVisit ? `${dateFormat.format(fromDateKey(patient.nextVisit))}, ${patient.nextVisitTime}` : '',
        nextVisitShort: patient.nextVisit ? shortFormat.format(fromDateKey(patient.nextVisit)) : '',
        ratingDot: PATIENT_RATING_DOT[patient.rating ?? mockPatientRating(patient.id)],
        ratingKey: `rating.${patient.rating ?? mockPatientRating(patient.id)}`
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

  // «Показано 21–40 из 45»
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
  protected readonly hasMore = computed(() => this.mobileLimit() < this.filteredCount());

  protected showMore(): void {
    this.mobileLimit.update(limit => limit + PAGE_SIZE);
  }

  private resetPaging(): void {
    this.page.set(1);
    this.mobileLimit.set(PAGE_SIZE);
  }

  protected openDetails(patientId: number): void {
    this.dialog.open<PatientDetailsDialog, PatientDetailsDialogData>(PatientDetailsDialog, {
      ...PATIENT_DETAILS_DIALOG_CONFIG,
      data: { patientId }
    });
  }
}
