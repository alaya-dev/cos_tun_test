import { onMounted, ref, type Component } from 'vue';
import { RouterLink } from 'vue-router';

type Category = { public_id: string; name: string };
type Product = { public_id: string; name: string; category?: Category; regular_price_millimes: number; stock_quantity: number | null; has_variants: boolean; is_active: boolean; updated_at: string; images: { path: string | null; processing_status: string }[] };
type Page<T> = { data: T[]; current_page: number; last_page: number; total: number };
const money = (value: number) => `${(value / 1000).toFixed(3).replace('.', ',')} TND`;

async function api<T>(path: string): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Votre session ne permet pas cet accès.' : 'Le catalogue est momentanément indisponible.');
    return response.json() as Promise<T>;
}

const ProductsView: Component = {
    components: { RouterLink },
    setup() {
        const page = ref<Page<Product> | null>(null);
        const categories = ref<Category[]>([]);
        const loading = ref(true);
        const error = ref('');
        const filters = ref({ search: '', category_id: '', is_active: '', has_variants: '', stock_state: '', is_promotional: '', sort: '-created_at' });
        const load = async (requestedPage = 1) => {
            loading.value = true; error.value = '';
            try {
                const query = new URLSearchParams({ per_page: '25', page: String(requestedPage), sort: filters.value.sort });
                Object.entries(filters.value).forEach(([key, value]) => { if (value && key !== 'sort') query.set(key, value); });
                page.value = (await api<{ data: Page<Product> }>(`products?${query}`)).data;
            } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { loading.value = false; }
        };
        onMounted(async () => { await Promise.all([load(), api<{ data: Page<Category> }>('categories?per_page=100').then(result => { categories.value = result.data.data; }).catch(() => undefined)]); });
        const imageUrl = (product: Product) => product.images[0]?.path ? `/storage/${product.images[0].path}` : '';
        return { page, categories, loading, error, filters, load, imageUrl, money };
    },
    // eslint-disable-next-line quotes
    template: `<section class="admin-page"><header><div><p class="admin-eyebrow">Catalogue</p><h1>Produits</h1></div><RouterLink class="admin-action" to="/products/new">Nouveau produit</RouterLink></header><form class="admin-form admin-product-filters" @submit.prevent="load()"><label>Recherche<input v-model.trim="filters.search" placeholder="Nom"></label><label>Catégorie<select v-model="filters.category_id"><option value="">Toutes</option><option v-for="category in categories" :value="category.public_id">{{ category.name }}</option></select></label><label>Publication<select v-model="filters.is_active"><option value="">Tous</option><option value="true">Actifs</option><option value="false">Inactifs</option></select></label><label>Type<select v-model="filters.has_variants"><option value="">Tous</option><option value="false">Stock unique</option><option value="true">Variantes</option></select></label><label>Stock<select v-model="filters.stock_state"><option value="">Tous</option><option value="in_stock">En stock</option><option value="low_stock">Stock bas</option><option value="out_of_stock">Rupture</option></select></label><label>Promotion<select v-model="filters.is_promotional"><option value="">Toutes</option><option value="true">En promotion</option><option value="false">Sans promotion</option></select></label><label>Trier<select v-model="filters.sort"><option value="-created_at">Plus récents</option><option value="created_at">Plus anciens</option><option value="name">Nom A-Z</option><option value="-name">Nom Z-A</option><option value="regular_price_millimes">Prix croissant</option><option value="-regular_price_millimes">Prix décroissant</option></select></label><button class="admin-action">Filtrer</button></form><p v-if="loading">Chargement…</p><p v-else-if="error" class="admin-alert">{{ error }}</p><p v-else-if="!page?.data.length" class="admin-empty">Aucun produit ne correspond à ces critères.</p><template v-else><p class="admin-result-count">{{ page.total }} produit(s)</p><div class="admin-table admin-product-table"><RouterLink v-for="product in page.data" :key="product.public_id" :to="'/products/' + product.public_id"><article><div class="admin-product-identity"><span class="admin-product-thumb"><img v-if="imageUrl(product)" :src="imageUrl(product)" alt=""><small v-else>—</small></span><span><strong>{{ product.name }}</strong><small>{{ product.category?.name || 'Sans catégorie' }} · mis à jour {{ new Date(product.updated_at).toLocaleDateString('fr-TN') }}</small></span></div><span>{{ money(product.regular_price_millimes) }}</span><span>{{ product.has_variants ? 'Variantes' : product.stock_quantity }}</span><span :class="product.is_active ? 'status-active' : 'status-muted'">{{ product.is_active ? 'Actif' : 'Inactif' }}</span></article></RouterLink></div><nav v-if="page.last_page > 1" class="admin-pagination" aria-label="Pagination des produits"><button class="text-link" :disabled="page.current_page === 1" @click="load(page.current_page - 1)">Précédente</button><span>Page {{ page.current_page }} / {{ page.last_page }}</span><button class="text-link" :disabled="page.current_page === page.last_page" @click="load(page.current_page + 1)">Suivante</button></nav></template></section>`,
};

export default ProductsView;
