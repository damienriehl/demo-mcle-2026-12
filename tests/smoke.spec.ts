import { expect, test } from '@playwright/test';

test('the app shell loads and reaches the API', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ ok: true });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Matter Cockpit' })).toBeVisible();
  await expect(page.getByTestId('health-status')).toHaveText('Server: connected');
});

test('body text meets the 18px projector floor', async ({ page }) => {
  await page.goto('/');
  const px = await page.getByTestId('health-status').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(px).toBeGreaterThanOrEqual(18);
});
