import { catchError, of } from 'rxjs';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../../core/auth/auth.service';
import { DashboardPrefsService } from '../../services/dashboard-prefs.service';
import { DashboardService } from '../../services/dashboard.service';

// «Ковалёв Максим Дмитриевич» → «КМ», «Савина А. И.» → «СА»
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
  selector: 'app-patients-today-dialog',
  imports: [ReactiveFormsModule, MatAutocompleteModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './patients-today-dialog.html',
  // Компонент на всю высоту окна: шапка и фильтр сверху, список занимает остальное
  host: { class: 'flex flex-col h-full' }
})
export class PatientsTodayDialog {
  private readonly dashboardService = inject(DashboardService);
  private readonly auth = inject(AuthService);

  private readonly prefs = inject(DashboardPrefsService);

  // Врач видит только своих — фильтр по врачам скрыт, если в настройках не включено «Показывать других врачей»
  protected readonly isDoctor = computed(() => this.auth.user()?.role === 'doctor');
  protected readonly showDoctorFilter = computed(() => !this.isDoctor() || this.prefs.showOtherDoctors());

  private readonly patients = toSignal(this.dashboardService.getTodayPatients().pipe(catchError(() => of([]))));

  protected readonly loading = computed(() => this.patients() === undefined);

  // ---- Фильтр по врачу ----

  // Выбранный врач: '' — все врачи; врачу сразу подставляем его самого
  protected readonly selectedDoctor = signal<string>(this.auth.user()?.role === 'doctor' ? this.auth.user()?.doctorName ?? '' : '');

  // Текст в поле поиска врача
  protected readonly doctorControl = new FormControl<string>('', { nonNullable: true });
  private readonly doctorQuery = toSignal(this.doctorControl.valueChanges, { initialValue: '' });

  // Врачи из записей на сегодня с количеством пациентов, по алфавиту
  private readonly doctors = computed(() => {
    const counts = new Map<string, number>();
    for (const patient of this.patients() ?? []) {
      counts.set(patient.doctorName, (counts.get(patient.doctorName) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  });

  // Врачи для выпадающего списка с учётом поиска
  protected readonly filteredDoctors = computed(() => {
    const query = this.doctorQuery().trim().toLowerCase();

    // Пустой запрос или в поле уже стоит выбранный врач — показываем всех
    if (!query || query === this.selectedDoctor().toLowerCase()) {
      return this.doctors();
    }
    return this.doctors().filter(doctor => doctor.name.toLowerCase().includes(query));
  });

  // Пациенты с учётом фильтра, инициалы считаем заранее, а не вызовом функции в шаблоне
  protected readonly items = computed(() => {
    const selected = this.selectedDoctor();

    return (this.patients() ?? [])
      .filter(patient => !selected || patient.doctorName === selected)
      .map(patient => ({
        ...patient,
        initials: getInitials(patient.fullName),
        doctorInitials: getInitials(patient.doctorName)
      }));
  });

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
