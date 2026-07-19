type CartItem = { product_public_id: string; variant_public_id: string | null; quantity: number };
type QuoteLine = { name: string; variant_label: string | null; quantity_requested: number; line_total: { formatted: string }; messages: string[] };
type Quote = { data: { items: QuoteLine[]; pricing: { subtotal: { formatted: string }; promo_code: null | { code: string; discount: { formatted: string } }; shipping: { fee: { formatted: string } }; total: { formatted: string } }; can_checkout: boolean } };
type CheckoutField = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox'; options: string[] | null; is_required: boolean };
type CheckoutFieldsResponse = { data: CheckoutField[]; meta: { schema_version: string; promo_code_field_visible: boolean } };
type Suggestion = { name: string; slug: string };
type Variant = { public_id: string; stock_quantity: number; is_active: boolean; value_ids: number[]; image_url: string | null };

const CART_KEY = 'pc_cart_v1';
const CART_TTL = 7 * 24 * 60 * 60 * 1000;
const escapeHtml = (text: string) => { const node = document.createElement('span'); node.textContent = text; return node.innerHTML; };
function cart(): CartItem[] { try { const stored = JSON.parse(localStorage.getItem(CART_KEY) ?? '{}') as { expiresAt?: number; items?: CartItem[] }; return stored.expiresAt && stored.expiresAt > Date.now() && Array.isArray(stored.items) ? stored.items : []; } catch { return []; } }
function saveCart(items: CartItem[]) { localStorage.setItem(CART_KEY, JSON.stringify({ expiresAt: Date.now() + CART_TTL, items })); updateCartCount(); }
function updateCartCount() { document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((node) => { node.textContent = String(cart().reduce((sum, line) => sum + line.quantity, 0)); }); }
function addToCart(line: CartItem) { const items = cart(); const current = items.find((item) => item.product_public_id === line.product_public_id && item.variant_public_id === line.variant_public_id); if (current) current.quantity = Math.min(99, current.quantity + line.quantity); else items.push(line); saveCart(items); }
async function quote(items = cart(), promoCode?: string): Promise<Quote> { const response = await fetch('/api/v1/public/cart/quote', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items, ...(promoCode ? { promo_code: promoCode } : {}) }) }); const payload = await response.json().catch(() => null) as Quote & { message?: string } | null; if (!response.ok || !payload) throw new Error(payload?.message || 'Le panier est momentanément indisponible.'); return payload; }
updateCartCount();

const searchForm = document.querySelector<HTMLFormElement>('[data-global-search]');
const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
const suggestionTarget = document.querySelector<HTMLElement>('[data-search-suggestions]');
document.querySelector('[data-search-trigger]')?.addEventListener('click', () => { searchForm?.classList.toggle('is-open'); searchInput?.focus(); });
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let searchAbort: AbortController | undefined;
searchInput?.addEventListener('input', () => {
    const query = searchInput.value.trim();
    clearTimeout(searchTimer);
    if (query.length < 2) { if (suggestionTarget) suggestionTarget.innerHTML = ''; return; }
    searchTimer = setTimeout(async () => {
        searchAbort?.abort(); searchAbort = new AbortController();
        try {
            const response = await fetch(`/api/v1/public/search/suggestions?q=${encodeURIComponent(query)}&limit=6`, { signal: searchAbort.signal, headers: { Accept: 'application/json' } });
            if (!response.ok || !suggestionTarget) return;
            const payload = await response.json() as { data: { products: Suggestion[]; categories: Suggestion[] } };
            suggestionTarget.innerHTML = [...payload.data.products.map((entry) => `<a href="/produits/${encodeURIComponent(entry.slug)}">${escapeHtml(entry.name)} <small>Produit</small></a>`), ...payload.data.categories.map((entry) => `<a href="/categories/${encodeURIComponent(entry.slug)}">${escapeHtml(entry.name)} <small>Catégorie</small></a>`)].join('') || '<p>Aucun résultat.</p>';
        } catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError') && suggestionTarget) suggestionTarget.textContent = 'La recherche est indisponible.'; }
    }, 180);
});

