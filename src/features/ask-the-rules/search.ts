import { listRules, type RuleSet } from '../../../data/rules';

export type RuleHit = {
  ruleId: string;
  citation: string;
  heading: string;
  /** Subdivision label as the source prints it, or null for the whole rule. */
  label: string | null;
  /** Verbatim library text of the matched subdivision or rule. */
  quote: string;
  sourceUrl: string;
};

const stopwords = new Set(('the a an and or of to in on for by with at from as is are was were be been do does did i me my we our you your '
  + 'it its this that these those what which who whom when where why how many much can could should would will shall may '
  + 'must have has had any all there their they them if then than so not no about into under after before').split(' '));

function stem(word: string) {
  return word.replace(/(ings|ing|ed|es|s)$/, '') || word;
}

function terms(text: string) {
  return (text.toLowerCase().match(/[a-z]+/g) ?? []).filter(word => word.length > 2 && !stopwords.has(word)).map(stem);
}

type Passage = RuleHit & { set: RuleSet; words: Map<string, number>; length: number; headingWords: Set<string> };

const passages: Passage[] = listRules().flatMap(rule => {
  const parts = rule.subdivisions.length > 0 ? rule.subdivisions : [{ label: null, text: rule.text }];
  const headingWords = new Set(terms(rule.heading));
  return parts.map(part => {
    const words = new Map<string, number>();
    const all = terms(part.text);
    for (const word of all) words.set(word, (words.get(word) ?? 0) + 1);
    return {
      ruleId: rule.id, set: rule.set, citation: rule.citation, heading: rule.heading,
      label: part.label, quote: part.text, sourceUrl: rule.sourceUrl, words, length: all.length, headingWords,
    };
  });
});

const documentFrequency = new Map<string, number>();
for (const passage of passages) for (const word of passage.words.keys()) documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
const averageLength = passages.reduce((sum, passage) => sum + passage.length, 0) / passages.length;

const minnesotaSets: RuleSet[] = ['mn-civ', 'mn-gp', 'mn-stat'];
const federalSets: RuleSet[] = ['frcp', 'frbp', 'usc', 'cfr37'];

/** Sets the matter's forum points to: Minnesota state courts, federal forums, or both. */
function forumSets(forum: string | undefined): Set<RuleSet> {
  const text = forum ?? '';
  const sets = new Set<RuleSet>();
  if (/county|minnesota department|minnesota private|minn\. stat/i.test(text)) minnesotaSets.forEach(set => sets.add(set));
  if (/u\.s\.|federal|bankruptcy|eeoc|patent/i.test(text)) federalSets.forEach(set => sets.add(set));
  return sets;
}

const timeQuestion = /\b(how (many|long)|deadline|due|when|time)\b/i;
const timePeriod = /\bwithin \d+ days\b|\b\d+ days (after|before)\b/i;

/** The library passages that best match a procedure question, matter's forum first. */
export function askTheRules(question: string, forum: string | undefined, limit = 3): RuleHit[] {
  const query = [...new Set(terms(question))];
  if (query.length === 0) return [];
  const preferred = forumSets(forum);
  const asksForTime = timeQuestion.test(question);
  return passages
    .map(passage => {
      let score = 0;
      for (const word of query) {
        const frequency = documentFrequency.get(word) ?? 0;
        const idf = Math.log(1 + (passages.length - frequency + 0.5) / (frequency + 0.5));
        const count = passage.words.get(word) ?? 0;
        // BM25 term weight: repeated words help less, and long passages do not win by length alone.
        score += idf * (count * 2.2) / (count + 1.2 * (0.25 + 0.75 * passage.length / averageLength));
        if (passage.headingWords.has(word)) score += idf;
      }
      if (asksForTime && timePeriod.test(passage.quote)) score *= 1.5;
      if (preferred.has(passage.set)) score *= 1.5;
      return { passage, score };
    })
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ passage: { ruleId, citation, heading, label, quote, sourceUrl } }) => ({ ruleId, citation, heading, label, quote, sourceUrl }));
}

/** Citation narrowed to the quoted subdivision, e.g. "Fed. R. Civ. P. 12(a)" or "Minn. Gen. R. Prac. 370.05". */
export function pinpoint({ citation, label }: Pick<RuleHit, 'citation' | 'label'>) {
  if (!label || citation.endsWith(`subd. ${label}`)) return citation;
  if (label.startsWith('(')) return citation + label;
  const number = citation.split(' ').at(-1) ?? '';
  return label.startsWith(`${number}.`) ? citation.slice(0, -number.length) + label : `${citation}, ${label}`;
}
