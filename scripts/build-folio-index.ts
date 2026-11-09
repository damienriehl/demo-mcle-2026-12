import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { load } from 'cheerio';

const [owlPath, commit] = process.argv.slice(2);
if (!owlPath || !commit) throw new Error('Usage: node --import tsx scripts/build-folio-index.ts <owl-path> <commit>');

const $ = load(readFileSync(owlPath, 'utf8'), { xmlMode: true });
const classes = new Map<string, { label: string; alt: string[]; parents: string[]; deprecated: boolean }>();
const sorted = (values: string[]) => [...new Set(values)].sort();

$('owl\\:Class').each((_, element) => {
  const node = $(element);
  const iri = node.attr('rdf:about');
  const values = (name: string) => node.children(name).toArray().map((child) => $(child).text().trim()).filter(Boolean);
  const label = values('rdfs\\:label')[0] ?? values('skos\\:prefLabel')[0];
  if (!iri || !label) return;
  classes.set(iri, {
    label,
    alt: sorted([...values('skos\\:altLabel'), ...values('skos\\:prefLabel')].filter((value) => value !== label)),
    parents: sorted(node.children('rdfs\\:subClassOf').toArray().flatMap((parent) => {
      const resource = $(parent).attr('rdf:resource') ?? $(parent).children('owl\\:Class').attr('rdf:about');
      return resource ? [resource] : [];
    })),
    deprecated: values('owl\\:deprecated').some((value) => value === 'true' || value === '1'),
  });
});

function branch(iri: string, seen = new Set<string>()): string {
  if (seen.has(iri)) return '';
  seen.add(iri);
  const concept = classes.get(iri);
  if (!concept) return '';
  if (concept.parents.includes('http://www.w3.org/2002/07/owl#Thing')) return concept.label;
  for (const parent of concept.parents) {
    const ancestor = branch(parent, seen);
    if (ancestor) return ancestor;
  }
  return '';
}

const concepts = [...classes].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  .filter(([, concept]) => !concept.deprecated)
  .map(([iri, concept]) => ({ iri, label: concept.label, alt: concept.alt, branch: branch(iri) }));
const index = {
  source: {
    repo: 'https://github.com/damienriehl/FOLIO',
    commit,
    license: 'CC-BY-4.0',
    attribution: 'FOLIO (Federated Open Legal Information Ontology), by Damien Riehl and contributors. https://github.com/damienriehl/FOLIO — licensed under CC BY 4.0: https://creativecommons.org/licenses/by/4.0/. Adapted to a label and ancestry index; definitions omitted.',
  },
  concepts,
};
mkdirSync('data/folio', { recursive: true });
const output = JSON.stringify(index) + '\n';
writeFileSync('data/folio/folio-index.json', output);
console.log(`Wrote ${concepts.length} concepts (${Buffer.byteLength(output)} bytes) to data/folio/folio-index.json`);
