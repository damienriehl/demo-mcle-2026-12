import { expect, test, type Locator, type Page } from '@playwright/test';
import fixtures from './fixtures/views/matters.json' with { type: 'json' };
import { computeDeadline } from '../src/engine';
import federalRules from '../data/rules/frcp.json' with { type: 'json' };
import { schedulingMatter } from './fixtures/views/scheduling-order';

function matters() {
  const [answer, unknown] = structuredClone([fixtures[0], fixtures[6]]);
  answer.deadlines = [{ id: 'answer', label: 'Answer the complaint', deadlineRuleId: 'frcp-12a-answer', trigger: { event: 'Complaint served; waiver request sent', date: '2026-11-03' }, assumptions: { service: 'personal' } }];
  answer.parties[0].name = 'Vale Workshop';
  answer.provenance['parties.0.name'] = { source: 'invented', evidence: '' };
  answer.provenance['deadlines.0.deadlineRuleId'] = { source: 'inferred', evidence: 'Federal complaint requires an answer.' };
  answer.provenance['deadlines.0.trigger.date'] = { source: 'stated', evidence: 'The request went out November 3.' };
  answer.reasoning = 'A federal complaint calls for an answer under Rule 12; service determines the response period.';
  unknown.reasoning = 'The agency notice must be reviewed to establish the comment deadline.';
  return [answer, unknown].map(matter => ({ ...matter, computedDeadlines: Object.fromEntries(matter.deadlines.map(deadline => [deadline.id, computeDeadline(deadline)])) }));
}

const themes = ['law-review', 'mission-control', 'boutique-firm'] as const;

test.describe('scheduling order verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify([schedulingMatter()])}\n\n` }));
    await page.goto('/');
  });

  test('cards distinguish court dates, computations, and the governing superseding date', async ({ page }) => {
    const trial = page.locator('[data-deadline-id="trial"]');
    await expect(trial).toContainText('From the order, p. 2');
    await expect(trial).not.toContainText('From the matter');
    await expect(page.locator('[data-deadline-id="pretrial"]')).toContainText('Code computed');
    const superseded = page.locator('[data-deadline-id="expert-default"]');
    await expect(superseded).toContainText('Superseded — the order sets this date (p. 3)');
    await expect(superseded.locator('.due-date')).toHaveText('Feb 1, 2027');
    await expect(superseded.locator('.countdown')).toHaveCount(0);
    await expect(superseded).not.toContainText(/days left|overdue|Due today/);
  });

  test('reasoning names both the court trigger and the computed upstream disclosure', async ({ page }) => {
    await page.locator('[data-deadline-id="pretrial"]').click();
    const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
    const reasoning = panel.locator('[data-verify-section="reasoning"]');
    await expect(reasoning).toContainText('Counts from Trial ready date · Jun 14, 2027');
    await expect(reasoning).toContainText('From the order, p. 2');
    await expect(panel.locator('[data-due-date]')).toHaveText('May 14, 2027');
    await expect(panel.getByRole('list', { name: 'Date math' })).toContainText('move earlier to Friday');
    await page.keyboard.press('Escape');
    await page.locator('[data-deadline-id="objections"]').click();
    await expect(reasoning).toContainText('Counts from Pretrial disclosures · May 14, 2027');
    await expect(reasoning).toContainText('Code computed');
    await expect(panel.locator('[data-due-date]')).toHaveText('May 28, 2027');
  });

  for (const theme of themes) {
    test(`source shows the uploaded quotation and checked-page caption (${theme})`, async ({ page }) => {
      await page.getByRole('combobox', { name: 'Theme', exact: true }).selectOption(theme);
      await page.locator('[data-deadline-id="trial"]').click();
      const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
      await expect(panel.locator('[data-verify-section="due"]')).toContainText('From the order, p. 2');
      const source = panel.locator('[data-verify-section="rule"]');
      await expect(source.getByRole('heading', { name: 'Scheduling order, p. 2', exact: true })).toBeVisible();
      await expect(source.getByRole('blockquote')).toHaveText('Trial ready date: June 14, 2027.');
      await expect(source).toContainText('Quoted from the uploaded order; the server checked this text against page 2');
      await expect(panel).not.toContainText('No source on file');
      await expect(panel).not.toContainText('the notice close');
      expect(Math.min(...await visibleFontSizes(panel))).toBeGreaterThanOrEqual(18);
      await page.screenshot({ path: `test-results/verify-order-${theme}.png` });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(source.getByRole('blockquote')).toBeVisible();
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({ path: `test-results/verify-order-mobile-${theme}.png` });
    });
  }

  test('superseded reasoning names the order date and quotes the library exception sentence', async ({ page }) => {
    await page.locator('[data-deadline-id="expert-default"]').click();
    const reasoning = page.locator('[data-verify-section="reasoning"]');
    await expect(reasoning).toContainText('The order sets this date: Court-set expert disclosures, Feb 1, 2027 (p. 3)');
    const quote = reasoning.getByRole('blockquote');
    await expect(quote).toContainText('Absent a stipulation or a court order');
    await expect(quote).not.toContainText('Unless the court orders otherwise, these disclosures must be made at least 30 days before trial.');
    expect(federalRules.find(rule => rule.id === 'frcp:26')!.text).toContain(await quote.innerText());
  });

  test('Radar omits the superseded default from all bands and the count', async ({ page }) => {
    await page.getByRole('button', { name: 'Deadline Radar', exact: true }).click();
    await expect(page.getByText('4 deadlines across 1 matters', { exact: true })).toBeVisible();
    await expect(page.locator('[data-deadline-card]')).toHaveCount(4);
    await expect(page.locator('[data-band] [data-deadline-id="expert-default"]')).toHaveCount(0);
  });
});

