export type TransactionType = 'income' | 'expense';

export type Category =
  | 'Food'
  | 'Transport'
  | 'Salary'
  | 'Rent'
  | 'Bills'
  | 'Shopping'
  | 'Health'
  | 'Savings'
  | 'Other';

export type BudgetPeriod = 'weekly' | 'monthly';

export type RecurringFrequency = 'weekly' | 'monthly';

export type CurrencyCode = 'USD' | 'GBP' | 'NGN' | 'EUR' | 'GHS' | 'KES' | 'ZAR';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: Category;
  note: string;
  date: string;
  createdAt: string;
  recurringId?: string;
}

export interface Budget {
  id: string;
  category: Category;
  amount: number;
  period: BudgetPeriod;
  createdAt: string;
}

export interface RecurringTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  category: Category;
  note: string;
  frequency: RecurringFrequency;
  nextRunAt: string;
  active: boolean;
  createdAt: string;
}

export interface AppSettings {
  currency: CurrencyCode;
  lockDashboard: boolean;
}

export interface FinanceData {
  transactions: Transaction[];
  budgets: Budget[];
  recurring: RecurringTransaction[];
  settings: AppSettings;
}

export interface BudgetUsage {
  budget: Budget;
  spent: number;
  remaining: number;
  percent: number;
  overBudget: boolean;
}
