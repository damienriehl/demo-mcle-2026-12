import type { MatterWithDeadlines } from '../../data/schema';

export const soonWindowDays = 30;
export type HeatBand = 'Hot' | 'Warm' | 'Cool';
export type HeatRow = {
  matter: MatterWithDeadlines;
  score: number;
  band: HeatBand;
  soonCount: number;
  overdueCount: number;
  nextDays: number | undefined;
  verifyCount: number;
  verifyReasons: string[];
};

function localToday() {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function daysBetween(today: string, date: string) {
  return Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
}

// Each engine-computed deadline due within the window adds heat: closer adds more,
// overdue adds the most. Uncomputable deadlines add no heat and are listed for review.
export function rankHeat(matters: MatterWithDeadlines[], today = localToday()): HeatRow[] {
  return matters.map(matter => {
    let score = 0, soonCount = 0, overdueCount = 0;
    let nextDays: number | undefined;
    const verifyReasons: string[] = [];
    for (const deadline of matter.deadlines) {
      const result = matter.computedDeadlines?.[deadline.id];
      if (result?.status !== 'computed') {
        verifyReasons.push(result?.status === 'uncomputable' ? result.reason : 'A computed date is not available.');
        continue;
      }
      const days = daysBetween(today, result.dueDate);
      if (days > soonWindowDays) continue;
      soonCount++;
      if (days < 0) overdueCount++;
      score += soonWindowDays + 1 - Math.max(days, 0);
      if (nextDays === undefined || days < nextDays) nextDays = days;
    }
    const band: HeatBand = score >= 24 ? 'Hot' : score > 0 ? 'Warm' : 'Cool';
    return { matter, score, band, soonCount, overdueCount, nextDays, verifyCount: verifyReasons.length, verifyReasons };
  }).sort((a, b) => b.score - a.score || a.matter.title.localeCompare(b.matter.title));
}
