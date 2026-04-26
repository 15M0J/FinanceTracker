import { CATEGORY_COLORS, CURRENCY_OPTIONS, EMPTY_FINANCE_DATA } from '../constants';
import { addFrequency, isDue, startOfPeriod, toDateInputValue } from './date';
import { createId } from './id';
import {
  Budget,
  BudgetUsage,
  Category,
  CurrencyCode,
  FinanceData,
  RecurringTransaction,
  Transaction,
} from '../types';

export function createSeedData(): FinanceData {
  const today = new Date();
  const daysAgo = (count: number) => {
    const date = new Date(today);
    date.setDate(today.getDate() - count);
    return toDateInputValue(date);
  };

  return {
    ...EMPTY_FINANCE_DATA,
    settings: { currency: 'USD', lockDashboard: true },
    transactions: [
      {
        id: createId('tx'),
        type: 'income',
        amount: 12800,
        category: 'Salary',
        note: 'Monthly salary',
        date: daysAgo(18),
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('tx'),
        type: 'expense',
        amount: 320,
        category: 'Transport',
        note: 'Transport',
        date: daysAgo(14),
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('tx'),
        type: 'expense',
        amount: 485,
        category: 'Food',
        note: 'Dining Out',
        date: daysAgo(13),
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('tx'),
        type: 'expense',
        amount: 2500,
        category: 'Rent',
        note: 'Housing',
        date: daysAgo(12),
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('tx'),
        type: 'expense',
        amount: 150,
        category: 'Bills',
        note: 'Utilities',
        date: daysAgo(10),
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('tx'),
        type: 'expense',
        amount: 9.99,
        category: 'Shopping',
        note: 'Spotify Premium',
        date: daysAgo(9),
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('tx'),
        type: 'expense',
        amount: 240.5,
        category: 'Food',
        note: 'The Gilded Fork',
        date: daysAgo(7),
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('tx'),
        type: 'income',
        amount: 450.25,
        category: 'Savings',
        note: 'Dividend Payout',
        date: daysAgo(5),
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('tx'),
        type: 'expense',
        amount: 1299,
        category: 'Shopping',
        note: 'Apple Store',
        date: daysAgo(1),
        createdAt: new Date().toISOString(),
      },
    ],
    budgets: [
      {
        id: createId('budget'),
        category: 'Food',
        amount: 850,
        period: 'monthly',
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('budget'),
        category: 'Transport',
        amount: 700,
        period: 'monthly',
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('budget'),
        category: 'Rent',
        amount: 2500,
        period: 'monthly',
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('budget'),
        category: 'Bills',
        amount: 250,
        period: 'monthly',
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('budget'),
        category: 'Shopping',
        amount: 240,
        period: 'monthly',
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('budget'),
        category: 'Health',
        amount: 150,
        period: 'monthly',
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('budget'),
        category: 'Savings',
        amount: 900,
        period: 'monthly',
        createdAt: new Date().toISOString(),
      },
    ],
    recurring: [
      {
        id: createId('rec'),
        type: 'expense',
        amount: 2500,
        category: 'Rent',
        note: 'Apartment rent',
        frequency: 'monthly',
        nextRunAt: daysAgo(0),
        active: true,
        createdAt: new Date().toISOString(),
      },
      {
        id: createId('rec'),
        type: 'income',
        amount: 12800,
        category: 'Salary',
        note: 'Monthly salary',
        frequency: 'monthly',
        nextRunAt: daysAgo(14),
        active: true,
        createdAt: new Date().toISOString(),
      },
    ],
  };
}

export function formatMoney(amount: number, currency: CurrencyCode) {
  const option = CURRENCY_OPTIONS.find((item) => item.code === currency) ?? CURRENCY_OPTIONS[0];
  return new Intl.NumberFormat(option.locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount);
}

export function getTotals(transactions: Transaction[]) {
  const income = transactions.filter((item) => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const expenses = transactions.filter((item) => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  return {
    income,
    expenses,
    balance: income - expenses,
  };
}

export function getBudgetUsage(budget: Budget, transactions: Transaction[], today = new Date()): BudgetUsage {
  const start = startOfPeriod(budget.period, today);
  const spent = transactions
    .filter((item) => item.type === 'expense')
    .filter((item) => item.category === budget.category)
    .filter((item) => new Date(item.date) >= start)
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    budget,
    spent,
    remaining: budget.amount - spent,
    percent: budget.amount === 0 ? 0 : Math.min((spent / budget.amount) * 100, 100),
    overBudget: spent > budget.amount,
  };
}

export function getCategoryTotals(transactions: Transaction[]) {
  const monthStart = startOfPeriod('monthly');
  const totals = new Map<Category, number>();

  transactions
    .filter((item) => item.type === 'expense')
    .filter((item) => new Date(item.date) >= monthStart)
    .forEach((item) => {
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
    });

  return Array.from(totals.entries())
    .map(([category, total]) => ({
      category,
      total,
      color: CATEGORY_COLORS[category],
    }))
    .sort((a, b) => b.total - a.total);
}

export function getDailyExpenseTotals(transactions: Transaction[]) {
  const days = Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return toDateInputValue(date);
  });

  return days.map((date) => ({
    date,
    total: transactions
      .filter((item) => item.type === 'expense' && item.date === date)
      .reduce((sum, item) => sum + item.amount, 0),
  }));
}

export function processRecurringTransactions(data: FinanceData, today = new Date()) {
  const transactionsToAdd: Transaction[] = [];
  const recurring = data.recurring.map((item) => {
    if (!item.active) {
      return item;
    }

    let nextRunAt = item.nextRunAt;
    let guard = 0;

    while (isDue(nextRunAt, today) && guard < 24) {
      transactionsToAdd.push(transactionFromRecurring(item, nextRunAt));
      nextRunAt = addFrequency(nextRunAt, item.frequency);
      guard += 1;
    }

    return {
      ...item,
      nextRunAt,
    };
  });

  if (transactionsToAdd.length === 0) {
    return { data, createdCount: 0 };
  }

  return {
    data: {
      ...data,
      recurring,
      transactions: [...transactionsToAdd, ...data.transactions],
    },
    createdCount: transactionsToAdd.length,
  };
}

function transactionFromRecurring(item: RecurringTransaction, date: string): Transaction {
  return {
    id: createId('tx'),
    recurringId: item.id,
    type: item.type,
    amount: item.amount,
    category: item.category,
    note: item.note,
    date,
    createdAt: new Date().toISOString(),
  };
}

export function toCsv(data: FinanceData) {
  const headers = ['id', 'type', 'amount', 'category', 'note', 'date', 'createdAt', 'recurringId'];
  const rows = data.transactions.map((item) =>
    [
      item.id,
      item.type,
      item.amount.toFixed(2),
      item.category,
      item.note,
      item.date,
      item.createdAt,
      item.recurringId ?? '',
    ]
      .map(csvEscape)
      .join(','),
  );

  return [headers.join(','), ...rows].join('\n');
}

function csvEscape(value: string | number) {
  const raw = String(value);
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}
