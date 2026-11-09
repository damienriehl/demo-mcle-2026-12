# Fictional draft pairs

These six pairs are source material for Draft Compare demonstrations. Every party, person, institution, jurisdiction, transaction, and dispute described in the drafts is invented. Contacts use `example.invalid`. The drafts are teaching examples, not legal advice, actual client documents, enacted legislation, or operative orders.

Each family folder contains `earlier.md`, `later.md`, and `pair.json`. The Markdown drafts have a title, a short preamble, and ten sections headed `Section N. Heading`. They contain plain paragraphs without tables, footnotes, or numbered-list syntax.

The folders are `transactional-asset-purchase`, `litigation-settlement`, `regulatory-consent-order`, `legislative-bill-amendment`, `advisory-opinion-letter`, and `bankruptcy-plan-support`. The legislative drafts concern the invented State of Northmere; the regulatory drafts use the invented Orivellan Resource Assurance Commission.

The metadata records the pair's title, broad document family, named parties and roles, practice-area matter hint (or `none`), and every intended change. Each change gives a summary, its section or move route, the party harmed, the party helped, and whether a small counter-edit offers an opportunity. `none` means no party is assigned that effect. These are authoring expectations for the later analysis task, rather than generated advice. Where a change has reciprocal or mixed consequences, its summary explains the perspective assigned in the metadata.

Each later draft includes substantive edits affecting both sides, one verbatim clause move of at least twenty-five words, counter-edit opportunities, and two neutral wording clean-ups. The asset-purchase revision includes the seller's indemnity cap at 10% of the Purchase Price and moves confidentiality from Section 7 to Section 3.

A build script turns these Markdown sources into `.docx` files and supplies canned analyses for the demo. That script, the generated Word and PDF artifacts, and the verified canned results belong to the separate build task; this content set supplies only Markdown drafts and authoring metadata. The builder should preserve the section-heading syntax and use the change lists to check that comparison and analysis retain the intended examples.
