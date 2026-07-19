type CartItem = { product_public_id: string; variant_public_id: string | null; quantity: number };
type QuoteLine = { product_public_id: string; variant_public_id: string | null; name: string; variant_label: string | null; image_url: string | null; quantity_requested: number; quantity_available: number; is_available: boolean; effective_unit_price: { formatted: string }; line_total: { formatted: string }; messages: string[] };
type Quote = { data: { items: QuoteLine[]; pricing: { subtotal: { formatted: string }; promo_code: null | { code: string; discount: { formatted: string } }; shipping: { fee: { formatted: string } }; total: { formatted: string } }; can_checkout: boolean } };
type CheckoutField = { key: string; label: string; type: 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox'; options: string[] | null; is_required: boolean };
type CheckoutFieldsResponse = { data: CheckoutField[]; meta: { schema_version: string; promo_code_field_visible: boolean } };
type Suggestion = { name: string; slug: string };
type Variant = { public_id: string; sku: string | null; stock_quantity: number; is_active: boolean; value_ids: number[]; image_url: string | null };

const CART_KEY = 'pc_cart_v2';
const CART_TTL = 7 * 24 * 60 * 60 * 1000;
const escapeHtml = (text: string) => { const node = document.createElement('span'); node.textContent = text; return node.innerHTML; };
function cart(): CartItem[] { try { const stored = JSON.parse(window.localStorage?.getItem(CART_KEY) ?? '{}') as { version?: number; expiresAt?: number; items?: CartItem[] }; return stored.version === 2 && stored.expiresAt && stored.expiresAt > Date.now() && Array.isArray(stored.items) ? stored.items.filter((item) => typeof item.product_public_id === 'string' && (item.variant_public_id === null || typeof item.variant_public_id === 'string') && Number.isInteger(item.quantity) && item.quantity > 0) : []; } catch { return []; } }
function saveCart(items: CartItem[]) { try { window.localStorage?.setItem(CART_KEY, JSON.stringify({ version: 2, expiresAt: Date.now() + CART_TTL, items })); } catch { /* The cart remains usable for this page when browser storage is blocked. */ } updateCartCount(); }
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
const drawerBackdrop = document.querySelector<HTMLElement>('[data-drawer-backdrop]');
const cartDrawer = document.querySelector<HTMLElement>('[data-cart-drawer]');
const cartOpen = document.querySelector<HTMLButtonElement>('[data-cart-open]');
const cartClose = document.querySelector<HTMLButtonElement>('[data-cart-close]');
const cartBackdrop = document.querySelector<HTMLElement>('[data-cart-backdrop]');
let panelTrigger: HTMLElement | null = null;
function closePanel(panel: HTMLElement | null, backdrop: HTMLElement | null, trigger?: HTMLElement | null) { panel?.classList.remove('is-open'); panel?.setAttribute('aria-hidden', 'true'); if (backdrop) backdrop.hidden = true; document.body.classList.remove('is-locked'); (trigger ?? panelTrigger)?.focus(); panelTrigger = null; }
function openPanel(panel: HTMLElement | null, backdrop: HTMLElement | null, trigger: HTMLElement | null) { if (!panel) return; panelTrigger = trigger; panel.classList.add('is-open'); panel.setAttribute('aria-hidden', 'false'); if (backdrop) backdrop.hidden = false; document.body.classList.add('is-locked'); panel.querySelector<HTMLElement>('button, a, input')?.focus(); }
function closeDrawer() { closePanel(drawer, drawerBackdrop, drawerOpen); drawerOpen?.setAttribute('aria-expanded', 'false'); }
drawerOpen?.addEventListener('click', () => { openPanel(drawer, drawerBackdrop, drawerOpen); drawerOpen.setAttribute('aria-expanded', 'true'); });
drawerClose?.addEventListener('click', closeDrawer);
drawerBackdrop?.addEventListener('click', closeDrawer);
drawer?.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => link.addEventListener('click', closeDrawer));
function closeCartDrawer() { closePanel(cartDrawer, cartBackdrop, cartOpen); }
function openCartDrawer() { renderCartDrawer(); openPanel(cartDrawer, cartBackdrop, cartOpen); }
cartOpen?.addEventListener('click', openCartDrawer);
cartClose?.addEventListener('click', closeCartDrawer);
cartBackdrop?.addEventListener('click', closeCartDrawer);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') { if (drawer?.classList.contains('is-open')) closeDrawer(); if (cartDrawer?.classList.contains('is-open')) closeCartDrawer(); } const panel = drawer?.classList.contains('is-open') ? drawer : cartDrawer?.classList.contains('is-open') ? cartDrawer : null; if (event.key !== 'Tab' || !panel) return; const focusable = [...panel.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')]; if (!focusable.length) return; const first = focusable[0]; const last = focusable[focusable.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } });

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
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
    hero.addEventListener('keydown', (event) => { if (event.key === 'ArrowLeft') show(index - 1); if (event.key === 'ArrowRight') show(index + 1); });
    start();
}

