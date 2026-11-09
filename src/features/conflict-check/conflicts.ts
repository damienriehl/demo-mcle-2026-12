import type { Matter } from '../../data/schema';

type NameSource = Pick<Matter, 'id' | 'title' | 'client' | 'parties'>;
export type SharedName = { name: string; roleHere: string; others: { matterId: string; title: string; role: string }[] };

const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

function namesIn(matter: NameSource): Map<string, { name: string; role: string }> {
  const names = new Map<string, { name: string; role: string }>();
  for (const party of matter.parties) if (!names.has(key(party.name))) names.set(key(party.name), { name: party.name.trim(), role: party.role });
  if (!names.has(key(matter.client.name))) names.set(key(matter.client.name), { name: matter.client.name.trim(), role: 'Client' });
  return names;
}

export function sharedNames(active: NameSource, matters: NameSource[]): SharedName[] {
  const others = matters.filter(matter => matter.id !== active.id).map(matter => ({ matter, names: namesIn(matter) }));
  return [...namesIn(active)].flatMap(([nameKey, { name, role }]) => {
    const hits = others.flatMap(({ matter, names }) => {
      const hit = names.get(nameKey);
      return hit ? [{ matterId: matter.id, title: matter.title, role: hit.role }] : [];
    });
    return hits.length ? [{ name, roleHere: role, others: hits }] : [];
  });
}
