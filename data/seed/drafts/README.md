# Fictional draft pairs

These six pairs are source material for Draft Compare demonstrations. Every party, person, institution, jurisdiction, transaction, and dispute described in the drafts is invented. Contacts use `example.invalid`. The drafts are teaching examples, not legal advice, actual client documents, enacted legislation, or operative orders.

Each family folder contains `earlier.md`, `later.md`, and `pair.json`. The Markdown drafts have a title, a short preamble, and ten sections headed `Section N. Heading`. They contain plain paragraphs without tables, footnotes, or numbered-list syntax.

The folders are `transactional-asset-purchase`, `litigation-settlement`, `regulatory-consent-order`, `legislative-bill-amendment`, `advisory-opinion-letter`, and `bankruptcy-plan-support`. The legislative drafts concern the invented State of Northmere; the regulatory drafts use the invented Orivellan Resource Assurance Commission.

The metadata records the pair's title, broad document family, named parties and roles, practice-area matter hint (or `none`), and every intended change. Each change gives a summary, its section or move route, the party harmed, the party helped, and whether a small counter-edit offers an opportunity. `none` means no party is assigned that effect. These are authoring expectations for the later analysis task, rather than generated advice. Where a change has reciprocal or mixed consequences, its summary explains the perspective assigned in the metadata.

Each later draft includes substantive edits affecting both sides, one verbatim clause move of at least twenty-five words, counter-edit opportunities, and two neutral wording clean-ups. The asset-purchase revision includes the seller's indemnity cap at 10% of the Purchase Price and moves confidentiality from Section 7 to Section 3.

Rebuild the committed Word files and the litigation later PDF from the Markdown, then generate verified canned analyses with the app's configured Claude key:

```sh
npx tsx scripts/build-drafts.ts
npx tsx scripts/generate-canned.ts
```

Both commands use the already installed dependencies; no package-script changes or downloads are needed. The builder uses `normalizeDraft` for Word and local Playwright Chromium for the litigation PDF. Rebuilding unchanged Markdown produces identical bytes, including canonical Word relationship IDs and fixed PDF clock metadata. The bankruptcy confidentiality clause sits before the notices paragraph in Section 10 because the engine treats a move to the final paragraph as a deletion and insertion.

The generator calls `createClient` through `server/ai.ts`, using the app's configured key without displaying it. With no configured key it prints the standard needs-key message and exits. To regenerate just one pair:

```sh
npx tsx scripts/generate-canned.ts transactional-asset-purchase
```

Generation uses the same source selection as `GET /samples`: earlier Word if present, otherwise Markdown; later PDF first, then Word, then Markdown. It normalizes those actual files before hashing their text and comparing, so the litigation replay key and change IDs match the Word-versus-PDF route. Rebuild before generating canned results whenever a Markdown source changes.

The generator runs one model fact pass, then advice for every party named in `pair.json`, through the route's verification code. It writes `meta.json` (content key, detected parties, document type, and verified model tags) and `analysis.<party-slug>.json` (party and verified assessments). Counter-language is retained only when its span verifies; replay verifies that span again. Each pair's summary reports changes, verified and unverified assessments, and counters kept. Unverified assessments are counted but never saved. Inspect generated advice for the intended effects in `pair.json`, run the sample tests, and commit the results. Samples without canned files still compare; canned assertions skip until those files are generated.
