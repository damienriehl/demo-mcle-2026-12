import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fixtures from './fixtures/views/matters.json' with { type: 'json' };

const runtime = resolve('data/matters.json');
let backup: Buffer | undefined;
async function seed(matters: unknown) {
  await writeFile(`${runtime}.email-tmp`, JSON.stringify(matters));
  await rename(`${runtime}.email-tmp`, runtime);
}
async function openNorthstar(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-01T18:00:00Z'));
  await page.goto('/');
  await page.getByRole('button', { name: /Northstar Studio v. Vale/ }).click();
  return page.getByRole('region', { name: 'Client update email' });
}

test.describe('client update email', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    try { backup = await readFile(runtime); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await mkdir(resolve('data'), { recursive: true });
    await seed(fixtures);
  });
  test.afterAll(async () => {
    if (backup) { await writeFile(`${runtime}.email-tmp`, backup); await rename(`${runtime}.email-tmp`, runtime); }
    else await rm(runtime, { force: true });
  });

  test('one click drafts an email from the active matter and offers a copy', async ({ page }) => {
    let sent: unknown;
    await page.route('**/api/features/client-update-email/draft', async route => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { email: 'Subject: Northstar update\n\nHi Northstar Client, a quick update.' } });
    });
    const panel = await openNorthstar(page);
    await panel.getByRole('button', { name: 'Draft email', exact: true }).click();
    await expect(panel.getByRole('textbox', { name: 'Email draft' })).toHaveValue(/Hi Northstar Client, a quick update\./);
    await expect(panel.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
    expect(sent).toMatchObject({ facts: { clientName: 'Northstar Client', nextSteps: ['Send us the signed copy.', 'Call us to discuss your questions.'], upcomingDates: [{ label: 'Review and response', date: 'Nov 5, 2026' }] } });
  });

  test('shows the plain-language message when no app key is configured', async ({ page }) => {
    await page.route('**/api/features/client-update-email/draft', route => route.fulfill({ status: 503, json: { error: 'needs_key', message: 'No Claude API key found.' } }));
    const panel = await openNorthstar(page);
    await panel.getByRole('button', { name: 'Draft email', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('No Claude API key found.');
  });
});
