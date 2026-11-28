import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { Diagnosis, DiagnosisDraft, Patient } from '../models/patient.model';
import { AuthService } from '../../../core/auth/auth.service';
import { MAX_PAGE_SIZE, Page, api, params } from '../../../core/api/api';

// Как часто перезагружать список — статусы пациентов меняются вместе с приёмами
const RELOAD_MS = 120_000;

// Пациенты клиники (GET /patients). Список грузится целиком (постранично по 100) —
// поиск, фильтры и сортировка остаются на экране. Врачу сервер отдаёт только его пациентов
@Injectable({ providedIn: 'root' })
export class PatientsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _patients = signal<Patient[]>([]);

  readonly patients = this._patients.asReadonly();
  readonly loading = signal(false);
  // Список уже загружен хотя бы раз — до этого показываем скелетон, а не «Пациентов нет»
  readonly loaded = signal(false);

  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      untracked(() => {
        this._patients.set([]);
        this.loaded.set(false);
        if (userId) this.reload();
      });
    });
    setInterval(() => this.reload(), RELOAD_MS);
  }

  reload(): void {
    if (!this.auth.isAuthenticated()) return;
    this.loading.set(true);
    const all: Patient[] = [];
    const loadPage = (page: number): void => {
      this.http.get<Page<Patient>>(api('/patients'), { params: params({ page, size: MAX_PAGE_SIZE }) }).subscribe({
        next: result => {
          all.push(...result.items);
          if (page * result.size < result.total && result.items.length) {
            loadPage(page + 1);
            return;
          }
          // Диагнозы уже открытых карточек не теряем
          const details = new Map(this._patients().filter(p => p.diagnoses).map(p => [p.id, p.diagnoses]));
          this._patients.set(all.map(p => (details.has(p.id) ? { ...p, diagnoses: details.get(p.id) } : p)));
          this.loading.set(false);
          this.loaded.set(true);
        },
        error: () => {
          this.loading.set(false);
          this.loaded.set(true);
        }
      });
    };
    loadPage(1);
  }

  // Карточка пациента — с диагнозами
  load(id: number): Observable<Patient> {
    return this.http.get<Patient>(api(`/patients/${id}`)).pipe(tap(patient => this.upsert(patient)));
  }

  update(id: number, changes: Partial<Patient>): Observable<void> {
    return this.http.patch<Patient>(api(`/patients/${id}`), changes).pipe(
      tap(updated => this.upsert(updated)),
      map(() => undefined)
    );
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(api(`/patients/${id}`)).pipe(
      tap(() => this._patients.update(list => list.filter(p => p.id !== id)))
    );
  }

  addDiagnosis(patientId: number, draft: DiagnosisDraft): Observable<Diagnosis> {
    return this.http.post<Diagnosis>(api(`/patients/${patientId}/diagnoses`), draft).pipe(
      tap(created => this.patchDiagnoses(patientId, list => [created, ...list]))
    );
  }

  updateDiagnosis(patientId: number, diagnosisId: number, draft: DiagnosisDraft): Observable<Diagnosis> {
    return this.http.patch<Diagnosis>(api(`/patients/${patientId}/diagnoses/${diagnosisId}`), draft).pipe(
      tap(updated => this.patchDiagnoses(patientId, list => list.map(d => (d.id === diagnosisId ? updated : d))))
    );
  }

  private patchDiagnoses(patientId: number, change: (list: Diagnosis[]) => Diagnosis[]): void {
    this._patients.update(list => list.map(p => (p.id === patientId ? { ...p, diagnoses: change(p.diagnoses ?? []) } : p)));
  }

  // Ответ сервера → в список; диагнозы сохраняем, если в ответе их нет
  private upsert(patient: Patient): void {
    this._patients.update(list => {
      const current = list.find(p => p.id === patient.id);
      const merged = { ...patient, diagnoses: patient.diagnoses ?? current?.diagnoses };
      return current ? list.map(p => (p.id === patient.id ? merged : p)) : [merged, ...list];
    });
  }
}
