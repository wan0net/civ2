import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir:  './tests',
  timeout:  60_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/report' }]],

  use: {
    baseURL:  'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 800 },
    // Slow down actions slightly so canvas renders between clicks
    actionTimeout: 10_000,
  },

  webServer: {
    command:              'npm run dev',
    url:                  'http://localhost:3000',
    reuseExistingServer:  true,
    timeout:              30_000,
  },
});
