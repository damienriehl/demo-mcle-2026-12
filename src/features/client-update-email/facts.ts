import type { MatterWithDeadlines } from '../../data/schema';
import { portalProjection } from '../../views/Portal';
import { dateLabel } from '../../views/shared';

export type EmailFacts = {
  clientName: string;
  matterTitle: string;
  status: string;
  nextSteps: string[];
  upcomingDates: { label: string; date: string }[];
};

/** Client-safe facts for the email: the Portal projection, with dates taken only from the engine. */
export function emailFacts(matter: MatterWithDeadlines, today: string): EmailFacts {
  const client = portalProjection(matter);
  const upcomingDates = (client.deadlines ?? []).flatMap(deadline => {
    const result = client.computedDeadlines?.[deadline.id];
    return result?.status === 'computed' && result.dueDate >= today ? [{ label: deadline.label, iso: result.dueDate }] : [];
  }).sort((a, b) => a.iso.localeCompare(b.iso)).map(({ label, iso }) => ({ label, date: dateLabel(iso) }));
  return {
    clientName: client.client?.name ?? '',
    matterTitle: client.title,
    status: client.clientFacing?.status ?? '',
    nextSteps: (client.clientFacing?.nextSteps ?? []).filter((step): step is string => typeof step === 'string'),
    upcomingDates,
  };
}
