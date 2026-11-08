import type { MatterWithDeadlines } from '../data/schema';
import type { DeadlineResult } from '../engine/types';

export type Selection = { matterId: string; label: string; value?: string; deadlineId?: string; result?: DeadlineResult };
export type ViewProps = { matters: MatterWithDeadlines[]; activeMatter: MatterWithDeadlines | undefined; onVerify: (selection: Selection) => void };
export const practiceAreas = ['litigation', 'transactional', 'patent', 'bankruptcy', 'family', 'employment', 'regulatory'] as const;
export function dateLabel(date: string) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}
export function daysFromToday(date: string) {
  const today = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}
export function deadlineResult(matter: MatterWithDeadlines, id: string): DeadlineResult {
  const result = matter.computedDeadlines?.[id];
  if (result?.status === 'computed' && result.dueDate) return result;
  if (result?.status === 'uncomputable' && result.reason) return result;
  return { status: 'uncomputable', reason: 'A computed date is not available in this view.', steps: [] };
}
export function countdown(days: number) {
  if (days === 0) return 'Due today';
  return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'day' : 'days'} ${days < 0 ? 'overdue' : 'left'}`;
}
