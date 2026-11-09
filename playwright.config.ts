import { defineConfig, devices } from '@playwright/test';

// Point the smoke test at another URL (e.g. the tailscale serve MagicDNS name)
// with MATTER_COCKPIT_BASE_URL; E2E_PORT sets the local dev server port.
const port = process.env.E2E_PORT ?? '8982';
const localURL = `http://127.0.0.1:${port}`;
const baseURL = process.env.MATTER_COCKPIT_BASE_URL ?? localURL;

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  reporter: 'list',
  use: { baseURL, trace: 'off' },
  projects: [
    {
      name: 'chromium',
      testIgnore: ['**/draft-compare.spec.ts', '**/draft-compare-e2e.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'chromium-draft-compare',
      testMatch: '**/draft-compare.spec.ts',
      dependencies: ['chromium'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
    {
      name: 'chromium-real-server',
      testMatch: '**/draft-compare-e2e.spec.ts',
      dependencies: ['chromium-draft-compare'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: `PORT=${port} npm run dev`,
    url: `${localURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