const drawer = document.querySelector<HTMLElement>('[data-mobile-drawer]');
const drawerOpen = document.querySelector<HTMLButtonElement>('[data-drawer-open]');
const drawerClose = document.querySelector<HTMLButtonElement>('[data-drawer-close]');
function closeDrawer() { drawer?.classList.remove('is-open'); drawer?.setAttribute('aria-hidden', 'true'); drawerOpen?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('is-locked'); drawerOpen?.focus(); }
drawerOpen?.addEventListener('click', () => { drawer?.classList.add('is-open'); drawer?.setAttribute('aria-hidden', 'false'); drawerOpen.setAttribute('aria-expanded', 'true'); document.body.classList.add('is-locked'); drawerClose?.focus(); });
drawerClose?.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && drawer?.classList.contains('is-open')) closeDrawer(); });

const hero = document.querySelector<HTMLElement>('[data-hero-carousel]');
if (hero) {
    const slides = [...hero.querySelectorAll<HTMLElement>('[data-hero-slide]')];
    const dots = [...hero.querySelectorAll<HTMLButtonElement>('[data-hero-dot]')];
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let index = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const show = (next: number) => { index = (next + slides.length) % slides.length; slides.forEach((slide, position) => { slide.classList.toggle('is-active', position === index); slide.setAttribute('aria-hidden', String(position !== index)); }); dots.forEach((dot, position) => dot.classList.toggle('is-active', position === index)); };
    const stop = () => clearInterval(timer);
    const start = () => { stop(); if (!reducedMotion && hero.dataset.autoplay === 'true' && slides.length > 1) timer = setInterval(() => show(index + 1), 8000); };
    hero.querySelector('[data-hero-prev]')?.addEventListener('click', () => { show(index - 1); start(); });
    hero.querySelector('[data-hero-next]')?.addEventListener('click', () => { show(index + 1); start(); });
    dots.forEach((dot) => dot.addEventListener('click', () => { show(Number(dot.dataset.heroDot)); start(); }));
    hero.addEventListener('mouseenter', stop); hero.addEventListener('mouseleave', start); hero.addEventListener('focusin', stop); hero.addEventListener('focusout', start);
    hero.addEventListener('keydown', (event) => { if (event.key === 'ArrowLeft') show(index - 1); if (event.key === 'ArrowRight') show(index + 1); });
    start();
}

