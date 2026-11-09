import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findByLabel, lookup, tagText } from '../server/folio/index';

const indemnification = 'https://folio.openlegalstandard.org/RLNlm7nXyJQLJmk8qYnaPQ';
const assetPurchase = 'https://folio.openlegalstandard.org/RmCQVvWRqLFZ5V65G0txFq';
const markdown = 'https://folio.openlegalstandard.org/R8x6LJFoln3OhMhoiVyPZtM';

describe('offline FOLIO matcher', () => {
  it('loads the index and matcher lazily in under 500 ms', () => {
    const start = performance.now();
    expect(lookup(assetPurchase)?.label).toBe('Asset Purchase Agreement');
    expect(performance.now() - start).toBeLessThan(500);
  });

  it('tags the real indemnification and asset purchase concepts with exact offsets', () => {
    const text = 'indemnification obligations under this Asset Purchase Agreement';
    const tags = tagText(text, 'earlier');
    expect(tags).toEqual([
      expect.objectContaining({ iri: indemnification, label: 'Indemnification', draft: 'earlier', start: 0, end: 15, text: 'indemnification', source: 'index' }),
      expect.objectContaining({ iri: assetPurchase, label: 'Asset Purchase Agreement', draft: 'earlier', start: 39, end: 63, text: 'Asset Purchase Agreement', source: 'index' }),
    ]);
    for (const tag of tags) {
      expect(text.slice(tag.start, tag.end)).toBe(tag.text);
      expect(tag.branch).not.toBe('');
    }
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
