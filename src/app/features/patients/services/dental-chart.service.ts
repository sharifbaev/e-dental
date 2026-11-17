import { Injectable, signal } from '@angular/core';
import { Patient } from '../models/patient.model';

export type ToothState = 'healthy' | 'caries' | 'filling' | 'rootCanal' | 'crown' | 'implant' | 'missing';

export const TOOTH_STATES: ToothState[] = ['healthy', 'caries', 'filling', 'rootCanal', 'crown', 'implant', 'missing'];

// Цвета состояний зуба (светлая и тёмная тема)
export const TOOTH_STATE_CLASSES: Record<ToothState, string> = {
  healthy: 'bg-surface border-line-strong text-soft',
  caries: 'bg-red-50 border-red-300 text-red-700 dark:bg-red-500/15 dark:border-red-500/40 dark:text-red-300',
  filling: 'bg-sky-50 border-sky-300 text-sky-700 dark:bg-sky-500/15 dark:border-sky-500/40 dark:text-sky-300',
  rootCanal: 'bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-violet-300',
  crown: 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-300',
  implant: 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300',
  missing: 'bg-page border-dashed border-line-strong text-subtle line-through'
};

// Нумерация FDI: верхняя челюсть 18…11 | 21…28, нижняя 48…41 | 31…38 (так зубы видит врач)
export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

type Chart = Record<number, ToothState>;

@Injectable({ providedIn: 'root' })
export class DentalChartService {
  // Зубная формула по пациентам: только зубы не в состоянии «здоров»
  // TODO: на API — GET/PATCH /patients/:id/dental-chart
  private readonly _charts = signal<Record<number, Chart>>({});

  readonly charts = this._charts.asReadonly();

  // Формула пациента. Первый раз — собираем из истории диагнозов (mock)
  chartOf(patient: Patient): Chart {
    return this._charts()[patient.id] ?? this.buildFromDiagnoses(patient);
  }

  setTooth(patient: Patient, tooth: number, state: ToothState): void {
    const chart = { ...this.chartOf(patient) };
    if (state === 'healthy') delete chart[tooth];
    else chart[tooth] = state;
    this._charts.update(all => ({ ...all, [patient.id]: chart }));
  }

  // Mock: зуб из диагноза — «лечится» → кариес, «вылечен» → пломба; плюс пара отметок по id пациента
  private buildFromDiagnoses(patient: Patient): Chart {
    const chart: Chart = {};
    for (const d of patient.diagnoses) {
      if (d.tooth) chart[d.tooth] = d.status === 'active' ? 'caries' : 'filling';
    }
    const extra: [number, ToothState][] = [[16, 'crown'], [46, 'rootCanal'], [38, 'missing'], [26, 'filling'], [36, 'implant']];
    const [tooth, state] = extra[patient.id % extra.length];
    chart[tooth] ??= state;
    return chart;
  }
}
