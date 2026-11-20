import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { DashboardService } from '../../services/dashboard.service';
import { NgTemplateOutlet } from '@angular/common';

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
  selector: 'app-shift-doctors-dialog',
  imports: [NgTemplateOutlet, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './shift-doctors-dialog.html',
  // Компонент на всю высоту окна: шапка и поиск сверху, список занимает остальное
  host: { class: 'flex flex-col h-full' }
})
export class ShiftDoctorsDialog {
  private readonly dashboardService = inject(DashboardService);

  private readonly doctors = toSignal(this.dashboardService.getShiftDoctors());

  protected readonly loading = computed(() => this.doctors() === undefined);

  // ---- Поиск по имени или специальности ----

  protected readonly searchControl = new FormControl<string>('', { nonNullable: true });
  protected readonly query = toSignal(this.searchControl.valueChanges, { initialValue: '' });

  // Врачи с учётом поиска, по алфавиту, инициалы считаем заранее
  private readonly items = computed(() => {
    const query = this.query().trim().toLowerCase();

    return (this.doctors() ?? [])
      .filter(doctor =>
        !query ||
        doctor.name.toLowerCase().includes(query) ||
        doctor.specialty.toLowerCase().includes(query)
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
      .map(doctor => ({ ...doctor, initials: getInitials(doctor.name) }));
  });

  protected readonly onShift = computed(() => this.items().filter(doctor => doctor.onShift));
  protected readonly offShift = computed(() => this.items().filter(doctor => !doctor.onShift));

  // Счётчик у заголовка: сколько на смене из общего числа (без учёта поиска)
  protected readonly onShiftTotal = computed(() => (this.doctors() ?? []).filter(d => d.onShift).length);
  protected readonly total = computed(() => (this.doctors() ?? []).length);

  protected clearSearch(): void {
    this.searchControl.setValue('');
  }
}
