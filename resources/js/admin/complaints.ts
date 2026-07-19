import { onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { adminApi } from './api';
import SelectControl from './select-control';
import { showError, showToast } from './feedback';
import { normalizeComplaint, normalizeComplaintMeta, normalizeComplaintRows, type Complaint, type ComplaintMeta, type ComplaintPagePayload } from './complaint-adapters';

const statusLabel = (status: string) => status === 'en_cours' ? 'En cours' : status === 'resolue' ? 'Résolue' : 'Nouvelle';

export const ComplaintsView: Component = {
    components: { RouterLink, SelectControl },
    setup() {
        const rows = ref<Complaint[]>([]);
        const meta = ref<ComplaintMeta>({ current_page: 1, last_page: 1, total: 0 });
        const search = ref('');
        const status = ref('');
        const dateFrom = ref('');
        const dateTo = ref('');
        const loading = ref(true);
        let requestId = 0;
        const options = [{ value: '', label: 'Tous les états' }, { value: 'nouvelle', label: 'Nouvelle' }, { value: 'en_cours', label: 'En cours' }, { value: 'resolue', label: 'Résolue' }];

        const load = async (page = 1) => {
            const currentRequest = ++requestId;
            loading.value = true;
            try {
                const query = new URLSearchParams({ per_page: '25', page: String(page) });
                if (search.value) query.set('search', search.value);
                if (status.value) query.set('status', status.value);
                if (dateFrom.value) query.set('date_from', dateFrom.value);
                if (dateTo.value) query.set('date_to', dateTo.value);
                const payload = (await adminApi<{ data?: ComplaintPagePayload }>(`complaints?${query}`)).data;
                if (currentRequest !== requestId) return;
                rows.value = normalizeComplaintRows(payload?.data);
                meta.value = normalizeComplaintMeta(payload);
            } catch (cause) {
                if (currentRequest === requestId) {
                    rows.value = [];
                    meta.value = normalizeComplaintMeta(null);
                    showError(cause instanceof Error ? cause.message : 'Chargement impossible.');
                }
            } finally {
                if (currentRequest === requestId) loading.value = false;
            }
        };
        let timer: number | undefined;
        const queueSearch = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 280); };

        onMounted(load);
        onBeforeUnmount(() => { requestId++; window.clearTimeout(timer); });
        return { rows, meta, search, status, dateFrom, dateTo, options, loading, load, queueSearch, statusLabel };
    },
    template: `<section class="admin-page">
      <header><div><p class="admin-eyebrow">Service client</p><h1>Réclamations</h1><p class="admin-subtitle">Suivi privé des demandes et de leur chronologie.</p></div></header>
      <div class="admin-filter-bar"><label class="admin-search"><span class="sr-only">Rechercher</span><input v-model="search" @input="queueSearch" placeholder="Référence, client ou sujet…"></label><SelectControl v-model="status" :options="options" @change="load()"/><label>Du<input v-model="dateFrom" type="date" @change="load()"></label><label>Au<input v-model="dateTo" type="date" @change="load()"></label></div>
      <p v-if="loading" class="admin-loading">Chargement…</p><p v-else-if="!rows.length" class="admin-empty">Aucune réclamation ne correspond aux filtres.</p>
      <div v-else class="admin-table"><div class="admin-table-head"><span>Référence</span><span>Sujet</span><span>État</span><span>Action</span></div><article v-for="complaint in rows" :key="complaint.public_reference"><div><strong>{{ complaint.public_reference }}</strong><small>{{ complaint.customer_name }}</small></div><span>{{ complaint.subject }}</span><span class="admin-badge">{{ statusLabel(complaint.status) }}</span><RouterLink class="text-link" :to="'/complaints/'+complaint.public_reference">Ouvrir</RouterLink></article></div>
      <nav v-if="meta.last_page > 1" class="admin-pagination" aria-label="Pagination"><button class="admin-outline" :disabled="meta.current_page <= 1" @click="load(meta.current_page - 1)">Précédent</button><span>Page {{ meta.current_page }} sur {{ meta.last_page }}</span><button class="admin-outline" :disabled="meta.current_page >= meta.last_page" @click="load(meta.current_page + 1)">Suivant</button></nav>
    </section>`,
};

