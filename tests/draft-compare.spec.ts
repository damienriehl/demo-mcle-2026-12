import { expect, test, type Page } from '@playwright/test';
import initial from './fixtures/views/scheduling-order-empty.json' with { type: 'json' };
import fixture from './fixtures/drafts/ui/comparison.json' with { type: 'json' };
import denseFixture from './fixtures/drafts/ui/dense-comparison.json' with { type: 'json' };

const api = '**/api/features/draft-compare';
const sse = (events: unknown[]) => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
async function open(page: Page, compare: unknown[] = fixture.compare, advice: unknown[] = fixture.advice) {
  await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: sse([[initial]]) }));
  await page.route(`${api}/samples`, route => route.fulfill({ json: { samples: fixture.samples } }));
  await page.route(`${api}/compare`, route => route.fulfill({ contentType: 'text/event-stream', body: sse(compare) }));
  await page.route(`${api}/*/advise`, route => route.fulfill({ contentType: 'text/event-stream', body: sse(advice) }));
  await page.route(`${api}/*/redline.docx?*`, route => route.fulfill({ body: 'stub redline', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  await page.route(`${api}/*/counter.docx`, route => route.fulfill({ body: 'stub counter', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Compare drafts', exact: true }).click();
}
async function sample(page: Page) {
  await page.getByLabel('Try a sample pair').selectOption('litigation');
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
}
async function advise(page: Page) {
  await sample(page);
  await page.getByRole('button', { name: 'Run advice', exact: true }).click();
  await expect(page.locator('[data-assessment="c1"]')).toContainText('Harms ▼');
}
async function next(page: Page) {
  await page.evaluate(() => (window as unknown as { nextDraftEvent: () => void }).nextDraftEvent());
}
async function stepStreams(page: Page) {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (!String(input).match(/draft-compare\/(compare|[^/]+\/advise)$/)) return response;
      const events = (await response.text()).trim().split('\n\n');
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        Object.assign(window, { draftStreamEndpoint: String(input), nextDraftEvent: () => {
          controller.enqueue(new TextEncoder().encode(`${events.shift()}\n\n`));
          if (!events.length) controller.close();
        } });
      } });
      return new Response(body, { headers: response.headers });
    };
  });
}

test('two dropped drafts stream redline, tags and parties in order', async ({ page }) => {
  await stepStreams(page);
  await open(page);
  await page.route(`${api}/compare`, async route => {
    expect(route.request().headers()['x-matter-cockpit-upload']).toBe('1');
    const body = route.request().postData()!;
    for (const text of ['name="matterId"', initial.id, 'name="earlier"; filename="earlier.docx"', 'name="later"; filename="later.pdf"']) expect(body).toContain(text);
    await route.fulfill({ contentType: 'text/event-stream', body: sse(fixture.compare) });
  });
  for (const [label, name] of [['Earlier draft', 'earlier.docx'], ['Later draft', 'later.pdf']]) {
    const transfer = await page.evaluateHandle(name => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(['fictional draft'], name));
      return transfer;
    }, name);
    await page.getByRole('button', { name: label, exact: true }).dispatchEvent('drop', { dataTransfer: transfer });
  }
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Compare drafts' }).getByRole('status')).toContainText('Comparing drafts');
  await page.waitForFunction(() => 'nextDraftEvent' in window);
  await next(page);
  const redline = page.getByRole('region', { name: 'Redline document' });
  for (const label of ['inserted', 'deleted', 'moved from', 'moved to', 'format changed']) await expect(redline.getByText(label, { exact: true }).first()).toBeAttached();
  await expect(page.getByRole('tabpanel', { name: 'Compare drafts' }).getByRole('status')).toContainText('Tagging legal concepts');
  await expect(page.locator('[data-assessment]')).toHaveCount(4);
  await expect(page.locator('[data-assessment="c1"]')).toContainText('Pending assessment');
  await next(page);
  await expect(page.getByRole('region', { name: 'FOLIO tags' })).toContainText('Notice');
  await expect(redline.getByText('format changed', { exact: true })).toHaveCount(1);
  await next(page);
  await expect(page.getByRole('radio', { name: /Quillfeather/ })).toBeChecked();
  await next(page);
  await expect(page.getByRole('button', { name: 'Run advice', exact: true })).toBeEnabled();
});

