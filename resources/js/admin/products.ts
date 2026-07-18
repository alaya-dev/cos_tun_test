import { computed, onMounted, ref, type Component } from 'vue';
import { RouterLink } from 'vue-router';
import { showError, showToast } from './feedback';
import SelectControl from './select-control';

type Product = { public_id: string; name: string; is_active: boolean; regular_price_millimes: number; stock_quantity: number | null; active_variant_stock_quantity?: number | null; has_variants: boolean; category?: { name: string } };
type Category = { public_id: string; name: string };
type Page<T> = { data: T[]; total: number };
type ProductAction = 'publish' | 'hide' | 'archive' | 'restore' | 'delete';
const money = (value: number) => `${(value / 1000).toFixed(3).replace('.', ',')} DT`;
const csrf = () => document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '';
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) throw new Error(payload?.message || 'Action impossible. Réessayez.');
    return payload as T;
}
const ProductsView: Component = {
    components: { RouterLink, SelectControl },
    setup() {
        const page = ref<Page<Product> | null>(null); const categories = ref<Category[]>([]); const loading = ref(true); const selected = ref<string[]>([]); const extra = ref(false);
        const filters = ref({ search: '', category_id: '', is_active: '', has_variants: '', stock_state: '', is_promotional: '', sort: '-created_at', archived: '0' });
        const archivedView = computed(() => filters.value.archived === '1');
        const allSelected = computed(() => !!page.value?.data.length && selected.value.length === page.value.data.length);
        const load = async () => {
            loading.value = true;
            try {
                const query = new URLSearchParams({ per_page: '100', sort: filters.value.sort, archived: filters.value.archived });
                (['search', 'category_id', 'is_active', 'has_variants', 'stock_state', 'is_promotional'] as const).forEach((key) => { if (filters.value[key]) query.set(key, filters.value[key]); });
                page.value = (await api<{ data: Page<Product> }>(`products?${query}`)).data;
                selected.value = selected.value.filter((id) => page.value?.data.some((product) => product.public_id === id));
            } catch (cause) { showError(cause instanceof Error ? cause.message : 'Impossible de charger les produits.'); }
            finally { loading.value = false; }
        };
        const loadCategories = async () => { try { categories.value = (await api<{ data: Page<Category> }>('categories?per_page=100&is_active=1')).data.data; } catch (cause) { showError(cause instanceof Error ? cause.message : 'Impossible de charger les catégories.'); } };
        const toggle = (id: string) => selected.value = selected.value.includes(id) ? selected.value.filter((item) => item !== id) : [...selected.value, id];
        const toggleAll = () => selected.value = allSelected.value ? [] : (page.value?.data.map((product) => product.public_id) || []);
        const reset = () => { filters.value = { search: '', category_id: '', is_active: '', has_variants: '', stock_state: '', is_promotional: '', sort: '-created_at', archived: '0' }; extra.value = false; load(); };
        const bulk = async (action: ProductAction) => {
            if (!selected.value.length) return;
            const messages: Record<ProductAction, string> = { publish: `Publier ${selected.value.length} produit(s) dans la boutique ?`, hide: `Masquer ${selected.value.length} produit(s) de la boutique ?`, archive: `Archiver ${selected.value.length} produit(s) ? Ils resteront restaurables et leurs références seront conservées.`, restore: `Restaurer ${selected.value.length} produit(s) ? Ils resteront masqués jusqu’à leur publication.`, delete: `Supprimer définitivement ${selected.value.length} produit(s) ? Cette action est irréversible et n’est possible que sans historique.` };
            if (!window.confirm(messages[action])) return;
            const path = action === 'archive' ? 'products/bulk-archive' : action === 'restore' ? 'products/bulk-restore' : action === 'delete' ? 'products/bulk-force-delete' : 'products/bulk-status';
            const body = action === 'publish' || action === 'hide' ? { public_ids: selected.value, is_active: action === 'publish' } : { public_ids: selected.value };
            try { await api(path, 'POST', body); showToast('success', action === 'delete' ? 'Produits supprimés définitivement.' : action === 'restore' ? 'Produits restaurés et masqués.' : 'Action groupée appliquée.'); selected.value = []; await load(); } catch (cause) { showError(cause instanceof Error ? cause.message : 'Action groupée impossible.'); }
        };
        let timer: number | undefined; const queue = () => { clearTimeout(timer); timer = window.setTimeout(load, 280); };
        const stockLabel = (product: Product) => `${product.has_variants ? product.active_variant_stock_quantity || 0 : product.stock_quantity || 0} unités`;
        onMounted(() => { load(); loadCategories(); });
        return { allSelected, archivedView, bulk, categories, extra, filters, load, loading, money, page, queue, reset, selected, stockLabel, toggle, toggleAll };
    },
    template: `<section class="admin-page products-page"><header class="admin-page-header"><div><p class="admin-eyebrow">Catalogue</p><h1>Produits</h1><p class="admin-subtitle">Gérez les produits, prix et disponibilité.</p></div><RouterLink class="admin-action" to="/products/new">Nouveau produit</RouterLink></header>
      <section class="product-filter-panel" aria-label="Filtres des produits"><label class="admin-search"><span class="sr-only">Rechercher un produit</span><input v-model.trim="filters.search" @input="queue" placeholder="Rechercher un produit…"></label><label class="toolbar-select"><span>Catégorie</span><SelectControl v-model="filters.category_id" :options="[{ value: '', label: 'Toutes les catégories' }, ...categories.map(category => ({ value: category.public_id, label: category.name }))]" @change="load"/></label><label class="toolbar-select"><span>Visibilité</span><SelectControl v-model="filters.is_active" :options="[{ value: '', label: 'Tous les produits' }, { value: '1', label: 'Publiés' }, { value: '0', label: 'Masqués' }]" @change="load"/></label><label class="toolbar-select"><span>Affichage</span><SelectControl v-model="filters.archived" :options="[{ value: '0', label: 'Catalogue actif' }, { value: '1', label: 'Archives' }]" @change="load"/></label><label class="toolbar-select"><span>Trier par</span><SelectControl v-model="filters.sort" :options="[{ value: '-created_at', label: 'Plus récents' }, { value: 'created_at', label: 'Plus anciens' }, { value: 'name', label: 'Nom A-Z' }, { value: '-name', label: 'Nom Z-A' }, { value: 'regular_price_millimes', label: 'Prix croissant' }, { value: '-regular_price_millimes', label: 'Prix décroissant' }]" @change="load"/></label><button class="admin-outline product-more" type="button" :aria-expanded="extra" @click="extra = !extra">{{ extra ? 'Moins de filtres' : 'Plus de filtres' }}</button><button class="text-link product-reset" type="button" @click="reset">Réinitialiser</button><Transition name="orders-filter"><div v-if="extra" class="product-extra-filters"><label class="toolbar-select"><span>Stock</span><SelectControl v-model="filters.stock_state" :options="[{ value: '', label: 'Tous les états' }, { value: 'in_stock', label: 'En stock' }, { value: 'low_stock', label: 'Stock faible' }, { value: 'out_of_stock', label: 'Rupture' }]" @change="load"/></label><label class="toolbar-select"><span>Type</span><SelectControl v-model="filters.has_variants" :options="[{ value: '', label: 'Tous les types' }, { value: '0', label: 'Stock unique' }, { value: '1', label: 'Avec variantes' }]" @change="load"/></label><label class="toolbar-select"><span>Promotion</span><SelectControl v-model="filters.is_promotional" :options="[{ value: '', label: 'Toutes' }, { value: '1', label: 'En promotion' }, { value: '0', label: 'Sans promotion' }]" @change="load"/></label></div></Transition></section>
      <section v-if="selected.length" class="bulk-bar" aria-live="polite"><strong>{{ selected.length }} sélectionné{{ selected.length > 1 ? 's' : '' }}</strong><template v-if="!archivedView"><div class="bulk-actions"><button class="admin-outline" type="button" @click="bulk('publish')">Publier</button><button class="admin-outline" type="button" @click="bulk('hide')">Masquer</button></div><button class="text-link danger" type="button" @click="bulk('archive')">Archiver</button></template><template v-else><div class="bulk-actions"><button class="admin-outline" type="button" @click="bulk('restore')">Restaurer</button></div><button class="text-link danger" type="button" @click="bulk('delete')">Supprimer définitivement</button></template></section>
      <p v-if="loading" class="admin-loading">Chargement…</p><section v-else-if="!page?.data.length" class="admin-empty"><strong>{{ archivedView ? 'Aucun produit archivé.' : 'Aucun produit ne correspond à ces filtres.' }}</strong><button v-if="!archivedView" class="text-link" type="button" @click="reset">Réinitialiser les filtres</button></section><div v-else class="admin-table admin-product-table"><div class="admin-table-head"><label><input type="checkbox" :checked="allSelected" @change="toggleAll"><span>Produit</span></label><span>Prix</span><span>Stock</span><span>Statut</span></div><article v-for="product in page.data" :key="product.public_id"><label class="admin-product-identity"><input type="checkbox" :checked="selected.includes(product.public_id)" @change="toggle(product.public_id)"><RouterLink :to="'/products/' + product.public_id"><strong>{{ product.name }}</strong><small>{{ product.category?.name || 'Sans catégorie' }}</small></RouterLink></label><span>{{ money(product.regular_price_millimes) }}</span><span>{{ stockLabel(product) }}</span><span class="admin-badge" :class="{ 'is-published': product.is_active }">{{ archivedView ? 'Archivé' : product.is_active ? 'Publié' : 'Masqué' }}</span></article></div></section>`,
};
export default ProductsView;
