import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import initial from './fixtures/views/scheduling-order-empty.json' with { type: 'json' };
import schedule from './fixtures/views/scheduling-order.json' with { type: 'json' };

const trialId = 'order-demo-date-1';
const sse = (events: unknown[]) => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
const dates = [
  { type: 'date', kind: 'trial', event: 'Trial ready date', date: '2027-06-14', page: 2, quote: 'Trial ready date: June 14, 2027.', verified: true },
  { type: 'date', kind: 'expert-disclosure', event: 'Order-set expert disclosures', date: '2027-02-01', page: 1, quote: 'Expert disclosures: February 1, 2027.', verified: true },
  { type: 'date', kind: 'other', event: 'Unverified hearing', date: '2027-03-01', page: 2, quote: 'Hearing: March 1, 2027.', verified: false, reason: 'Quote does not appear on the cited page.' },
];
async function open(page: Page, snapshot: unknown = initial) {
  await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: sse([[snapshot]]) }));
  await page.clock.setFixedTime(new Date('2026-11-08T18:00:00Z'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Scheduling order', exact: true }).click();
}
async function publish(page: Page, snapshot: unknown) {
  await page.evaluate(data => window.dispatchEvent(new CustomEvent('schedule-snapshot', { detail: data })), [snapshot]);
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const Original = window.EventSource;
    window.EventSource = class extends Original {
      constructor(url: string | URL, config?: EventSourceInit) {
        super(url, config);
        window.addEventListener('schedule-snapshot', event => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify((event as CustomEvent).detail) })));
      }
    };
  });
});

test('upload streams quotes in arrival order, groups the live schedule, moves trial and downloads a calendar', async ({ page }) => {
  await page.route('**/api/features/scheduling-order/extract', async route => {
    expect(route.request().headers()['x-matter-cockpit-upload']).toBe('1');
    expect(route.request().postData()).toContain('name="matterId"');
    expect(route.request().postData()).toContain(initial.id);
    expect(route.request().postData()).toContain('filename="demo.pdf"');
    await route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'pages', count: 2 }, ...dates, { type: 'done', matter: schedule, added: { courtDates: 2, derived: 3 }, unverified: [dates[2]] }]) });
  });
  await open(page);
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['synthetic PDF'], 'demo.pdf', { type: 'application/pdf' }));
    return data;
  });
  await page.getByRole('button', { name: 'Drop a scheduling order' }).dispatchEvent('drop', { dataTransfer: transfer });
  const rows = page.locator('[data-order-arrival]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Trial ready date');
  await expect(rows.nth(0)).toContainText('From the order, p. 2');
  await expect(rows.nth(0).locator('blockquote')).toHaveText(dates[0].quote);
  await expect(rows.nth(1)).toContainText('Order-set expert disclosures');
  await expect(rows.nth(1)).toContainText('From the order, p. 1');
  await expect(rows.nth(2)).toContainText('Unverified quote — not added');
  await expect(rows.nth(2)).toContainText(dates[2].reason!);
  await publish(page, schedule);
  const groups = page.locator('[data-court-date]');
  await expect(groups).toHaveCount(2);
  await expect(groups.first()).toContainText('Order-set expert disclosures');
  const trial = page.locator(`[data-court-date="${trialId}"]`);
  await expect(trial).toContainText('Federal pretrial disclosures');
  await expect(trial).toContainText('Federal objections to pretrial disclosures');
  await expect(trial).toContainText('Superseded — the order sets this date (p. 1)');
  await expect(trial).toContainText('Governing court date: Order-set expert disclosures');
  await trial.locator('[data-deadline-id="order-demo-date-1-pretrial"]').click();
  await expect(page.getByRole('dialog', { name: 'Trust but Verify' })).toContainText('Federal pretrial disclosures');
  await page.getByRole('button', { name: 'Close verification' }).click();

  const { computedDeadlines: _computed, ...stored } = schedule;
  const expected = structuredClone(stored);
  expected.deadlines[0].inputs!.date = '2027-06-21';
  Object.assign(expected.deadlines[0].inputs!, { movedFrom: '2027-06-14' });
  expected.timeline[0].date = '2027-06-21';
  expected.deadlines[0].trigger = { event: expected.deadlines[0].trigger.event, date: '2027-06-21' };
  Object.assign(expected.provenance, {
    'deadlines.0.inputs.date': { source: 'stated', evidence: 'Moved on screen from 2027-06-14' },
    'deadlines.0.trigger.date': { source: 'stated', evidence: 'Moved on screen from 2027-06-14' },
    'timeline.0.date': { source: 'stated', evidence: 'Moved on screen from 2027-06-14' },
    'deadlines.0.inputs.movedFrom': { source: 'stated', evidence: 'Original order date: 2027-06-14' },
  });
  await page.route(`**/api/matters/${schedule.id}`, async route => {
    expect(route.request().method()).toBe('PUT');
    expect(route.request().headers()['content-type']).toBe('application/json');
    expect(route.request().postDataJSON()).toEqual(expected);
    await route.fulfill({ json: expected });
    const moved = structuredClone(schedule);
    Object.assign(moved, expected);
    moved.computedDeadlines[trialId].dueDate = '2027-06-21';
    moved.computedDeadlines['order-demo-date-1-pretrial'].dueDate = '2027-05-21';
    moved.computedDeadlines['order-demo-date-1-objections'].dueDate = '2027-06-04';
    await publish(page, moved);
  });
  await trial.getByLabel('Move', { exact: true }).fill('2027-06-21');
  await expect(trial.getByLabel('Move', { exact: true })).toHaveValue('2027-06-21');
  await expect(trial).toContainText('Moved on screen from 2027-06-14');
  await expect(trial.locator('[data-deadline-id="order-demo-date-1-pretrial"]')).toContainText('May 21, 2027');
  await expect(trial.locator('[data-deadline-id="order-demo-date-1-objections"]')).toContainText('Jun 4, 2027');
  await expect(trial.getByText('Date changed', { exact: true })).toHaveCount(2);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to calendar' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('scheduling-demo-schedule.ics');
  const text = await readFile((await download.path())!, 'utf8');
  expect(text).toContain('BEGIN:VCALENDAR');
  expect(text).toContain('SUMMARY:Federal pretrial disclosures');
  expect(text).not.toContain('SUMMARY:Federal expert disclosures');
});

