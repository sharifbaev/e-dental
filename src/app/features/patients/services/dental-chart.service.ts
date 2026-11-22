import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, tap, throwError } from 'rxjs';
import { api } from '../../../core/api/api';
import { Patient } from '../models/patient.model';
import { HEALTHY_STATE_ID } from '../../../shared/services/tooth-states.service';

// Состояние зуба — id из справочника «Состояния зубов» (Настройки → Справочники)
export type ToothState = string;

// Нумерация FDI: верхняя челюсть 18…11 | 21…28, нижняя 48…41 | 31…38 (так зубы видит врач)
export const UPPER_TEETH = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
export const LOWER_TEETH = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

// Молочные зубы (дети): верхняя 55…51 | 61…65, нижняя 85…81 | 71…75
export const UPPER_CHILD_TEETH = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65];
export const LOWER_CHILD_TEETH = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75];

type Chart = Record<number, ToothState>;

@Injectable({ providedIn: 'root' })
export class DentalChartService {
  private readonly http = inject(HttpClient);

  // Зубная формула по пациентам: только зубы не в состоянии «здоров» (GET/PATCH /patients/:id/dental-chart)
  private readonly _charts = signal<Record<number, Chart>>({});

  readonly charts = this._charts.asReadonly();

  // Формула пациента; пока не загружена — пустая
  chartOf(patient: Patient): Chart {
    return this._charts()[patient.id] ?? {};
  }

  load(patientId: number): void {
    this.http.get<Record<string, ToothState>>(api(`/patients/${patientId}/dental-chart`)).subscribe({
      next: chart => this._charts.update(all => ({ ...all, [patientId]: toChart(chart) })),
      error: () => undefined
    });
  }

  // Сразу показываем новое состояние; сервер не принял — возвращаем прежнее
  setTooth(patient: Patient, tooth: number, state: ToothState): Observable<void> {
    const before = this.chartOf(patient);
    const chart = { ...before };
    if (state === HEALTHY_STATE_ID) delete chart[tooth];
    else chart[tooth] = state;
    this._charts.update(all => ({ ...all, [patient.id]: chart }));

    return this.http.patch<Record<string, ToothState>>(api(`/patients/${patient.id}/dental-chart`), { [tooth]: state }).pipe(
      tap(saved => this._charts.update(all => ({ ...all, [patient.id]: toChart(saved) }))),
      catchError(error => {
        this._charts.update(all => ({ ...all, [patient.id]: before }));
        return throwError(() => error);
      }),
      map(() => undefined)
    );
  }
}

function toChart(raw: Record<string, ToothState>): Chart {
  const chart: Chart = {};
  for (const [tooth, state] of Object.entries(raw ?? {})) chart[Number(tooth)] = state;
  return chart;
}