test('file pickers accept the supported formats and sample picker orders the matter family first', async ({ page }) => {
  await open(page);
  for (const label of ['Earlier draft', 'Later draft']) {
    await expect(page.locator(`input[type="file"][aria-label="${label}"]`)).toHaveAttribute('accept', '.docx,.pdf,.txt,.md,.doc,.rtf,.odt,.html,.htm');
  }
  const options = page.getByLabel('Try a sample pair').locator('option');
  await expect(options.nth(1)).toContainText('Settlement agreement');
  await expect(options.nth(2)).toContainText('Supply agreement');
  await page.route(`${api}/compare`, async route => {
    expect(route.request().postData()).toContain('name="sample"');
    expect(route.request().postData()).toContain('litigation');
    await route.fulfill({ contentType: 'text/event-stream', body: sse(fixture.compare) });
  });
  await sample(page);
});

test('advice requires a party and sends the chosen party', async ({ page }) => {
  const compare = structuredClone(fixture.compare);
  compare[2].parties!.forEach(party => { party.isMatterClient = false; });
  await open(page, compare);
  await sample(page);
  await expect(page.getByRole('button', { name: 'Run advice', exact: true })).toBeDisabled();
  await page.getByRole('radio', { name: /Copperleaf/ }).check();
  await page.route(`${api}/*/advise`, async route => {
    expect(route.request().postDataJSON()).toEqual({ matterId: initial.id, party: 'Copperleaf' });
    await route.fulfill({ contentType: 'text/event-stream', body: sse(fixture.advice) });
  });
  await page.getByRole('button', { name: 'Run advice', exact: true }).click();
  await expect(page.locator('[data-assessment="c1"]')).toContainText('Harms ▼');
});

test('assessments stream, memo orders harms first, links focus pairs, and tab switches preserve advice', async ({ page }) => {
  await stepStreams(page);
  await open(page);
  await sample(page);
  await page.waitForFunction(() => 'nextDraftEvent' in window);
  for (let i = 0; i < fixture.compare.length; i++) await next(page);
  await page.getByRole('button', { name: 'Run advice', exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: 'Compare drafts' }).getByRole('status')).toContainText('Assessing changes');
  await page.waitForFunction(() => (window as unknown as { draftStreamEndpoint: string }).draftStreamEndpoint.endsWith('/advise'));
  await next(page);
  await expect(page.locator('[data-assessment="c2"]')).toContainText('Helps ▲');
  await expect(page.locator('[data-assessment="c1"]')).toContainText('Pending assessment');
  for (let i = 1; i < fixture.advice.length; i++) await next(page);
  const summary = page.getByRole('region', { name: 'Advice memo' }).locator('summary');
  await expect(summary).toHaveText('Harms ▼: 1 · Neutral ●: 2 · Helps ▲: 1 · Advice memo');
  await expect(summary.locator('strong')).toHaveText('Harms ▼: 1');
  await expect(page.getByRole('region', { name: 'Advice memo' }).locator('details')).not.toHaveAttribute('open');
  await page.getByText('Advice memo', { exact: false }).click();
  const memo = page.getByRole('region', { name: 'Advice memo' });
  await expect(memo.getByRole('link').first()).toContainText('Five days');
  await memo.getByRole('link').first().click();
  await expect(page.locator('[data-change-id="c1"]').first()).toBeFocused();
  await expect(page.locator('[data-assessment="c1"]')).toContainText('Preserves time to respond.');
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('tab', { name: 'Compare drafts', exact: true }).click();
  await expect(page.locator('[data-assessment="c1"]')).toContainText('Harms ▼');
});

