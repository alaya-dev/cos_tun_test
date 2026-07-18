import { onMounted, ref, type Component } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { showError, showToast } from './feedback';
import SelectControl from './select-control';

type Category = { public_id: string; name: string };
type Product = {
    public_id: string;
    name: string;
    category?: Category;
    regular_price_millimes: number;
    stock_quantity: number | null;
    active_variant_stock_quantity?: number | null;
    has_variants: boolean;
    is_active: boolean;
    updated_at: string;
    images: { path: string | null }[];
};
type Page<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
};
const money = (value: number) =>
    `${(value / 1000).toFixed(3).replace('.', ',')} DT`;

async function api<T>(path: string): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
    });
    if (!response.ok)
        throw new Error(
            response.status === 401 || response.status === 403
                ? 'Votre session ne permet pas cet accès.'
                : 'Impossible de charger les produits pour le moment. Réessayez dans un instant.',
        );
    return response.json() as Promise<T>;
}

const ProductsView: Component = {
    components: { RouterLink, SelectControl },
    setup() {
        const route = useRoute();
        const page = ref<Page<Product> | null>(null);
        const categories = ref<Category[]>([]);
        const loading = ref(true);
        const error = ref('');
        const filters = ref({
            search: '',
            category_id: '',
            is_active: '',
            has_variants: '',
            stock_state: '',
            is_promotional: '',
            sort: '-created_at',
        });
        const load = async (requestedPage = 1) => {
            loading.value = true;
            try {
                const query = new URLSearchParams({
                    per_page: '25',
                    page: String(requestedPage),
                    sort: filters.value.sort,
                });
                Object.entries(filters.value).forEach(([key, value]) => {
                    if (!value || key === 'sort') return;
                    query.set(
                        key,
                        ['is_active', 'has_variants', 'is_promotional'].includes(key)
                            ? value === 'true'
                                ? '1'
                                : '0'
                            : value,
                    );
                });
                page.value = (
                    await api<{ data: Page<Product> }>(`products?${query}`)
                ).data;
            } catch (cause) {
                showError(cause instanceof Error ? cause.message : 'Impossible de charger les produits.');
            } finally {
                loading.value = false;
            }
        };
        onMounted(async () => {
            const category = route.query.category_id;
            if (typeof category === 'string')
                filters.value.category_id = category;
            await Promise.all([
                load(),
                api<{ data: Page<Category> }>('categories?per_page=100')
                    .then((result) => {
                        categories.value = result.data.data;
                    })
                    .catch((cause) => showError(cause instanceof Error ? cause.message : 'Impossible de charger les catégories.')),
            ]);
        });
        const imageUrl = (product: Product) => {
            const path = product.images[0]?.path;
            return path
                ? path.startsWith('http') || path.startsWith('/')
                    ? path
                    : `/storage/${path}`
                : '';
        };
        let searchTimer: number | undefined;
        const queueSearch = () => {
            window.clearTimeout(searchTimer);
            searchTimer = window.setTimeout(() => load(), 280);
        };
        const reset = () => {
            filters.value = {
                search: '',
                category_id: '',
                is_active: '',
                has_variants: '',
                stock_state: '',
                is_promotional: '',
                sort: '-created_at',
            };
            load();
            showToast('info', 'Filtres réinitialisés.');
        };
        const stock = (product: Product) =>
            product.has_variants
                ? product.active_variant_stock_quantity || 0
                : product.stock_quantity || 0;
        return {
            page,
            categories,
            loading,
            error,
            filters,
            load,
            queueSearch,
            reset,
            imageUrl,
            money,
            stock,
        };
    },
    template:
        '<section class="admin-page"><header><div><p class="admin-eyebrow">Catalogue / Produits</p><h1>Produits</h1><p class="admin-subtitle">Gérez les produits, prix, variantes et disponibilité.</p></div><RouterLink class="admin-action" to="/products/new">Nouveau produit</RouterLink></header><div class="admin-filter-bar"><label class="admin-search"><span class="sr-only">Rechercher</span><input v-model.trim="filters.search" @input="queueSearch" placeholder="Rechercher un produit…"></label><SelectControl v-model="filters.category_id" :options="[{ value: \'\', label: \'Catégorie\' }, ...categories.map(category => ({ value: category.public_id, label: category.name }))]" @change="load()"/><SelectControl v-model="filters.is_active" :options="[{ value: \'\', label: \'Publication\' }, { value: \'true\', label: \'Publié\' }, { value: \'false\', label: \'Brouillon\' }]" @change="load()"/><SelectControl v-model="filters.has_variants" :options="[{ value: \'\', label: \'Type\' }, { value: \'false\', label: \'Stock unique\' }, { value: \'true\', label: \'Variantes\' }]" @change="load()"/><SelectControl v-model="filters.stock_state" :options="[{ value: \'\', label: \'Stock\' }, { value: \'in_stock\', label: \'En stock\' }, { value: \'low_stock\', label: \'Stock faible\' }, { value: \'out_of_stock\', label: \'Rupture\' }]" @change="load()"/><SelectControl v-model="filters.is_promotional" :options="[{ value: \'\', label: \'Promotion\' }, { value: \'true\', label: \'En promotion\' }, { value: \'false\', label: \'Sans promotion\' }]" @change="load()"/><SelectControl v-model="filters.sort" :options="[{ value: \'-created_at\', label: \'Plus récents\' }, { value: \'name\', label: \'Nom A-Z\' }, { value: \'regular_price_millimes\', label: \'Prix croissant\' }]" @change="load()"/><button class="text-link" type="button" @click="reset">Réinitialiser</button></div><p v-if="loading" class="admin-loading">Chargement des produits…</p><p v-else-if="error" class="admin-alert" role="alert">{{ error }}</p><p v-else-if="!page?.data.length" class="admin-empty">Aucun produit ne correspond à ces critères. Modifiez les filtres ou créez un produit.</p><template v-else><p class="admin-result-count">{{ page.total }} résultat(s)</p><div class="admin-table admin-product-table"><div class="admin-table-head"><span>Produit</span><span>Prix</span><span>Stock</span><span>Statut</span></div><RouterLink v-for="product in page.data" :key="product.public_id" :to="\'/products/\' + product.public_id"><article><div class="admin-product-identity"><span class="admin-product-thumb"><img v-if="imageUrl(product)" :src="imageUrl(product)" alt=""><small v-else>Sans image</small></span><span><strong>{{ product.name }}</strong><small>{{ product.category?.name || \'Sans catégorie\' }} · {{ product.has_variants ? \'Variantes\' : \'Stock unique\' }}</small></span></div><span>{{ money(product.regular_price_millimes) }}</span><span>{{ stock(product) }} unités</span><span :class="product.is_active ? \'admin-badge is-published\' : \'admin-badge\'">{{ product.is_active ? \'Publié\' : \'Brouillon\' }}</span></article></RouterLink></div><nav v-if="page.last_page > 1" class="admin-pagination" aria-label="Pagination des produits"><button class="text-link" :disabled="page.current_page === 1" @click="load(page.current_page - 1)">Précédente</button><span>Page {{ page.current_page }} / {{ page.last_page }}</span><button class="text-link" :disabled="page.current_page === page.last_page" @click="load(page.current_page + 1)">Suivante</button></nav></template></section>',
};

export default ProductsView;