test('schedule survives reload and paste displays needs-key and error messages without changing it', async ({ page }) => {
  await open(page, schedule);
  await page.reload();
  await page.getByRole('tab', { name: 'Scheduling order', exact: true }).click();
  await expect(page.locator('[data-court-date]')).toHaveCount(2);
  await page.getByText('Paste order text', { exact: true }).click();
  await page.getByLabel('Order text', { exact: true }).fill('Trial ready date: June 14, 2027.');
  for (const type of ['needs_key', 'error']) {
    await page.route('**/api/features/scheduling-order/extract', async route => {
      expect(route.request().headers()['x-matter-cockpit-upload']).toBe('1');
      expect(route.request().postDataJSON()).toEqual({ matterId: schedule.id, text: 'Trial ready date: June 14, 2027.' });
      await route.fulfill({ contentType: 'text/event-stream', body: sse([{ type, message: `${type} message` }]) });
    });
    await page.getByRole('button', { name: 'Extract dates' }).click();
    await expect(page.getByText(`${type} message`, { exact: true })).toBeVisible();
    await expect(page.locator('[data-court-date]')).toHaveCount(2);
    await expect(page.getByLabel('Order text', { exact: true })).toHaveValue('Trial ready date: June 14, 2027.');
  }
});

test('file picker dates appear while the extraction stream is still open', async ({ page }) => {
  await page.route('**/api/features/scheduling-order/extract', route => route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'pages', count: 2 }, ...dates, { type: 'done', added: { courtDates: 2, derived: 3 }, unverified: [dates[2]], matter: schedule }]) }));
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (String(input) !== '/api/features/scheduling-order/extract') return response;
      const events = (await response.text()).trim().split('\n\n');
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        Object.assign(window, { nextOrderEvent: () => {
          controller.enqueue(new TextEncoder().encode(`${events.shift()}\n\n`));
          if (!events.length) controller.close();
        } });
      } });
      return new Response(body, { headers: response.headers });
    };
  });
  await open(page);
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Drop a scheduling order' }).click();
  await (await chooser).setFiles({ name: 'demo.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic PDF') });
  await page.waitForFunction(() => 'nextOrderEvent' in window);
  const next = () => page.evaluate(() => (window as unknown as { nextOrderEvent: () => void }).nextOrderEvent());
  await next();
  await expect(page.getByRole('status').filter({ hasText: '2 pages' })).toBeVisible();
  await next();
  await expect(page.locator('[data-order-arrival]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeDisabled();
  await next();
  await expect(page.locator('[data-order-arrival]')).toHaveCount(2);
  await next();
  await expect(page.locator('[data-order-arrival]')).toHaveCount(3);
  await next();
  await publish(page, schedule);
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeEnabled();
});

