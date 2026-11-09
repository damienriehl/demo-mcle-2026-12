import { expect, test, type Page } from '@playwright/test';

async function openPortal(page: Page) {
  await page.goto('/');
  await page.locator('.matter-list button').first().click();
  await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
  return page.getByRole('region', { name: 'What happens next' });
}

test('the client asks what happens next and gets a plain-English step, its engine date, and why', async ({ page }) => {
  test.setTimeout(90_000);
  const section = await openPortal(page);
  await section.getByRole('button', { name: 'Explain my next step' }).click();
  await expect(section.getByText('Why it matters', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(section.getByText('When', { exact: true })).toBeVisible();
  await expect(section).toContainText(/[A-Z][a-z]{2} \d{1,2}, \d{4}|No date set yet/);
  await section.screenshot({ path: 'test-results/what-happens-next.png' });
});

test('without a key the section explains how to unlock it', async ({ page }) => {
  await page.route('**/api/features/what-happens-next/explain', route => route.fulfill({
    status: 503, contentType: 'application/json',
    body: JSON.stringify({ error: 'needs_key', message: 'No Claude API key found. Put it in ~/.config/matter-cockpit/api-key, or set MATTER_COCKPIT_API_KEY in .env.local, then try again.' }),
  }));
  const section = await openPortal(page);
  await section.getByRole('button', { name: 'Explain my next step' }).click();
  await expect(section).toContainText('No Claude API key found.');
  await expect(section).toContainText('A configured app key unlocks this explanation.');
});
