import { expect, test } from '@playwright/test';

test('patent matter shows the prior-art listing, citation trail, and verified ratings', async ({ page }) => {
  await page.route('**/api/features/prior-art/run', route => route.fulfill({ json: {
    runId: 'r1', source: 'sample', sourceLine: 'Illustrative sample (no USPTO key configured)', notices: [],
    queries: ['folding shade canopy'], numbers: [], trailNodeCount: 2, invention: 'Self-folding shade canopy. Spiral hinge locks the canopy without a separate pin.',
    candidates: [{ id: 'SAMPLE-1', title: 'Collapsible shade canopy with radial ribs', date: '2019-04-16', text: 'A removable locking pin holds the ribs.', sample: true }],
    trails: [{ id: 'SAMPLE-1', title: 'Collapsible shade canopy with radial ribs', date: '2019-04-16', text: 'x', sample: true, depth: 0, children: [
      { id: 'SAMPLE-3', title: 'Self-erecting beach umbrella', date: '2015-06-23', text: 'y', sample: true, depth: 1, category: 'examiner', children: [] },
    ] }],
  } }));
  await page.route('**/api/features/prior-art/analyze', route => route.fulfill({ json: { ratings: [
    { id: 'SAMPLE-1', rating: 'Partial', reason: 'Folding canopy, but locks with a separate pin.', quote: 'A removable locking pin holds the ribs.', quoteVerified: true },
  ] } }));
  await page.goto('/');
  await page.getByRole('button', { name: /Self-folding shade canopy/ }).first().click();
  await page.getByRole('tab', { name: 'Prior art', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Prior art' });
  await expect(panel.getByText('Illustrative sample — not real USPTO data', { exact: false })).toBeVisible();
  await expect(panel.locator('[data-candidate="SAMPLE-1"]')).toContainText('Relation: Partial');
  await expect(panel.locator('[data-candidate="SAMPLE-1"] blockquote')).toContainText('removable locking pin');
  await expect(panel.locator('[data-trail-node="SAMPLE-3"]')).toContainText('cited by examiner');
  await expect(panel.getByText('not a patentability opinion', { exact: false })).toBeVisible();
  await expect(panel.locator('a[href*="patents.google.com"]')).toHaveCount(0);
});

test('real server falls back to the labeled sample without a USPTO key', async ({ page }) => {
  await page.route('**/api/features/prior-art/analyze', route => route.fulfill({ status: 503, json: { error: 'needs_key', message: 'x' } }));
  await page.goto('/');
  await page.getByRole('button', { name: /Self-folding shade canopy/ }).first().click();
  await page.getByRole('tab', { name: 'Prior art', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Prior art' });
  await expect(panel.locator('[data-candidate]').first()).toBeVisible();
  await expect(panel.getByText('Relevance ratings need a Claude API key', { exact: false })).toBeVisible();
});
