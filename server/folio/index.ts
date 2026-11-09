import { readFileSync } from 'node:fs';
import type { FolioTag } from '../drafts/types';

interface Concept {
  iri: string;
  label: string;
  alt: string[];
  branch: string;
}

interface Match {
  concept: Concept;
  preferred: boolean;
}

interface Trie {
  children: Map<string, Trie>;
  matches?: Match[];
}

const canonical = (text: string) => text.toLowerCase()
  .replace(/[‘’‚‛]/gu, "'")
  .replace(/[“”„‟]/gu, '"')
  .replace(/[\p{Dash_Punctuation}\u2212]/gu, '-')
  .replace(/\s/gu, ' ');

function normalize(text: string) {
  const chars: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let offset = 0;
  for (const original of text) {
    const end = offset + original.length;
    const normalized = canonical(original);
    for (const char of normalized.split('')) {
      if (char === ' ' && chars.at(-1) === ' ') {
        ends[ends.length - 1] = end;
      } else {
        chars.push(char);
        starts.push(offset);
        ends.push(end);
      }
    }
    offset = end;
  }
  return { value: chars.join(''), starts, ends };
}

const key = (text: string) => canonical(text).replace(/ +/gu, ' ').trim();

function preferredForms(label: string): Set<string> {
  const forms = new Set([label]);
  if (!/^[a-z]+$/u.test(label)) return forms;
  if (/ies$/u.test(label)) forms.add(label.slice(0, -3) + 'y');
  else if (/(ches|shes|sses|xes|zes)$/u.test(label)) forms.add(label.slice(0, -2));
  else if (/s$/u.test(label) && !/(ss|us|is)$/u.test(label)) forms.add(label.slice(0, -1));
  else forms.add(/[^aeiou]y$/u.test(label) ? label.slice(0, -1) + 'ies'
    : /(s|x|z|ch|sh)$/u.test(label) ? label + 'es' : label + 's');
  return forms;
}

const tokens = /[\p{L}\p{M}\p{N}_]+|[^\p{L}\p{M}\p{N}_]/gu;
const trieNode = (): Trie => ({ children: new Map() });
const compareIri = (a: Match, b: Match) => Number(b.preferred) - Number(a.preferred)
  || (a.concept.iri < b.concept.iri ? -1 : a.concept.iri > b.concept.iri ? 1 : 0);

let singleton: {
  byIri: Map<string, Concept>;
  byBranch: Map<string, Concept[]>;
  bySingularLabel: Map<string, Concept[]>;
  bySingularAlt: Map<string, Concept[]>;
  byWord: Map<string, Concept[]>;
  wordsByConcept: Map<Concept, Set<string>>;
  blocked: Map<string, Set<string>>;
  trie: Trie;
} | undefined;

function getIndex() {
  if (singleton) return singleton;
  const { concepts } = JSON.parse(readFileSync(new URL('../../data/folio/folio-index.json', import.meta.url), 'utf8')) as { concepts: Concept[] };
  const { blocked_aliases } = JSON.parse(readFileSync(new URL('../../data/folio/alias-blocklist.json', import.meta.url), 'utf8')) as {
    blocked_aliases: { surface_term: string; blocked_iri: string }[];
  };
  const byIri = new Map<string, Concept>();
  const byBranch = new Map<string, Concept[]>();
  const bySingularLabel = new Map<string, Concept[]>();
  const bySingularAlt = new Map<string, Concept[]>();
  const byWord = new Map<string, Concept[]>();
  const wordsByConcept = new Map<Concept, Set<string>>();
  const blocked = new Map<string, Set<string>>();
  const trie = trieNode();
  for (const entry of blocked_aliases) {
    const surface = key(entry.surface_term);
    if (!blocked.has(surface)) blocked.set(surface, new Set());
    blocked.get(surface)!.add(entry.blocked_iri);
  }
  for (const concept of concepts) {
    if (concept.branch.startsWith('ZZZ') || concept.branch === 'Legal Use Cases') continue;
    byIri.set(concept.iri, concept);
    const preferred = preferredForms(key(concept.label));
    for (const label of new Set([...preferred, ...concept.alt.map(key)])) {
      if (!label) continue;
      const match = { concept, preferred: preferred.has(label) };
      let node = trie;
      for (const token of label.match(tokens)!) {
        let next = node.children.get(token);
        if (!next) {
          next = trieNode();
          node.children.set(token, next);
        }
        node = next;
      }
      (node.matches ??= []).push(match);
      if (node.matches.length > 1) node.matches.sort(compareIri);
    }
  }
  for (const concept of byIri.values()) {
    const add = (map: Map<string, Concept[]>, value: string) => {
      const entries = map.get(value) ?? [];
      entries.push(concept);
      map.set(value, entries);
    };
    add(byBranch, concept.branch);
    add(bySingularLabel, singularLabel(concept.label));
    for (const label of new Set(concept.alt.map(singularLabel))) add(bySingularAlt, label);
    const words = contentWords(concept.label);
    wordsByConcept.set(concept, words);
    for (const word of words) add(byWord, word);
  }
  singleton = { byIri, byBranch, bySingularLabel, bySingularAlt, byWord, wordsByConcept, blocked, trie };
  return singleton;
}