test('apply and undo select only applied ids for counter download, and redline downloads by matter', async ({ page }) => {
  await open(page);
  await advise(page);
  const card = page.locator('[data-assessment="c1"]');
  await card.getByRole('button', { name: /Harms/ }).click();
  const counter = page.getByRole('button', { name: 'Download counter-draft' });
  await expect(counter).toBeDisabled();
  await expect(page.getByText('Apply at least one suggestion first.', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(card).toContainText('Applied');
  await card.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(counter).toBeDisabled();
  await card.getByRole('button', { name: 'Apply', exact: true }).click();
  const otherCard = page.locator('[data-assessment="c2"]');
  await otherCard.getByRole('button', { name: /Helps/ }).click();
  await otherCard.getByRole('button', { name: 'Apply', exact: true }).click();
  await otherCard.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.route(`${api}/*/counter.docx`, async route => {
    expect(route.request().postDataJSON()).toEqual({ matterId: initial.id, changeIds: ['c1'] });
    await route.fulfill({ body: 'stub counter' });
  });
  let downloaded = page.waitForEvent('download');
  await counter.click();
  expect((await downloaded).suggestedFilename()).toBe(`${initial.id}-counter-draft.docx`);
  await page.route(`${api}/*/redline.docx?*`, async route => {
    expect(new URL(route.request().url()).searchParams.get('matterId')).toBe(initial.id);
    await route.fulfill({ body: 'stub redline' });
  });
  downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download redline' }).click();
  expect((await downloaded).suggestedFilename()).toBe(`${initial.id}-redline.docx`);
});

test('FOLIO filter hides other branches and selecting a tag outlines the precise source span', async ({ page }) => {
  await open(page);
  await advise(page);
  const panel = page.getByRole('region', { name: 'FOLIO tags' });
  await expect(panel).toContainText('Settlement agreement');
  await panel.getByLabel('Branch').selectOption('Clauses');
  await expect(panel.getByRole('button', { name: /Fees/ })).toHaveCount(0);
  await panel.getByRole('button', { name: /Notice.*later/ }).click();
  const span = page.locator('.dc-tag-span');
  await expect(span).toHaveText('Notice');
  await expect(span).toHaveCSS('outline-style', 'solid');
  await expect(page.getByRole('region', { name: 'Redline document' })).toContainText('FOLIO: Notice · Clauses · earlier');
  await panel.getByRole('button', { name: /Response period.*earlier/ }).click();
  await expect(span).toHaveText(['30', '5']);
  await expect(page.locator('.dc-tag-current')).toHaveText('30');
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.locator('.dc-tag-current')).toHaveText('5');
  await expect(page.locator('.dc-tag-current')).toBeFocused();
  await panel.getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('.dc-tag-current')).toHaveText('30');
});

test('changing party clears cards, memo and applied suggestions and allows fresh advice', async ({ page }) => {
  await open(page);
  await advise(page);
  const card = page.locator('[data-assessment="c1"]');
  await card.getByRole('button', { name: /Harms/ }).click();
  await card.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('radio', { name: /Copperleaf/ }).check();
  await expect(page.getByText(/Party changed/)).toBeVisible();
  await expect(page.getByText('Five days leaves too little time to respond.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Advice memo' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download counter-draft' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Run advice', exact: true })).toBeEnabled();
});

test('unverified advice has no apply and needs-key advice keeps the redline', async ({ page }) => {
  await open(page);
  await advise(page);
  const card = page.locator('[data-assessment="c4"]');
  await card.getByRole('button', { name: /Neutral/ }).click();
  await expect(card).toContainText('Unverified quote — not applicable');
  await expect(card.getByRole('button', { name: 'Apply', exact: true })).toHaveCount(0);
  await expect(page.getByText('Apply at least one suggestion first.', { exact: true })).toBeVisible();
  await page.getByRole('radio', { name: /Copperleaf/ }).check();
  await page.route(`${api}/*/advise`, route => route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'needs_key', stage: 'advice', message: 'Add an API key to run advice.' }]) }));
  await page.getByRole('button', { name: 'Run advice', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Add an API key to run advice.');
  await expect(page.getByRole('region', { name: 'Redline document' })).toContainText('Notice within');
});

test('switching party during streamed advice discards subsequent advice for the previous party', async ({ page }) => {
  await stepStreams(page);
  await open(page);
  await sample(page);
  await page.waitForFunction(() => 'nextDraftEvent' in window);
  for (let i = 0; i < fixture.compare.length; i++) await next(page);
  await page.getByRole('button', { name: 'Run advice', exact: true }).click();
  await page.waitForFunction(() => (window as unknown as { draftStreamEndpoint: string }).draftStreamEndpoint.endsWith('/advise'));
  await next(page);
  await expect(page.locator('[data-assessment="c2"]')).toContainText('Helps ▲');
  await page.getByRole('radio', { name: /Copperleaf/ }).check();
  for (let i = 1; i < fixture.advice.length; i++) await next(page);
  await expect(page.getByRole('region', { name: 'Advice memo' })).toHaveCount(0);
  await expect(page.locator('[data-assessment="c1"]')).toContainText('Pending assessment');
  await expect(page.getByRole('button', { name: 'Run advice', exact: true })).toBeEnabled();
});

