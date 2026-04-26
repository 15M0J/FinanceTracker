import { Category, CurrencyCode } from './types';

export const CATEGORIES: Category[] = [
  'Food',
  'Transport',
  'Salary',
  'Rent',
  'Bills',
  'Shopping',
  'Health',
  'Savings',
  'Other',
];

export const EXPENSE_CATEGORIES: Category[] = [
  'Food',
  'Transport',
  'Rent',
  'Bills',
  'Shopping',
  'Health',
  'Savings',
  'Other',
];

export const INCOME_CATEGORIES: Category[] = ['Salary', 'Savings', 'Other'];

export const CATEGORY_COLORS: Record<Category, string> = {
  Food: '#F97316',
  Transport: '#0EA5E9',
  Salary: '#16A34A',
  Rent: '#8B5CF6',
  Bills: '#DC2626',
  Shopping: '#EC4899',
  Health: '#14B8A6',
  Savings: '#2563EB',
  Other: '#64748B',
};

export const CURRENCY_OPTIONS: Array<{ code: CurrencyCode; label: string; locale: string }> = [
  { code: 'USD', label: 'USD $', locale: 'en-US' },
  { code: 'GBP', label: 'GBP GBP', locale: 'en-GB' },
  { code: 'NGN', label: 'NGN NGN', locale: 'en-NG' },
  { code: 'EUR', label: 'EUR EUR', locale: 'de-DE' },
  { code: 'GHS', label: 'GHS GHS', locale: 'en-GH' },
  { code: 'KES', label: 'KES KSh', locale: 'en-KE' },
  { code: 'ZAR', label: 'ZAR R', locale: 'en-ZA' },
];

export const EMPTY_FINANCE_DATA = {
  transactions: [],
  budgets: [],
  recurring: [],
  settings: {
    currency: 'USD',
    lockDashboard: true,
  },
} as const;
