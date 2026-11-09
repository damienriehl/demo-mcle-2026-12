import { expect, test, type Page } from '@playwright/test';
import rawFixtures from './fixtures/views/matters.json' with { type: 'json' };
import { matterSchema } from '../src/data/schema';
import { computeDeadline } from '../src/engine';

const fixtures = rawFixtures.map(raw => {
  const matter = matterSchema.parse(raw);
  return { ...matter, computedDeadlines: Object.fromEntries(matter.deadlines.map(deadline => [deadline.id, computeDeadline(deadline)])) };
});
fixtures[0].provenance['parties.0.role'] = { source: 'invented' };

const themes = [
  { id: 'law-review', name: 'Law Review', background: 'rgb(247, 243, 234)', font: 'Newsreader', radius: '0px' },
  { id: 'mission-control', name: 'Mission Control', background: 'rgb(13, 20, 32)', font: 'Space Grotesk', radius: '12px' },
  { id: 'boutique-firm', name: 'Boutique Firm', background: 'rgb(241, 237, 228)', font: 'Fraunces', radius: '16px' },
];
async function open(page: Page, matters = fixtures) {
  await page.clock.setFixedTime(new Date('2026-11-08T18:00:00Z'));
  await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(matters)}\n\n` }));
  await page.goto('/');
  await expect(page.locator('.matter-list button').first()).toBeVisible();
}
async function legible(page: Page) {
  const sizes = await page.locator('.matter-app *').evaluateAll(elements => elements.filter(el => el.getClientRects().length && el.textContent?.trim()).map(el => parseFloat(getComputedStyle(el).fontSize)));
  expect(Math.min(...sizes)).toBeGreaterThanOrEqual(18);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1920);
}

test('three themes restyle every view and the open verify drawer live, then persist', async ({ page }) => {
  await open(page);
  const selector = page.getByRole('combobox', { name: 'Theme', exact: true });
  await expect(selector.locator('option')).toHaveText(themes.map(theme => theme.name));
  await expect(selector).toHaveValue('law-review');
  await page.evaluate(() => Object.assign(window, { themeSession: 'same document' }));
  for (const theme of themes) {
    await selector.selectOption(theme.id);
    await expect(page.locator('body')).toHaveCSS('background-color', theme.background);
    for (const view of ['Cockpit', 'Deadline Radar', 'Client Portal']) {
      await page.getByRole('button', { name: view, exact: true }).click();
      await expect(page.locator('main h2').first()).toHaveCSS('font-family', new RegExp(theme.font));
      await legible(page);
      if (view === 'Client Portal') {
        await page.getByRole('button', { name: 'Cedar House acquisition', exact: true }).click();
        await expect(page.locator('.portal-date')).toContainText('Nov 10, 2026');
        await expect(page.locator('.portal-view .source-label, .portal-view [data-source]')).toHaveCount(0);
        await page.getByRole('checkbox', { name: 'Show what I said' }).check();
        await expect(page.locator('.portal-view .source-label, .portal-view [data-source]')).toHaveCount(0);
        await page.getByRole('checkbox', { name: 'Show what I said' }).uncheck();
      }
      await page.screenshot({ path: `test-results/themes-${theme.id}-${view === 'Cockpit' ? 'cockpit' : view === 'Deadline Radar' ? 'radar' : 'portal'}.png` });
    }
    await page.getByRole('button', { name: 'Cockpit', exact: true }).click();
    await page.locator('.matter-list button').first().click();
    await expect(page.locator('[data-deadline-card]').first()).toHaveCSS('border-radius', theme.radius);
  }
  await page.locator('[data-deadline-card]').first().click();
  const drawer = page.getByRole('dialog', { name: 'Trust but Verify' });
  for (const theme of themes) {
    // The selector is behind the modal; dispatch the same change while keeping it open.
    await selector.selectOption(theme.id, { force: true });
    await expect(drawer).toHaveCSS('background-color', theme.background);
    await expect(drawer.locator('h2')).toHaveCSS('font-family', new RegExp(theme.font));
    await legible(page);
  }
  expect(await page.evaluate(() => (window as unknown as { themeSession: string }).themeSession)).toBe('same document');
  await page.reload();
  await expect(selector).toHaveValue('boutique-firm');
  await expect(page.locator('body')).toHaveCSS('background-color', themes[2].background);
});

test('source markers distinguish AI additions and the toggle emphasizes stated facts without fading text', async ({ page }) => {
  await open(page);
  const stated = page.locator('[data-source="stated"]').first();
  const inferred = page.locator('[data-source="inferred"]').first();
  const invented = page.locator('[data-source="invented"]').first();
  await expect(stated.locator('.source-label')).toBeHidden();
  await expect(inferred.locator('.source-label')).toHaveText('AI inferred');
  await expect(inferred.locator('.source-label')).toHaveCSS('font-style', 'italic');
  await expect(invented.locator('.source-label')).toHaveText('AI invented');
  await expect(invented.locator(':scope > span').first()).toHaveCSS('text-decoration-style', 'dotted');
  for (const theme of themes) {
    await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme.id);
    const originalColor = await inferred.evaluate(el => getComputedStyle(el).color);
    await page.getByRole('checkbox', { name: 'Show what I said' }).check();
    await expect(stated).toHaveCSS('font-weight', '700');
    await expect(inferred).toHaveCSS('font-weight', '400');
    expect(await stated.evaluate(el => getComputedStyle(el).borderLeftColor)).not.toBe('rgba(0, 0, 0, 0)');
    for (const field of [stated, inferred, invented]) await expect(field).toHaveCSS('opacity', '1');
    await expect(inferred).toHaveCSS('color', originalColor);
    await page.getByRole('checkbox', { name: 'Show what I said' }).uncheck();
  }
});

test('empty Radar bands form compact summaries and give occupied bands the width', async ({ page }) => {
  await open(page, fixtures.slice(0, 1));
  await page.getByRole('button', { name: 'Deadline Radar', exact: true }).click();
  const empty = page.locator('.radar-band').filter({ hasText: 'Nothing due' });
  await expect(empty).toHaveCount(4);
  const summaries = await empty.evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height));
  expect(Math.max(...summaries)).toBeLessThan(130);
  const occupied = await page.locator('.radar-band').filter({ has: page.locator('[data-deadline-card]') }).boundingBox();
  expect(occupied!.width).toBeGreaterThan(800);
  await page.screenshot({ path: 'test-results/themes-compact-radar.png' });
});
