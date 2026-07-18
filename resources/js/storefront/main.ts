type Suggestion = { name: string; slug: string };
type SearchResponse = { data: { products: Suggestion[]; categories: Suggestion[] } };
type Variant = { public_id: string; stock_quantity: number; is_active: boolean; value_ids: number[] };
type RitualCategory = { name: string; url: string };
type CartItem = { product_public_id: string; variant_public_id: string | null; quantity: number };
type QuoteLine = { product_public_id: string; variant_public_id: string | null; name: string; variant_label: string | null; quantity_requested: number; is_available: boolean; effective_unit_price: { formatted: string }; line_total: { formatted: string }; messages: string[] };
type Quote = { data: { items: QuoteLine[]; pricing: { subtotal: { formatted: string }; shipping: { fee: { formatted: string } }; total: { formatted: string } }; can_checkout: boolean } };
const CART_KEY = 'pc_cart_v1';
const CART_TTL = 7 * 24 * 60 * 60 * 1000;

function cart(): CartItem[] { try { const saved = JSON.parse(localStorage.getItem(CART_KEY) ?? '{}') as { expiresAt?: number; items?: CartItem[] }; return saved.expiresAt && saved.expiresAt > Date.now() && Array.isArray(saved.items) ? saved.items : []; } catch { return []; } }
function saveCart(items: CartItem[]): void { localStorage.setItem(CART_KEY, JSON.stringify({ expiresAt: Date.now() + CART_TTL, items })); updateCartCount(); }
function updateCartCount(): void { document.querySelectorAll<HTMLElement>('[data-cart-count]').forEach((node) => { node.textContent = String(cart().reduce((sum, item) => sum + item.quantity, 0)); }); }
function addToCart(item: CartItem): void { const items = cart(); const existing = items.find((line) => line.product_public_id === item.product_public_id && line.variant_public_id === item.variant_public_id); if (existing) existing.quantity = Math.min(99, existing.quantity + item.quantity); else items.push(item); saveCart(items); }
async function quote(items = cart()): Promise<Quote> { const response = await fetch('/api/v1/public/cart/quote', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ items }) }); if (!response.ok) throw new Error('quote'); return response.json() as Promise<Quote>; }
updateCartCount();

const searchForm = document.querySelector<HTMLFormElement>('[data-global-search]');
const searchTrigger = document.querySelector<HTMLButtonElement>('[data-search-trigger]');
const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
const suggestionTarget = document.querySelector<HTMLElement>('[data-search-suggestions]');
let searchAbort: AbortController | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;

searchTrigger?.addEventListener('click', () => {
    searchForm?.classList.toggle('is-open');
    if (searchForm?.classList.contains('is-open')) searchInput?.focus();
});

searchInput?.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (query.length < 2) {
        if (suggestionTarget) suggestionTarget.innerHTML = '';

        return;
    }
    searchTimer = setTimeout(async () => {
        searchAbort?.abort();
        searchAbort = new AbortController();
        try {
            const response = await fetch(`/api/v1/public/search/suggestions?q=${encodeURIComponent(query)}&limit=6`, { signal: searchAbort.signal, headers: { Accept: 'application/json' } });
            if (!response.ok) return;
            const payload = await response.json() as SearchResponse;
            if (!suggestionTarget) return;
            const products = payload.data.products.map((item) => `<a href="/produits/${encodeURIComponent(item.slug)}">${escapeHtml(item.name)} <small>Produit</small></a>`).join('');
            const categories = payload.data.categories.map((item) => `<a href="/categories/${encodeURIComponent(item.slug)}">${escapeHtml(item.name)} <small>Catégorie</small></a>`).join('');
            suggestionTarget.innerHTML = products || categories ? `${products}${categories}` : '<p class="search-empty">Aucun résultat immédiat.</p>';
        } catch (error: unknown) {
            if (!(error instanceof DOMException && error.name === 'AbortError') && suggestionTarget) suggestionTarget.textContent = 'La recherche est momentanément indisponible.';
        }
    }, 180);
});

function escapeHtml(value: string): string {
    const element = document.createElement('span');
    element.textContent = value;

    return element.innerHTML;
}

const ritualHost = document.querySelector<HTMLElement>('[data-ritual-finder]');
if (ritualHost) {
    const categories = JSON.parse(ritualHost.dataset.categories ?? '[]') as RitualCategory[];
    const prompts = ['Une pause apaisante', 'Un geste énergisant', 'Un moment pour moi'];
    ritualHost.innerHTML = `<div class="ritual-finder-ui"><p>De quoi avez-vous envie aujourd’hui ?</p><div class="ritual-options">${prompts.map((prompt, index) => `<button type="button" aria-pressed="false" data-ritual-choice="${index}">${prompt}</button>`).join('')}</div><div class="ritual-result" data-ritual-result>Choisissez une envie pour recevoir une piste.</div></div>`;
    ritualHost.querySelectorAll<HTMLButtonElement>('[data-ritual-choice]').forEach((button) => {
        button.addEventListener('click', () => {
            ritualHost.querySelectorAll<HTMLButtonElement>('[data-ritual-choice]').forEach((choice) => choice.setAttribute('aria-pressed', String(choice === button)));
            const category = categories[Number(button.dataset.ritualChoice) % Math.max(categories.length, 1)];
            const result = ritualHost.querySelector<HTMLElement>('[data-ritual-result]');
            if (result) result.innerHTML = category ? `Commencez par <a class="text-link" href="${category.url}">${escapeHtml(category.name)}</a>, puis composez votre geste à votre rythme.` : 'La sélection arrive bientôt.';
        });
    });
}

