# FOLIO label index

`folio-index.json` is an offline label and ancestry index derived from the RDF/XML
FOLIO ontology at commit `f9c5152` (2026-10-20). It contains 18,324 labeled,
non-deprecated concepts. The source has 18,328 class declarations: three are
deprecated and the unlabeled `owl:Thing` declaration is the hierarchy root.
Definitions and other annotations are omitted.

Each concept retains `iri`, `label` (`rdfs:label`, falling back to
`skos:prefLabel`), deduplicated `alt` labels (including a differing
`skos:prefLabel`), and `branch`, the label of its ancestor directly under
`owl:Thing`. Alternative labels retain all source languages. Concepts are sorted
by IRI and alternatives by label. Where multiple ancestry paths exist, the first
root reached through sorted parent IRIs wins; cycles are guarded. A class with
no path to `owl:Thing` has an empty branch. All bundled concepts have a branch.

Rebuild from the local ontology without network access:

```sh
node --import tsx scripts/build-folio-index.ts .cache/folio/FOLIO.owl f9c5152
```

Run from the repository root; the script writes `data/folio/folio-index.json`.
The compact JSON uses readable keys and is 4,318,404 bytes, below 5 MB.

`server/folio/index.ts` loads the data and builds its phrase trie once, on first
use. `tagText(text, draft)` returns nonoverlapping tags with UTF-16 offsets into
the original text and `source: 'index'`. Matching normalizes case, curly quotes,
dashes and whitespace; longer source spans win, with preferred labels winning
equal spans and IRI order breaking any remaining tie. Labels containing at most
three letters require an uppercase source occurrence. `lookup(iri)` returns a
concept or `undefined`; `findByLabel(label)` returns all preferred or alternative
label matches, with preferred matches first. Lookup does not apply tagging gates.

`alias-blocklist.json` retains all five public surface/IRI exclusions supplied by
folio-resolve. Its `notice` contains the MIT license and copyright credit. The
reference gates module contains no stopword rejection list: its short-label and
place gates allow exact matches, so no additional generic-word or place-name
exclusions are introduced here.

FOLIO (Federated Open Legal Information Ontology), by Damien Riehl and
contributors, is available at <https://github.com/damienriehl/FOLIO> under
[Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/).
This index adapts that ontology by selecting labels and deriving top-level
ancestry, without definitions. Source: commit `f9c5152`.

Alias/homonym blocklist: folio-resolve, copyright Damien Riehl, MIT License.
