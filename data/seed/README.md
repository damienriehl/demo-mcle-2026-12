# Synthetic matter seeds

Put one synthetic matter object per JSON file in `data/seed/matters/`. Files are read in
filename order. With zero files (or no matters directory yet), reset writes an empty list.
Use the fields in `src/data/schema.ts`, also documented in `CLAUDE.md`. All people, contacts,
documents, and events must be fictional, with `synthetic: true` on every matter.

Store every seed date as a signed integer day-offset string relative to the reset date:
`"+0"` means today, `"+12"` means twelve days ahead, and `"-30"` means thirty days ago.
This applies to timeline dates, deadline trigger dates, and dates inside deadline inputs.
For example:

```json
{
  "trigger": { "event": "Synthetic notice received", "date": "-2" },
  "inputs": { "noticeCloseDate": "+12" }
}
```

`npm run reset` recursively converts every complete string matching `[+-][0-9]+` into
an ISO `YYYY-MM-DD` date, including nested inputs. Reserve that string format for dates;
use JSON numbers for numeric quantities. Prose and provenance evidence can describe dates
in words instead. Use offsets rather than fixed ISO dates so the demo stays current.

Today is the machine's local calendar date; day arithmetic uses calendar days across month,
year, and daylight-saving boundaries. Reset validates all materialized matter shapes before
atomically replacing `data/matters.json`. Catalog validation happens in the running store
after the deadline engine is injected. Reset never computes or stores due dates.

## Fictional scheduling orders

Real public court orders are bundled under `data/seed/orders/public/` as source documents, while public-record matters are created only at runtime and never seeded.

`orders/` contains three fictional, two-page court orders. Each has an HTML source,
a committed PDF, and a matching `.extraction.json` with the court-set dates, exact
quotes, and 1-based page numbers. Every PDF page is marked
"SYNTHETIC — FOR DEMONSTRATION". Rebuild the PDFs with the installed Playwright Chromium:

```sh
npx tsx scripts/build-orders.ts
```

| Order and matching matter ID | Court | Dates |
| --- | --- | --- |
| `hennepin-lanternfish` | Hennepin County, Minnesota | Five dates across two pages |
| `ramsey-copperleaf` | Ramsey County, Minnesota | Four dates across two pages |
| `dminn-quillfeather` | District of Minnesota | Eight dates across two pages |

The PDFs and canned extractions retain fixed calendar dates so their page quotes stay
verifiable. The matching seed matters follow the day-offset convention above: their
timelines end with "Scheduling order entered" relative to reset, rather than purporting
to match the PDFs' fixed entry dates. Each has one independent pending discovery response
to keep it visible in the existing demo; no scheduling-order dates or derived deadlines
are loaded. Upload the matching PDF to populate those dates.

`tests/orders.test.ts` checks page counts, date kinds and page assignments, and verifies
every canned quote against text extracted from the committed PDF. The federal plaintiff's
expert disclosure is the `expert-disclosure` entry; the defendant's is `other`.
