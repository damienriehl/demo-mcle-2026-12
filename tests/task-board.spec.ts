import { expect, test } from '@playwright/test';

const MATTER = 'matters-paperkite-custody';

test('task board: draft, share, move, see it in the Portal, and upload', async ({ page, request }) => {
  // Deterministic: the model routes are mocked; code-only drafting runs on the real server.
  await page.route('**/api/features/task-board/draft-ai', route => route.fulfill({ status: 503, json: { error: 'needs_key', message: 'x' } }));
  await page.route('**/api/features/task-board/prepare', route => route.fulfill({ status: 503, json: { error: 'needs_key', message: 'x' } }));
  const existing = await (await request.get(`/api/features/task-board/tasks?matterId=${MATTER}&view=lawyer`)).json();
  for (const task of existing.tasks) await request.delete(`/api/features/task-board/tasks/${task.id}?matterId=${MATTER}`);

  await page.goto('/');
  await page.getByRole('button', { name: /Aster Lindmere and Rowan Fenwick/ }).first().click();
  await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Tasks', exact: true });
  await panel.getByRole('button', { name: 'Draft tasks' }).click();
  await expect(panel.getByRole('status')).toContainText('needs a Claude API key');

  const lawyer = panel.getByRole('region', { name: 'Lawyer tasks' });
  const shared = lawyer.locator('[data-task]').filter({ hasText: 'Serve and file temporary-custody motion papers' });
  await expect(shared).toContainText('Source: computed deadline');
  await expect(shared).toContainText(/Due \d{4}-\d{2}-\d{2}/);
  await shared.getByRole('checkbox').click();
  await expect(shared).toContainText('Shared with client: Yes');
  await shared.getByRole('button', { name: 'Move to Done' }).click();
  await expect(lawyer.locator('[data-column="done"]')).toContainText('Serve and file temporary-custody motion papers');

  await page.getByRole('button', { name: 'Client Portal', exact: true }).click();
  const portal = page.getByRole('region', { name: 'Your tasks', exact: true });
  const visible = portal.locator('[data-task]').filter({ hasText: 'Serve and file temporary-custody motion papers' });
  await expect(visible).toContainText('Done');
  await expect(visible).toContainText('Read-only');
  await expect(portal.getByText('Track response deadline for new issues')).toHaveCount(0);

  const clientTask = portal.locator('[data-task]').filter({ hasText: 'Send corrections' });
  await clientTask.locator('input[type=file]').setInputFiles({ name: 'corrections.txt', mimeType: 'text/plain', buffer: Buffer.from('Please correct the pickup time to 6 p.m. on school nights.') });
  await expect(portal.getByText('Uploaded — thank you', { exact: false })).toBeVisible();
  await expect(portal.getByRole('region', { name: 'Your to-do list' }).locator('[data-column="done"]')).toContainText('Send corrections');
});
