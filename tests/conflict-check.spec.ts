import { expect, test } from '@playwright/test';
import fixtures from './fixtures/views/matters.json' with { type: 'json' };

// Serve the fixture matters through the live event stream so this spec never rewrites the shared store.
const matters = fixtures.map(matter => ({ ...matter, deadlines: [], computedDeadlines: {} }));

test('conflict check flags a counterparty that appears in other matters', async ({ page }) => {
  await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(matters)}\n\n` }));
  await page.goto('/');
  await page.getByRole('button', { name: /Northstar Studio v. Vale/ }).click();
  const panel = page.getByRole('region', { name: 'Conflict check' });
  await expect(panel).toContainText('1 name also appears in another matter');
  await expect(panel).toContainText('Fictional Counterparty');
  await expect(panel.getByRole('listitem')).toHaveCount(6);
  await expect(panel.getByRole('listitem').filter({ hasText: 'Clearwater comment letter' })).toHaveCount(1);
  await expect(panel).not.toContainText('Northstar Client');
  await page.screenshot({ path: 'test-results/conflict-check.png' });
});
