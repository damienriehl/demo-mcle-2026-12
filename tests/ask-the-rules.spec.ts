import { expect, test } from '@playwright/test';

// Reads the live store without writing it, so it can run beside the specs that seed it.
// Ranking and verbatim quoting are pinned against the library in tests/ask-the-rules.test.ts.
test('Ask the Rules quotes the closest rules for the active matter', async ({ page, request }) => {
  const [matter] = await (await request.get('/api/matters')).json() as { title: string }[];
  const question = 'How many days do I have to answer the complaint?';
  await page.goto('/');
  await page.getByRole('button', { name: matter.title }).first().click();
  await page.getByRole('tab', { name: 'Ask the Rules' }).click();
  const panel = page.getByRole('region', { name: 'Ask the Rules' });
  await panel.getByRole('textbox', { name: 'Your procedure question' }).fill(question);
  await panel.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText(`3 rules for “${question}”`);
  const results = panel.getByRole('list', { name: 'Matching rules' }).getByRole('listitem');
  await expect(results).toHaveCount(3);
  await expect(results.first().locator('blockquote')).toContainText(/within 21 days/i);
  await expect(results.first().locator('blockquote')).toContainText(/answer/i);
  await expect(results.first().getByRole('link', { name: /^Official source for / })).toHaveAttribute('href', /^https:\/\//);
});