const detail = document.querySelector<HTMLElement>('[data-product-detail]');
if (detail) {
    let quantity = 1; let variantId: string | null = null;
    const quantityInput = detail.querySelector<HTMLInputElement>('[data-quantity]');
    const setQuantity = (next: number, limit = 99) => { quantity = Math.max(1, Math.min(limit, Number.isFinite(next) ? Math.floor(next) : 1)); if (quantityInput) quantityInput.value = String(quantity); };
    detail.querySelector('[data-quantity-minus]')?.addEventListener('click', () => setQuantity(quantity - 1));
    detail.querySelector('[data-quantity-plus]')?.addEventListener('click', () => setQuantity(quantity + 1, Number(quantityInput?.max || 99)));
    quantityInput?.addEventListener('change', () => setQuantity(Number(quantityInput.value), Number(quantityInput.max || 99)));
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
    const sellableVariants = () => variants.filter((candidate) => candidate.is_active && candidate.stock_quantity > 0);
    const syncVariant = () => {
        const variant = variants.find((candidate) => candidate.value_ids.length === selected.size && candidate.value_ids.every((id) => selected.has(id)));
        const available = Boolean(variant?.is_active && variant.stock_quantity > 0);
        variantId = available ? variant?.public_id ?? null : null;
        if (addButton) addButton.disabled = !available;
        if (stockMessage) stockMessage.textContent = available ? `${variant?.stock_quantity} en stock${variant?.sku ? ` · Réf. ${variant.sku}` : ''}` : 'Produit indisponible.';
        if (quantityInput) { quantityInput.max = String(available ? variant!.stock_quantity : 1); setQuantity(quantity, Number(quantityInput.max)); }
        const image = detail.querySelector<HTMLImageElement>('[data-gallery-main]');
        if (image && variant?.image_url) image.src = variant.image_url;
        detail.querySelectorAll<HTMLButtonElement>('[data-option-value]').forEach((button) => {
            const valueId = Number(button.dataset.optionValue);
            const groupValues = [...(button.closest('fieldset')?.querySelectorAll<HTMLButtonElement>('[data-option-value]') ?? [])].map((item) => Number(item.dataset.optionValue));
            const compatible = sellableVariants().some((candidate) => candidate.value_ids.includes(valueId) && [...selected].filter((id) => !groupValues.includes(id)).every((id) => candidate.value_ids.includes(id)));
            button.disabled = !compatible;
            button.setAttribute('aria-disabled', String(!compatible));
        });
    };
    const selectVariant = (variant: Variant) => {
        selected.clear();
        variant.value_ids.forEach((valueId) => selected.add(valueId));
        detail.querySelectorAll<HTMLButtonElement>('[data-option-value]').forEach((button) => button.setAttribute('aria-pressed', String(selected.has(Number(button.dataset.optionValue)))));
        syncVariant();
    };
    if (!variants.length && addButton) { const stock = Number(detail.dataset.productStock || 0); addButton.disabled = stock < 1; if (quantityInput) quantityInput.max = String(Math.max(1, stock)); }
    const firstAvailableVariant = variants.find((variant) => variant.is_active && variant.stock_quantity > 0);
    if (firstAvailableVariant) selectVariant(firstAvailableVariant);
    detail.querySelectorAll<HTMLButtonElement>('[data-option-value]').forEach((button) => button.addEventListener('click', () => {
        button.closest('fieldset')?.querySelectorAll<HTMLButtonElement>('[data-option-value]').forEach((other) => { selected.delete(Number(other.dataset.optionValue)); other.setAttribute('aria-pressed', 'false'); });
        selected.add(Number(button.dataset.optionValue)); button.setAttribute('aria-pressed', 'true');
        syncVariant();
    }));
    addButton?.addEventListener('click', () => { if (!detail.dataset.productPublicId || (variants.length && !variantId) || addButton.disabled) return; addButton.disabled = true; addToCart({ product_public_id: detail.dataset.productPublicId, variant_public_id: variantId, quantity }); addButton.textContent = 'Ajouté au panier'; window.setTimeout(() => { addButton.textContent = 'Ajouter au panier'; if (variants.length) syncVariant(); else addButton.disabled = false; }, 1200); });
}