test('identical drafts and refusal messages are readable on screen', async ({ page }) => {
  await open(page, [{ ...fixture.compare[0], changes: [], html: '<p>Same text.</p>' }, fixture.compare[3]]);
  await sample(page);
  await expect(page.getByText('No differences found.', { exact: true })).toBeVisible();
  await page.getByText('Draft inputs · comparison ready', { exact: true }).click();
  await page.route(`${api}/compare`, route => route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'error', message: 'The legacy converter is unavailable.' }]) }));
  await page.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The legacy converter is unavailable.');
});

test('projector layout aligns cards with changes and captures advice at 1920 by 1080', async ({ page }) => {
  await open(page, denseFixture.compare, denseFixture.advice);
  await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption('law-review');
  await advise(page);
  const panel = page.getByRole('region', { name: 'FOLIO tags' });
  await expect(panel.getByRole('button')).toHaveCount(10);
  await expect(panel.getByRole('button')).toHaveText([
    'Buyer · Actor / Player · earlier 2 · later 2', 'Seller · Actor / Player · earlier 2 · later 2',
    ...['Assignment', 'Indemnification', 'Notice', 'Payment', 'Termination'].map(label => `${label} · Clauses · earlier 2 · later 2`),
    'Asset purchase agreement · Document types · earlier 2 · later 2',
    'Assets · Objectives · earlier 2 · later 2', 'Fees · Objectives · earlier 2 · later 2',
  ]);
  await panel.getByRole('button', { name: /^Seller/ }).click();
  await expect(page.locator('.dc-tag-span')).toHaveText(['Seller', 'Seller']);
  await expect(panel.getByRole('status')).toHaveText('Seller · earlier · occurrence 1 of 4');
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Seller · earlier · occurrence 2 of 4');
  await expect(page.locator('.dc-tag-current')).toBeFocused();
  await panel.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText('Seller · later · occurrence 3 of 4');
  await panel.getByLabel('Branch').selectOption('Clauses');
  await expect(panel.locator('.dc-chip')).toHaveCount(5);
  await panel.getByLabel('Branch').selectOption('');
  await page.locator('[data-assessment="c1"]').getByRole('button', { name: /Harms/ }).click();
  const change = page.locator('[data-change-id="c1"]').first();
  const card = page.locator('[data-assessment="c1"]');
  await expect(card.locator('.dc-chip')).toHaveCount(6);
  await expect(card).toContainText('+4 more');
  await expect(card.locator('.dc-chip')).toHaveText([
    'Buyer · Actor / Player', 'Seller · Actor / Player', 'Assignment · Clauses',
    'Indemnification · Clauses', 'Notice · Clauses', 'Payment · Clauses',
  ]);
  await expect.poll(async () => Math.abs((await change.boundingBox())!.y - (await card.boundingBox())!.y)).toBeLessThan(5);
  expect((await card.boundingBox())!.height).toBeGreaterThan((await change.boundingBox())!.height + 200);
  await expect(change).toBeFocused();
  const cards = await page.locator('[data-assessment]').all();
  for (let i = 1; i < cards.length; i++) {
    const previous = (await cards[i - 1].boundingBox())!;
    expect((await cards[i].boundingBox())!.y).toBeGreaterThanOrEqual(previous.y + previous.height);
  }
  const heading = page.locator('.dc-redline .docx-Heading1');
  await expect(heading).toHaveCSS('font-family', /Newsreader/);
  await expect(heading.locator('span')).toHaveCSS('font-family', /Newsreader/);
  await expect(heading).toHaveCSS('font-weight', '500');
  await expect(page.locator('.dc-redline h2')).toHaveCSS('font-family', /Newsreader/);
  await page.getByRole('region', { name: 'Advice memo' }).evaluate(element => element.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -document.querySelector('header')!.getBoundingClientRect().height));
  await page.screenshot({ path: '.cache/dc-u6b.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
