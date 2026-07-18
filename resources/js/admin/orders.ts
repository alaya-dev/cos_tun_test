import { computed, onMounted, ref, type Component } from 'vue';
import { RouterLink } from 'vue-router';
import { showError, showToast } from './feedback';
import SelectControl from './select-control';

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
type Transition = 'confirmee' | 'annulee' | 'livree' | 'echec_livraison' | 'retournee';

const money = (value: number) => `${(value / 1000).toFixed(3).replace('.', ',')} DT`;
const toMillimes = (value: string) => value ? Math.round(Number(value.replace(',', '.')) * 1000) : null;
const statusMeta = (value: string) => ({
    nouvelle: { label: 'Nouvelle', tone: 'new' },
    confirmee: { label: 'Confirmée', tone: 'confirmed' },
    annulee: { label: 'Annulée', tone: 'cancelled' },
    livree: { label: 'Livrée', tone: 'delivered' },
    echec_livraison: { label: 'Incident de livraison', tone: 'incident' },
    retournee: { label: 'Retournée', tone: 'returned' },
}[value] || { label: value, tone: 'muted' });
const transitionLabel: Record<Transition, string> = {
    confirmee: 'Confirmer', annulee: 'Annuler', livree: 'Marquer livrée',
    echec_livraison: 'Signaler un incident', retournee: 'Marquer retournée',
};
const allowedTransitions: Record<string, Transition[]> = {
    nouvelle: ['confirmee', 'annulee'],
    confirmee: ['livree', 'echec_livraison'],
    livree: ['retournee'],
};
const csrf = () => document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '';
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, {
        method,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) throw new Error(payload?.message || 'Action impossible. Réessayez dans un instant.');
    return payload as T;
}

