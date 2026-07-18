import { onMounted, ref, type Component } from 'vue';
import { RouterLink } from 'vue-router';

type Order = { public_reference: string; customer_name: string; customer_phone: string; status: string; total_millimes: number; created_at: string; items_count: number };
type Page<T> = { data: T[]; current_page: number; last_page: number; total: number };
const money = (value: number) => `${(value / 1000).toFixed(3).replace('.', ',')} TND`;

async function api<T>(path: string): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Votre session ne permet pas cet accès.' : 'Les commandes sont momentanément indisponibles.');
    return response.json() as Promise<T>;
}

const OrdersView: Component = {
    components: { RouterLink },
    setup() {
        const page = ref<Page<Order> | null>(null);
        const loading = ref(true);
        const error = ref('');
        const filters = ref({ search: '', status: '', date_from: '', date_to: '', min_total_millimes: null as number | null, max_total_millimes: null as number | null, sort: '-created_at' });
        const load = async (requestedPage = 1) => {
            loading.value = true; error.value = '';
            try {
                const query = new URLSearchParams({ per_page: '25', page: String(requestedPage), sort: filters.value.sort });
                (Object.entries(filters.value) as [string, string | number | null][]).forEach(([key, value]) => { if (value !== '' && value !== null && key !== 'sort') query.set(key, String(value)); });
                page.value = (await api<{ data: Page<Order> }>(`orders?${query}`)).data;
            } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { loading.value = false; }
        };
        const exportCsv = () => {
            const query = new URLSearchParams();
            ['status', 'date_from', 'date_to'].forEach(key => { const value = filters.value[key as keyof typeof filters.value]; if (typeof value === 'string' && value) query.set(key, value); });
            window.location.assign(`/api/v1/admin/orders/export?${query}`);
        };
        onMounted(load);
        return { page, loading, error, filters, load, exportCsv, money };
    },
    template: '<section class="admin-page"><header><div><p class="admin-eyebrow">Opérations</p><h1>Commandes</h1></div><button class="admin-action" @click="exportCsv">Exporter CSV</button></header><form class="admin-form admin-order-filters" @submit.prevent="load()"><label>Recherche<input v-model.trim="filters.search" placeholder="Référence, client, téléphone"></label><label>Statut<select v-model="filters.status"><option value="">Tous</option><option value="nouvelle">Nouvelle</option><option value="confirmee">Confirmée</option><option value="annulee">Annulée</option><option value="livree">Livrée</option><option value="echec_livraison">Échec livraison</option><option value="retournee">Retournée</option></select></label><label>Du<input v-model="filters.date_from" type="date"></label><label>Au<input v-model="filters.date_to" type="date"></label><label>Total minimum (millimes)<input v-model.number="filters.min_total_millimes" type="number" min="0"></label><label>Total maximum (millimes)<input v-model.number="filters.max_total_millimes" type="number" min="0"></label><label>Trier<select v-model="filters.sort"><option value="-created_at">Plus récentes</option><option value="created_at">Plus anciennes</option><option value="-total_millimes">Total décroissant</option><option value="total_millimes">Total croissant</option><option value="status">Statut</option><option value="customer_name">Client</option></select></label><button class="admin-action">Filtrer</button></form><p v-if="loading">Chargement…</p><p v-else-if="error" class="admin-alert">{{ error }}</p><p v-else-if="!page?.data.length" class="admin-empty">Aucune commande ne correspond à ces critères.</p><template v-else><p class="admin-result-count">{{ page.total }} commande(s)</p><div class="admin-table"><RouterLink v-for="order in page.data" :key="order.public_reference" :to="\'/orders/\' + order.public_reference"><article><div><strong>{{ order.public_reference }}</strong><small>{{ order.customer_name }} · {{ order.customer_phone }} · {{ order.items_count }} article(s)</small></div><span>{{ money(order.total_millimes) }}</span><span class="status-muted">{{ order.status }}</span></article></RouterLink></div><nav v-if="page.last_page > 1" class="admin-pagination" aria-label="Pagination des commandes"><button class="text-link" :disabled="page.current_page === 1" @click="load(page.current_page - 1)">Précédente</button><span>Page {{ page.current_page }} / {{ page.last_page }}</span><button class="text-link" :disabled="page.current_page === page.last_page" @click="load(page.current_page + 1)">Suivante</button></nav></template></section>',
};

export default OrdersView;