function visibleFontSizes(panel: Locator) {
  return panel.locator('*').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => parseFloat(getComputedStyle(element).fontSize)));
}

/** Resolves a theme token to its computed CSS value inside the given element. */
function tokenValue(scope: Locator, property: string, value: string) {
  return scope.evaluate((element, [property, value]) => {
    const probe = document.createElement('span');
    probe.style.setProperty(property, value);
    element.append(probe);
    const resolved = getComputedStyle(probe).getPropertyValue(property);
    probe.remove();
    return resolved;
  }, [property, value] as const);
}

async function open(page: Page) {
  await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(matters())}\n\n` }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Northstar Studio v. Vale', exact: true })).toBeVisible();
}

test('service preview recomputes locally, links every step to verbatim rules, and restores focus', async ({ page }) => {
  let writes = 0;
  page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes++; });
  await open(page);
  const opener = page.locator('[data-deadline-id="answer"]');
  await opener.click();
  const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
  await expect(panel).toBeFocused();
  const due = panel.locator('[data-due-date]');
  await expect(due).toHaveText('Nov 24, 2026');
  const service = panel.getByRole('group', { name: 'Service', exact: true });
  await expect(service.getByRole('button', { name: 'Personal service', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await service.getByRole('button', { name: 'Rule 4(d) waiver', exact: true }).click();
  await expect(due).toHaveText('Jan 4, 2027');
  const steps = panel.getByRole('list', { name: 'Date math' });
  await expect(steps).toContainText('Add 60 days; landing day is Saturday.');
  await expect(steps).toContainText('Weekend/holiday landing on Saturday: move forward to Monday.');
  await expect(steps).toContainText('Fed. R. Civ. P. 12(a)(1)(A)(ii)');
  await expect(steps).toContainText('Fed. R. Civ. P. 6(a)(1)(C)');
  expect(await steps.locator('li').count()).toBe(await steps.getByRole('link').count());
  await expect(steps.locator('[data-changed="true"]').first()).toBeVisible();
  const rule = federalRules.find(rule => rule.id === 'frcp:12')!;
  await expect(panel.locator('[data-rule-excerpt]')).toHaveText(rule.subdivisions[0].text.split('\n').find(line => line.startsWith('(ii) if it has timely waived'))!);
  await panel.getByRole('button', { name: 'Show full rule', exact: true }).click();
  expect(await panel.locator('[data-rule-text]').textContent()).toBe(rule.text);
  await expect(panel.getByRole('link', { name: 'Official source', exact: true })).toHaveAttribute('href', rule.sourceUrl);
  await expect(panel.getByRole('link', { name: 'Navigation page', exact: true })).toHaveAttribute('href', rule.navigationUrl!);
  await expect(panel).toContainText(rule.sourceVersion);
  await steps.getByRole('link', { name: 'Fed. R. Civ. P. 6(a)(1)(C)', exact: true }).first().click();
  await expect(panel.getByRole('heading', { name: /Fed. R. Civ. P. 6 —/ })).toBeVisible();
  expect(await panel.locator('[data-rule-excerpt]').textContent()).toBe(federalRules.find(rule => rule.id === 'frcp:6')!.subdivisions[0].text.split('\n').find(line => line.startsWith('(C) include the last day'))!);
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(panel.locator('[data-due-date]')).toHaveText('Nov 24, 2026');
  await panel.getByRole('button', { name: 'Close verification' }).click();
  await expect(opener).toBeFocused();
  expect(writes).toBe(0);
});

test('long rule scrolls independently below the date, toggles, math, and reasoning', async ({ page }) => {
  await open(page);
  await page.locator('[data-deadline-id="answer"]').click();
  const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
  await panel.getByRole('button', { name: 'Show full rule', exact: true }).click();
  const sections = panel.locator('[data-verify-section]');
  expect(await sections.evaluateAll(elements => elements.map(element => element.getAttribute('data-verify-section')))).toEqual(['due', 'assumptions', 'math', 'reasoning', 'rule']);
  await expect(panel.locator('[data-due-date]')).toBeInViewport({ ratio: 1 });
  await expect(panel.getByRole('group', { name: 'Service', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(panel.getByRole('heading', { name: 'Reasoning chain', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(panel.getByRole('link', { name: 'Official source', exact: true })).toBeInViewport({ ratio: 1 });
  expect(await panel.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  expect(await panel.locator('[data-rule-scroll]').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  expect(Math.min(...await visibleFontSizes(panel))).toBeGreaterThanOrEqual(18);
  await page.screenshot({ path: 'test-results/verify-computed.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(panel.getByRole('button', { name: 'Close verification' })).toBeInViewport();
  await page.screenshot({ path: 'test-results/verify-mobile.png', animations: 'disabled' });
});

for (const theme of themes) {
  test(`uncomputable deadline shows the amber warning and reasoning with no due date (${theme})`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('matter-cockpit-theme', value), theme);
    await open(page);
    await page.getByRole('button', { name: /Clearwater comment letter/ }).click();
    await page.locator('[data-deadline-id="due"]').click();
    const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
    await expect(panel.getByText('No source on file. Verify independently.', { exact: true })).toBeVisible();
    await expect(panel.locator('[data-due-date]')).toHaveCount(0);
    await expect(panel).toContainText('The agency notice must be reviewed to establish the comment deadline.');
    const warning = panel.locator('[data-no-source]');
    const tokenColor = await tokenValue(panel, 'color', 'var(--mc-warning)');
    expect(tokenColor).not.toBe(await tokenValue(panel, 'color', 'var(--mc-accent)'));
    await expect(warning).toHaveCSS('color', tokenColor);
    expect(Math.min(...await visibleFontSizes(panel))).toBeGreaterThanOrEqual(18);
    await page.screenshot({ path: `test-results/verify-uncomputable-${theme}.png`, animations: 'disabled' });
  });

  test(`computed deadline drawer keeps the projector type floor (${theme})`, async ({ page }) => {
    await page.addInitScript(value => localStorage.setItem('matter-cockpit-theme', value), theme);
    await open(page);
    await page.locator('[data-deadline-id="answer"]').click();
    const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
    await panel.getByRole('button', { name: 'Show full rule', exact: true }).click();
    await expect(panel.locator('[data-due-date]')).toBeInViewport({ ratio: 1 });
    expect(await panel.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
    expect(Math.min(...await visibleFontSizes(panel))).toBeGreaterThanOrEqual(18);
  });
}

test('invented and inferred facts show their provenance and evidence without deadline sections', async ({ page }) => {
  await open(page);
  const fact = page.getByRole('button', { name: 'Vale Workshop AI invented', exact: true });
  await fact.click();
  const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
  await expect(panel).toContainText('AI invented');
  await expect(panel).toContainText('No evidence quote on file.');
  await expect(panel).toContainText('A federal complaint calls for an answer under Rule 12; service determines the response period.');
  await expect(panel.getByRole('heading', { name: 'Reasoning chain', exact: true })).toBeVisible();
  await expect(panel.locator('[data-verify-section="math"], [data-verify-section="rule"], [data-verify-section="assumptions"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(fact).toBeFocused();
  await page.getByRole('button', { name: 'litigation AI inferred', exact: true }).click();
  await expect(panel.getByRole('blockquote')).toHaveText('SECRET EVIDENCE');
});

test('Radar opens the selected deadline with its assumptions and reasoning', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Deadline Radar', exact: true }).click();
  await page.locator('[data-deadline-id="answer"]').click();
  const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
  await panel.getByRole('button', { name: 'Rule 4(d) waiver', exact: true }).click();
  await expect(panel.locator('[data-due-date]')).toHaveText('Jan 4, 2027');
  await expect(panel).toContainText('A federal complaint calls for an answer under Rule 12; service determines the response period.');
});

test('opening a matter focuses its deadline once and leaves later controls focused', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Deadline Radar', exact: true }).click();
  await page.locator('[data-deadline-id="answer"]').click();
  await page.getByRole('button', { name: 'Open matter', exact: true }).click();
  await expect(page.locator('[data-deadline-id="answer"]')).toBeFocused();
  const theme = page.getByRole('combobox', { name: 'Theme', exact: true });
  await theme.focus();
  await theme.selectOption('mission-control');
  await expect(theme).toBeFocused();

  let release!: () => void;
  await page.route('**/api/intake/ramble', async route => {
    await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ contentType: 'text/event-stream', body: [
      { type: 'field', path: 'client.name', value: 'Streamed fictional client', source: 'stated' },
      { type: 'followups', questions: [{ id: 'forum', field: 'forum', question: 'Which forum?' }] },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') });
  });
  await page.getByRole('button', { name: 'Ramble', exact: true }).click();
  const intake = page.getByRole('dialog', { name: 'Ramble intake' });
  await intake.getByRole('textbox', { name: 'Tell us about the matter' }).fill('A fictional client needs help.');
  const build = intake.getByRole('button', { name: 'Build matter', exact: true });
  await build.click();
  await expect(intake.getByRole('status')).toContainText('Building your matter');
  const story = intake.getByRole('textbox', { name: 'Tell us about the matter' });
  await story.focus();
  await expect.poll(() => typeof release).toBe('function');
  release();
  await expect(intake.getByText('Streamed fictional client', { exact: true })).toBeVisible();
  await expect(story).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(intake).toHaveCount(0);
});

test('mail-service math keeps duplicate calendar steps without React key warnings', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const data = matters();
  data[0].deadlines[0] = { ...data[0].deadlines[0], deadlineRuleId: 'frcp-33-interrogatories',
    trigger: { event: 'Interrogatories served', date: '2026-10-03' }, assumptions: { serviceMethod: 'mail' } };
  data[0].computedDeadlines.answer = computeDeadline(data[0].deadlines[0]);
  const repeated = 'The landing day is neither a weekend nor a legal holiday; no calendar roll is required.';
  expect(data[0].computedDeadlines.answer.steps.filter(step => step.label === repeated)).toHaveLength(2);
  await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify(data)}\n\n` }));
  await page.goto('/');
  await page.locator('[data-deadline-id="answer"]').click();
  const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
  const math = panel.getByRole('list', { name: 'Date math' });
  await expect(math.getByText(repeated, { exact: true })).toHaveCount(2);
  const service = panel.getByRole('group', { name: 'Service method', exact: true });
  await service.getByRole('button', { name: 'Personal service', exact: true }).click();
  await expect(math.getByText(repeated, { exact: true })).toHaveCount(1);
  await service.getByRole('button', { name: 'Mail', exact: true }).click();
  await expect(math.getByText(repeated, { exact: true })).toHaveCount(2);
  expect(errors.filter(error => error.includes('same key'))).toEqual([]);
});

