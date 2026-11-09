import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findByLabel, labelsInBranches, lookup, tagText } from '../server/folio/index';

const indemnification = 'https://folio.openlegalstandard.org/RLNlm7nXyJQLJmk8qYnaPQ';
const assetPurchase = 'https://folio.openlegalstandard.org/RmCQVvWRqLFZ5V65G0txFq';
const markdown = 'https://folio.openlegalstandard.org/R8x6LJFoln3OhMhoiVyPZtM';

describe('offline FOLIO matcher', () => {
  it('caches all preferred labels in the actor, governmental body and legal entity branches', () => {
    const branches = ['Actor / Player', 'Governmental Body', 'Legal Entity'];
    const { concepts } = JSON.parse(readFileSync('data/folio/folio-index.json', 'utf8')) as {
      concepts: { label: string; branch: string }[];
    };
    const labels = labelsInBranches(branches);
    expect(labels).toEqual([...new Set(concepts.filter(concept => branches.includes(concept.branch)).map(concept => concept.label))].sort());
    expect(labels).toEqual(expect.arrayContaining(['Debtor', 'Creditor', 'Governmental Body', 'Limited Liability Company']));
    expect(labelsInBranches([...branches].reverse())).toBe(labels);
  });

  it('looks up an indexed concept', () => {
    expect(lookup(assetPurchase)?.label).toBe('Asset Purchase Agreement');
  });

  it('tags the real indemnification and asset purchase concepts with exact offsets', () => {
    const text = 'indemnification obligations under this Asset Purchase Agreement';
    const tags = tagText(text, 'earlier');
    expect(tags).toEqual([
      expect.objectContaining({ iri: indemnification, label: 'Indemnification', draft: 'earlier', start: 0, end: 15, text: 'indemnification', source: 'index' }),
      expect.objectContaining({ label: 'Obligation', draft: 'earlier', start: 16, end: 27, text: 'obligations', source: 'index' }),
      expect.objectContaining({ iri: assetPurchase, label: 'Asset Purchase Agreement', draft: 'earlier', start: 39, end: 63, text: 'Asset Purchase Agreement', source: 'index' }),
    ]);
    for (const tag of tags) {
      expect(text.slice(tag.start, tag.end)).toBe(tag.text);
      expect(tag.branch).not.toBe('');
    }
  });

  it('tags Buyer without treating maintenance contracts as spousal support', () => {
    const tags = tagText('Buyer shall pay maintenance contracts', 'later');
    expect(tags).toContainEqual(expect.objectContaining({ label: 'Buyer', branch: 'Actor / Player', text: 'Buyer' }));
    expect(tags.map((tag) => tag.label)).not.toContain('Long-term Spousal Support');
  });

  it.each([
    ['a single closing', 'Unmarried'],
    ['completed', 'Service Closed / Ended'],
    ['funds', 'Funds Practice'],
    ['licenses', 'Licensing Practice'],
    ['information', 'Information Industry'],
    ['claims', 'Litigation Claims'],
    ['medical', 'Medical - Real Estate Asset'],
  ])('does not tag the standalone alternative %s as %s', (text, label) => {
    expect(tagText(text, 'later').map((tag) => tag.label)).not.toContain(label);
  });

  it('excludes sandbox and use-case concepts while still tagging Notice', () => {
    const tags = tagText('inventory; prompt notice; Document Management Implementation Services', 'later');
    expect(tags.map((tag) => tag.label)).not.toContain('Inventory');
    expect(tags.map((tag) => tag.label)).not.toContain('Prompt');
    expect(tags.every((tag) => !tag.branch.startsWith('ZZZ') && tag.branch !== 'Legal Use Cases')).toBe(true);
    expect(tags).toContainEqual(expect.objectContaining({ label: 'Notice', text: 'notice' }));
  });

  it.each([
    ['BUYER', 'Buyer'], ['buyers', 'Buyer'],
    ['seller', 'Seller'], ['sellers', 'Seller'],
    ['obligation', 'Obligation'], ['obligations', 'Obligation'],
    ['notice', 'Notice'], ['notices', 'Notice'],
    ['lien', 'Lien'], ['liens', 'Lien'],
    ['agreement', 'Agreements'], ['agreements', 'Agreements'],
    ['authorities', 'Authority'], ['statuses', 'Status'], ['expense', 'Expenses'],
    ['cash', 'Cash'], ['assignment', 'Assignment'],
    ['indemnification', 'Indemnification'],
    ['Closing Event', 'Closing Event'],
    ['Limited Liability Company', 'Limited Liability Company'],
    ['Conditions to Closing', 'Conditions to Closing'],
    ['Closing Conditions', 'Conditions to Closing'],
    ['Spousal Maintenance', 'Long-term Spousal Support'],
    ['Service Closed', 'Service Closed / Ended'],
  ])('keeps preferred forms and multi-word labels: %s', (text, label) => {
    expect(tagText(text, 'earlier')).toContainEqual(expect.objectContaining({ label, text, start: 0, end: text.length }));
  });

  it('does not map Action to the blocklisted auction IRI', () => {
    expect(tagText('Action', 'later').some((tag) => tag.iri === 'https://folio.openlegalstandard.org/R8kOvHwkY6TrQmB7RnYiWNO')).toBe(false);
  });

  it('requires capitals and word boundaries for a two-letter label', () => {
    const text = 'md mdword MDword MD';
    expect(tagText(text, 'later').filter((tag) => tag.iri === markdown)).toEqual([
      expect.objectContaining({ start: 17, end: 19, text: 'MD' }),
    ]);
  });

  it('keeps the longer overlapping phrase', () => {
    expect(tagText('Asset Purchase Agreement', 'later').map((tag) => tag.iri)).toEqual([assetPurchase]);
  });

  it('prefers a preferred label over another concept’s alternative for the same span', () => {
    expect(tagText('Northern Mariana Islands', 'later').map((tag) => tag.iri)).toEqual([
      'https://folio.openlegalstandard.org/R00374a071b60A862d3CAf30',
    ]);
  });

  it('normalizes quotes, dashes, case and whitespace while preserving original UTF-16 spans', () => {
    const text = '📄 «CONTRAT D’ACHAT»; Attorney–Client\t Privilege; Asset\n  Purchase\u00a0Agreement';
    const tags = tagText(text, 'later');
    for (const [iri, literal] of [
      ['https://folio.openlegalstandard.org/RBNZsqQC9ryG9xpmKm812lV', 'CONTRAT D’ACHAT'],
      ['https://folio.openlegalstandard.org/R9BdovRK3PPCHYuYSJXadkJ', 'Attorney–Client\t Privilege'],
      [assetPurchase, 'Asset\n  Purchase\u00a0Agreement'],
    ]) {
      expect(tags).toContainEqual(expect.objectContaining({ iri, text: literal, start: text.indexOf(literal), end: text.indexOf(literal) + literal.length }));
    }
  });

  it('returns identical results on repeated tagging and supports preferred and alternative lookup', () => {
    const text = 'Indemnity under an Asset Purchase Agreement; indemnification.';
    expect(tagText(text, 'later')).toEqual(tagText(text, 'later'));
    expect(findByLabel('INDEMNITY').map((concept) => concept.iri)).toContain(indemnification);
    expect(findByLabel('asset purchase agreement').map((concept) => concept.iri)).toContain(assetPurchase);
    expect(lookup(indemnification)?.label).toBe('Indemnification');
  });
});

