import { expect, test } from '@playwright/test';

test('the app shell loads and reaches the API', async ({ page, request }) => {
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  expect(await health.json()).toEqual({ ok: true });

  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Matter Cockpit' })).toBeVisible();
  await expect(page.getByTestId('health-status')).toHaveText('Server: connected');
});
