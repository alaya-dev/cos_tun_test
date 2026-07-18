import { computed, onMounted, ref, type Component } from 'vue';
import { RouterLink } from 'vue-router';
import { showError, showToast } from './feedback';

type Order = {
    public_reference: string;
    customer_name: string;
    customer_phone: string;
    status: string;
    total_millimes: number;
    created_at: string;
    items_count: number;
};

type Page<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

const money = (value: number) =>
    `${(value / 1000).toFixed(3).replace('.', ',')} DT`;

const statusMeta = (value: string) =>
    ({
        nouvelle: { label: 'Nouvelle', tone: 'new' },
        confirmee: { label: 'Confirmée', tone: 'confirmed' },
        annulee: { label: 'Annulée', tone: 'cancelled' },
        livree: { label: 'Livrée', tone: 'delivered' },
        echec_livraison: { label: 'Incident de livraison', tone: 'incident' },
        retournee: { label: 'Retournée', tone: 'returned' },
    })[value] || { label: value, tone: 'muted' };

const toMillimes = (value: string) =>
    value ? Math.round(Number(value.replace(',', '.')) * 1000) : null;

async function api<T>(path: string): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, {
        headers: { Accept: 'application/json' },
        credentials: 'same-origin',
    });

    if (!response.ok) {
        throw new Error(
            response.status === 401 || response.status === 403
                ? 'Votre session ne permet pas cet accès.'
                : 'Impossible de charger les commandes. Réessayez dans un instant.',
        );
    }

    return response.json() as Promise<T>;
}