test('changed-date labels expire after a fresh snapshot of the same dates', async ({ page }) => {
  await page.clock.install();
  await open(page, schedule);
  const moved = structuredClone(schedule);
  moved.computedDeadlines['order-demo-date-1-pretrial'].dueDate = '2027-05-21';
  await publish(page, moved);
  await expect(page.getByText('Date changed', { exact: true })).toHaveCount(1);
  await publish(page, moved);
  await page.clock.runFor(5001);
  await expect(page.getByText('Date changed', { exact: true })).toHaveCount(0);
});

test('serializes uploads and court edits until a move reaches the live snapshot', async ({ page }) => {
  await open(page, schedule);
  await page.getByText('Paste order text', { exact: true }).click();
  await page.getByLabel('Order text', { exact: true }).fill('Trial ready date: June 21, 2027.');
  const moved = structuredClone(schedule);
  moved.deadlines[0].inputs!.date = '2027-06-21';
  Object.assign(moved.deadlines[0].trigger, { date: '2027-06-21' });
  moved.computedDeadlines[trialId].dueDate = '2027-06-21';
  await page.route(`**/api/matters/${schedule.id}`, route => route.fulfill({ json: moved }));
  const response = page.waitForResponse(`**/api/matters/${schedule.id}`);
  await page.locator(`[data-court-date="${trialId}"]`).getByLabel('Move', { exact: true }).fill('2027-06-21');
  await response;
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Extract dates' })).toBeDisabled();
  for (const input of await page.getByLabel('Move', { exact: true }).all()) await expect(input).toBeDisabled();
  await publish(page, moved);
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Extract dates' })).toBeEnabled();
  let finish!: () => void;
  const ready = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/api/features/scheduling-order/extract', async route => {
    await ready;
    await route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'done', matter: moved, added: { courtDates: 2, derived: 3 } }]) });
  });
  await page.getByRole('button', { name: 'Extract dates' }).click();
  for (const input of await page.getByLabel('Move', { exact: true }).all()) await expect(input).toBeDisabled();
  finish();
  await expect(page.getByRole('button', { name: 'Extract dates' })).toBeEnabled();
});

test('successful extraction waits for its live snapshot before allowing a court edit', async ({ page }) => {
  const extracted = structuredClone(schedule);
  extracted.deadlines[0].inputs!.quote = 'Updated order: Trial ready date: June 14, 2027.';
  await page.route('**/api/features/scheduling-order/extract', route => route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'done', matter: extracted, added: { courtDates: 2, derived: 3 } }]) }));
  await open(page, schedule);
  await page.locator('input[type=file]').setInputFiles({ name: 'updated.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic PDF') });
  await expect(page.getByRole('status').filter({ hasText: 'Added 2 court dates' })).toBeVisible();
  for (const input of await page.getByLabel('Move', { exact: true }).all()) await expect(input).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeDisabled();
  await publish(page, extracted);
  for (const input of await page.getByLabel('Move', { exact: true }).all()) await expect(input).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeEnabled();
});

