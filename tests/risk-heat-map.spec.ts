import { expect, test } from '@playwright/test';
import rawFixtures from './fixtures/views/matters.json' with { type: 'json' };
import { matterSchema } from '../src/data/schema';
import { computeDeadline } from '../src/engine';

const fixtures = rawFixtures.map(raw => {
  const matter = matterSchema.parse(raw);
  return { ...matter, computedDeadlines: Object.fromEntries(matter.deadlines.map(deadline => [deadline.id, computeDeadline(deadline)])) };
});

test.describe('risk heat map', () => {
  test('Radar ranks the hottest matters first with labeled heat bands', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-08T18:00:00Z'));
    await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(fixtures)}\n\n` }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Deadline Radar', exact: true }).click();
    const map = page.getByRole('region', { name: 'Risk Heat Map' });
    await expect(map).toBeVisible();
    const tiles = map.locator('[data-heat-tile]');
    await expect(tiles).toHaveCount(7);
    await expect(tiles.nth(0)).toContainText('Northstar Studio v. Vale');
    await expect(tiles.nth(0)).toContainText('Hot');
    await expect(tiles.nth(0)).toContainText('3 days overdue');
    await expect(tiles.nth(1)).toContainText('Cedar House acquisition');
    await expect(tiles.nth(1)).toContainText('2 days left');
    await expect(tiles.nth(3)).toContainText('Lumen optics application');
    await expect(tiles.nth(3)).toContainText('Warm');
    await expect(map.locator('[data-heat-tile][data-heat="Cool"]')).toHaveCount(2);
    await expect(map.locator('[data-heat-tile]', { hasText: 'Clearwater comment letter' })).toContainText('Needs verification: No computed-deadline logic on file');
    await map.scrollIntoViewIfNeeded();
    await page.screenshot({ path: 'test-results/risk-heat-map.png', fullPage: false });
  });
});