const OrdersView: Component = {
    components: { RouterLink, SelectControl },
    setup() {
        const page = ref<Page<Order> | null>(null);
        const loading = ref(true);
        const extra = ref(false);
        const selected = ref<string[]>([]);
        const filters = ref({ search: '', status: '', archived: '0', date_from: '', date_to: '', min_total_dt: '', max_total_dt: '', sort: '-created_at' });
        const allSelected = computed(() => !!page.value?.data.length && selected.value.length === page.value.data.length);
        const selectedOrders = computed(() => page.value?.data.filter((order) => selected.value.includes(order.public_reference)) || []);
        const commonTransitions = computed<Transition[]>(() => {
            if (!selectedOrders.value.length) return [];
            return selectedOrders.value.slice(1).reduce<Transition[]>(
                (common, order) => common.filter((status) => allowedTransitions[order.status]?.includes(status)),
                [...(allowedTransitions[selectedOrders.value[0].status] || [])],
            );
        });
        const summaries = computed(() => {
            const orders = page.value?.data || [];
            const count = (...statuses: string[]) => orders.filter((order) => statuses.includes(order.status)).length;
            return [
                { label: 'Nouvelles', value: count('nouvelle'), tone: 'new', icon: '○' },
                { label: 'Confirmées', value: count('confirmee'), tone: 'confirmed', icon: '✓' },
                { label: 'Livrées', value: count('livree'), tone: 'delivered', icon: '↗' },
                { label: 'Incidents / retours', value: count('echec_livraison', 'retournee', 'annulee'), tone: 'incident', icon: '!' },
            ];
        });
        const load = async (requestedPage = 1) => {
            loading.value = true;
            try {
                const query = new URLSearchParams({ per_page: '25', page: String(requestedPage), sort: filters.value.sort, archived: filters.value.archived });
                if (filters.value.search) query.set('search', filters.value.search);
                if (filters.value.status) query.set('status', filters.value.status);
                if (filters.value.date_from) query.set('date_from', filters.value.date_from);
                if (filters.value.date_to) query.set('date_to', filters.value.date_to);
                const min = toMillimes(filters.value.min_total_dt); const max = toMillimes(filters.value.max_total_dt);
                if (min !== null) query.set('min_total_millimes', String(min));
                if (max !== null) query.set('max_total_millimes', String(max));
                page.value = (await api<{ data: Page<Order> }>(`orders?${query}`)).data;
                selected.value = selected.value.filter((reference) => page.value?.data.some((order) => order.public_reference === reference));
            } catch (cause) { showError(cause instanceof Error ? cause.message : 'Impossible de charger les commandes.'); }
            finally { loading.value = false; }
        };
        let timer: number | undefined;
        const search = () => { clearTimeout(timer); timer = window.setTimeout(load, 280); };
        const reset = () => { filters.value = { search: '', status: '', archived: '0', date_from: '', date_to: '', min_total_dt: '', max_total_dt: '', sort: '-created_at' }; load(); showToast('info', 'Filtres réinitialisés.'); };
        const toggle = (reference: string) => selected.value = selected.value.includes(reference) ? selected.value.filter((item) => item !== reference) : [...selected.value, reference];
        const toggleAll = () => selected.value = allSelected.value ? [] : (page.value?.data.map((order) => order.public_reference) || []);
        const bulkTransition = async (toStatus: Transition) => {
            if (!selected.value.length || !window.confirm(`Appliquer « ${transitionLabel[toStatus]} » à ${selected.value.length} commande(s) ?`)) return;
            try { await api('orders/bulk-transition', 'POST', { references: selected.value, to_status: toStatus }); showToast('success', 'Statut mis à jour pour la sélection.'); selected.value = []; await load(); }
            catch (cause) { showError(cause instanceof Error ? cause.message : 'Mise à jour groupée impossible.'); }
        };
        const bulkArchive = async () => {
            if (!selected.value.length || !window.confirm(`Archiver ${selected.value.length} commande(s) ? Elles resteront consultables dans les archives et leur historique sera préservé.`)) return;
            try { await api('orders/bulk-archive', 'POST', { references: selected.value }); showToast('success', 'Commandes archivées, leur historique est préservé.'); selected.value = []; await load(); }
            catch (cause) { showError(cause instanceof Error ? cause.message : 'Archivage groupé impossible.'); }
        };
        const bulkRestore = async () => {
            if (!selected.value.length || !window.confirm(`Restaurer ${selected.value.length} commande(s) dans la liste active ?`)) return;
            try { await api('orders/bulk-restore', 'POST', { references: selected.value }); showToast('success', 'Commandes restaurées dans la liste active.'); selected.value = []; await load(); }
            catch (cause) { showError(cause instanceof Error ? cause.message : 'Restauration groupée impossible.'); }
        };
        const exportCsv = () => {
            const query = new URLSearchParams();
            if (filters.value.status) query.set('status', filters.value.status);
            if (filters.value.date_from) query.set('date_from', filters.value.date_from);
            if (filters.value.date_to) query.set('date_to', filters.value.date_to);
            window.location.assign(`/api/v1/admin/orders/export?${query}`);
        };
        onMounted(load);
        return { page, loading, extra, selected, filters, summaries, allSelected, commonTransitions, load, search, reset, toggle, toggleAll, bulkTransition, bulkArchive, bulkRestore, exportCsv, money, statusMeta, transitionLabel };
    },
    template: `<section class="admin-page orders-page">
      <header class="admin-page-header"><div><p class="admin-eyebrow">Opérations</p><h1>Commandes</h1><p class="admin-subtitle">Recherchez, filtrez et suivez vos commandes.</p></div><button class="admin-outline orders-export" :disabled="!page?.data.length" @click="exportCsv">↓ <span>Exporter CSV</span></button></header>
      <section class="order-summary-grid" aria-label="Aperçu des commandes chargées"><article v-for="summary in summaries" :key="summary.label" class="order-summary-card" :class="'is-' + summary.tone"><span aria-hidden="true">{{ summary.icon }}</span><div><small>{{ summary.label }}</small><strong>{{ summary.value }}</strong><em>commande{{ summary.value > 1 ? 's' : '' }}</em></div></article></section>
      <section class="orders-filter-card" aria-label="Filtres des commandes"><label class="orders-search"><span class="sr-only">Rechercher une commande</span><span aria-hidden="true">⌕</span><input v-model.trim="filters.search" @input="search" placeholder="Référence, client ou téléphone…"></label><label class="toolbar-select"><span>Statut</span><SelectControl v-model="filters.status" :options="[{ value: '', label: 'Tous les statuts' }, { value: 'nouvelle', label: 'Nouvelles' }, { value: 'confirmee', label: 'Confirmées' }, { value: 'livree', label: 'Livrées' }, { value: 'echec_livraison', label: 'Incidents' }, { value: 'annulee', label: 'Annulées' }, { value: 'retournee', label: 'Retournées' }]" @change="load()"/></label><label class="toolbar-select"><span>Affichage</span><SelectControl v-model="filters.archived" :options="[{ value: '0', label: 'Commandes actives' }, { value: '1', label: 'Archives' }]" @change="load()"/></label><label class="toolbar-select"><span>Trier par</span><SelectControl v-model="filters.sort" :options="[{ value: '-created_at', label: 'Plus récentes' }, { value: 'created_at', label: 'Plus anciennes' }, { value: '-total_millimes', label: 'Total décroissant' }, { value: 'total_millimes', label: 'Total croissant' }]" @change="load()"/></label><button class="admin-outline orders-more" type="button" :aria-expanded="extra" @click="extra = !extra">⌄ {{ extra ? 'Moins de filtres' : 'Plus de filtres' }}</button><button class="text-link orders-reset" type="button" @click="reset">Réinitialiser</button><Transition name="orders-filter"><div v-if="extra" class="orders-extra"><label>Du<input v-model="filters.date_from" type="date" @change="load()"></label><label>Au<input v-model="filters.date_to" type="date" @change="load()"></label><label>Total minimum (DT)<input v-model="filters.min_total_dt" inputmode="decimal" @change="load()"></label><label>Total maximum (DT)<input v-model="filters.max_total_dt" inputmode="decimal" @change="load()"></label></div></Transition></section>
      <section v-if="selected.length" class="bulk-bar" aria-live="polite"><strong>{{ selected.length }} sélectionnée{{ selected.length > 1 ? 's' : '' }}</strong><template v-if="filters.archived === '0'"><div v-if="commonTransitions.length" class="bulk-actions"><button v-for="transition in commonTransitions" :key="transition" class="admin-outline" type="button" @click="bulkTransition(transition)">{{ transitionLabel[transition] }}</button></div><span v-else class="bulk-help">Aucune étape commune pour cette sélection.</span><button class="text-link danger" type="button" @click="bulkArchive">Archiver</button></template><template v-else><span class="bulk-help">La restauration remet les commandes dans la liste opérationnelle, sans modifier leur statut.</span><button class="admin-outline" type="button" @click="bulkRestore">Restaurer</button></template></section>
      <p v-if="loading" class="admin-loading">Chargement des commandes…</p><section v-else-if="!page?.data.length" class="admin-empty orders-empty"><strong>Aucune commande ne correspond à ces filtres.</strong><span>Modifiez les filtres ou affichez toutes les commandes.</span><button class="text-link" type="button" @click="reset">Réinitialiser les filtres</button></section>
      <section v-else class="orders-list-card"><div class="orders-table-head"><label><input type="checkbox" :checked="allSelected" @change="toggleAll"><span>Référence / client</span></label><span>Date</span><span>Total</span><span>Statut</span><span>Action</span></div><article v-for="order in page.data" :key="order.public_reference" class="order-row"><label class="order-select"><input type="checkbox" :checked="selected.includes(order.public_reference)" @change="toggle(order.public_reference)"><span class="order-row-icon" aria-hidden="true">□</span></label><RouterLink class="order-customer" :to="'/orders/' + order.public_reference" :aria-label="'Ouvrir la commande ' + order.public_reference"><div><strong>{{ order.public_reference }}</strong><small>{{ order.customer_name }} <i>·</i> {{ order.items_count }} article{{ order.items_count > 1 ? 's' : '' }}</small><small class="order-phone">⌕ {{ order.customer_phone }}</small></div></RouterLink><time :datetime="order.created_at">{{ new Date(order.created_at).toLocaleDateString('fr-TN') }}<small>{{ new Date(order.created_at).toLocaleTimeString('fr-TN', { hour: '2-digit', minute: '2-digit' }) }}</small></time><strong class="order-total">{{ money(order.total_millimes) }}</strong><span class="order-status" :class="'is-' + statusMeta(order.status).tone">{{ statusMeta(order.status).label }}</span><RouterLink class="order-open" :to="'/orders/' + order.public_reference" aria-label="Voir la commande">Voir</RouterLink></article><footer class="orders-pagination"><span>{{ page.total }} commande{{ page.total > 1 ? 's' : '' }}</span><span>Page {{ page.current_page }} sur {{ page.last_page }}</span><div><button type="button" :disabled="page.current_page <= 1" aria-label="Page précédente" @click="load(page.current_page - 1)">‹</button><button type="button" :disabled="page.current_page >= page.last_page" aria-label="Page suivante" @click="load(page.current_page + 1)">›</button></div></footer></section>
    </section>`,
};

export default OrdersView;
