import { HttpClient } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { Debt, DebtDraft, Expense, ExpenseDraft } from '../models/finance.model';
import { AuthService } from '../../../core/auth/auth.service';
import { MAX_PAGE_SIZE, Page, api, params } from '../../../core/api/api';

// Расходы и долги клиники (/finance/expenses, /finance/debts). Списки грузятся целиком —
// фильтры и итоги считаются на экране. Врачу раздел недоступен
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _expenses = signal<Expense[]>([]);
  private readonly _debts = signal<Debt[]>([]);

  readonly expenses = this._expenses.asReadonly();
  readonly debts = this._debts.asReadonly();

  constructor() {
    effect(() => {
      const user = this.auth.user();
      untracked(() => {
        this._expenses.set([]);
        this._debts.set([]);
        if (user && user.role !== 'doctor') this.reload();
      });
    });
  }

  reload(): void {
    this.loadAll<Expense>('/finance/expenses', list => this._expenses.set(list));
    this.loadAll<Debt>('/finance/debts', list => this._debts.set(list));
  }

  // ---- Расходы ----

  addExpense(draft: ExpenseDraft): Observable<Expense> {
    return this.http.post<Expense>(api('/finance/expenses'), draft).pipe(
      tap(created => this._expenses.update(list => [created, ...list]))
    );
  }

  updateExpense(id: number, draft: ExpenseDraft): Observable<void> {
    return this.http.patch<Expense>(api(`/finance/expenses/${id}`), draft).pipe(
      tap(updated => this._expenses.update(list => list.map(e => (e.id === id ? updated : e)))),
      map(() => undefined)
    );
  }

  removeExpense(id: number): Observable<void> {
    return this.http.delete<void>(api(`/finance/expenses/${id}`)).pipe(
      tap(() => this._expenses.update(list => list.filter(e => e.id !== id)))
    );
  }

  // ---- Долги ----

  addDebt(draft: DebtDraft): Observable<Debt> {
    return this.http.post<Debt>(api('/finance/debts'), cleanDebt(draft)).pipe(
      tap(created => this._debts.update(list => [created, ...list]))
    );
  }

  updateDebt(id: number, draft: DebtDraft): Observable<void> {
    return this.http.patch<Debt>(api(`/finance/debts/${id}`), cleanDebt(draft)).pipe(
      tap(updated => this._debts.update(list => list.map(d => (d.id === id ? updated : d)))),
      map(() => undefined)
    );
  }

  removeDebt(id: number): Observable<void> {
    return this.http.delete<void>(api(`/finance/debts/${id}`)).pipe(
      tap(() => this._debts.update(list => list.filter(d => d.id !== id)))
    );
  }

  // Все страницы списка подряд
  private loadAll<T>(path: string, done: (list: T[]) => void): void {
    const all: T[] = [];
    const loadPage = (page: number): void => {
      this.http.get<Page<T>>(api(path), { params: params({ page, size: MAX_PAGE_SIZE }) }).subscribe({
        next: result => {
          all.push(...result.items);
          if (page * result.size < result.total && result.items.length) loadPage(page + 1);
          else done(all);
        },
        error: () => undefined
      });
    };
    loadPage(1);
  }
}

// Пустой срок погашения сервер ждёт как отсутствующее поле, а не пустую строку
function cleanDebt(draft: DebtDraft): Partial<DebtDraft> {
  const { dueDate, ...rest } = draft;
  return dueDate ? draft : rest;
}