const cartPage = document.querySelector<HTMLElement>('[data-cart-page]');
if (cartPage) void renderCart(cartPage);
async function renderCart(host: HTMLElement) {
    const items = cart();
    if (!items.length) { host.innerHTML = '<p class="catalogue-empty">Votre panier est vide. <a class="text-link" href="/produits">Découvrir les soins</a></p>'; return; }
    try {
        const quoted = await quote(items);
        host.innerHTML = `<div class="cart-layout"><div class="cart-lines">${quoted.data.items.map((line, position) => `<article class="cart-line">${line.image_url ? `<img src="${escapeHtml(line.image_url)}" alt="">` : ''}<div><h2>${escapeHtml(line.name)}</h2><p>${escapeHtml(line.variant_label ?? '')}</p><small>${line.effective_unit_price.formatted} l’unité</small>${line.messages.map((message) => `<p class="commerce-alert">${escapeHtml(message)}</p>`).join('')}</div><strong>${line.line_total.formatted}</strong><div class="cart-stepper"><button type="button" data-cart-change="${position}" data-delta="-1" aria-label="Réduire la quantité">−</button><output>${line.quantity_requested}</output><button type="button" data-cart-change="${position}" data-delta="1" aria-label="Augmenter la quantité" ${!line.is_available || line.quantity_requested >= line.quantity_available ? 'disabled' : ''}>+</button><button type="button" data-cart-remove="${position}">Retirer</button></div></article>`).join('')}</div><aside class="cart-summary">${checkoutSummary(quoted)}${quoted.data.can_checkout ? '<a class="button button-dark" href="/commande">Finaliser ma commande</a>' : '<p class="commerce-alert">Mettez votre panier à jour avant de commander.</p>'}</aside></div>`;
        host.querySelectorAll<HTMLButtonElement>('[data-cart-change]').forEach((button) => button.addEventListener('click', () => {
            const updated = cart(); const line = updated[Number(button.dataset.cartChange)]; const quoteLine = quoted.data.items[Number(button.dataset.cartChange)];
            if (!line || !quoteLine) return;
            line.quantity = Math.max(1, Math.min(Math.min(99, quoteLine.quantity_available), line.quantity + Number(button.dataset.delta)));
            saveCart(updated); void renderCart(host);
        }));
        host.querySelectorAll<HTMLButtonElement>('[data-cart-remove]').forEach((button) => button.addEventListener('click', () => { const updated = cart(); updated.splice(Number(button.dataset.cartRemove), 1); saveCart(updated); void renderCart(host); }));
    } catch (cause) { host.innerHTML = `<p class="commerce-alert">${escapeHtml(cause instanceof Error ? cause.message : 'Panier indisponible.')}</p><button class="button button-outline" type="button" data-cart-retry>Réessayer</button>`; host.querySelector('[data-cart-retry]')?.addEventListener('click', () => { void renderCart(host); }); }
}