const detail = document.querySelector<HTMLElement>('[data-product-detail]');
if (detail) {
    let quantity = 1;
    let variantId: string | null = null;
    const output = detail.querySelector<HTMLOutputElement>('[data-quantity]');
    detail.querySelector('[data-quantity-minus]')?.addEventListener('click', () => { quantity = Math.max(1, quantity - 1); if (output) output.value = String(quantity); });
    detail.querySelector('[data-quantity-plus]')?.addEventListener('click', () => { quantity += 1; if (output) output.value = String(quantity); });
    detail.querySelectorAll<HTMLButtonElement>('[data-gallery-image]').forEach((button) => button.addEventListener('click', () => {
        const image = detail.querySelector<HTMLImageElement>('[data-gallery-main]');
        if (image && button.dataset.galleryImage) image.src = button.dataset.galleryImage;
    }));
    const rawVariants = detail.dataset.productVariants;
    const addButton = detail.querySelector<HTMLButtonElement>('[data-add-to-cart]');
    if (rawVariants) setupVariants(detail, JSON.parse(rawVariants) as Variant[], (id) => { variantId = id; }); else if (addButton) addButton.disabled = false;
    addButton?.addEventListener('click', () => { const productId = detail.dataset.productPublicId; if (!productId || (rawVariants && !variantId)) return; addToCart({ product_public_id: productId, variant_public_id: variantId, quantity }); addButton.textContent = 'Ajouté au panier'; window.setTimeout(() => { addButton.textContent = 'Ajouter au panier'; }, 1400); });
}

function setupVariants(detailElement: HTMLElement, variants: Variant[], onSelect: (id: string | null) => void): void {
    const selected = new Set<number>();
    const buttons = detailElement.querySelectorAll<HTMLButtonElement>('[data-option-value]');
    const message = detailElement.querySelector<HTMLElement>('[data-stock-message]');
    const addButton = detailElement.querySelector<HTMLButtonElement>('[data-add-to-cart]');
    buttons.forEach((button) => button.addEventListener('click', () => {
        const value = Number(button.dataset.optionValue);
        const group = button.closest('fieldset');
        group?.querySelectorAll<HTMLButtonElement>('[data-option-value]').forEach((other) => { selected.delete(Number(other.dataset.optionValue)); other.setAttribute('aria-pressed', 'false'); });
        selected.add(value);
        button.setAttribute('aria-pressed', 'true');
        const variant = variants.find((item) => item.value_ids.length === selected.size && item.value_ids.every((id) => selected.has(id)));
        if (!variant) { onSelect(null); if (message) message.textContent = 'Cette combinaison n’est pas disponible.'; if (addButton) addButton.disabled = true; return; }
        const available = variant.is_active && variant.stock_quantity > 0;
        if (message) { message.textContent = available ? 'En stock' : 'Indisponible'; message.className = `stock-message ${available ? 'in-stock' : 'out-stock'}`; }
        onSelect(available ? variant.public_id : null);
        if (addButton) addButton.disabled = !available;
    }));
}

const cartPage = document.querySelector<HTMLElement>('[data-cart-page]');
if (cartPage) renderCartPage(cartPage);
async function renderCartPage(host: HTMLElement): Promise<void> { const items = cart(); if (!items.length) { host.innerHTML = '<p class="catalogue-empty">Votre panier est vide. <a class="text-link" href="/produits">Découvrir les soins</a></p>'; return; } try { const payload = await quote(items); const quoteData = payload.data; host.innerHTML = `<div class="cart-layout"><div class="cart-lines">${quoteData.items.map((line, index) => `<article class="cart-line"><div><h2>${escapeHtml(line.name)}</h2><p>${escapeHtml(line.variant_label ?? '')}</p>${line.messages.map(escapeHtml).join('<p class="commerce-alert">')}</p></div><strong>${line.line_total.formatted}</strong><div class="cart-stepper"><button type="button" data-cart-change="${index}" data-delta="-1">−</button><span>${line.quantity_requested}</span><button type="button" data-cart-change="${index}" data-delta="1">+</button><button type="button" data-cart-remove="${index}">Retirer</button></div></article>`).join('')}</div><aside class="cart-summary"><p>Sous-total <strong>${quoteData.pricing.subtotal.formatted}</strong></p><p>Livraison <strong>${quoteData.pricing.shipping.fee.formatted}</strong></p><p class="cart-total">Total <strong>${quoteData.pricing.total.formatted}</strong></p><p>Paiement à la livraison.</p><a class="button button-dark ${quoteData.can_checkout ? '' : 'is-disabled'}" ${quoteData.can_checkout ? 'href="/commande"' : 'aria-disabled="true"'}>Finaliser ma commande</a></aside></div>`; host.querySelectorAll<HTMLButtonElement>('[data-cart-change]').forEach((button) => button.addEventListener('click', () => { const index = Number(button.dataset.cartChange); const updated = cart(); const item = updated[index]; if (!item) return; item.quantity = Math.max(1, Math.min(99, item.quantity + Number(button.dataset.delta))); saveCart(updated); renderCartPage(host); })); host.querySelectorAll<HTMLButtonElement>('[data-cart-remove]').forEach((button) => button.addEventListener('click', () => { const updated = cart(); updated.splice(Number(button.dataset.cartRemove), 1); saveCart(updated); renderCartPage(host); })); } catch { host.innerHTML = '<p class="commerce-alert">Le panier est momentanément indisponible. Réessayez dans un instant.</p>'; } }
