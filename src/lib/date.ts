import { BudgetPeriod, RecurringFrequency } from '../types';

export function toDateInputValue(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function startOfPeriod(period: BudgetPeriod, source = new Date()) {
  const date = new Date(source);
  date.setHours(0, 0, 0, 0);

  if (period === 'weekly') {
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return date;
  }

  date.setDate(1);
  return date;
}

export function addFrequency(dateValue: string, frequency: RecurringFrequency) {
  const date = new Date(dateValue);
  if (frequency === 'weekly') {
    date.setDate(date.getDate() + 7);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return toDateInputValue(date);
}

export function isDue(dateValue: string, today = new Date()) {
  const dueDate = new Date(dateValue);
  dueDate.setHours(0, 0, 0, 0);
  const current = new Date(today);
  current.setHours(0, 0, 0, 0);
  return dueDate <= current;
}

export function shortDate(dateValue: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(dateValue));
}