async function renderCartDrawer() {
    const host = document.querySelector<HTMLElement>('[data-cart-drawer-content]');
    if (!host) return;
    const items = cart();
    if (!items.length) { host.innerHTML = '<p class="catalogue-empty">Votre panier est vide.</p><a class="button button-dark" href="/produits">Découvrir les soins</a>'; return; }
    host.innerHTML = '<p class="admin-loading">Mise à jour du panier…</p>';
    try {
        const quoted = await quote(items);
        host.innerHTML = `<div class="cart-drawer-lines">${quoted.data.items.map((line, position) => `<article><div class="cart-drawer-product">${line.image_url ? `<img src="${escapeHtml(line.image_url)}" alt="">` : ''}<div><strong>${escapeHtml(line.name)}</strong><small>${escapeHtml(line.variant_label ?? '')}</small><small>${line.effective_unit_price.formatted} l’unité</small><span>Quantité : ${line.quantity_requested}</span></div></div><div class="cart-drawer-line-total"><strong>${line.line_total.formatted}</strong><button class="text-link" type="button" data-cart-drawer-remove="${position}">Retirer</button></div></article>`).join('')}</div><div class="cart-drawer-summary">${checkoutSummary(quoted)}</div><div class="cart-drawer-actions"><a class="button button-outline" href="/panier">Voir le panier</a>${quoted.data.can_checkout ? '<a class="button button-dark" href="/commande">Commander</a>' : '<a class="button button-dark" href="/panier">Mettre à jour</a>'}</div>`;
        host.querySelectorAll<HTMLButtonElement>('[data-cart-drawer-remove]').forEach((button) => button.addEventListener('click', () => { const updated = cart(); updated.splice(Number(button.dataset.cartDrawerRemove), 1); saveCart(updated); void renderCartDrawer(); }));
    } catch (cause) {
        host.innerHTML = `<p class="commerce-alert">${escapeHtml(cause instanceof Error ? cause.message : 'Panier indisponible.')}</p><button class="button button-outline" type="button" data-cart-retry>Réessayer</button>`;
        host.querySelector('[data-cart-retry]')?.addEventListener('click', () => { void renderCartDrawer(); });
    }
}