test('Portal fact verification keeps the source label and omits internal evidence and reasoning', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
  await page.locator('.portal-date').click();
  const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
  await expect(panel.locator('[data-due-date]')).toHaveText('Nov 24, 2026');
  await expect(panel).not.toContainText('SECRET EVIDENCE');
  await expect(panel).not.toContainText('A federal complaint calls for an answer');
  await page.keyboard.press('Escape');
  const portal = page.locator('.portal-view');
  await expect(portal.locator('.source-label, .verification-marker')).toHaveCount(0);
  await expect(portal).not.toContainText(/AI (inferred|invented)|You said/);
  await portal.getByRole('button', { name: 'Send us the signed copy.', exact: true }).click();
  await expect(panel).toContainText('AI inferred');
  await expect(panel).toContainText('No evidence quote on file.');
  await expect(panel).not.toContainText('SECRET EVIDENCE');
  await expect(panel).not.toContainText('A federal complaint calls for an answer');
});

test('intake fact verification shows provenance and reasoning before the matter is saved', async ({ page }) => {
  await page.route('**/api/intake/ramble', route => route.fulfill({ contentType: 'text/event-stream', body: [
    { type: 'field', path: 'parties.0.name', value: 'Vale Workshop', source: 'invented', evidence: 'A fictional party supplies the missing counterparty.' },
    { type: 'field', path: 'reasoning', value: 'The story describes a dispute but does not name the other party.', source: 'inferred' },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') }));
  await open(page);
  await page.getByRole('button', { name: 'Ramble', exact: true }).click();
  const intake = page.getByRole('dialog', { name: 'Ramble intake' });
  await intake.getByRole('textbox', { name: 'Tell us about the matter' }).fill('A fictional dispute needs another party.');
  await intake.getByRole('button', { name: 'Build matter', exact: true }).click();
  const fact = intake.getByRole('button', { name: 'Vale Workshop AI invented', exact: true });
  await fact.click();
  const panel = page.getByRole('dialog', { name: 'Trust but Verify' });
  await expect(panel).toContainText('AI invented');
  await expect(panel.getByRole('blockquote')).toHaveText('A fictional party supplies the missing counterparty.');
  await expect(panel).toContainText('The story describes a dispute but does not name the other party.');
  await expect(panel.locator('[data-verify-section="math"], [data-verify-section="rule"], [data-verify-section="assumptions"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(fact).toBeFocused();
});
