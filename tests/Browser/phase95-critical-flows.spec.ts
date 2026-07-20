import { test, expect, type Page } from '@playwright/test';

const browserErrors = new WeakMap<Page, string[]>();
const responsiveViewports = [
    { width: 320, height: 740 }, { width: 360, height: 800 }, { width: 390, height: 844 },
    { width: 430, height: 932 }, { width: 768, height: 1024 }, { width: 1024, height: 768 },
    { width: 1280, height: 800 }, { width: 1440, height: 900 },
];
const acceptanceViewports = [
    { width: 320, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 },
    { width: 1024, height: 768 }, { width: 1440, height: 900 },
];
const cartStorage = {
    version: 2,
    expiresAt: Date.now() + 30 * 60_000,
    items: [
        { product_public_id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', variant_public_id: '01ARZ3NDEKTSV4RRFFQ69G5FB0', quantity: 2 },
        { product_public_id: '01ARZ3NDEKTSV4RRFFQ69G5FB1', variant_public_id: null, quantity: 1 },
    ],
};
const mockQuote = (items: Array<{ product_public_id: string; variant_public_id: string | null; quantity: number }>) => {
    const catalogue = (item: { product_public_id: string }) => item.product_public_id.endsWith('FAV') ? { name: 'Huile nourrissante', variantLabel: 'Parfum : Fleur d’oranger', price: 12_000 } : { name: 'Baume apaisant', variantLabel: null, price: 7_000 };
    const totalMillimes = items.reduce((total, item) => total + catalogue(item).price * item.quantity, 0);
    const money = (millimes: number) => ({ millimes, formatted: `${(millimes / 1000).toFixed(3).replace('.', ',')} TND` });
    return {
        data: {
            items: items.map((item) => { const product = catalogue(item); return { product_public_id: item.product_public_id, variant_public_id: item.variant_public_id, name: product.name, variant_label: product.variantLabel, image_url: null, quantity_requested: item.quantity, quantity_available: 9, is_available: true, effective_unit_price: money(product.price), line_total: money(product.price * item.quantity), messages: [] }; }),
            pricing: { subtotal: money(totalMillimes), promo_code: null, shipping: { fee: money(8_000) }, total: money(totalMillimes + 8_000) },
            can_checkout: true,
        },
    };
};
const prepareCartFixture = async (page: Page) => {
    await page.addInitScript((stored) => { if (!window.localStorage.getItem('pc_cart_v2')) window.localStorage.setItem('pc_cart_v2', JSON.stringify(stored)); }, cartStorage);
    await page.route('**/api/v1/public/cart/quote', async (route) => {
        const body = route.request().postDataJSON() as { items: Array<{ product_public_id: string; variant_public_id: string | null; quantity: number }> };
        await route.fulfill({ json: mockQuote(body.items) });
    });
    await page.route('**/api/v1/public/checkout-fields', (route) => route.fulfill({ json: { data: [{ key: 'full_name', label: 'Nom et prénom', type: 'text', options: null, is_required: true }], meta: { schema_version: '1', promo_code_field_visible: false } } }));
};

const expectNoPageOverflow = async (page: Page) => {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.body.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
};

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
    await expectNoPageOverflow(page);
});

test('principal public pages do not overflow at supported widths', async ({ page }) => {
    test.setTimeout(240_000);
    for (const viewport of responsiveViewports) {
        await page.setViewportSize(viewport);
        for (const path of ['/', '/produits', '/panier', '/commande']) {
            await page.goto(path);
            await expect(page.locator('main, .error-page')).toBeVisible();
            await expectNoPageOverflow(page);
        }
    }
});

test('public navigation is keyboard reachable and honors reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('.announcement-bar-track')).toHaveCSS('animation-name', 'none');
});

test('mobile header keeps cart access visible and its drawer remains keyboard operable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const cartButton = page.getByRole('button', { name: 'Ouvrir le panier' });
    await expect(cartButton).toBeVisible();
    await cartButton.click();
    await expect(page.getByRole('complementary', { name: 'Panier' })).toHaveAttribute('aria-hidden', 'false');
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-cart-drawer]')).toHaveAttribute('aria-hidden', 'true');
    await expectNoPageOverflow(page);
});