const checkoutPage = document.querySelector<HTMLElement>('[data-checkout-page]');
if (checkoutPage) void renderCheckout(checkoutPage);
async function renderCheckout(host: HTMLElement) {
    const items = cart(); if (!items.length) { host.innerHTML = '<p class="catalogue-empty">Votre panier est vide.</p>'; return; }
    try {
        const [fieldResponse, quoted] = await Promise.all([fetch('/api/v1/public/checkout-fields', { headers: { Accept: 'application/json' } }), quote(items)]);
        if (!fieldResponse.ok || !quoted.data.can_checkout) throw new Error('Votre panier doit être mis à jour.');
        const fields = await fieldResponse.json() as CheckoutFieldsResponse;
        const promo = fields.meta.promo_code_field_visible ? '<fieldset class="promo-field"><legend>Code promo</legend><div><input name="promo_code" maxlength="80" autocomplete="off"><button type="button" data-promo-apply>Appliquer</button></div><p data-promo-message aria-live="polite"></p><button class="text-link" type="button" data-promo-remove hidden>Retirer le code</button></fieldset>' : '';
        host.innerHTML = `<div class="checkout-layout"><form class="checkout-form" data-order-form novalidate><div class="form-errors" data-form-errors aria-live="assertive"></div>${fields.data.map(checkoutField).join('')}<p class="privacy-note">Vos informations servent uniquement à traiter et confirmer votre commande.</p><div class="checkout-submit-area">${promo}<button class="button button-dark" type="submit">Confirmer la commande</button></div></form><aside class="cart-summary" data-checkout-summary>${checkoutSummary(quoted)}</aside></div>`;
        const form = host.querySelector<HTMLFormElement>('[data-order-form]');
        let appliedPromoCode = '';
        let invalidPromoCode = false;
        form?.querySelector('[data-promo-apply]')?.addEventListener('click', async () => { const input = form.elements.namedItem('promo_code') as HTMLInputElement; const message = form.querySelector<HTMLElement>('[data-promo-message]'); const remove = form.querySelector<HTMLButtonElement>('[data-promo-remove]'); const code = input.value.trim(); if (!code) return; try { const updated = await quote(items, code); const summary = host.querySelector<HTMLElement>('[data-checkout-summary]'); if (summary) summary.innerHTML = checkoutSummary(updated); appliedPromoCode = code; invalidPromoCode = false; if (message) message.textContent = 'Code promo appliqué.'; if (remove) remove.hidden = false; } catch { appliedPromoCode = ''; invalidPromoCode = true; if (message) message.textContent = 'Ce code promotionnel n’est pas valide. Retirez-le ou saisissez un autre code pour continuer.'; if (remove) remove.hidden = false; } });
        form?.querySelector<HTMLInputElement>('[name="promo_code"]')?.addEventListener('input', () => { appliedPromoCode = ''; invalidPromoCode = false; });
        form?.querySelector('[data-promo-remove]')?.addEventListener('click', async () => { const input = form.elements.namedItem('promo_code') as HTMLInputElement; const message = form.querySelector<HTMLElement>('[data-promo-message]'); const remove = form.querySelector<HTMLButtonElement>('[data-promo-remove]'); input.value = ''; appliedPromoCode = ''; invalidPromoCode = false; try { const updated = await quote(items); const summary = host.querySelector<HTMLElement>('[data-checkout-summary]'); if (summary) summary.innerHTML = checkoutSummary(updated); if (message) message.textContent = 'Code promo retiré.'; if (remove) remove.hidden = true; } catch (cause) { if (message) message.textContent = cause instanceof Error ? cause.message : 'Le panier est momentanément indisponible.'; } });
        form?.addEventListener('submit', (event) => { event.preventDefault(); const input = form.elements.namedItem('promo_code') as HTMLInputElement | null; const message = form.querySelector<HTMLElement>('[data-promo-message]'); const code = input?.value.trim() ?? ''; if (code && appliedPromoCode !== code) { if (message) message.textContent = invalidPromoCode ? 'Ce code promotionnel n’est pas valide. Retirez-le ou saisissez un autre code pour continuer.' : 'Appliquez ce code promotionnel avant de confirmer la commande.'; input?.focus(); return; } void submitOrder(form, fields, items); });
    } catch (cause) { host.innerHTML = `<p class="commerce-alert">${escapeHtml(cause instanceof Error ? cause.message : 'Commande indisponible.')}</p>`; }
}
function checkoutField(field: CheckoutField): string { const required = field.is_required ? ' required' : ''; const label = `${escapeHtml(field.label)}${field.is_required ? ' *' : ''}`; if (field.type === 'textarea') return `<label>${label}<textarea name="${escapeHtml(field.key)}"${required}></textarea></label>`; if (field.type === 'select') return `<label>${label}<select name="${escapeHtml(field.key)}"${required}><option value="">Choisir…</option>${(field.options ?? []).map((option) => `<option>${escapeHtml(option)}</option>`).join('')}</select></label>`; if (field.type === 'radio') return `<fieldset><legend>${label}</legend>${(field.options ?? []).map((option) => `<label class="inline-check"><input type="radio" name="${escapeHtml(field.key)}" value="${escapeHtml(option)}"${required}> ${escapeHtml(option)}</label>`).join('')}</fieldset>`; if (field.type === 'checkbox') return `<label class="inline-check"><input type="checkbox" name="${escapeHtml(field.key)}" value="true"${required}> ${label}</label>`; return `<label>${label}<input name="${escapeHtml(field.key)}" type="${field.type === 'number' ? 'number' : field.key === 'phone' ? 'tel' : 'text'}"${required}></label>`; }
function checkoutSummary(quoted: Quote): string { const promo = quoted.data.pricing.promo_code; return `<p>Sous-total <strong>${quoted.data.pricing.subtotal.formatted}</strong></p>${promo ? `<p>Code ${escapeHtml(promo.code)} <strong>− ${promo.discount.formatted}</strong></p>` : ''}<p>Livraison <strong>${quoted.data.pricing.shipping.fee.formatted}</strong></p><p class="cart-total">Total <strong>${quoted.data.pricing.total.formatted}</strong></p><p>Paiement à la livraison.</p>`; }
function checkoutKey() { try { const saved = window.sessionStorage?.getItem('pc_checkout_key'); if (saved) return saved; const created = crypto.randomUUID(); window.sessionStorage?.setItem('pc_checkout_key', created); return created; } catch { return crypto.randomUUID(); } }
function showCheckoutErrors(form: HTMLFormElement, errors: Record<string, string[]> | undefined) {
    form.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach((field) => field.removeAttribute('aria-invalid'));
    if (!errors) return '';
    const messages = Object.entries(errors).flatMap(([key, values]) => {
        const field = form.elements.namedItem(key) as HTMLElement | RadioNodeList | null;
        const control = field instanceof RadioNodeList ? field[0] as HTMLElement | undefined : field;
        control?.setAttribute('aria-invalid', 'true');
        return values;
    });
    const first = form.querySelector<HTMLElement>('[aria-invalid="true"]');
    first?.focus();
    return messages.join(' ');
}
async function submitOrder(form: HTMLFormElement, fields: CheckoutFieldsResponse, items: CartItem[]) {
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]'); const errorTarget = form.querySelector<HTMLElement>('[data-form-errors]');
    const values = new FormData(form); const customer = Object.fromEntries(fields.data.filter((field) => values.has(field.key)).map((field) => [field.key, values.get(field.key)])); const promoCode = String(values.get('promo_code') ?? '').trim();
    if (button) { button.disabled = true; button.textContent = 'Confirmation en cours…'; }
    try {
        const response = await fetch('/api/v1/public/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': checkoutKey() }, body: JSON.stringify({ checkout_schema_version: fields.meta.schema_version, customer, items, ...(promoCode ? { promo_code: promoCode } : {}) }) });
        const payload = await response.json().catch(() => null) as { data?: { confirmation?: { url: string } }; message?: string; errors?: Record<string, string[]> } | null;
        if (!response.ok || !payload?.data?.confirmation?.url) {
            const fieldMessage = showCheckoutErrors(form, payload?.errors);
            const retryAfter = response.status === 429 ? response.headers.get('Retry-After') : null;
            const retryMessage = retryAfter ? ` Réessayez dans ${retryAfter} secondes.` : '';
            const sessionMessage = response.status === 419 ? 'Votre session a expiré. Actualisez la page avant de réessayer.' : '';
            throw new Error(fieldMessage || sessionMessage || `${payload?.message || 'La commande n’a pas pu être confirmée.'}${retryMessage}`);
        }
        try { window.localStorage?.removeItem(CART_KEY); window.sessionStorage?.removeItem('pc_checkout_key'); } catch { /* Confirmation remains valid if browser storage is unavailable. */ }
        window.location.assign(payload.data.confirmation.url);
    } catch (cause) {
        const message = cause instanceof Error ? cause.message : 'La commande n’a pas pu être confirmée.';
        if (promoCode && /promo/i.test(message)) { const promoMessage = form.querySelector<HTMLElement>('[data-promo-message]'); const promoRemove = form.querySelector<HTMLButtonElement>('[data-promo-remove]'); if (promoMessage) promoMessage.textContent = 'Ce code promotionnel n’est pas valide. Retirez-le ou saisissez un autre code pour continuer.'; if (promoRemove) promoRemove.hidden = false; }
        if (errorTarget) errorTarget.textContent = message;
        if (button) { button.disabled = false; button.textContent = 'Confirmer la commande'; }
    }
}

const complaintForm = document.querySelector<HTMLFormElement>('[data-complaint-form]');
complaintForm?.addEventListener('submit', async (event) => { event.preventDefault(); const button = complaintForm.querySelector<HTMLButtonElement>('button[type="submit"]'); const errors = complaintForm.querySelector<HTMLElement>('[data-complaint-errors]'); if (button) button.disabled = true; try { const response = await fetch('/api/v1/public/complaints', { method: 'POST', headers: { Accept: 'application/json' }, body: new FormData(complaintForm) }); const payload = await response.json() as { message?: string; errors?: Record<string, string[]> }; if (!response.ok) throw new Error(payload.errors ? Object.values(payload.errors).flat().join(' ') : payload.message || 'Réclamation invalide.'); complaintForm.hidden = true; const success = document.querySelector<HTMLElement>('[data-complaint-success]'); if (success) success.hidden = false; } catch (cause) { if (errors) errors.textContent = cause instanceof Error ? cause.message : 'La réclamation n’a pas pu être envoyée.'; if (button) button.disabled = false; } });
