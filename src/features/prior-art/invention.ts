type MatterLike = {
  title: string;
  documents: { title: string; body: string }[];
  timeline: { event: string; date: string }[];
};

const STOP = new Set(['self', 'with', 'that', 'this', 'from', 'over', 'into', 'without', 'separate', 'patent', 'application', 'claims', 'claim', 'cited', 'references', 'rejected']);

export function inventionTitle(title: string): string {
  const dash = title.split(/\s+[—–-]\s+/);
  return (dash.length > 1 ? dash.slice(1).join(' — ') : title).trim();
}

/** Summary: the invention title plus document sentences that mention its key words. */
export function inventionSummary(matter: MatterLike): string {
  const name = inventionTitle(matter.title);
  const words = name.toLowerCase().split(/[^a-z]+/).filter(word => word.length > 3 && !STOP.has(word));
  const sentences = matter.documents
    .flatMap(doc => doc.body.replace(/SYNTHETIC DEMO DOCUMENT\.?/g, '').split(/(?<=\.)\s+/))
    .map(sentence => sentence.trim())
    .filter(sentence => sentence && words.some(word => sentence.toLowerCase().includes(word)));
  return [`${name}.`, ...new Set(sentences)].slice(0, 4).join(' ');
}

/** Keyword queries without the model: title words, plus the distinguishing mechanism when named. */
export function keywordQueries(matter: MatterLike): string[] {
  const words = inventionTitle(matter.title).toLowerCase().split(/[^a-z]+/).filter(word => word.length > 3 && !STOP.has(word));
  const core = words.map(word => word.replace(/^self/, '')).filter(Boolean);
  const text = matter.documents.map(doc => doc.body.toLowerCase()).join(' ');
  const queries = [core.join(' ')];
  for (const extra of ['hinge', 'lock', 'spring', 'latch']) {
    if (text.includes(extra)) queries.push([...core.slice(-2), extra].join(' '));
  }
  return [...new Set(queries.filter(Boolean))].slice(0, 4);
}

/** ISO filing date from a timeline event such as "Utility application ... filed". */
export function filingDate(matter: MatterLike): string | undefined {
  const event = matter.timeline.find(item => /application/i.test(item.event) && /filed/i.test(item.event));
  return event && /^\d{4}-\d{2}-\d{2}$/.test(event.date) ? event.date : undefined;
}