test('moving a court date keeps the original source, timeline, card and drawer honest', async ({ page }) => {
  await open(page, schedule);
  const writes: typeof schedule[] = [];
  await page.route(`**/api/matters/${schedule.id}`, async route => {
    const body = route.request().postDataJSON();
    writes.push(body);
    await route.fulfill({ json: body });
    const moved = structuredClone(schedule);
    Object.assign(moved, body);
    moved.computedDeadlines[trialId].dueDate = body.deadlines[0].inputs.date;
    await publish(page, moved);
  });
  const input = page.locator(`[data-court-date="${trialId}"]`).getByLabel('Move', { exact: true });
  for (const date of ['2027-06-21', '2027-06-28', '2027-06-14']) {
    await input.fill(date);
    await input.blur();
    await expect.poll(() => writes.length).toBe(['2027-06-21', '2027-06-28', '2027-06-14'].indexOf(date) + 1);
    const body = writes.at(-1)!;
    expect(body.timeline.find(event => event.id === `${trialId}-event`)?.date).toBe(date);
    expect(body.deadlines[0].inputs).toMatchObject({ date });
    if (date === '2027-06-14') expect(body.deadlines[0].inputs).not.toHaveProperty('movedFrom');
    else expect(body.deadlines[0].inputs).toHaveProperty('movedFrom', '2027-06-14');
    expect(body.provenance['deadlines.0.inputs.date'].evidence).toBe(`Moved on screen from ${writes.length === 1 ? '2027-06-14' : writes.length === 2 ? '2027-06-21' : '2027-06-28'}`);
    await expect(input).toBeEnabled();
  }
  await input.fill('2027-06-21');
  await input.blur();
  await expect(input).toBeEnabled();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  const card = page.locator(`[data-deadline-id="${trialId}"]`);
  await expect(card).toContainText('Moved on screen · order p. 2 said Jun 14, 2027');
  await card.click();
  await expect(page.getByRole('dialog')).toContainText('Moved on screen · order p. 2 said Jun 14, 2027');
});

test('keyboard date edits wait for blur or Enter and reject years outside the calendar', async ({ page }) => {
  await open(page, schedule);
  const writes: unknown[] = [];
  await page.route(`**/api/matters/${schedule.id}`, async route => {
    const body = route.request().postDataJSON();
    writes.push(body);
    await route.fulfill({ json: body });
    await publish(page, { ...schedule, ...body });
  });
  const input = page.locator(`[data-court-date="${trialId}"]`).getByLabel('Move', { exact: true });
  await input.focus();
  // Chromium starts with the month segment selected; move to the year and type it.
  await input.press('ArrowRight');
  await input.press('ArrowRight');
  await input.pressSequentially('2028');
  await expect(input).toHaveValue('2028-06-14');
  expect(writes).toHaveLength(0);
  await input.press('Enter');
  await expect.poll(() => writes.length).toBe(1);
  await expect(input).toBeEnabled();
  await input.focus();
  await input.press('ArrowRight');
  await input.press('ArrowRight');
  await input.pressSequentially('2');
  await expect(input).toHaveValue('0002-06-14');
  expect(writes).toHaveLength(1);
  await input.blur();
  expect(writes).toHaveLength(1);
  await expect(input).toHaveValue('2028-06-14');
  await input.focus();
  await input.press('ArrowRight');
  await input.press('ArrowRight');
  await input.pressSequentially('2029');
  await expect(input).toHaveValue('2029-06-14');
  expect(writes).toHaveLength(1);
  await input.blur();
  await expect.poll(() => writes.length).toBe(2);
  await expect(input).toBeEnabled();
});