export function warmFolioIndex(): void {
  getIndex();
}

export function lookup(iri: string): Concept | undefined {
  return getIndex().byIri.get(iri);
}

const branchLabels = new Map<string, readonly string[]>();

export function labelsInBranches(branches: readonly string[]): readonly string[] {
  const selected = new Set(branches);
  const cacheKey = JSON.stringify([...selected].sort());
  let labels = branchLabels.get(cacheKey);
  if (!labels) {
    const { byBranch } = getIndex();
    labels = [...new Set([...selected].flatMap(branch => byBranch.get(branch) ?? []).map(concept => concept.label))].sort();
    branchLabels.set(cacheKey, labels);
  }
  return labels;
}

export function findByLabel(label: string): Concept[] {
  let node = getIndex().trie;
  for (const token of key(label).match(tokens) ?? []) {
    const next = node.children.get(token);
    if (!next) return [];
    node = next;
  }
  return (node.matches ?? []).map((match) => match.concept);
}

const grammaticalFillerAndDocumentWrappers = new Set('a an the of and or for to in on by with from as at is are legal document letter'.split(' '));
const singularWord = (word: string) => [...preferredForms(word)].sort((a, b) => a.length - b.length)[0];
const singularLabel = (label: string) => key(label).replace(/[a-z]+$/u, singularWord);
const contentWords = (label: string) => new Set((key(label).match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])
  .map(singularWord).filter(word => !grammaticalFillerAndDocumentWrappers.has(word)));

export function resolveLabel(label: string, { branches }: { branches?: readonly string[] } = {}): Concept | undefined {
  const allowed = (concept: Concept) => !branches || branches.includes(concept.branch);
  const normalized = key(label);
  const exact = findByLabel(label).filter(concept => allowed(concept)
    && [concept.label, ...concept.alt].some(form => key(form) === normalized));
  const preferred = exact.find(concept => key(concept.label) === normalized);
  if (preferred || exact.length) return preferred ?? exact[0];

  const index = getIndex();
  const singular = singularLabel(label);
  const inflected = index.bySingularLabel.get(singular)?.find(allowed)
    ?? index.bySingularAlt.get(singular)?.find(allowed);
  if (inflected) return inflected;

  const words = contentWords(label);
  const overlaps = new Map<Concept, number>();
  for (const word of words) {
    for (const concept of index.byWord.get(word) ?? []) {
      if (allowed(concept)) overlaps.set(concept, (overlaps.get(concept) ?? 0) + 1);
    }
  }
  let best: Concept | undefined;
  let bestScore = 0;
  for (const [concept, shared] of overlaps) {
    // Alternative labels can be broad or even whole definitions. Use preferred
    // labels for overlap; alternatives still participate in both exact stages.
    const target = index.wordsByConcept.get(concept)!;
    const score = shared / (words.size + target.size - shared);
    if (score < 0.5) continue;
    if (score > bestScore || (score === bestScore && best
      && (concept.label.length < best.label.length
        || (concept.label.length === best.label.length && concept.iri < best.iri)))) {
      best = concept;
      bestScore = score;
    }
  }
  return best;
}

const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{M}\p{N}_]/u.test(char);

export function tagText(text: string, draft: FolioTag['draft']): FolioTag[] {
  const index = getIndex();
  const { value, starts, ends } = normalize(text);
  const words = [...value.matchAll(tokens)];
  const candidates: (Match & { start: number; end: number })[] = [];
  for (let start = 0; start < words.length; start++) {
    if (isWord(words[start - 1]?.[0])) continue;
    let node = index.trie;
    for (let end = start; end < words.length; end++) {
      const next = node.children.get(words[end][0]);
      if (!next) break;
      node = next;
      if (!node.matches || isWord(words[end + 1]?.[0])) continue;
      const first = words[start].index;
      const last = words[end].index + words[end][0].length - 1;
      const literal = text.slice(starts[first], ends[last]);
      const surface = value.slice(first, last + 1);
      const letters = surface.match(/\p{L}/gu) ?? [];
      if (letters.length <= 3 && letters.length > 0
        && (literal !== literal.toUpperCase() || literal === literal.toLowerCase())) continue;
      for (const match of node.matches) {
        if (!surface.includes(' ') && !match.preferred) continue;
        if (!index.blocked.get(surface)?.has(match.concept.iri)) {
          candidates.push({ ...match, start: starts[first], end: ends[last] });
        }
      }
    }
  }
  candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start) || compareIri(a, b) || a.start - b.start);
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    let low = 0;
    let high = selected.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (selected[middle].start < candidate.start) low = middle + 1;
      else high = middle;
    }
    if (low > 0 && selected[low - 1].end > candidate.start) continue;
    if (low < selected.length && selected[low].start < candidate.end) continue;
    selected.splice(low, 0, candidate);
  }
  return selected.map(({ concept, start, end }) => ({
    iri: concept.iri,
    label: concept.label,
    branch: concept.branch,
    draft,
    start,
    end,
    text: text.slice(start, end),
    source: 'index',
  }));
}
