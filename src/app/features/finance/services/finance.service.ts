import { Injectable, signal } from '@angular/core';
import { Observable, delay, map, of, tap } from 'rxjs';
import { toDateKey } from '../../schedule/services/schedule.service';
import { Debt, DebtDraft, Expense, ExpenseDraft } from '../models/finance.model';

const EXPENSES_KEY = 'e-dental.expenses';
const DEBTS_KEY = 'e-dental.debts';

// Имитация задержки ответа сервера
const MOCK_DELAY_MS = 300;

// Дата на N дней от сегодня
function daysFromToday(days: number): string {
  const d = new Date();
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + days));
}

function mockExpenses(): Expense[] {
  return [
    { id: 1, date: daysFromToday(-1), category: 'materials', description: 'Пломбировочный материал Filtek', amount: 1_850_000, method: 'transfer' },
    { id: 2, date: daysFromToday(-3), category: 'utilities', description: 'Электричество и вода', amount: 960_000, method: 'transfer' },
    { id: 3, date: daysFromToday(-5), category: 'salary', description: 'Аванс ассистентам', amount: 6_000_000, method: 'card' },
    { id: 4, date: daysFromToday(-8), category: 'rent', description: 'Аренда помещения', amount: 12_000_000, method: 'transfer' },
    { id: 5, date: daysFromToday(-10), category: 'marketing', description: 'Реклама в Instagram', amount: 1_200_000, method: 'card' },
    { id: 6, date: daysFromToday(-12), category: 'equipment', description: 'Наконечник турбинный NSK', amount: 3_400_000, method: 'cash' },
    { id: 7, date: daysFromToday(-15), category: 'other', description: 'Канцтовары для ресепшена', amount: 180_000, method: 'cash' }
  ];
}

function mockDebts(): Debt[] {
  return [
    { id: 1, direction: 'incoming', counterparty: 'Ковалёв Максим Дмитриевич', phone: '+998 93 555-12-34', date: daysFromToday(-6), dueDate: daysFromToday(7), amount: 450_000, paid: 150_000, note: 'Лечение кариеса, остаток' },
    { id: 2, direction: 'incoming', counterparty: 'Турсунов Жасур Алишерович', phone: '+998 91 444-78-90', date: daysFromToday(-20), dueDate: daysFromToday(-2), amount: 800_000, paid: 0, note: 'Удаление и гигиена' },
    { id: 3, direction: 'outgoing', counterparty: 'Зуботехническая лаборатория «Дента-Лаб»', phone: '+998 71 200-30-40', date: daysFromToday(-4), dueDate: daysFromToday(10), amount: 2_500_000, paid: 1_000_000, note: 'Коронки, партия за месяц' },
    { id: 4, direction: 'outgoing', counterparty: 'ООО «МедСнаб»', phone: '+998 71 150-60-70', date: daysFromToday(-30), dueDate: daysFromToday(-10), amount: 1_200_000, paid: 1_200_000, note: 'Расходные материалы' }
  ];
}

// Расходы и долги клиники
// TODO: на API — /finance/expenses и /finance/debts. Пока храним в браузере
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly _expenses = signal<Expense[]>(read(EXPENSES_KEY, mockExpenses));
  private readonly _debts = signal<Debt[]>(read(DEBTS_KEY, mockDebts));

  readonly expenses = this._expenses.asReadonly();
  readonly debts = this._debts.asReadonly();

  // ---- Расходы ----

  addExpense(draft: ExpenseDraft): Observable<Expense> {
    const expense: Expense = { ...draft, id: Date.now() };
    return of(expense).pipe(delay(MOCK_DELAY_MS), tap(created => this.setExpenses([created, ...this._expenses()])));
  }

  updateExpense(id: number, draft: ExpenseDraft): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this.setExpenses(this._expenses().map(e => (e.id === id ? { ...draft, id } : e)))),
      map(() => undefined)
    );
  }

  removeExpense(id: number): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this.setExpenses(this._expenses().filter(e => e.id !== id))),
      map(() => undefined)
    );
  }

  // ---- Долги ----

  addDebt(draft: DebtDraft): Observable<Debt> {
    const debt: Debt = { ...draft, id: Date.now() };
    return of(debt).pipe(delay(MOCK_DELAY_MS), tap(created => this.setDebts([created, ...this._debts()])));
  }

  updateDebt(id: number, draft: DebtDraft): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this.setDebts(this._debts().map(d => (d.id === id ? { ...draft, id } : d)))),
      map(() => undefined)
    );
  }

  removeDebt(id: number): Observable<void> {
    return of(undefined).pipe(
      delay(MOCK_DELAY_MS),
      tap(() => this.setDebts(this._debts().filter(d => d.id !== id))),
      map(() => undefined)
    );
  }

  private setExpenses(list: Expense[]): void {
    this._expenses.set(list);
    write(EXPENSES_KEY, list);
  }

  private setDebts(list: Debt[]): void {
    this._debts.set(list);
    write(DEBTS_KEY, list);
  }
}

function read<T>(key: string, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // повреждённые данные — берём демо-данные
  }
  return fallback();
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage недоступен — данные действуют до перезагрузки
  }
}