const OrdersView: Component = {
    components: { RouterLink },
    setup() {
        const page = ref<Page<Order> | null>(null);
        const loading = ref(true);
        const extra = ref(false);
        const filters = ref({
            search: '',
            status: '',
            date_from: '',
            date_to: '',
            min_total_dt: '',
            max_total_dt: '',
            sort: '-created_at',
        });

        const summaries = computed(() => {
            const orders = page.value?.data || [];
            const count = (...statuses: string[]) =>
                orders.filter((order) => statuses.includes(order.status)).length;

            return [
                { label: 'Nouvelles', value: count('nouvelle'), tone: 'new', icon: '◌' },
                { label: 'À confirmer', value: count('confirmee'), tone: 'confirmed', icon: '✓' },
                { label: 'En livraison', value: count('livree'), tone: 'delivered', icon: '↗' },
                { label: 'Problèmes / retours', value: count('echec_livraison', 'retournee', 'annulee'), tone: 'incident', icon: '!' },
            ];
        });

        const load = async (requestedPage = 1) => {
            loading.value = true;
            try {
                const query = new URLSearchParams({
                    per_page: '25',
                    page: String(requestedPage),
                    sort: filters.value.sort,
                });
                if (filters.value.search) query.set('search', filters.value.search);
                if (filters.value.status) query.set('status', filters.value.status);
                if (filters.value.date_from) query.set('date_from', filters.value.date_from);
                if (filters.value.date_to) query.set('date_to', filters.value.date_to);
                const min = toMillimes(filters.value.min_total_dt);
                const max = toMillimes(filters.value.max_total_dt);
                if (min !== null) query.set('min_total_millimes', String(min));
                if (max !== null) query.set('max_total_millimes', String(max));
                page.value = (
                    await api<{ data: Page<Order> }>(`orders?${query}`)
                ).data;
            } catch (cause) {
                showError(
                    cause instanceof Error
                        ? cause.message
                        : 'Impossible de charger les commandes.',
                );
            } finally {
                loading.value = false;
            }
        };

        let timer: number | undefined;
        const search = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(load, 280);
        };
        const reset = () => {
            filters.value = {
                search: '', status: '', date_from: '', date_to: '',
                min_total_dt: '', max_total_dt: '', sort: '-created_at',
            };
            load();
            showToast('info', 'Filtres réinitialisés.');
        };
        const exportCsv = () => {
            const query = new URLSearchParams();
            if (filters.value.status) query.set('status', filters.value.status);
            if (filters.value.date_from) query.set('date_from', filters.value.date_from);
            if (filters.value.date_to) query.set('date_to', filters.value.date_to);
            window.location.assign(`/api/v1/admin/orders/export?${query}`);
        };

        onMounted(load);

        return {
            page, loading, extra, filters, summaries, load, search, reset,
            exportCsv, money, statusMeta,
        };
    },
    template: `<section class="admin-page orders-page">
      <header class="admin-page-header">
        <div><p class="admin-eyebrow">Opérations</p><h1>Commandes</h1><p class="admin-subtitle">Recherchez, filtrez et suivez vos commandes en toute simplicité.</p></div>
        <button class="admin-outline orders-export" :disabled="!page?.data.length" @click="exportCsv">↥ <span>Exporter CSV</span></button>
      </header>

      <section class="order-summary-grid" aria-label="Aperçu des commandes chargées">
        <article v-for="summary in summaries" :key="summary.label" class="order-summary-card" :class="'is-' + summary.tone"><span aria-hidden="true">{{ summary.icon }}</span><div><small>{{ summary.label }}</small><strong>{{ summary.value }}</strong><em>commande{{ summary.value > 1 ? 's' : '' }}</em></div></article>
      </section>

      <section class="orders-filter-card" aria-label="Filtres des commandes">
        <label class="orders-search"><span class="sr-only">Rechercher une commande</span><span aria-hidden="true">⌕</span><input v-model.trim="filters.search" @input="search" placeholder="Référence, client ou téléphone…"></label>
        <label class="toolbar-select"><span>Statut</span><select v-model="filters.status" @change="load()"><option value="">Tous les statuts</option><option value="nouvelle">Nouvelles</option><option value="confirmee">Confirmées</option><option value="livree">Livrées</option><option value="echec_livraison">Incidents</option><option value="annulee">Annulées</option><option value="retournee">Retournées</option></select></label>
        <label class="toolbar-select"><span>Trier par</span><select v-model="filters.sort" @change="load()"><option value="-created_at">Plus récentes</option><option value="created_at">Plus anciennes</option><option value="-total_millimes">Total décroissant</option><option value="total_millimes">Total croissant</option></select></label>
        <button class="admin-outline orders-more" type="button" :aria-expanded="extra" @click="extra = !extra">⌄ {{ extra ? 'Moins de filtres' : 'Plus de filtres' }}</button>
        <button class="text-link orders-reset" type="button" @click="reset">Réinitialiser</button>
        <Transition name="orders-filter"><div v-if="extra" class="orders-extra"><label>Du<input v-model="filters.date_from" type="date" @change="load()"></label><label>Au<input v-model="filters.date_to" type="date" @change="load()"></label><label>Total minimum (DT)<input v-model="filters.min_total_dt" inputmode="decimal" @change="load()"></label><label>Total maximum (DT)<input v-model="filters.max_total_dt" inputmode="decimal" @change="load()"></label></div></Transition>
      </section>

      <p v-if="loading" class="admin-loading">Chargement des commandes…</p>
      <section v-else-if="!page?.data.length" class="admin-empty orders-empty"><strong>Aucune commande ne correspond à ces filtres.</strong><span>Modifiez les filtres ou affichez toutes les commandes.</span><button class="text-link" type="button" @click="reset">Réinitialiser les filtres</button></section>
      <section v-else class="orders-list-card">
        <div class="orders-table-head"><span>Référence / client</span><span>Date</span><span>Total</span><span>Statut</span><span>Action</span></div>
        <RouterLink v-for="order in page.data" :key="order.public_reference" class="order-row" :to="'/orders/' + order.public_reference" :aria-label="'Ouvrir la commande ' + order.public_reference">
          <div class="order-customer"><span class="order-row-icon" aria-hidden="true">□</span><div><strong>{{ order.public_reference }}</strong><small>{{ order.customer_name }} <i>·</i> {{ order.items_count }} article{{ order.items_count > 1 ? 's' : '' }}</small><small class="order-phone">⌕ {{ order.customer_phone }}</small></div></div>
          <time :datetime="order.created_at">{{ new Date(order.created_at).toLocaleDateString('fr-TN') }}<small>{{ new Date(order.created_at).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' }) }}</small></time>
          <strong class="order-total">{{ money(order.total_millimes) }}</strong>
          <span class="order-status" :class="'is-' + statusMeta(order.status).tone">{{ statusMeta(order.status).label }}</span>
          <span class="order-open" aria-hidden="true">›</span>
        </RouterLink>
        <footer class="orders-pagination"><span>{{ page.total }} commande{{ page.total > 1 ? 's' : '' }}</span><span>{{ page.per_page || 25 }} par page</span><span>Page {{ page.current_page }} sur {{ page.last_page }}</span><div><button type="button" :disabled="page.current_page <= 1" aria-label="Page précédente" @click="load(page.current_page - 1)">‹</button><button type="button" :disabled="page.current_page >= page.last_page" aria-label="Page suivante" @click="load(page.current_page + 1)">›</button></div></footer>
      </section>
    </section>`,
};

export default OrdersView;
