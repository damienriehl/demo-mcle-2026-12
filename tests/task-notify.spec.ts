import { expect, test } from '@playwright/test';

const MATTER = 'matters-paperkite-custody';
const API = '/api/features/task-board';

test('waiting on client writes previewed email and text to the outbox', async ({ page, request }) => {
  await page.route(`**${API}/draft-ai`, route => route.fulfill({ status: 503, json: { error: 'needs_key', message: 'x' } }));
  const existing = await (await request.get(`${API}/tasks?matterId=${MATTER}&view=lawyer`)).json();
  for (const task of existing.tasks) await request.delete(`${API}/tasks/${task.id}?matterId=${MATTER}`);
  await request.delete(`${API}/outbox?matterId=${MATTER}`);
  await request.put(`${API}/prefs`, { data: { matterId: MATTER, email: true, text: false, textConsent: false } });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/');
  await page.getByRole('button', { name: /Aster Lindmere and Rowan Fenwick/ }).first().click();
  await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Tasks', exact: true });
  await panel.getByRole('button', { name: 'Draft tasks' }).click();
  await expect(panel.getByRole('status').first()).toContainText('needs a Claude API key');

  const shared = panel.getByRole('region', { name: 'Lawyer tasks' }).locator('[data-task]').filter({ hasText: 'Serve and file temporary-custody motion papers' });
  await shared.getByRole('checkbox').click();
  await expect(shared).toContainText('Shared with client: Yes');
  await shared.getByRole('button', { name: 'Waiting on client', exact: true }).click();
  const outbox = panel.getByRole('region', { name: 'Outbox' });
  const email = outbox.locator('[data-outbox="email"]').first();
  await expect(email).toContainText('Your lawyer is waiting on:');
  await expect(email).toContainText('Preview — not sent');
  await expect(shared).toContainText('Client notified by email (preview)');

  await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
  const reach = page.getByRole('group', { name: 'How should we reach you?' });
  await reach.getByLabel('Text me').check();
  await reach.getByLabel(/I agree to receive texts/).check();
  await reach.getByLabel('Mobile phone').fill('555-0100');
  await reach.getByRole('button', { name: 'Save how we reach you' }).click();
  await expect(reach.getByRole('status')).toHaveText('Saved.');

  await page.getByRole('button', { name: 'Cockpit', exact: true }).click();
  await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
  const clientTask = panel.getByRole('region', { name: 'Client tasks' }).locator('[data-task]').filter({ hasText: 'Send corrections' });
  await clientTask.getByRole('button', { name: 'Waiting on client', exact: true }).click();
  const text = outbox.locator('[data-outbox="text"]').first();
  await expect(text.locator('.task-outbox-body')).toHaveText(/Reply STOP to opt out\.$/);
  await expect(text).toContainText('Preview — not sent');
  await expect(clientTask).toContainText('Client notified by email and text (preview)');
  if (process.env.NOTIFY_SCREENSHOT) {
    await outbox.scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.NOTIFY_SCREENSHOT });
  }
});
