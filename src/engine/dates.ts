// ISO calendar dates only. UTC is an arithmetic carrier; local-time getters and
// parsers are never used, so daylight saving and the host timezone have no role.
const DAY_MS = 86_400_000;

function utc(date: string): number {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function iso(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, 10);
}

export function isCalendarDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(utc(value)) && iso(utc(value)) === value;
}

export function addDays(date: string, days: number): string {
  return iso(utc(date) + days * DAY_MS);
}

export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay)));
}

export function weekday(date: string): number {
  return new Date(utc(date)).getUTCDay();
}

export function dayName(date: string): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday(date)];
}

export function calendarCovered(date: string): boolean {
  return date >= '2024-01-01' && date <= '2030-12-31';
}
