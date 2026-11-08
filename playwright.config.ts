import { defineConfig, devices } from '@playwright/test';

// Point the smoke test at another URL (e.g. the tailscale serve MagicDNS name)
// with MATTER_COCKPIT_BASE_URL; the local dev server still starts on 8982.
const baseURL = process.env.MATTER_COCKPIT_BASE_URL ?? 'http://127.0.0.1:8982';

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  reporter: 'list',
  use: { baseURL, trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 } } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8982/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