const detail = document.querySelector<HTMLElement>('[data-product-detail]');
if (detail) {
    let quantity = 1; let variantId: string | null = null;
    const output = detail.querySelector<HTMLOutputElement>('[data-quantity]');
    detail.querySelector('[data-quantity-minus]')?.addEventListener('click', () => { quantity = Math.max(1, quantity - 1); if (output) output.value = String(quantity); });
    detail.querySelector('[data-quantity-plus]')?.addEventListener('click', () => { quantity = Math.min(99, quantity + 1); if (output) output.value = String(quantity); });
    detail.querySelectorAll<HTMLButtonElement>('[data-gallery-image]').forEach((button) => button.addEventListener('click', () => { const image = detail.querySelector<HTMLImageElement>('[data-gallery-main]'); if (image && button.dataset.galleryImage) image.src = button.dataset.galleryImage; }));
    const thumbnailRail = detail.querySelector<HTMLElement>('[data-gallery-thumbnails]');
    if (thumbnailRail && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        let thumbnailTimer: number | undefined;
        const stopThumbnailLoop = () => { if (thumbnailTimer) window.clearInterval(thumbnailTimer); thumbnailTimer = undefined; };
        const startThumbnailLoop = () => {
            stopThumbnailLoop();
            if (thumbnailRail.scrollWidth <= thumbnailRail.clientWidth + 4) return;
            thumbnailTimer = window.setInterval(() => {
                const next = thumbnailRail.scrollLeft + Math.max(96, Math.round(thumbnailRail.clientWidth * 0.45));
                thumbnailRail.scrollTo({ left: next >= thumbnailRail.scrollWidth - thumbnailRail.clientWidth - 4 ? 0 : next, behavior: 'smooth' });
            }, 4200);
        };
        thumbnailRail.addEventListener('pointerenter', stopThumbnailLoop);
        thumbnailRail.addEventListener('pointerleave', startThumbnailLoop);
        thumbnailRail.addEventListener('focusin', stopThumbnailLoop);
        thumbnailRail.addEventListener('focusout', startThumbnailLoop);
        startThumbnailLoop();
    }
    const selected = new Set<number>();
    const variants = JSON.parse(detail.dataset.productVariants ?? '[]') as Variant[];
    const addButton = detail.querySelector<HTMLButtonElement>('[data-add-to-cart]');
    const stockMessage = detail.querySelector<HTMLElement>('[data-stock-message]');
    const syncVariant = () => {
        const variant = variants.find((candidate) => candidate.value_ids.length === selected.size && candidate.value_ids.every((id) => selected.has(id)));
        const available = Boolean(variant?.is_active && variant.stock_quantity > 0);
        variantId = available ? variant?.public_id ?? null : null;
        if (addButton) addButton.disabled = !available;
        if (stockMessage) stockMessage.textContent = available ? `${variant?.stock_quantity} en stock` : 'Cette variante est indisponible.';
        const image = detail.querySelector<HTMLImageElement>('[data-gallery-main]');
        if (image && variant?.image_url) image.src = variant.image_url;
    };
    const selectVariant = (variant: Variant) => {
        selected.clear();
        variant.value_ids.forEach((valueId) => selected.add(valueId));
        detail.querySelectorAll<HTMLButtonElement>('[data-option-value]').forEach((button) => button.setAttribute('aria-pressed', String(selected.has(Number(button.dataset.optionValue)))));
        syncVariant();
    };
    if (!variants.length && addButton) addButton.disabled = false;
    const firstAvailableVariant = variants.find((variant) => variant.is_active && variant.stock_quantity > 0);
    if (firstAvailableVariant) selectVariant(firstAvailableVariant);
    detail.querySelectorAll<HTMLButtonElement>('[data-option-value]').forEach((button) => button.addEventListener('click', () => {
        button.closest('fieldset')?.querySelectorAll<HTMLButtonElement>('[data-option-value]').forEach((other) => { selected.delete(Number(other.dataset.optionValue)); other.setAttribute('aria-pressed', 'false'); });
        selected.add(Number(button.dataset.optionValue)); button.setAttribute('aria-pressed', 'true');
        syncVariant();
    }));
    addButton?.addEventListener('click', () => { if (!detail.dataset.productPublicId || (variants.length && !variantId)) return; addToCart({ product_public_id: detail.dataset.productPublicId, variant_public_id: variantId, quantity }); addButton.textContent = 'Ajouté au panier'; setTimeout(() => { addButton.textContent = 'Ajouter au panier'; }, 1200); });
}

const cartPage = document.querySelector<HTMLElement>('[data-cart-page]');
if (cartPage) void renderCart(cartPage);
async function renderCart(host: HTMLElement) {
    const items = cart();
    if (!items.length) { host.innerHTML = '<p class="catalogue-empty">Votre panier est vide. <a class="text-link" href="/produits">Découvrir les soins</a></p>'; return; }
    try { const quoted = await quote(items); host.innerHTML = `<div class="cart-layout"><div class="cart-lines">${quoted.data.items.map((line, position) => `<article class="cart-line"><div><h2>${escapeHtml(line.name)}</h2><p>${escapeHtml(line.variant_label ?? '')}</p>${line.messages.map((message) => `<p class="commerce-alert">${escapeHtml(message)}</p>`).join('')}</div><strong>${line.line_total.formatted}</strong><div class="cart-stepper"><button type="button" data-cart-change="${position}" data-delta="-1">−</button><span>${line.quantity_requested}</span><button type="button" data-cart-change="${position}" data-delta="1">+</button><button type="button" data-cart-remove="${position}">Retirer</button></div></article>`).join('')}</div><aside class="cart-summary">${checkoutSummary(quoted)}<a class="button button-dark" href="/commande">Finaliser ma commande</a></aside></div>`; host.querySelectorAll<HTMLButtonElement>('[data-cart-change]').forEach((button) => button.addEventListener('click', () => { const updated = cart(); const line = updated[Number(button.dataset.cartChange)]; if (!line) return; line.quantity = Math.max(1, Math.min(99, line.quantity + Number(button.dataset.delta))); saveCart(updated); void renderCart(host); })); host.querySelectorAll<HTMLButtonElement>('[data-cart-remove]').forEach((button) => button.addEventListener('click', () => { const updated = cart(); updated.splice(Number(button.dataset.cartRemove), 1); saveCart(updated); void renderCart(host); })); } catch (cause) { host.innerHTML = `<p class="commerce-alert">${escapeHtml(cause instanceof Error ? cause.message : 'Panier indisponible.')}</p>`; }
}

