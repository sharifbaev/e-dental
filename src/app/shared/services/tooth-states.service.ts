import { Injectable, signal } from '@angular/core';
import { Observable, delay, of, tap } from 'rxjs';

// Цвет состояния зуба — ключ из готовой палитры (светлая и тёмная тема)
export type ToothStateColor = 'none' | 'red' | 'sky' | 'violet' | 'amber' | 'emerald' | 'orange' | 'pink' | 'teal' | 'dashed';

export const TOOTH_COLOR_CLASSES: Record<ToothStateColor, string> = {
  none: 'bg-surface border-line-strong text-soft',
  red: 'bg-red-50 border-red-300 text-red-700 dark:bg-red-500/15 dark:border-red-500/40 dark:text-red-300',
  sky: 'bg-sky-50 border-sky-300 text-sky-700 dark:bg-sky-500/15 dark:border-sky-500/40 dark:text-sky-300',
  violet: 'bg-violet-50 border-violet-300 text-violet-700 dark:bg-violet-500/15 dark:border-violet-500/40 dark:text-violet-300',
  amber: 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-500/15 dark:border-amber-500/40 dark:text-amber-300',
  emerald: 'bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-300',
  orange: 'bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-500/15 dark:border-orange-500/40 dark:text-orange-300',
  pink: 'bg-pink-50 border-pink-300 text-pink-700 dark:bg-pink-500/15 dark:border-pink-500/40 dark:text-pink-300',
  teal: 'bg-teal-50 border-teal-300 text-teal-700 dark:bg-teal-500/15 dark:border-teal-500/40 dark:text-teal-300',
  dashed: 'bg-page border-dashed border-line-strong text-subtle line-through'
};

export const TOOTH_COLORS = Object.keys(TOOTH_COLOR_CLASSES) as ToothStateColor[];

// Базовое состояние «Здоров» — у зуба без отметки; удалить его нельзя
export const HEALTHY_STATE_ID = 'healthy';

// Состояние зуба. name пустое — стандартное название из переводов (dentalChart.states.<id>)
export interface ToothStateItem {
  id: string;
  name?: string;
  color: ToothStateColor;
}

export interface ToothStateDraft {
  name: string;
  color: ToothStateColor;
}

// Состояния по умолчанию — как были в зубной формуле
const DEFAULT_TOOTH_STATES: ToothStateItem[] = [
  { id: HEALTHY_STATE_ID, color: 'none' },
  { id: 'caries', color: 'red' },
  { id: 'filling', color: 'sky' },
  { id: 'rootCanal', color: 'violet' },
  { id: 'crown', color: 'amber' },
  { id: 'implant', color: 'emerald' },
  { id: 'missing', color: 'dashed' }
];

const STORAGE_KEY = 'e-dental.toothStates';

// Справочник «Состояния зубов» (Настройки → Справочники); используется в зубной формуле пациента.
// Хранится в браузере: на сервере пока только стандартные состояния (healthy, caries, filling, rootCanal,
// crown, implant, missing) — своё состояние сервер не сохранит в зубной формуле
@Injectable({ providedIn: 'root' })
export class ToothStatesService {
  private readonly _states = signal<ToothStateItem[]>(this.read());

  readonly states = this._states.asReadonly();

  // TODO: на API — POST /dictionaries/tooth-states
  add(draft: ToothStateDraft): Observable<ToothStateItem> {
    const item: ToothStateItem = { id: `custom-${Date.now()}`, name: draft.name, color: draft.color };
    return of(item).pipe(delay(200), tap(created => this.write([...this._states(), created])));
  }

  // TODO: на API — PATCH /dictionaries/tooth-states/:id
  update(id: string, draft: ToothStateDraft): Observable<ToothStateItem | undefined> {
    const list = this._states().map(s => (s.id === id ? { ...s, name: draft.name, color: draft.color } : s));
    return of(list.find(s => s.id === id)).pipe(delay(200), tap(() => this.write(list)));
  }

  // TODO: на API — DELETE /dictionaries/tooth-states/:id. «Здоров» не удаляется
  remove(id: string): Observable<void> {
    if (id === HEALTHY_STATE_ID) return of(undefined);
    return of(undefined).pipe(delay(200), tap(() => this.write(this._states().filter(s => s.id !== id))));
  }

  private write(list: ToothStateItem[]): void {
    this._states.set(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // localStorage недоступен — справочник действует до перезагрузки
    }
  }

  private read(): ToothStateItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as ToothStateItem[];
        if (Array.isArray(saved) && saved.some(s => s.id === HEALTHY_STATE_ID)) return saved;
      }
    } catch {
      // повреждённые данные — берём значения по умолчанию
    }
    return DEFAULT_TOOTH_STATES;
  }
}
