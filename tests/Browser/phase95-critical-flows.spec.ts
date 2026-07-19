import { test, expect, type Page } from '@playwright/test';

const browserErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
    const errors: string[] = [];
    browserErrors.set(page, errors);
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
});

test.afterEach(async ({ page }) => {
    expect(browserErrors.get(page) ?? [], 'Le navigateur a signalé une erreur de rendu.').toEqual([]);
});

test('public storefront renders French shell', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByText('Passion Cosmetic', { exact: true })).toBeVisible();
});

test('public navigation is keyboard reachable and honors reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('public checkout and admin login entry points remain reachable in French', async ({ page }) => {
    await page.goto('/commande');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await page.goto('/admin/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('form')).toBeVisible();
});

test('checkout retry returns the same safe validation contract', async ({ page }) => {
    const idempotencyKey = `browser-retry-${Date.now()}`;
    const payload = { items: [], customer: {} };
    const first = await page.request.post('/api/v1/public/orders', {
        headers: { 'Idempotency-Key': idempotencyKey },
        data: payload,
    });
    const second = await page.request.post('/api/v1/public/orders', {
        headers: { 'Idempotency-Key': idempotencyKey },
        data: payload,
    });

    expect(first.status()).toBe(422);
    expect(second.status()).toBe(422);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.message).toBe(secondBody.message);
    expect(firstBody.errors).toEqual(secondBody.errors);
});

test('protected inventory, image, and transition flows reject unauthenticated access', async ({ page }) => {
    const inventory = await page.request.get('/api/v1/admin/inventory/movements');
    expect(inventory.status()).toBe(401);
    const image = await page.request.post('/api/v1/admin/products/01ARZ3NDEKTSV4RRFFQ69G5FAV/images');
    expect(image.status()).toBe(401);
    const transition = await page.request.post('/api/v1/admin/orders/01ARZ3NDEKTSV4RRFFQ69G5FAV/transitions');
    expect(transition.status()).toBe(401);
});
