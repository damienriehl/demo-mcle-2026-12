import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { getComments, getRevisions, initialize } from 'docxodus/core';
import { compareEventSchema, comparisonRecordSchema } from '../server/drafts/types';
import seed from '../data/seed/matters/velvet-acorn.json' with { type: 'json' };

const api = '/api/features/draft-compare';
const buyer = 'Quorrelith Components LLC';

test.beforeAll(async () => { await initialize(); });

test('asset-purchase advice exports a commented redline and only the applied indemnity counter', async ({ page, request }, testInfo) => {
  // The real compare route looks up this seeded matter in the server store.
  const matterResponse = await request.get(`/api/matters/${seed.id}`);
  expect(matterResponse.ok(), 'The server must already hold the seeded asset-purchase matter.').toBe(true);
  const matter = await matterResponse.json();
  await page.route('**/api/events', route => route.fulfill({
    contentType: 'text/event-stream', body: `data: ${JSON.stringify([matter])}\n\n`,
  }));
  await page.goto('/');
  await page.getByRole('button', { name: seed.title, exact: false }).click();
  await page.getByRole('tab', { name: 'Compare drafts', exact: true }).click();
  await page.getByLabel('Try a sample pair').selectOption('transactional-asset-purchase');
  const comparing = page.waitForResponse(response => response.url().endsWith(`${api}/compare`));
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  const compareEvents = (await (await comparing).text()).trim().split('\n\n')
    .map(event => compareEventSchema.parse(JSON.parse(event.replace(/^data: */, ''))));
  const redlineEvent = compareEvents.find(event => event.type === 'redline');
  expect(redlineEvent).toBeDefined();
  expect(compareEvents.at(-1)?.type).toBe('done');

  const redline = page.getByRole('region', { name: 'Redline document' });
  await expect(redline.locator('.rev-move-from').first()).toBeAttached();
  await expect(redline.locator('.rev-move-to').first()).toBeAttached();
  await expect(page.getByRole('region', { name: 'FOLIO tags' })).toContainText('Indemnification');
  await expect(page.getByRole('button', { name: 'Run advice', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: new RegExp(`${buyer}.*buyer`, 'i') }).check();
  const advising = page.waitForResponse(response => response.url().endsWith('/advise'));
  await page.getByRole('button', { name: 'Run advice', exact: true }).click();
  await (await advising).finished();
  await expect(page.getByRole('button', { name: 'Run advice', exact: true })).toBeEnabled();
  const recordResponse = await request.get(`${api}/${redlineEvent!.comparisonId}?matterId=${seed.id}`);
  expect(recordResponse.ok()).toBe(true);
  const record = comparisonRecordSchema.parse(await recordResponse.json());
  expect(record.party).toBe(buyer);
  expect(record.assessments).toHaveLength(8);
  expect(record.assessments).toHaveLength(record.changes.length);
  await expect(page.locator('[data-assessment]')).toHaveCount(record.assessments.length);
  const memo = page.getByRole('region', { name: 'Advice memo' });
  await memo.locator('summary').click();
  const indemnity = memo.getByRole('link', { name: /Seller's indemnity cap falls/ });
  await indemnity.click();
  const card = page.locator('[data-assessment]').filter({ hasText: "Seller's indemnity cap falls" });
  await expect(card).toContainText('Harms ▼');
  await expect(card).toContainText('Replace with: shall not exceed the Purchase Price');
  await expect(card.getByRole('button', { name: /Harms/ })).toHaveAttribute('aria-expanded', 'true');
  await card.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(card).toContainText('Applied');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('asset-purchase-advice.png'), fullPage: true });

  const redlineDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download redline', exact: true }).click();
  const downloadedRedline = await redlineDownload;
  expect(downloadedRedline.suggestedFilename()).toBe(`${seed.id}-redline.docx`);
  const redlineBytes = await readFile((await downloadedRedline.path())!);
  expect(redlineBytes.byteLength).toBeGreaterThan(0);
  const revisions = await getRevisions(redlineBytes);
  expect(revisions.filter(revision => revision.type === 'move')).toHaveLength(1);
  const comments = await getComments(redlineBytes);
  expect(comments).toHaveLength(record.assessments.length);
  for (const assessment of record.assessments) {
    expect(comments.filter(comment => comment.text.includes(assessment.reason))).toHaveLength(1);
  }

  const counterDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download counter-draft', exact: true }).click();
  const downloadedCounter = await counterDownload;
  expect(downloadedCounter.suggestedFilename()).toBe(`${seed.id}-counter-draft.docx`);
  const counterBytes = await readFile((await downloadedCounter.path())!);
  expect(counterBytes.byteLength).toBeGreaterThan(0);
  expect((await getRevisions(counterBytes)).map(({ type, author, text }) => ({ type, author, text }))).toEqual([
    { type: 'insert', author: `${buyer} counsel`, text: 'shall not exceed' },
    { type: 'delete', author: `${buyer} counsel`, text: 'is capped at 10% of' },
  ]);
  expect(await getComments(counterBytes)).toEqual([]);
});
