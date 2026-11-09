import type { Matter } from '../../data/schema';
import { dateLabel } from '../../views/shared';

export function courtDateSource(deadline: Matter['deadlines'][number]): string {
  return deadline.inputs?.movedFrom
    ? `Moved on screen · order p. ${deadline.inputs.page} said ${dateLabel(String(deadline.inputs.movedFrom))}`
    : `From the order, p. ${deadline.inputs?.page}`;
}
