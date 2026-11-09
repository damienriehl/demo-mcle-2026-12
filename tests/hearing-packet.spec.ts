import { expect, test } from '@playwright/test';

test('family matter shows the hearing packet sections with verified excerpts', async ({ page }) => {
  await page.route('**/api/features/hearing-packet/analyze', route => route.fulfill({ json: { narrative: {
    happened: [{ date: '2026-09-08', text: 'Aster filed for dissolution and asked for custody.' }],
    issues: ['Should the court adopt the school-night schedule pending trial?'],
    ourPosition: ['The two-week trial schedule worked for the children.'],
    theirArguments: [{ argument: 'The schedule is too new to adopt.', response: 'Two weeks of stable exchanges show it works.' }],
    excerpts: [
      { documentId: 'doc-1', documentTitle: 'Temporary-custody hearing notice', why: 'Frames the relief', quote: 'not emergency or post-trial relief', verified: true },
      { documentId: 'doc-2', documentTitle: 'Parenting schedule working note', why: 'Paraphrase', verified: false },
    ],
    risks: ['Opposing papers may raise new issues.'],
    checklist: ['Confirm courtroom'],
    omitted: [],
  } } }));
  await page.goto('/');
  await page.getByRole('button', { name: /Marriage of Aster Lindmere/ }).first().click();
  await page.getByRole('tab', { name: 'Hearing packet', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Hearing packet' });
  await expect(panel.getByRole('combobox')).toContainText('Scheduled temporary-custody motion hearing');
  for (const title of ['Hearing at a glance', 'What has happened', 'What the court will decide', 'Our position and best arguments',
    "Other side's likely arguments, and our responses", 'Key documents and excerpts', 'Deadlines around the hearing', 'Risks and open questions', 'Prep checklist']) {
    await expect(panel.getByRole('region', { name: title })).toBeVisible();
  }
  await expect(panel.getByText('Internal work product — prepared for counsel', { exact: false })).toBeVisible();
  await expect(panel.locator('blockquote')).toContainText('not emergency or post-trial relief');
  await expect(panel.getByText('Quote not verified — omitted')).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Hearing at a glance' })).toContainText(/in \d+ days/);
  await expect(panel.getByRole('button', { name: 'Print packet' })).toBeVisible();
  await expect(panel.getByRole('checkbox').first()).not.toBeChecked();
});

test('without a key the packet falls back to structured sections', async ({ page }) => {
  await page.route('**/api/features/hearing-packet/analyze', route => route.fulfill({ status: 503, json: { error: 'needs_key', message: 'x' } }));
  await page.goto('/');
  await page.getByRole('button', { name: /Marriage of Aster Lindmere/ }).first().click();
  await page.getByRole('tab', { name: 'Hearing packet', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Hearing packet' });
  await expect(panel.getByText('Narrative sections need a Claude API key.', { exact: false })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'Deadlines around the hearing' })).toBeVisible();
  await expect(panel.getByRole('region', { name: 'What the court will decide' })).toHaveCount(0);
});