test('cart drawer preserves its full item structure and restores focus after backdrop close', async ({ page }) => {
    test.setTimeout(120_000);
    await prepareCartFixture(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const cartButton = page.getByRole('button', { name: 'Ouvrir le panier' });
    await expect(cartButton).toHaveText('3');
    await cartButton.click();
    const drawer = page.locator('[data-cart-drawer]');
    await expect(drawer).toContainText('Huile nourrissante');
    await expect(drawer).toContainText('Parfum : Fleur d’oranger');
    await expect(drawer).toContainText('12,000 TND l’unité');
    await expect(drawer).toContainText('Quantité : 2');
    await expect(drawer).toContainText('24,000 TND');
    const remove = drawer.getByRole('button', { name: 'Retirer' }).first();
    await expect(remove).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.body.classList.contains('is-locked'))).toBe(true);
    await remove.click();
    await expect(drawer.locator('.cart-drawer-lines article').first()).toHaveClass(/is-removing/);
    await expect(drawer).toContainText('Baume apaisant');
    await expect(cartButton).toHaveText('1');
    await page.locator('[data-cart-backdrop]').click({ position: { x: 4, y: 4 } });
    await expect(drawer).toHaveAttribute('aria-hidden', 'true');
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-cart-open') === '')).toBe(true);
    await expect.poll(() => page.evaluate(() => !document.body.classList.contains('is-locked'))).toBe(true);
    await expectNoPageOverflow(page);
});

test('cart and checkout stay readable at every acceptance viewport and reconcile rapid changes', async ({ page }) => {
    test.setTimeout(180_000);
    await prepareCartFixture(page);
    for (const viewport of acceptanceViewports) {
        await page.setViewportSize(viewport);
        await page.goto('/panier');
        await expect(page.locator('.cart-line')).toHaveCount(2);
        await expect(page.locator('.cart-line').first()).toContainText('Huile nourrissante');
        await expect(page.locator('.cart-summary')).toContainText('Total');
        await expectNoPageOverflow(page);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/panier');
    const firstLine = page.locator('.cart-line').first();
    const increase = firstLine.getByRole('button', { name: 'Augmenter la quantité' });
    await increase.click();
    await increase.click();
    await expect(firstLine.locator('output')).toHaveText('4');
    await expect(page.locator('[data-cart-count]')).toHaveText('5');
    await page.waitForTimeout(500);
    await expect(page.locator('.cart-line').first().locator('output')).toHaveText('4');
    await expect(page.locator('[data-cart-feedback]')).toHaveText(/Panier mis à jour/);
    await page.goto('/commande');
    const summary = page.locator('[data-checkout-summary]');
    await expect(summary).toContainText('Votre sélection');
    await expect(summary).toContainText('Huile nourrissante');
    await expect(summary).toContainText('Parfum : Fleur d’oranger');
    await expect(summary).toContainText('Quantité : 4');
    await expectNoPageOverflow(page);
});

test('global search shows lightweight suggestions while the customer types', async ({ page }) => {
    await page.route('**/api/v1/public/search/suggestions?*', (route) => route.fulfill({ json: { data: { products: [{ name: 'Soin douceur', slug: 'soin-douceur' }], categories: [{ name: 'Corps', slug: 'corps' }] } } }));
    await page.goto('/');
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await page.getByLabel('Rechercher un produit ou une catégorie').fill('so');
    const suggestions = page.locator('[data-search-suggestions]');
    await expect(suggestions.getByRole('link', { name: /Soin douceur/ })).toBeVisible();
    await expect(suggestions.getByRole('link', { name: /Corps/ })).toBeVisible();
});

test('global search exposes loading and empty states on mobile', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 320, height: 740 });
    await page.route('**/api/v1/public/search/suggestions?*', async (route) => { await new Promise((resolve) => setTimeout(resolve, 350)); await route.fulfill({ json: { data: { products: [], categories: [] } } }); });
    await page.goto('/');
    await page.getByRole('button', { name: 'Rechercher' }).click();
    await page.getByLabel('Rechercher un produit ou une catégorie').fill('zz');
    const suggestions = page.locator('[data-search-suggestions]');
    await expect(suggestions).toContainText('Recherche en cours…');
    await expect(suggestions).toContainText('Aucun résultat.');
    await expect(suggestions).toHaveClass(/is-visible/);
    await expectNoPageOverflow(page);
});

test('public checkout and admin login entry points remain reachable in French', async ({ page }) => {
    await page.goto('/commande');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await page.goto('/admin/login');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('form')).toBeVisible();
    await expectNoPageOverflow(page);
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