export const ComplaintDetailView: Component = {
    components: { RouterLink },
    setup() {
        const route = useRoute();
        const complaint = ref<Complaint | null>(null);
        const note = ref('');
        const orderReference = ref('');
        const loading = ref(true);
        let requestId = 0;
        const load = async () => {
            const currentRequest = ++requestId;
            loading.value = true;
            try {
                const result = await adminApi<{ data?: unknown }>(`complaints/${route.params.reference}`);
                const next = normalizeComplaint(result.data);
                if (!next) throw new Error('La réclamation reçue est invalide.');
                if (currentRequest !== requestId) return;
                complaint.value = next;
                orderReference.value = next.order?.public_reference || '';
            } catch (cause) {
                if (currentRequest === requestId) {
                    complaint.value = null;
                    showError(cause instanceof Error ? cause.message : 'Chargement impossible.');
                }
            } finally {
                if (currentRequest === requestId) loading.value = false;
            }
        };
        const transition = async () => {
            if (!complaint.value) return;
            const to = complaint.value.status === 'nouvelle' ? 'en_cours' : 'resolue';
            try { await adminApi(`complaints/${complaint.value.public_reference}/transitions`, 'POST', { to_status: to }); showToast('success', 'Statut mis à jour.'); await load(); }
            catch (cause) { showError(cause instanceof Error ? cause.message : 'Transition impossible.'); }
        };
        const addNote = async () => {
            if (!complaint.value || !note.value.trim()) return;
            try { await adminApi(`complaints/${complaint.value.public_reference}/notes`, 'POST', { body: note.value }); note.value = ''; showToast('success', 'Note ajoutée.'); await load(); }
            catch (cause) { showError(cause instanceof Error ? cause.message : 'Ajout impossible.'); }
        };
        const linkOrder = async () => {
            if (!complaint.value) return;
            try { await adminApi(`complaints/${complaint.value.public_reference}`, 'PATCH', { order_reference: orderReference.value || null }); showToast('success', 'Commande liée mise à jour.'); await load(); }
            catch (cause) { showError(cause instanceof Error ? cause.message : 'Association impossible.'); }
        };

        onMounted(load);
        watch(() => route.params.reference, () => void load());
        onBeforeUnmount(() => { requestId++; });
        return { complaint, note, orderReference, loading, transition, addNote, linkOrder, statusLabel };
    },
    template: `<section v-if="complaint" class="admin-page">
      <RouterLink class="back-link" to="/complaints">← Réclamations</RouterLink><header><div><p class="admin-eyebrow">{{ complaint.public_reference }}</p><h1>{{ complaint.subject }}</h1><span class="admin-badge">{{ statusLabel(complaint.status) }}</span></div><button v-if="complaint.status !== 'resolue'" class="admin-action" @click="transition">{{ complaint.status === 'nouvelle' ? 'Prendre en charge' : 'Marquer résolue' }}</button></header>
      <div class="order-detail-layout"><main class="order-detail-main"><section class="order-panel"><h2>Réclamation</h2><dl><dt>Client</dt><dd>{{ complaint.customer_name }}</dd><dt>Téléphone</dt><dd>{{ complaint.customer_phone }}</dd></dl><p class="complaint-body">{{ complaint.description }}</p><a v-if="complaint.has_attachment" class="admin-outline" :href="'/api/v1/admin/complaints/'+complaint.public_reference+'/attachment'">Télécharger la pièce jointe privée</a></section><section class="order-panel"><h2>Notes internes</h2><form @submit.prevent="addNote"><textarea v-model="note" maxlength="5000" required></textarea><button class="admin-action">Ajouter la note</button></form><ul><li v-for="entry in complaint.notes || []" :key="entry.id"><strong>{{ entry.user?.name || 'Utilisateur supprimé' }}</strong><p>{{ entry.body }}</p></li></ul></section></main><aside class="order-detail-side"><section class="order-panel"><h2>Commande liée</h2><form @submit.prevent="linkOrder"><input v-model="orderReference" maxlength="26" placeholder="Référence de commande"><button class="admin-outline">Lier ou délier</button></form></section><section class="order-panel"><h2>Chronologie</h2><ol><li v-for="entry in complaint.status_history || []" :key="entry.id">{{ statusLabel(entry.to_status) }} · {{ new Date(entry.created_at).toLocaleString('fr-TN') }}</li></ol></section></aside></div>
    </section><p v-else-if="loading" class="admin-loading">Chargement de la réclamation…</p><p v-else class="admin-empty">Cette réclamation est indisponible.</p>`,
};
