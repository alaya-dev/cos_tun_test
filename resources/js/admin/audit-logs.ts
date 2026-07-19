import { onMounted, ref, type Component } from 'vue';
import { adminApi } from './api';
import SelectControl from './select-control';

type AuditLog = { public_id: string; action: string; actor_role_snapshot?: string | null; created_at: string; before?: Record<string, unknown> | null; after?: Record<string, unknown> | null; request_id?: string | null };
type Page<T> = { data: T[]; meta: { current_page: number; last_page: number; total: number } };

const auditActionLabels: Record<string, string> = {
    'user.created': 'Utilisateur créé', 'user.updated': 'Utilisateur modifié', 'catalog.category_created': 'Catégorie créée', 'catalog.category_updated': 'Catégorie modifiée',
    'catalog.product_created': 'Produit créé', 'catalog.product_updated': 'Produit modifié', 'settings.shipping_updated': 'Réglages de livraison modifiés',
    'checkout.field_created': 'Champ de commande créé', 'checkout.field_updated': 'Champ de commande modifié', 'promotion.created': 'Code promo créé', 'promotion.updated': 'Code promo modifié',
    'complaint.created': 'Réclamation créée', 'complaint.updated': 'Réclamation modifiée', 'content.updated': 'Contenu modifié',
};
const privateAuditFields = new Set(['password', 'password_confirmation', 'phone', 'telephone', 'email', 'address', 'description', 'body', 'notes']);
const fieldLabel = (key: string) => ({ is_active: 'État', force_password_change: 'Changement de mot de passe requis', actor_role: 'Rôle', sort_order: 'Ordre', status: 'Statut' }[key] ?? key.replaceAll('_', ' '));
const actionLabel = (action: string) => auditActionLabels[action] ?? action.replaceAll(/[._]/g, ' ').replace(/^./, char => char.toUpperCase());
const roleLabel = (role?: string | null) => role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Administrateur' : 'Système';

const AuditLogsView: Component = {
    components: { SelectControl },
    setup() {
        const logs = ref<AuditLog[]>([]);
        const loading = ref(true);
        const error = ref('');
        const page = ref(1);
        const meta = ref<Page<AuditLog>['meta']>({ current_page: 1, last_page: 1, total: 0 });
        const search = ref('');
        const actorRole = ref('');
        const dateFrom = ref('');
        const dateTo = ref('');
        const expanded = ref<string | null>(null);
        let debounce: number | undefined;
        const params = () => new URLSearchParams(Object.entries({ search: search.value, actor_role: actorRole.value, date_from: dateFrom.value, date_to: dateTo.value, page: String(page.value), per_page: '25' }).filter(([, value]) => value !== ''));
        const load = async () => {
            loading.value = true;
            error.value = '';
            try {
                const response = await adminApi<{ data: Page<AuditLog> }>(`audit-logs?${params().toString()}`);
                logs.value = response.data.data;
                meta.value = response.data.meta;
            } catch (cause) {
                error.value = cause instanceof Error ? cause.message : 'Le chargement du journal a échoué.';
            } finally { loading.value = false; }
        };
        const queueLoad = () => { window.clearTimeout(debounce); debounce = window.setTimeout(() => { page.value = 1; void load(); }, 300); };
        const resetFilters = () => { search.value = ''; actorRole.value = ''; dateFrom.value = ''; dateTo.value = ''; page.value = 1; void load(); };
        const changePage = (next: number) => { if (next >= 1 && next <= meta.value.last_page) { page.value = next; void load(); } };
        const changedFields = (log: AuditLog) => Array.from(new Set([...Object.keys(log.before ?? {}), ...Object.keys(log.after ?? {})])).filter(key => !privateAuditFields.has(key)).map(fieldLabel);
        const formatDate = (value: string) => new Intl.DateTimeFormat('fr-TN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
        onMounted(load);
        return { logs, loading, error, page, meta, search, actorRole, dateFrom, dateTo, expanded, actionLabel, roleLabel, changedFields, formatDate, load, queueLoad, resetFilters, changePage,
            roleOptions: [{ value: '', label: 'Tous les intervenants' }, { value: 'super_admin', label: 'Super Admin' }, { value: 'admin', label: 'Administrateur' }],
        };
    },
    template: `
      <section class="admin-page audit-page"><header class="admin-page-header"><div><p class="admin-eyebrow">Traçabilité</p><h1>Journal d’audit</h1><p class="admin-subtitle">Historique des actions sensibles. Les valeurs personnelles ne sont jamais affichées ici.</p></div></header>
        <section class="admin-filter-bar" aria-label="Filtres du journal"><label class="admin-search"><span class="sr-only">Rechercher une action</span><input v-model.trim="search" type="search" placeholder="Action ou identifiant de requête…" @input="queueLoad"></label><label class="toolbar-select"><span>Intervenant</span><SelectControl v-model="actorRole" :options="roleOptions" @change="page = 1; load()" /></label><label>Du<input v-model="dateFrom" type="date" @change="page = 1; load()"></label><label>Au<input v-model="dateTo" type="date" @change="page = 1; load()"></label><button class="text-link" type="button" @click="resetFilters">Réinitialiser</button></section>
        <p v-if="error" class="page-error" role="alert">{{ error }} <button class="text-link" type="button" @click="load">Réessayer</button></p>
        <p v-else-if="loading" class="admin-loading">Chargement du journal…</p>
        <section v-else-if="!logs.length" class="admin-empty" aria-live="polite"><strong>Aucune action ne correspond à ces critères.</strong><span>Les actions des administrateurs apparaîtront ici automatiquement.</span></section>
        <div v-else class="admin-table audit-table"><div class="admin-table-head"><span>Action</span><span>Intervenant</span><span>Évolution</span><span>Date</span><span>Détail</span></div><article v-for="log in logs" :key="log.public_id"><div><strong>{{ actionLabel(log.action) }}</strong><small>{{ log.action }}</small></div><span>{{ roleLabel(log.actor_role_snapshot) }}</span><span>{{ changedFields(log).length ? changedFields(log).join(' · ') : 'Action enregistrée' }}</span><time :datetime="log.created_at">{{ formatDate(log.created_at) }}</time><span><button class="text-link" type="button" :aria-expanded="expanded === log.public_id" @click="expanded = expanded === log.public_id ? null : log.public_id">{{ expanded === log.public_id ? 'Masquer' : 'Détails' }}</button></span><div v-if="expanded === log.public_id" class="audit-details"><p><strong>Champs concernés :</strong> {{ changedFields(log).length ? changedFields(log).join(', ') : 'Aucun champ affichable' }}</p><p v-if="log.request_id"><strong>Identifiant de requête :</strong> {{ log.request_id }}</p></div></article></div>
        <nav v-if="meta.last_page > 1" class="admin-pagination" aria-label="Pagination du journal"><button class="admin-outline" type="button" :disabled="page === 1" @click="changePage(page - 1)">Précédent</button><span>Page {{ meta.current_page }} sur {{ meta.last_page }} · {{ meta.total }} actions</span><button class="admin-outline" type="button" :disabled="page === meta.last_page" @click="changePage(page + 1)">Suivant</button></nav>
      </section>`,
};

export default AuditLogsView;
