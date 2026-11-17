import { Component, computed, inject, input, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import { Patient } from '../../models/patient.model';
import {
  DentalChartService,
  LOWER_TEETH,
  TOOTH_STATES,
  TOOTH_STATE_CLASSES,
  ToothState,
  UPPER_TEETH
} from '../../services/dental-chart.service';

// Зубная формула: 32 зуба по схеме FDI. Клик по зубу — выбор состояния, сохраняется сразу
@Component({
  selector: 'app-dental-chart',
  imports: [NgTemplateOutlet, MatIconModule, TranslocoPipe],
  templateUrl: './dental-chart.html'
})
export class DentalChart {
  private readonly chartService = inject(DentalChartService);

  readonly patient = input.required<Patient>();
  readonly readonly = input(false);

  private readonly chart = computed(() => this.chartService.chartOf(this.patient()));

  protected readonly selectedTooth = signal<number | null>(null);

  private toTooth(number: number) {
    const state: ToothState = this.chart()[number] ?? 'healthy';
    return { number, state, classes: TOOTH_STATE_CLASSES[state], key: `dentalChart.states.${state}` };
  }

  // Левая и правая половины каждой челюсти — между ними разделитель
  protected readonly upper = computed(() => [UPPER_TEETH.slice(0, 8), UPPER_TEETH.slice(8)].map(half => half.map(n => this.toTooth(n))));
  protected readonly lower = computed(() => [LOWER_TEETH.slice(0, 8), LOWER_TEETH.slice(8)].map(half => half.map(n => this.toTooth(n))));

  protected readonly legend = TOOTH_STATES.map(state => ({ state, classes: TOOTH_STATE_CLASSES[state], key: `dentalChart.states.${state}` }));

  // Счётчик отмеченных зубов (не «здоров»)
  protected readonly marked = computed(() => Object.keys(this.chart()).length);

  protected readonly selectedState = computed(() => {
    const tooth = this.selectedTooth();
    return tooth ? this.chart()[tooth] ?? 'healthy' : null;
  });

  protected selectTooth(number: number): void {
    if (this.readonly()) return;
    this.selectedTooth.update(current => (current === number ? null : number));
  }

  protected setState(state: ToothState): void {
    const tooth = this.selectedTooth();
    if (!tooth) return;
    this.chartService.setTooth(this.patient(), tooth, state);
  }
}
