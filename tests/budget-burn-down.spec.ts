import { expect, test } from '@playwright/test';

test('budget burn-down charts fees billed against the client budget for the active matter', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Prairie Fen Studios/ }).click();
  await page.getByRole('tab', { name: 'Budget Burn-Down' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Budget Burn-Down' });
  await panel.getByLabel('Client budget (USD)').fill('50000');
  await panel.getByLabel('Fees billed so far (USD)').fill('18500');
  await expect(panel.getByRole('status')).toHaveText('$18,500 billed of $50,000: 37% used, $31,500 remaining.');
  await expect(panel.getByRole('img', { name: /37% used/ })).toBeVisible();
  await panel.getByLabel('Fees billed so far (USD)').fill('56000');
  await expect(panel.getByRole('status')).toContainText('OVER BUDGET. Over budget by $6,000');
});
