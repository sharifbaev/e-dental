import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Observable, filter, switchMap } from 'rxjs';
import { CONFIRM_DIALOG_CONFIG, ConfirmDialog, ConfirmDialogData } from '../../shared/components/confirm-dialog/confirm-dialog';
import { FeedbackService } from '../../shared/services/feedback.service';
import { formatMoney } from '../payments/services/payments.service';
import { toDateKey } from '../schedule/services/schedule.service';
import { DEBT_FORM_DIALOG_CONFIG, DebtFormData, DebtFormDialog } from './components/debt-form-dialog/debt-form-dialog';
import { EXPENSE_FORM_DIALOG_CONFIG, ExpenseFormData, ExpenseFormDialog } from './components/expense-form-dialog/expense-form-dialog';
import {
  DEBT_DIRECTIONS, DEBT_STATUSES, DEBT_STATUS_CLASSES, Debt, DebtDirection, DebtDraft, DebtStatus,
  EXPENSE_CATEGORIES, Expense, ExpenseCategory, ExpenseDraft, FINANCE_METHODS, FinanceMethod, debtStatus
} from './models/finance.model';
import { FinanceService } from './services/finance.service';

const LOCALES: Record<string, string> = { ru: 'ru-RU', uz: 'uz-Latn-UZ' };

type Tab = 'expenses' | 'debts';

// Иконки категорий расходов
const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  rent: 'apartment',
  salary: 'badge',
  materials: 'inventory_2',
  equipment: 'precision_manufacturing',
  utilities: 'bolt',
  marketing: 'campaign',
  other: 'more_horiz'
};

// 'YYYY-MM-DD' → Date по местному времени
function fromDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

@Component({
  selector: 'app-finance',
  imports: [MatIconModule, TranslocoPipe],
  templateUrl: './finance.html'
})
export class Finance {
  private readonly financeService = inject(FinanceService);
  private readonly dialog = inject(MatDialog);
  private readonly feedback = inject(FeedbackService);
  private readonly transloco = inject(TranslocoService);

  private readonly lang = toSignal(this.transloco.langChanges$, { initialValue: this.transloco.getActiveLang() });
  private readonly locale = computed(() => LOCALES[this.lang()] ?? 'ru-RU');
  private readonly dateFormat = computed(() => new Intl.DateTimeFormat(this.locale(), { day: '2-digit', month: '2-digit', year: 'numeric' }));

  protected money(value: number): string {
    return formatMoney(value, this.locale());
  }

  // ---- Вкладки ----

  protected readonly tab = signal<Tab>('expenses');

  protected readonly tabs: { id: Tab; key: string; icon: string }[] = [
    { id: 'expenses', key: 'finance.tabs.expenses', icon: 'receipt_long' },
    { id: 'debts', key: 'finance.tabs.debts', icon: 'account_balance_wallet' }
  ];