const checkoutPage = document.querySelector<HTMLElement>('[data-checkout-page]');
if (checkoutPage) void renderCheckout(checkoutPage);
async function renderCheckout(host: HTMLElement) {
    const items = cart(); if (!items.length) { host.innerHTML = '<p class="catalogue-empty">Votre panier est vide.</p>'; return; }
    try {
        const [fieldResponse, quoted] = await Promise.all([fetch('/api/v1/public/checkout-fields', { headers: { Accept: 'application/json' } }), quote(items)]);
        if (!fieldResponse.ok || !quoted.data.can_checkout) throw new Error('Votre panier doit être mis à jour.');
        const fields = await fieldResponse.json() as CheckoutFieldsResponse;
        const promo = fields.meta.promo_code_field_visible ? '<fieldset class="promo-field"><legend>Code promo</legend><div><input name="promo_code" maxlength="80" autocomplete="off"><button type="button" data-promo-apply>Appliquer</button></div><p data-promo-message aria-live="polite"></p></fieldset>' : '';
        host.innerHTML = `<div class="checkout-layout"><form class="checkout-form" data-order-form novalidate><div class="form-errors" data-form-errors aria-live="assertive"></div>${fields.data.map(checkoutField).join('')}<p class="privacy-note">Vos informations servent uniquement à traiter et confirmer votre commande.</p><div class="checkout-submit-area">${promo}<button class="button button-dark" type="submit">Confirmer la commande</button></div></form><aside class="cart-summary" data-checkout-summary>${checkoutSummary(quoted)}</aside></div>`;
        const form = host.querySelector<HTMLFormElement>('[data-order-form]');
        form?.querySelector('[data-promo-apply]')?.addEventListener('click', async () => { const input = form.elements.namedItem('promo_code') as HTMLInputElement; const message = form.querySelector<HTMLElement>('[data-promo-message]'); try { const updated = await quote(items, input.value.trim()); const summary = host.querySelector<HTMLElement>('[data-checkout-summary]'); if (summary) summary.innerHTML = checkoutSummary(updated); if (message) message.textContent = 'Code promo appliqué.'; } catch { input.value = ''; if (message) message.textContent = 'Code promo invalide ou indisponible. Il a été retiré.'; } });
        form?.addEventListener('submit', (event) => { event.preventDefault(); void submitOrder(form, fields, items); });
    } catch (cause) { host.innerHTML = `<p class="commerce-alert">${escapeHtml(cause instanceof Error ? cause.message : 'Commande indisponible.')}</p>`; }
}
function checkoutField(field: CheckoutField): string { const required = field.is_required ? ' required' : ''; const label = `${escapeHtml(field.label)}${field.is_required ? ' *' : ''}`; if (field.type === 'textarea') return `<label>${label}<textarea name="${escapeHtml(field.key)}"${required}></textarea></label>`; if (field.type === 'select') return `<label>${label}<select name="${escapeHtml(field.key)}"${required}><option value="">Choisir…</option>${(field.options ?? []).map((option) => `<option>${escapeHtml(option)}</option>`).join('')}</select></label>`; if (field.type === 'radio') return `<fieldset><legend>${label}</legend>${(field.options ?? []).map((option) => `<label class="inline-check"><input type="radio" name="${escapeHtml(field.key)}" value="${escapeHtml(option)}"${required}> ${escapeHtml(option)}</label>`).join('')}</fieldset>`; if (field.type === 'checkbox') return `<label class="inline-check"><input type="checkbox" name="${escapeHtml(field.key)}" value="true"${required}> ${label}</label>`; return `<label>${label}<input name="${escapeHtml(field.key)}" type="${field.type === 'number' ? 'number' : field.key === 'phone' ? 'tel' : 'text'}"${required}></label>`; }
function checkoutSummary(quoted: Quote): string { const promo = quoted.data.pricing.promo_code; return `<p>Sous-total <strong>${quoted.data.pricing.subtotal.formatted}</strong></p>${promo ? `<p>Code ${escapeHtml(promo.code)} <strong>− ${promo.discount.formatted}</strong></p>` : ''}<p>Livraison <strong>${quoted.data.pricing.shipping.fee.formatted}</strong></p><p class="cart-total">Total <strong>${quoted.data.pricing.total.formatted}</strong></p><p>Paiement à la livraison.</p>`; }
function checkoutKey() { const saved = sessionStorage.getItem('pc_checkout_key'); if (saved) return saved; const created = crypto.randomUUID(); sessionStorage.setItem('pc_checkout_key', created); return created; }
async function submitOrder(form: HTMLFormElement, fields: CheckoutFieldsResponse, items: CartItem[]) { const button = form.querySelector<HTMLButtonElement>('button[type="submit"]'); const errorTarget = form.querySelector<HTMLElement>('[data-form-errors]'); const values = new FormData(form); const customer = Object.fromEntries(fields.data.filter((field) => values.has(field.key)).map((field) => [field.key, values.get(field.key)])); const promoCode = String(values.get('promo_code') ?? '').trim(); if (button) { button.disabled = true; button.textContent = 'Confirmation en cours…'; } try { const response = await fetch('/api/v1/public/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': checkoutKey() }, body: JSON.stringify({ checkout_schema_version: fields.meta.schema_version, customer, items, ...(promoCode ? { promo_code: promoCode } : {}) }) }); const payload = await response.json() as { data?: { confirmation?: { url: string } }; message?: string }; if (!response.ok || !payload.data?.confirmation?.url) throw new Error(payload.message || 'La commande n’a pas pu être confirmée.'); localStorage.removeItem(CART_KEY); sessionStorage.removeItem('pc_checkout_key'); window.location.assign(payload.data.confirmation.url); } catch (cause) { const message = cause instanceof Error ? cause.message : 'La commande n’a pas pu être confirmée.'; if (promoCode && /promo/i.test(message)) { const promoInput = form.elements.namedItem('promo_code') as HTMLInputElement | null; const promoMessage = form.querySelector<HTMLElement>('[data-promo-message]'); if (promoInput) promoInput.value = ''; if (promoMessage) promoMessage.textContent = 'Code promo invalide ou indisponible. Il a été retiré.'; } if (errorTarget) errorTarget.textContent = message; if (button) { button.disabled = false; button.textContent = 'Confirmer la commande'; } } }

const complaintForm = document.querySelector<HTMLFormElement>('[data-complaint-form]');
complaintForm?.addEventListener('submit', async (event) => { event.preventDefault(); const button = complaintForm.querySelector<HTMLButtonElement>('button[type="submit"]'); const errors = complaintForm.querySelector<HTMLElement>('[data-complaint-errors]'); if (button) button.disabled = true; try { const response = await fetch('/api/v1/public/complaints', { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(complaintForm) }); const payload = await response.json() as { message?: string; errors?: Record<string, string[]> }; if (!response.ok) throw new Error(payload.errors ? Object.values(payload.errors).flat().join(' ') : payload.message || 'Réclamation invalide.'); complaintForm.hidden = true; const success = document.querySelector<HTMLElement>('[data-complaint-success]'); if (success) success.hidden = false; } catch (cause) { if (errors) errors.textContent = cause instanceof Error ? cause.message : 'La réclamation n’a pas pu être envoyée.'; if (button) button.disabled = false; } });
