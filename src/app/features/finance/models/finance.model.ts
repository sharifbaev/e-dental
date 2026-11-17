// Финансы клиники: расходы и долги

export type ExpenseCategory = 'rent' | 'salary' | 'materials' | 'equipment' | 'utilities' | 'marketing' | 'other';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['rent', 'salary', 'materials', 'equipment', 'utilities', 'marketing', 'other'];

export type FinanceMethod = 'cash' | 'card' | 'transfer';

export const FINANCE_METHODS: FinanceMethod[] = ['cash', 'card', 'transfer'];

export interface Expense {
  id: number;
  date: string;                // 'YYYY-MM-DD'
  category: ExpenseCategory;
  description: string;
  amount: number;              // сум
  method: FinanceMethod;
}

export type ExpenseDraft = Omit<Expense, 'id'>;

// incoming — нам должны (пациент, партнёр); outgoing — должны мы (поставщик, лаборатория)
export type DebtDirection = 'incoming' | 'outgoing';

export const DEBT_DIRECTIONS: DebtDirection[] = ['incoming', 'outgoing'];

// Статус считается из сумм и срока: open — не оплачен, partial — частично, overdue — срок прошёл, closed — погашен
export type DebtStatus = 'open' | 'partial' | 'overdue' | 'closed';

export const DEBT_STATUSES: DebtStatus[] = ['open', 'partial', 'overdue', 'closed'];

export const DEBT_STATUS_CLASSES: Record<DebtStatus, string> = {
  open: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  partial: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  overdue: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300',
  closed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
};

export interface Debt {
  id: number;
  direction: DebtDirection;
  counterparty: string;        // кто должен / кому должны
  phone: string;
  date: string;                // 'YYYY-MM-DD' — когда возник долг
  dueDate: string;             // 'YYYY-MM-DD' — срок погашения, может быть пустым
  amount: number;              // сумма долга, сум
  paid: number;                // уже погашено, сум
  note: string;
}

export type DebtDraft = Omit<Debt, 'id'>;

export function debtStatus(debt: Debt, today: string): DebtStatus {
  if (debt.paid >= debt.amount) return 'closed';
  if (debt.dueDate && debt.dueDate < today) return 'overdue';
  return debt.paid > 0 ? 'partial' : 'open';
}