  // Сколько карточек показываем на мобилке («Показать ещё»)
  private static readonly MOBILE_PAGE = 10;
  protected readonly mobileLimit = signal(Finance.MOBILE_PAGE);

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
    this.mobileLimit.set(Finance.MOBILE_PAGE);
  }

  protected showMore(): void {
    this.mobileLimit.update(limit => limit + Finance.MOBILE_PAGE);
  }

  // Модалка фильтров (ПК и мобилка)
  protected readonly filtersOpen = signal(false);

  // ---- Расходы: фильтры ----

  protected readonly categories = EXPENSE_CATEGORIES;
  protected readonly methods = FINANCE_METHODS;
  protected readonly categoryIcons = CATEGORY_ICONS;

  protected readonly expenseQuery = signal('');
  protected readonly expenseCategory = signal<ExpenseCategory | ''>('');
  protected readonly expenseMethod = signal<FinanceMethod | ''>('');
  protected readonly expenseFrom = signal('');
  protected readonly expenseTo = signal('');

  protected readonly expenseFiltersCount = computed(() =>
    [this.expenseQuery(), this.expenseCategory(), this.expenseMethod(), this.expenseFrom(), this.expenseTo()].filter(Boolean).length
  );

  protected resetExpenseFilters(): void {
    this.expenseQuery.set('');
    this.expenseCategory.set('');
    this.expenseMethod.set('');
    this.expenseFrom.set('');
    this.expenseTo.set('');
  }

  protected readonly expenses = computed(() => {
    const query = this.expenseQuery().trim().toLowerCase();
    const category = this.expenseCategory();
    const method = this.expenseMethod();
    const from = this.expenseFrom();
    const to = this.expenseTo();
    const format = this.dateFormat();

    return this.financeService.expenses()
      .filter(e =>
        (!query || e.description.toLowerCase().includes(query)) &&
        (!category || e.category === category) &&
        (!method || e.method === method) &&
        (!from || e.date >= from) &&
        (!to || e.date <= to)
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map(e => ({
        ...e,
        dateLabel: format.format(fromDateKey(e.date)),
        amountLabel: this.money(e.amount),
        categoryKey: `finance.categories.${e.category}`,
        methodKey: `finance.methods.${e.method}`,
        icon: CATEGORY_ICONS[e.category]
      }));
  });

  protected readonly expensesTotal = computed(() => this.money(this.expenses().reduce((sum, e) => sum + e.amount, 0)));

  // ---- Долги: фильтры ----

  protected readonly directions = DEBT_DIRECTIONS;
  protected readonly debtStatuses = DEBT_STATUSES;

  protected readonly debtQuery = signal('');
  protected readonly debtDirection = signal<DebtDirection | ''>('');
  protected readonly debtStatusFilter = signal<DebtStatus | ''>('');
  protected readonly debtFrom = signal('');
  protected readonly debtTo = signal('');

  protected readonly debtFiltersCount = computed(() =>
    [this.debtQuery(), this.debtDirection(), this.debtStatusFilter(), this.debtFrom(), this.debtTo()].filter(Boolean).length
  );

  protected resetDebtFilters(): void {
    this.debtQuery.set('');
    this.debtDirection.set('');
    this.debtStatusFilter.set('');
    this.debtFrom.set('');
    this.debtTo.set('');
  }

  protected readonly debts = computed(() => {
    const query = this.debtQuery().trim().toLowerCase();
    const direction = this.debtDirection();
    const status = this.debtStatusFilter();
    const from = this.debtFrom();
    const to = this.debtTo();
    const today = toDateKey(new Date());
    const format = this.dateFormat();

    const digits = query.replace(/\D/g, '');
    const matches = (d: Debt) =>
      d.counterparty.toLowerCase().includes(query) ||
      d.note.toLowerCase().includes(query) ||
      (digits.length >= 2 && d.phone.replace(/\D/g, '').includes(digits));

    return this.financeService.debts()
      .map(d => ({ ...d, status: debtStatus(d, today) }))
      .filter(d =>
        (!query || matches(d)) &&
        (!direction || d.direction === direction) &&
        (!status || d.status === status) &&
        (!from || d.date >= from) &&
        (!to || d.date <= to)
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
      .map(d => ({
        ...d,
        dateLabel: format.format(fromDateKey(d.date)),
        dueLabel: d.dueDate ? format.format(fromDateKey(d.dueDate)) : '',
        amountLabel: this.money(d.amount),
        paidLabel: this.money(d.paid),
        remaining: Math.max(d.amount - d.paid, 0),
        remainingLabel: this.money(Math.max(d.amount - d.paid, 0)),
        directionKey: `finance.directions.${d.direction}`,
        statusKey: `finance.statuses.${d.status}`,
        statusClass: DEBT_STATUS_CLASSES[d.status]
      }));
  });

  // Итоги по отфильтрованным долгам: нам должны и мы должны (остаток)
  protected readonly debtTotals = computed(() => {
    let incoming = 0;
    let outgoing = 0;
    for (const d of this.debts()) {
      if (d.direction === 'incoming') incoming += d.remaining;
      else outgoing += d.remaining;
    }
    return { incoming: this.money(incoming), outgoing: this.money(outgoing) };
  });

  // ---- CRUD ----

  protected add(): void {
    if (this.tab() === 'expenses') this.openExpense();
    else this.openDebt();
  }

  protected openExpense(expense?: Expense): void {
    this.dialog
      .open<ExpenseFormDialog, ExpenseFormData, ExpenseDraft>(ExpenseFormDialog, { ...EXPENSE_FORM_DIALOG_CONFIG, data: { expense } })
      .afterClosed()
      .pipe(
        filter((draft): draft is ExpenseDraft => !!draft),
        switchMap((draft): Observable<unknown> => expense ? this.financeService.updateExpense(expense.id, draft) : this.financeService.addExpense(draft))
      )
      .subscribe({
        next: () => this.feedback.success(expense ? 'feedback.updated' : 'finance.feedback.saved'),
        error: err => this.feedback.error(err)
      });
  }

  protected removeExpense(expense: Expense): void {
    this.confirmDelete('finance.expenses.deleteMessage', { name: expense.description })
      .pipe(switchMap(() => this.financeService.removeExpense(expense.id)))
      .subscribe({
        next: () => this.feedback.success('finance.feedback.deleted'),
        error: err => this.feedback.error(err)
      });
  }

  protected openDebt(debt?: Debt): void {
    this.dialog
      .open<DebtFormDialog, DebtFormData, DebtDraft>(DebtFormDialog, { ...DEBT_FORM_DIALOG_CONFIG, data: { debt } })
      .afterClosed()
      .pipe(
        filter((draft): draft is DebtDraft => !!draft),
        switchMap((draft): Observable<unknown> => debt ? this.financeService.updateDebt(debt.id, draft) : this.financeService.addDebt(draft))
      )
      .subscribe({
        next: () => this.feedback.success(debt ? 'feedback.updated' : 'finance.feedback.saved'),
        error: err => this.feedback.error(err)
      });
  }

  protected removeDebt(debt: Debt): void {
    this.confirmDelete('finance.debts.deleteMessage', { name: debt.counterparty })
      .pipe(switchMap(() => this.financeService.removeDebt(debt.id)))
      .subscribe({
        next: () => this.feedback.success('finance.feedback.deleted'),
        error: err => this.feedback.error(err)
      });
  }

  private confirmDelete(messageKey: string, messageParams: Record<string, unknown>): Observable<boolean> {
    return this.dialog
      .open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, {
        ...CONFIRM_DIALOG_CONFIG,
        data: {
          titleKey: 'finance.deleteTitle',
          messageKey,
          messageParams,
          confirmKey: 'finance.delete',
          cancelKey: 'common.cancel',
          danger: true
        }
      })
      .afterClosed()
      .pipe(filter((ok): ok is boolean => !!ok));
  }
}
