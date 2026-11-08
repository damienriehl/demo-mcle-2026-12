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