for (const destination of ['tab', 'matter']) test(`in-flight extraction arrivals and snapshot lock survive changing the ${destination}`, async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (input !== '/api/features/scheduling-order/extract') return original(input, init);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({ start(controller) {
        window.addEventListener('order-chunk', event => {
          const value = (event as CustomEvent).detail;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
          if (value.type === 'done') controller.close();
        });
      } });
      return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }));
    };
  });
  await open(page);
  const other = { ...initial, id: 'another-synthetic-matter', title: 'Another synthetic matter' };
  if (destination === 'matter') {
    await page.evaluate(matters => window.dispatchEvent(new CustomEvent('schedule-snapshot', { detail: matters })), [initial, other]);
  }
  async function leave() {
    if (destination === 'tab') await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    else {
      await page.getByRole('button', { name: other.title }).click();
      await expect(page.locator('[data-order-arrival]')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeEnabled();
    }
  }
  async function returnToUpload() {
    if (destination === 'tab') await page.getByRole('tab', { name: 'Scheduling order', exact: true }).click();
    else await page.getByRole('button', { name: initial.title }).click();
  }
  await page.locator('input[type=file]').setInputFiles({ name: 'slow.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic') });
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeDisabled();
  await page.evaluate(date => window.dispatchEvent(new CustomEvent('order-chunk', { detail: date })), dates[0]);
  await expect(page.locator('[data-order-arrival]')).toHaveCount(1);
  await leave();
  await page.evaluate(date => window.dispatchEvent(new CustomEvent('order-chunk', { detail: date })), dates[1]);
  await returnToUpload();
  await expect(page.locator('[data-order-arrival]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeDisabled();
  await page.evaluate(matter => window.dispatchEvent(new CustomEvent('order-chunk', { detail: { type: 'done', matter, added: { courtDates: 2, derived: 3 } } })), schedule);
  await expect(page.getByRole('status').filter({ hasText: 'Added 2 court dates' })).toBeVisible();
  await leave();
  await returnToUpload();
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeDisabled();
  await publish(page, schedule);
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeEnabled();
  await expect(page.locator('[data-order-arrival]')).toHaveCount(2);
});


test('an unchanged done event displays the verification message and unlocks without a new snapshot', async ({ page }) => {
  const message = 'No dates could be verified; the matter was not changed.';
  await page.route('**/api/features/scheduling-order/extract', route => route.fulfill({
    contentType: 'text/event-stream', body: sse([dates[2], {
      type: 'done', matter: schedule, added: { courtDates: 0, derived: 0 }, unverified: [dates[2]], message,
    }]),
  }));
  await open(page, schedule);
  await page.locator('input[type=file]').setInputFiles({ name: 'unverified.pdf', mimeType: 'application/pdf', buffer: Buffer.from('synthetic') });
  await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeEnabled();
  await expect(page.locator('[data-court-date]')).toHaveCount(2);
  await expect(page.locator('[data-order-arrival]')).toContainText('Unverified quote — not added');
});

test('a rejected move restores the saved date in the input', async ({ page }) => {
  await open(page, schedule);
  let writes = 0;
  await page.route(`**/api/matters/${schedule.id}`, async route => {
    writes++;
    await route.fulfill({ status: 500, json: { error: 'Could not save' } });
  });
  const input = page.locator(`[data-court-date="${trialId}"]`).getByLabel('Move', { exact: true });
  await input.fill('2027-06-21');
  await expect(page.getByRole('status').filter({ hasText: 'Could not move the court date.' })).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue('2027-06-14');
  expect(writes).toBe(1);
});

test('a moved governing date is labeled honestly on its superseded schedule', async ({ page }) => {
  await open(page, schedule);
  await page.route(`**/api/matters/${schedule.id}`, async route => {
    const body = route.request().postDataJSON();
    await route.fulfill({ json: body });
    const moved = { ...structuredClone(schedule), ...body };
    moved.computedDeadlines['order-demo-date-2'].dueDate = '2027-02-08';
    await publish(page, moved);
  });
  await page.locator('[data-court-date="order-demo-date-2"]').getByLabel('Move', { exact: true }).fill('2027-02-08');
  const superseded = page.locator('[data-court-date]').filter({ has: page.locator('.order-superseded') }).locator('.order-superseded');
  await expect(superseded).toContainText('Moved on screen · order p. 1 said Feb 1, 2027');
  await expect(superseded).not.toContainText('the order sets this date');
});
