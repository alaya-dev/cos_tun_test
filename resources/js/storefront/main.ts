type Suggestion = { name: string; slug: string };
type SearchResponse = { data: { products: Suggestion[]; categories: Suggestion[] } };
type Variant = { public_id: string; stock_quantity: number; is_active: boolean; value_ids: number[] };
type RitualCategory = { name: string; url: string };

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
    const output = detail.querySelector<HTMLOutputElement>('[data-quantity]');
    detail.querySelector('[data-quantity-minus]')?.addEventListener('click', () => { quantity = Math.max(1, quantity - 1); if (output) output.value = String(quantity); });
    detail.querySelector('[data-quantity-plus]')?.addEventListener('click', () => { quantity += 1; if (output) output.value = String(quantity); });
    detail.querySelectorAll<HTMLButtonElement>('[data-gallery-image]').forEach((button) => button.addEventListener('click', () => {
        const image = detail.querySelector<HTMLImageElement>('[data-gallery-main]');
        if (image && button.dataset.galleryImage) image.src = button.dataset.galleryImage;
    }));
    const rawVariants = detail.dataset.productVariants;
    if (rawVariants) setupVariants(detail, JSON.parse(rawVariants) as Variant[]);
}

function setupVariants(detailElement: HTMLElement, variants: Variant[]): void {
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
        if (!variant) { if (message) message.textContent = 'Cette combinaison n’est pas disponible.'; if (addButton) addButton.disabled = true; return; }
        const available = variant.is_active && variant.stock_quantity > 0;
        if (message) { message.textContent = available ? 'En stock' : 'Indisponible'; message.className = `stock-message ${available ? 'in-stock' : 'out-stock'}`; }
        if (addButton) addButton.disabled = !available;
    }));
}
