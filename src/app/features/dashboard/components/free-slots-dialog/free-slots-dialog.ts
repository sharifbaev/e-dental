import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../../core/auth/auth.service';
import { DashboardPrefsService } from '../../services/dashboard-prefs.service';
import { DoctorSlots } from '../../models/dashboard.model';

// Данные, которые передаёт главная при открытии модалки
export interface FreeSlotsDialogData {
  doctors: DoctorSlots[];
  selectedDoctorId: string;    // 'all' — все врачи, иначе doctorId
}

// TODO: получать длительность окна с API (у разных врачей может отличаться)
const SLOT_DURATION_MINUTES = 30;

// 'HH:mm' → минуты от начала дня
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

// минуты от начала дня → 'HH:mm'
function toTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
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
  selector: 'app-free-slots-dialog',
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './free-slots-dialog.html',
  // Компонент на всю высоту окна: шапка и фильтр сверху, список занимает остальное
  host: { class: 'flex flex-col h-full' }
})
export class FreeSlotsDialog {
  private readonly data = inject<FreeSlotsDialogData>(MAT_DIALOG_DATA);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  private readonly prefs = inject(DashboardPrefsService);

  // Врач видит только своих — фильтр по врачам скрыт, если в настройках не включено «Показывать других врачей»
  protected readonly isDoctor = computed(() => this.auth.user()?.role === 'doctor');
  protected readonly showDoctorFilter = computed(() => !this.isDoctor() || this.prefs.showOtherDoctors());

  // Текущее время — обновляется раз в минуту, чтобы прошедшие окна исчезали сами
  private readonly now = signal(new Date());

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  // Врачи только с оставшимися окнами (прошедшие отброшены), с интервалами и инициалами
  private readonly doctors = computed(() => {
    const nowMinutes = this.now().getHours() * 60 + this.now().getMinutes();

    return this.data.doctors
      .map(doctor => {
        const intervals = doctor.slots
          .map(toMinutes)
          .filter(start => start > nowMinutes)
          .sort((a, b) => a - b)
          .map(start => ({
            start: toTime(start),
            end: toTime(start + SLOT_DURATION_MINUTES)
          }));

        return {
          id: doctor.doctorId,
          name: doctor.doctorName,
          initials: getInitials(doctor.doctorName),
          intervals
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  });

  // ---- Фильтр по врачу ----

  // Выбранный врач по имени: '' — все врачи. Стартуем с врача, выбранного на главной
  protected readonly selectedDoctor = signal<string>(
    this.data.doctors.find(d => String(d.doctorId) === this.data.selectedDoctorId)?.doctorName ?? ''
  );

  // Текст в поле поиска врача — сразу подставляем выбранного
  protected readonly doctorControl = new FormControl<string>(this.selectedDoctor(), { nonNullable: true });
  private readonly doctorQuery = toSignal(this.doctorControl.valueChanges, { initialValue: this.selectedDoctor() });

  // Врачи для выпадающего списка с учётом поиска
  protected readonly filteredDoctors = computed(() => {
    const query = this.doctorQuery().trim().toLowerCase();

    // Пустой запрос или в поле уже стоит выбранный врач — показываем всех
    if (!query || query === this.selectedDoctor().toLowerCase()) {
      return this.doctors();
    }
    return this.doctors().filter(doctor => doctor.name.toLowerCase().includes(query));
  });

  // Блоки врачей для списка: при «Все врачи» скрываем тех, у кого окон не осталось
  protected readonly groups = computed(() => {
    const selected = this.selectedDoctor();

    if (selected) {
      return this.doctors().filter(doctor => doctor.name === selected && doctor.intervals.length > 0);
    }
    return this.doctors().filter(doctor => doctor.intervals.length > 0);
  });

  // Общее количество окон с учётом фильтра — для счётчика у заголовка
  protected readonly totalCount = computed(() =>
    this.groups().reduce((sum, doctor) => sum + doctor.intervals.length, 0)
  );

  protected onDoctorSelected(event: MatAutocompleteSelectedEvent): void {
    this.selectedDoctor.set(event.option.value as string);
  }

  // Поле очистили вручную — снова все врачи
  protected onDoctorInput(): void {
    if (!this.doctorControl.value.trim()) {
      this.selectedDoctor.set('');
    }
  }

  protected clearDoctor(): void {
    this.doctorControl.setValue('');
    this.selectedDoctor.set('');
  }
}
