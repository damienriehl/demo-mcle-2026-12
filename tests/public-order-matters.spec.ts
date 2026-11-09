import { expect, test } from '@playwright/test';
import initial from './fixtures/views/scheduling-order-empty.json' with { type: 'json' };
import { publicOrder } from './fixtures/public-order';

const sse = (events: unknown[]) => events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
const arrival = { type: 'date', kind: 'trial', event: 'Trial ready date', date: '2027-06-14', page: 2, quote: 'Trial ready date: June 14, 2027.', verified: true };

test.beforeEach(async ({ page }) => {
  await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: sse([[initial]]) }));
  await page.addInitScript(() => {
    const Original = window.EventSource;
    window.EventSource = class extends Original {
      constructor(url: string | URL, config?: EventSourceInit) {
        super(url, config);
        window.addEventListener('public-order-snapshot', event => this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify((event as CustomEvent).detail) })));
      }
    };
  });
});

for (const method of ['picker', 'drop']) test(`opens a public order through ${method}, streams arrivals and selects its later snapshot`, async ({ page }) => {
  await page.route('**/api/features/scheduling-order/extract', route => {
    expect(route.request().headers()['x-matter-cockpit-upload']).toBe('1');
    expect(route.request().postData()).toMatch(/name="matterId"\r\n\r\nnew\r\n/);
    expect(route.request().postData()).toContain('filename="fictional-order.pdf"');
    return route.fulfill({ contentType: 'text/event-stream', body: sse([
      { type: 'pages', count: 2 }, arrival,
      { type: 'done', created: true, matter: publicOrder, added: { courtDates: 2, derived: 3 } },
    ]) });
  });
  await page.addInitScript(() => {
    const original = window.fetch;
    window.fetch = async (input, init) => {
      const response = await original(input, init);
      if (String(input) !== '/api/features/scheduling-order/extract') return response;
      const events = (await response.text()).trim().split('\n\n');
      return new Response(new ReadableStream<Uint8Array>({ start(controller) {
        Object.assign(window, { nextPublicOrderEvent: () => {
          controller.enqueue(new TextEncoder().encode(`${events.shift()}\n\n`));
          if (!events.length) controller.close();
        } });
      } }), { headers: response.headers });
    };
  });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Scheduling order', exact: true }).click();
  const control = page.getByRole('button', { name: 'Open a public order as a new matter' });
  if (method === 'picker') {
    const chooser = page.waitForEvent('filechooser');
    await control.click();
    await (await chooser).setFiles({ name: 'fictional-order.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fictional PDF') });
  } else {
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer();
      data.items.add(new File(['fictional PDF'], 'fictional-order.pdf', { type: 'application/pdf' }));
      return data;
    });
    await control.dispatchEvent('drop', { dataTransfer: transfer });
  }
  await page.waitForFunction(() => 'nextPublicOrderEvent' in window);
  const next = () => page.evaluate(() => (window as unknown as { nextPublicOrderEvent: () => void }).nextPublicOrderEvent());
  await next();
  await expect(page.getByRole('status').filter({ hasText: '2 pages' })).toBeVisible();
  await next();
  await expect(page.locator('[data-order-arrival]')).toContainText(arrival.quote);
  await expect(control).toBeDisabled();
  await next();
  const message = `Opened ${publicOrder.title} as a new public-record matter.`;
  await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible();
  // Completion precedes the store snapshot: keep the selection request pending.
  await expect(page.getByRole('heading', { name: initial.title, exact: true })).toBeVisible();
  await page.evaluate(matters => window.dispatchEvent(new CustomEvent('public-order-snapshot', { detail: matters })), [initial, publicOrder]);
  await expect(page.getByRole('heading', { name: publicOrder.title, exact: true })).toBeVisible();
  const selected = page.getByRole('complementary', { name: 'Matter list' }).getByRole('button', { name: publicOrder.title });
  await expect(selected).toHaveAttribute('aria-pressed', 'true');
  await expect(selected).toHaveClass(/matter-arrival/);
  await expect(selected).toContainText('Public record');
  await expect(selected).toContainText('New');
  await expect(page.locator('.matter-heading')).toContainText('Public record · FAKE-27-cv-0042 · Fictional District Court');
  await expect(page.locator('[data-order-arrival]')).toContainText(arrival.quote);
  await expect(page.getByRole('status').filter({ hasText: message })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Drop a scheduling order' })).toBeEnabled();
  await expect(page.locator('[data-court-date]')).toHaveCount(2);
});

test('Client Portal omits a public-record matter from its list and selection', async ({ page }) => {
  await page.route('**/api/events', route => route.fulfill({ contentType: 'text/event-stream', body: sse([[initial, publicOrder]]) }));
  await page.goto('/');
  await page.getByRole('complementary', { name: 'Matter list' }).getByRole('button', { name: publicOrder.title }).click();
  await expect(page.getByRole('heading', { name: publicOrder.title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Matter list' }).getByRole('button')).toHaveCount(1);
  await expect(page.getByText(publicOrder.title, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Public court record (no client)', { exact: true })).toHaveCount(0);
  await page.getByRole('complementary', { name: 'Matter list' }).getByRole('button', { name: initial.title }).click();
  await expect(page.locator('.portal-view')).toContainText(initial.title);
});
