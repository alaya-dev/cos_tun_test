import { onMounted, ref, type Component } from 'vue';
import { RouterLink, useRoute } from 'vue-router';

type OrderItem = { product_name_snapshot: string; variant_snapshot: { group: string; value: string }[] | null; quantity: number; effective_unit_price_millimes: number; line_total_millimes: number };
type History = { from_status: string; to_status: string; reason: string | null; created_at?: string };
type Note = { body: string; created_at?: string };
type AdminOrder = { public_reference: string; lock_version: number; customer_name: string; customer_phone: string; customer_city: string; customer_address: string; status: string; subtotal_millimes: number; shipping_fee_millimes: number; total_millimes: number; items: OrderItem[]; notes: Note[]; status_history: History[] };
type Detail = { order: AdminOrder; is_editable: boolean; allowed_transitions: string[]; meta_purchase: { event_id: string; status: string } };

const money = (value: number) => `${(value / 1000).toFixed(3).replace('.', ',')} TND`;

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || 'Cette opération est momentanément indisponible.');
    }
    return response.json() as Promise<T>;
}

const OrderDetailView: Component = {
    components: { RouterLink },
    setup() {
        const route = useRoute();
        const detail = ref<Detail | null>(null);
        const loading = ref(true);
        const saving = ref(false);
        const error = ref('');
        const note = ref('');
        const customer = ref({ full_name: '', phone: '', city: '', address: '' });
        const refresh = async () => {
            const next = (await request<{ data: Detail }>(`orders/${route.params.reference}`)).data;
            detail.value = next;
            customer.value = { full_name: next.order.customer_name, phone: next.order.customer_phone, city: next.order.customer_city, address: next.order.customer_address };
        };
        onMounted(async () => { try { await refresh(); } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { loading.value = false; } });
        const saveCustomer = async () => {
            if (!detail.value) return;
            saving.value = true; error.value = '';
            try { await request(`orders/${detail.value.order.public_reference}`, 'PATCH', { lock_version: detail.value.order.lock_version, customer: customer.value }); await refresh(); } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { saving.value = false; }
        };
        const transition = async (status: string) => {
            if (!detail.value) return;
            saving.value = true; error.value = '';
            try { await request(`orders/${detail.value.order.public_reference}/transitions`, 'POST', { to_status: status, lock_version: detail.value.order.lock_version, reason: ['annulee', 'echec_livraison', 'retournee'].includes(status) ? 'Décision opérateur' : null, restock_items: status === 'retournee' }); await refresh(); } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { saving.value = false; }
        };
        const addNote = async () => {
            if (!detail.value || !note.value.trim()) return;
            saving.value = true;
            try { await request(`orders/${detail.value.order.public_reference}/notes`, 'POST', { body: note.value.trim() }); note.value = ''; await refresh(); } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { saving.value = false; }
        };
        return { detail, loading, saving, error, customer, note, saveCustomer, transition, addNote, money, print: () => window.print() };
    },
    template: '<section class="admin-page"><RouterLink class="text-link" to="/orders">Retour aux commandes</RouterLink><p v-if="loading">Chargement…</p><p v-else-if="error" class="admin-alert">{{ error }}</p><template v-else-if="detail"><header><div><p class="admin-eyebrow">Commande</p><h1>{{ detail.order.public_reference }}</h1></div><button class="admin-action" @click="print">Imprimer</button></header><div class="admin-order-summary"><p><strong>{{ detail.order.status }}</strong></p><p>{{ money(detail.order.total_millimes) }}</p><small>Suivi Meta: {{ detail.meta_purchase.status }}</small></div><section class="admin-order-section"><h2>Articles</h2><div class="admin-table"><article v-for="item in detail.order.items"><div><strong>{{ item.product_name_snapshot }}</strong><small v-if="item.variant_snapshot">{{ item.variant_snapshot.map(value => value.value).join(\' · \') }}</small></div><span>× {{ item.quantity }}</span><span>{{ money(item.line_total_millimes) }}</span></article></div><dl class="admin-totals"><div><dt>Sous-total</dt><dd>{{ money(detail.order.subtotal_millimes) }}</dd></div><div><dt>Livraison</dt><dd>{{ money(detail.order.shipping_fee_millimes) }}</dd></div><div><dt>Total</dt><dd>{{ money(detail.order.total_millimes) }}</dd></div></dl></section><div class="admin-actions"><button v-for="status in detail.allowed_transitions" class="admin-action" :disabled="saving" @click="transition(status)">{{ status }}</button></div><section class="admin-order-section"><h2>Livraison</h2><form v-if="detail.is_editable" class="admin-form" @submit.prevent="saveCustomer"><label>Nom complet<input v-model.trim="customer.full_name" minlength="2" maxlength="180" required></label><label>Téléphone<input v-model.trim="customer.phone" maxlength="40" required></label><label>Ville<input v-model.trim="customer.city" minlength="2" maxlength="160" required></label><label>Adresse<textarea v-model="customer.address" minlength="5" maxlength="2000" required></textarea></label><button class="admin-action" :disabled="saving">Mettre à jour</button></form><p v-else class="admin-empty">Les informations de livraison sont figées pour cette commande.</p></section><section class="admin-order-section"><h2>Notes internes</h2><form class="admin-form" @submit.prevent="addNote"><label>Note<textarea v-model="note" maxlength="5000" required></textarea></label><button class="admin-action" :disabled="saving">Ajouter la note</button></form><div v-if="detail.order.notes.length" class="admin-table"><article v-for="item in detail.order.notes"><strong>Note interne</strong><small>{{ item.body }}</small></article></div></section><section v-if="detail.order.status_history.length" class="admin-order-section"><h2>Historique</h2><div class="admin-table"><article v-for="item in detail.order.status_history"><strong>{{ item.from_status }} → {{ item.to_status }}</strong><small>{{ item.reason || \'Sans motif\' }}</small></article></div></section></template></section>',
};

export default OrderDetailView;