it('builds deterministic attributed label data, excludes deprecated classes and guards ancestry cycles', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'folio-index-'));
  const script = resolve('scripts/build-folio-index.ts');
  try {
    writeFileSync(resolve(directory, 'input.owl'), `<?xml version="1.0"?>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:owl="http://www.w3.org/2002/07/owl#" xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#" xmlns:skos="http://www.w3.org/2004/02/skos/core#">
        <owl:Class rdf:about="urn:branch"><rdfs:label>Branch</rdfs:label><rdfs:subClassOf rdf:resource="http://www.w3.org/2002/07/owl#Thing"/></owl:Class>
        <owl:Class rdf:about="urn:child"><rdfs:label>Child</rdfs:label><skos:prefLabel>Preferred</skos:prefLabel><skos:altLabel>Alias</skos:altLabel><skos:altLabel>Alias</skos:altLabel><skos:definition>Omit this definition.</skos:definition><rdfs:subClassOf rdf:resource="urn:loop"/><rdfs:subClassOf rdf:resource="urn:branch"/></owl:Class>
        <owl:Class rdf:about="urn:loop"><skos:prefLabel>Loop</skos:prefLabel><rdfs:subClassOf rdf:resource="urn:child"/></owl:Class>
        <owl:Class rdf:about="urn:deprecated"><rdfs:label>Old</rdfs:label><owl:deprecated>true</owl:deprecated></owl:Class>
      </rdf:RDF>`);
    const build = () => execFileSync(process.execPath, ['--import', import.meta.resolve('tsx'), script, 'input.owl', 'fixture-commit'], { cwd: directory, stdio: 'inherit' });
    build();
    const first = readFileSync(resolve(directory, 'data/folio/folio-index.json'), 'utf8');
    build();
    expect(readFileSync(resolve(directory, 'data/folio/folio-index.json'), 'utf8')).toBe(first);
    const index = JSON.parse(first);
    expect(index.source).toEqual(expect.objectContaining({ repo: 'https://github.com/damienriehl/FOLIO', commit: 'fixture-commit', license: 'CC-BY-4.0', attribution: expect.stringContaining('Damien Riehl') }));
    expect(index.concepts).toEqual([
      { iri: 'urn:branch', label: 'Branch', alt: [], branch: 'Branch' },
      { iri: 'urn:child', label: 'Child', alt: ['Alias', 'Preferred'], branch: 'Branch' },
      { iri: 'urn:loop', label: 'Loop', alt: [], branch: 'Branch' },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
