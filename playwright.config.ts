import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/Browser',
    fullyParallel: true,
    reporter: 'line',
    use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:8000', trace: 'retain-on-failure' },
    webServer: { command: 'php artisan serve --host=127.0.0.1 --port=8000', url: 'http://127.0.0.1:8000', reuseExistingServer: true },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
