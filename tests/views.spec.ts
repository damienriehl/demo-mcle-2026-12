import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import fixtures from './fixtures/views/matters.json' with { type: 'json' };
import example from './fixtures/views/feature.json' with { type: 'json' };

const runtime = resolve('data/matters.json');
const featurePath = resolve('src/features/fixture-brief');
let backup: Buffer | undefined;
async function seed(matters: unknown) {
  await writeFile(`${runtime}.views-tmp`, JSON.stringify(matters));
  await rename(`${runtime}.views-tmp`, runtime);
}
async function open(page: Page) {
  await page.clock.setFixedTime(new Date('2026-11-08T18:00:00Z'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Northstar Studio v. Vale/ })).toBeVisible();
}
function sse(events: unknown[]) { return events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''); }

test.describe('shared matter views', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeAll(async () => {
    try { backup = await readFile(runtime); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await mkdir(resolve('data'), { recursive: true });
    await seed(fixtures);
  });
  test.afterAll(async () => {
    if (backup) { await writeFile(`${runtime}.views-tmp`, backup); await rename(`${runtime}.views-tmp`, runtime); }
    else await rm(runtime, { force: true });
  });
  test.beforeEach(async () => { await seed(fixtures); });

  test('Radar orders all seven matters, bands countdowns, and opens a focused Cockpit', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Deadline Radar', exact: true }).click();
    const bands = page.locator('[data-band]');
    await expect(bands).toHaveCount(5);
    await expect(page.locator('[data-deadline-card]')).toHaveCount(7);
    await expect(page.locator('[data-deadline-card]').first()).toContainText('3 days overdue');
    await expect(page.getByRole('region', { name: 'This week' })).toContainText('2 days left');
    await expect(page.getByRole('region', { name: 'This month' })).toContainText('11 days left');
    await expect(page.getByRole('region', { name: 'Later' })).toContainText('40 days left');
    const unknown = page.getByRole('region', { name: 'Needs verification' });
    await expect(unknown).toContainText('No deadline rule selected.');
    await expect(unknown.locator('[data-verification-marker]')).toBeVisible();
    await expect(unknown).not.toContainText(/NaN|days left/);
    const noticeTop = await page.locator('.synthetic-notice').evaluate(element => element.getBoundingClientRect().top);
    const cardBottoms = await page.locator('[data-deadline-card]').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().bottom));
    expect(Math.max(...cardBottoms)).toBeLessThanOrEqual(noticeTop);
    await page.screenshot({ path: 'test-results/views-radar.png', fullPage: false });
    await page.getByRole('region', { name: 'This week' }).getByRole('button').first().click();
    await expect(page.getByRole('dialog', { name: 'Trust but Verify' })).toContainText('Nov 10, 2026');
    await expect(page.getByRole('heading', { name: 'Deadline Radar', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open matter', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Cedar House acquisition', exact: true })).toBeVisible();
    await expect(page.locator('[data-deadline-id="due"]')).toBeFocused();
    await page.locator('[data-deadline-id="due"]').click();
    await page.getByRole('button', { name: 'Close verification' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Cockpit shows matter depth, source emphasis, and fact verification', async ({ page }) => {
    await open(page);
    for (const heading of ['Parties', 'Timeline', 'Documents', 'Deadlines']) await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Show what I said' }).check();
    await expect(page.locator('[data-source="stated"]').first()).toHaveCSS('font-weight', '700');
    await expect(page.locator('[data-source="inferred"]').first()).toHaveCSS('font-weight', '400');
    await page.locator('[data-source="inferred"]').first().click();
    await expect(page.getByRole('dialog')).toContainText('This fact has no computed due date.');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/views-cockpit.png', fullPage: false });
  });

  test('Portal shows client language and shared documents while honoring internal paths', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your next steps' })).toBeVisible();
    await expect(page.getByText('Send us the signed copy.', { exact: true })).toBeVisible();
    await expect(page.getByText('Your matter overview', { exact: true })).toBeVisible();
    for (const text of ['Private strategy memorandum', 'Restricted shared document', 'HIDDEN SHARED BODY', 'INTERNAL REASONING CHAIN', 'SECRET EVIDENCE', 'HIDDEN NEXT STEP', 'client0@example.invalid']) await expect(page.getByText(text, { exact: false })).toHaveCount(0);
    await page.screenshot({ path: 'test-results/views-portal.png', fullPage: false });
    await page.getByText('We are reviewing the next steps with you.', { exact: true }).click();
    await expect(page.getByRole('dialog')).not.toContainText(/SECRET|INTERNAL/);
  });

  test('Portal navigation respects internal-only fields too', async ({ page }) => {
    const matters = structuredClone(fixtures);
    matters[0].internalOnly.push('title', 'practiceArea');
    await seed(matters);
    await open(page);
    await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
    await expect(page.getByText('Northstar Studio v. Vale', { exact: true })).toHaveCount(0);
    await expect(page.getByText('litigation', { exact: true })).toHaveCount(0);
  });

  test('Portal redacts computed date paths and provenance for extensions', async ({ page }) => {
    const matters = structuredClone(fixtures);
    matters[1].internalOnly.push('computedDeadlines.due.dueDate', 'provenance.title', 'provenance.*.source');
    await seed(matters);
    await open(page);
    await page.evaluate(async () => {
      const registryPath = '/src/features/registry.ts';
      const { registerFeature } = await import(registryPath);
      registerFeature({ id: 'projection-check', title: 'Projection check', slot: 'portal.section', component: ({ activeMatter }: { activeMatter?: { provenance?: Record<string, unknown> } }) => JSON.stringify(activeMatter?.provenance ?? {}) });
    });
    await page.getByRole('button', { name: /Cedar House acquisition/ }).click();
    await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Upcoming dates' })).toBeVisible();
    await expect(page.getByText('Nov 10, 2026', { exact: true })).toHaveCount(0);
    const extension = page.getByRole('region', { name: 'Projection check' });
    await expect(extension).not.toContainText('"source":');
    await expect(extension).not.toContainText('"title":');
    matters[1].internalOnly.push('computedDeadlines', 'provenance.*');
    await seed(matters);
    await expect(page.getByRole('heading', { name: 'Upcoming dates' })).toBeVisible();
    await expect(extension).toHaveText('{}');
  });

  test('Portal extensions receive dates without internal calculation details', async ({ page }) => {
    const matters = structuredClone(fixtures);
    matters[1].deadlines[0].trigger.event = 'INTERNAL TRIGGER EVENT';
    Object.assign(matters[1].deadlines[0], { inputs: { dueDate: '2026-11-10', section: 'INTERNAL AGREEMENT SECTION' } });
    matters[1].internalOnly.push('deadlines.0.trigger', 'deadlines.0.inputs');
    await seed(matters);
    await open(page);
    await page.evaluate(async () => {
      const registryPath = '/src/features/registry.ts';
      const { registerFeature } = await import(registryPath);
      registerFeature({ id: 'client-projection', title: 'Client projection', slot: 'portal.section', component: ({ activeMatter }: { activeMatter?: unknown }) => JSON.stringify(activeMatter) });
    });
    await page.getByRole('button', { name: /Cedar House acquisition/ }).click();
    await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Client projection' })).not.toContainText('INTERNAL');
    await expect(page.getByText('Nov 10, 2026', { exact: true })).toBeVisible();
  });

  test('Radar source emphasis and arrival animation use the shared snapshot', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Deadline Radar', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Show what I said' }).check();
    await expect(page.locator('[data-deadline-card] [data-source="stated"]').first()).toHaveCSS('font-weight', '700');
    await expect(page.locator('[data-deadline-card] [data-source="inferred"]').first()).toHaveCSS('font-weight', '400');
    await seed([...fixtures, { ...fixtures[1], id: 'radar-arrival', title: 'New on Radar' }]);
    await expect(page.locator('[data-deadline-card]').filter({ hasText: 'New on Radar' })).toHaveClass(/matter-arrival/);
  });

  test('file arrivals highlight without changing selection and edits update every view', async ({ page }) => {
    await open(page);
    await seed([...fixtures, { ...fixtures[1], id: 'arrival', title: 'New synthetic matter' }]);
    await expect(page.getByRole('button', { name: /New synthetic matter/ })).toContainText('New');
    await expect(page.getByRole('heading', { name: 'Northstar Studio v. Vale', exact: true })).toBeVisible();
    const changed = structuredClone(fixtures);
    changed[0].clientFacing.status = 'Your signed copy has arrived.';
    changed[0].title = 'Northstar updated';
    await seed(changed);
    await expect(page.getByRole('heading', { name: 'Northstar updated', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
    await expect(page.getByText('Your signed copy has arrived.', { exact: true })).toBeVisible();
  });

  test('Ramble idle, progressive streaming, follow-ups, skip, embellish, and done', async ({ page }) => {
    let releaseStream!: () => void;
    await page.route('**/api/intake/ramble', async route => {
      await new Promise<void>(resolve => { releaseStream = resolve; });
      await route.fulfill({ contentType: 'text/event-stream', body: sse([
        { type: 'field', path: 'client.name', value: 'Aster Client', source: 'stated' },
        { type: 'followups', questions: [{ id: 'forum', question: 'Which forum?', field: 'forum' }, { id: 'event', question: 'When did it happen?', field: 'timeline.0.date' }] },
      ]) });
    });
    await page.route('**/api/intake/answer', async route => {
      expect(route.request().postDataJSON().answers).toEqual([{ questionId: 'event', answer: 'November 1' }]);
      await route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'field', path: 'forum', value: 'Minnesota', source: 'inferred' }]) });
    });
    await page.route('**/api/intake/embellish', async route => {
      expect(route.request().postDataJSON().draft.client.name).toBe('Aster Client');
      await seed([...fixtures, { ...fixtures[1], id: 'ramble-arrival', title: 'Aster arrived' }]);
      await route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'done', matter: { ...fixtures[1], id: 'ramble-arrival', title: 'Aster arrived' } }]) });
    });
    await open(page);
    await page.getByRole('button', { name: 'Ramble', exact: true }).click();
    const intake = page.getByRole('dialog', { name: 'Ramble intake' });
    await expect(intake.getByRole('status')).toContainText('Ready for your story');
    await expect(intake.getByRole('button', { name: 'Embellish', exact: true })).toBeEnabled();
    await intake.getByRole('textbox', { name: 'Tell us about the matter' }).fill('Aster needs help.');
    await intake.getByRole('button', { name: 'Build matter', exact: true }).click();
    await expect(intake.getByRole('status')).toContainText('Building your matter');
    releaseStream();
    await expect(intake.getByText('Aster Client', { exact: true })).toBeVisible();
    await expect(intake.getByText('Which forum?', { exact: true })).toBeVisible();
    await intake.getByRole('button', { name: 'Skip', exact: true }).click();
    await expect(intake.getByText('When did it happen?', { exact: true })).toBeVisible();
    await intake.getByRole('textbox', { name: 'Your answer' }).fill('November 1');
    await intake.getByRole('button', { name: 'Use answer', exact: true }).click();
    await expect(intake.getByText('Minnesota', { exact: true })).toBeVisible();
    await expect(intake.getByText(/Missing.*client contact/i)).toBeVisible();
    await page.screenshot({ path: 'test-results/views-ramble.png', fullPage: false });
    await intake.getByRole('button', { name: 'Embellish', exact: true }).click();
    await expect(intake.getByRole('status')).toContainText('Matter added');
    await expect(intake.getByRole('button', { name: 'Embellish', exact: true })).toHaveCount(0);
    await intake.getByRole('button', { name: 'Close intake' }).click();
    await expect(page.getByRole('button', { name: /Aster arrived/ })).toContainText('New');
    await expect(page.getByRole('heading', { name: 'Northstar Studio v. Vale', exact: true })).toBeVisible();
  });

  test('Ramble retains partial facts on failure, needs a key explains the option, and Surprise works', async ({ page }) => {
    await page.route('**/api/intake/ramble', route => route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'field', path: 'title', value: 'Kept fact', source: 'stated' },
      { type: 'error', message: 'The remaining fields need attention.', partial: { title: 'Kept fact' } },
    ]) }));
    let release!: () => void;
    await page.route('**/api/intake/embellish', async route => {
      await new Promise<void>(resolve => { release = resolve; });
      await route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'needs_key', message: 'Add an API key to use live extraction and Embellish.' }]) });
    });
    await page.route('**/api/intake/surprise', async route => {
      expect(route.request().postDataJSON()).toEqual({ practiceArea: 'patent' });
      await route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'done', matter: fixtures[2] }]) });
    });
    await open(page);
    await page.getByRole('button', { name: 'Ramble', exact: true }).click();
    const intake = page.getByRole('dialog', { name: 'Ramble intake' });
    await intake.getByRole('textbox', { name: 'Tell us about the matter' }).fill('A matter');
    await intake.getByRole('button', { name: 'Build matter', exact: true }).click();
    await expect(intake.getByRole('status')).toContainText('Partial matter');
    await expect(intake.getByText('Kept fact', { exact: true })).toBeVisible();
    await expect(intake.getByText(/Missing.*client/i)).toBeVisible();
    await intake.getByRole('button', { name: 'Embellish', exact: true }).click();
    await expect(intake.getByRole('status')).toContainText('Embellishing');
    await expect(intake.getByRole('button', { name: 'Embellish', exact: true })).toBeVisible();
    release();
    await expect(intake.getByRole('status')).toContainText('Needs a key');
    await expect(intake).toContainText('Surprise Me');
    await intake.getByRole('button', { name: 'Close intake' }).click();
    await page.getByRole('combobox', { name: 'Surprise practice area' }).selectOption('patent');
    await page.getByRole('button', { name: 'Surprise Me', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Ramble intake' }).getByRole('status')).toContainText('Matter added');
    await expect(page.getByText(/synthetic matters and public court records.*model provider/i)).toBeVisible();
  });

  test('failed answers keep the question and typed answer available', async ({ page }) => {
    await page.route('**/api/intake/ramble', route => route.fulfill({ contentType: 'text/event-stream', body: sse([{ type: 'followups', questions: [{ id: 'forum', question: 'Which forum?', field: 'forum' }] }]) }));
    await page.route('**/api/intake/answer', route => route.abort());
    await open(page);
    await page.getByRole('button', { name: 'Ramble', exact: true }).click();
    const intake = page.getByRole('dialog', { name: 'Ramble intake' });
    await intake.getByRole('textbox', { name: 'Tell us about the matter' }).fill('A client needs help');
    await intake.getByRole('button', { name: 'Build matter', exact: true }).click();
    await intake.getByRole('textbox', { name: 'Your answer' }).fill('Minnesota district court');
    await intake.getByRole('button', { name: 'Use answer', exact: true }).click();
    await expect(intake.getByRole('status')).toContainText('Partial matter');
    await expect(intake.getByRole('textbox', { name: 'Your answer' })).toHaveValue('Minnesota district court');
    await expect(intake.getByText('Which forum?', { exact: true })).toBeVisible();
    await expect(intake.getByRole('button', { name: 'Embellish', exact: true })).toBeEnabled();
  });

  test('fields appear before the streaming response closes', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const original = window.fetch;
      let controller: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; } });
      Object.assign(window, { pushIntake: (line: string, done = false) => { controller.enqueue(new TextEncoder().encode(line)); if (done) controller.close(); } });
      window.fetch = (input, init) => String(input) === '/api/intake/ramble'
        ? Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })) : original(input, init);
    });
    await page.getByRole('button', { name: 'Ramble', exact: true }).click();
    const intake = page.getByRole('dialog', { name: 'Ramble intake' });
    await intake.getByRole('textbox', { name: 'Tell us about the matter' }).fill('A streaming story');
    await intake.getByRole('button', { name: 'Build matter', exact: true }).click();
    await page.evaluate(line => (window as unknown as { pushIntake: (line: string) => void }).pushIntake(line), sse([{ type: 'field', path: 'client.name', value: 'First streamed fact', source: 'stated' }]));
    await expect(intake.getByText('First streamed fact', { exact: true })).toBeVisible();
    await expect(intake.getByRole('status')).toContainText('Building your matter');
    await page.evaluate(line => (window as unknown as { pushIntake: (line: string) => void }).pushIntake(line), sse([{ type: 'field', path: 'forum', value: 'Draft forum', source: 'inferred' }]));
    await intake.getByText('Draft forum', { exact: true }).click();
    const verification = page.getByRole('dialog', { name: 'Trust but Verify' });
    await expect(verification.getByRole('button', { name: 'Open matter', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Close verification' }).click();
    await expect(intake).toBeVisible();
    await page.evaluate(line => (window as unknown as { pushIntake: (line: string, done: boolean) => void }).pushIntake(line, true), sse([{ type: 'followups', questions: [{ id: 'date', question: 'What date?', field: 'timeline.0.date' }] }]));
    await expect(intake.getByText('What date?', { exact: true })).toBeVisible();
  });

  test('Ramble network failures remain actionable', async ({ page }) => {
    await page.route('**/api/intake/ramble', route => route.abort());
    await open(page);
    await page.getByRole('button', { name: 'Ramble', exact: true }).click();
    const intake = page.getByRole('dialog', { name: 'Ramble intake' });
    await intake.getByRole('textbox', { name: 'Tell us about the matter' }).fill('A matter');
    await intake.getByRole('button', { name: 'Build matter', exact: true }).click();
    await expect(intake.getByRole('status')).toContainText('Partial matter');
    await expect(intake).toContainText('Could not reach intake');
    await expect(intake.getByRole('button', { name: 'Embellish', exact: true })).toBeEnabled();
  });

  test('a folder registers a Cockpit tab automatically without a host edit', async ({ page }) => {
    await open(page);
    await mkdir(featurePath, { recursive: true });
    try {
      await writeFile(resolve(featurePath, 'index.tsx'), `import { registerFeature } from '../registry';\nregisterFeature({ id: ${JSON.stringify(example.id)}, title: ${JSON.stringify(example.title)}, slot: 'cockpit.tab', component: ({ activeMatter }) => <p>${example.body}: {activeMatter?.title}</p> });\n`);
      await page.getByRole('tab', { name: example.title }).click();
      await page.getByRole('button', { name: /Cedar House acquisition/ }).click();
      await expect(page.getByText(`${example.body}: Cedar House acquisition`, { exact: true })).toBeVisible();
    } finally {
      await rm(featurePath, { recursive: true, force: true });
      // Filesystem removal finishes before Vite invalidates the eager glob import.
      await expect.poll(async () => {
        const loader = await page.request.get('/src/features/load.ts');
        expect(loader.ok()).toBe(true);
        return loader.text();
      }).not.toContain('fixture-brief');
    }
    await page.reload();
    await expect(page.getByRole('button', { name: /Northstar Studio v. Vale/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: example.title })).toHaveCount(0);
  });

  test('projected text stays legible and narrow screens remain navigable', async ({ page }) => {
    await open(page);
    const sizes = await page.locator('button, p, label, span, h1, h2, h3').evaluateAll(elements => elements.filter(el => el.getClientRects().length).map(el => parseFloat(getComputedStyle(el).fontSize)));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(18);
    const contrast = await page.locator('p, .source-label, .practice-mark, .source-field > span:first-child').evaluateAll(elements => {
      function rgb(value: string) { return (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number); }
      function light(channels: number[]) { return channels.map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0); }
      return elements.filter(el => el.getClientRects().length).map(el => {
        let surface: Element | null = el;
        while (surface?.parentElement && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
        const ink = light(rgb(getComputedStyle(el).color));
        const background = light(rgb(getComputedStyle(surface ?? el).backgroundColor));
        return (Math.max(ink, background) + .05) / (Math.min(ink, background) + .05);
      });
    });
    expect(Math.min(...contrast)).toBeGreaterThanOrEqual(7);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Deadline Radar', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: 'test-results/views-mobile.png', fullPage: false });
  });
});
