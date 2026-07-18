import { onMounted, ref, type Component } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { confirmAction, showError, showToast } from './feedback';

type Variant = { public_id: string; sku: string | null; is_active: boolean; values: { value: string }[] };
type Product = { public_id: string; variants: Variant[] };
type Item = { product_name_snapshot: string; quantity: number; line_total_millimes: number; product: Product | null; variant: Variant | null };
type Order = {
    public_reference: string; lock_version: number; customer_name: string; customer_phone: string;
    customer_city: string; customer_address: string; status: string; total_millimes: number;
    created_at?: string; items: Item[]; notes: { body: string; created_at?: string }[];
    status_history: { from_status: string | null; to_status: string; reason: string | null; created_at?: string }[];
};
type Detail = { order: Order; is_editable: boolean; allowed_transitions: string[]; meta_purchase: { status: string } };
type Line = { product_public_id: string; variant_public_id: string | null; quantity: number; label: string; variants: Variant[] };

const money = (value: number) => `${(value / 1000).toFixed(3).replace('.', ',')} DT`;
const statusMeta = (value: string) => ({
    nouvelle: { label: 'Nouvelle', tone: 'new' }, confirmee: { label: 'Confirmée', tone: 'confirmed' },
    annulee: { label: 'Annulée', tone: 'cancelled' }, livree: { label: 'Livrée', tone: 'delivered' },
    echec_livraison: { label: 'Incident de livraison', tone: 'incident' }, retournee: { label: 'Retournée', tone: 'returned' },
})[value] || { label: value, tone: 'muted' };

const transitionMeta = (value: string) => ({
    confirmee: { label: 'Confirmer la commande', description: 'La commande est validée et prête à être préparée.' },
    livree: { label: 'Marquer comme livrée', description: 'Confirmez uniquement après livraison effective.' },
    echec_livraison: { label: 'Signaler un incident', description: 'Utilisez cette action si la livraison a échoué.' },
    retournee: { label: 'Enregistrer un retour', description: 'Le stock sera réapprovisionné conformément à la règle existante.' },
    annulee: { label: 'Annuler la commande', description: 'Cette action annule la commande et rétablit le stock.' },
})[value] || { label: statusMeta(value).label, description: 'Mettez à jour le statut de cette commande.' };

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '';
    const response = await fetch(`/api/v1/admin/${path}`, {
        method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': token }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message || 'Opération impossible.');
    }
    return response.json() as Promise<T>;
}

const OrderDetailView: Component = {
    components: { RouterLink },
    setup() {
        const route = useRoute();
        const detail = ref<Detail | null>(null);
        const lines = ref<Line[]>([]);
        const customer = ref({ full_name: '', phone: '', city: '', address: '' });
        const note = ref('');
        const loading = ref(true);
        const saving = ref(false);
        const refresh = async () => {
            const next = (await api<{ data: Detail }>(`orders/${route.params.reference}`)).data;
            detail.value = next;
            customer.value = { full_name: next.order.customer_name, phone: next.order.customer_phone, city: next.order.customer_city, address: next.order.customer_address };
            lines.value = next.order.items.flatMap((item) => item.product ? [{ product_public_id: item.product.public_id, variant_public_id: item.variant?.public_id || null, quantity: item.quantity, label: item.product_name_snapshot, variants: item.product.variants.filter((variant) => variant.is_active) }] : []);
        };
        onMounted(async () => { try { await refresh(); } catch (cause: unknown) { showError(cause instanceof Error ? cause.message : 'Impossible de charger la commande.'); } finally { loading.value = false; } });
        const run = async (path: string, method: string, body: unknown, successMessage: string) => {
            saving.value = true;
            try { await api(path, method, body); await refresh(); showToast('success', successMessage); return true; }
            catch (cause: unknown) { showError(cause instanceof Error ? cause.message : 'Opération impossible.'); return false; }
            finally { saving.value = false; }
        };
        const copyReference = async () => {
            if (!detail.value) return;
            try { await navigator.clipboard.writeText(detail.value.order.public_reference); showToast('success', 'Référence copiée.'); }
            catch { showError('Impossible de copier la référence.'); }
        };
        return {
            detail, lines, customer, note, loading, saving, money, statusMeta, transitionMeta, print: () => window.print(), copyReference,
            saveCustomer: () => detail.value && run(`orders/${detail.value.order.public_reference}`, 'PATCH', { lock_version: detail.value.order.lock_version, customer: customer.value }, 'Informations de livraison mises à jour.'),
            saveItems: () => detail.value && run(`orders/${detail.value.order.public_reference}/items`, 'PUT', { lock_version: detail.value.order.lock_version, items: lines.value.map(({ product_public_id, variant_public_id, quantity }) => ({ product_public_id, variant_public_id, quantity })) }, 'Articles recalculés.'),
            transition: async (status: string) => {
                if (!detail.value) return;
                const destructive = ['annulee', 'echec_livraison', 'retournee'].includes(status);
                const confirmed = await confirmAction('Changer le statut de la commande ?', `La commande passera à l’état « ${statusMeta(status).label} ».`, 'Confirmer', destructive ? 'danger' : 'default');
                if (confirmed) await run(`orders/${detail.value.order.public_reference}/transitions`, 'POST', { to_status: status, lock_version: detail.value.order.lock_version, reason: destructive ? 'Décision opérateur' : null, restock_items: status === 'retournee' }, 'Statut de la commande mis à jour.');
            },
            addNote: async () => { if (!detail.value || !note.value.trim()) return; const saved = await run(`orders/${detail.value.order.public_reference}/notes`, 'POST', { body: note.value.trim() }, 'Note ajoutée.'); if (saved) note.value = ''; },
        };
    },
    template: `<section class="admin-page order-detail-page">
      <RouterLink class="back-link" to="/orders">‹ <span>Retour aux commandes</span></RouterLink>
      <p v-if="loading" class="admin-loading">Chargement de la commande…</p>
      <template v-else-if="detail">
        <header class="admin-page-header order-detail-header"><div><p class="admin-eyebrow">Commande</p><h1 :title="detail.order.public_reference">{{ detail.order.public_reference }}</h1></div><button class="admin-outline" @click="print">▣ <span>Imprimer</span></button></header>
        <section class="order-detail-strip" aria-label="Informations principales"><article><small>Statut</small><strong class="order-status" :class="'is-' + statusMeta(detail.order.status).tone">{{ statusMeta(detail.order.status).label }}</strong></article><article><small>Total de la commande</small><strong>{{ money(detail.order.total_millimes) }}</strong></article><article><small>Client</small><strong>{{ detail.order.customer_name }}</strong></article><article><small>Suivi Meta</small><strong class="meta-status">∞ {{ detail.meta_purchase.status === 'not_configured' ? 'Non configuré' : detail.meta_purchase.status }}</strong></article></section>
        <div class="order-detail-layout">
          <main class="order-detail-main">
            <section class="order-panel"><div class="order-panel-heading"><div><h2>Articles</h2><p>Vérifiez les produits et les quantités avant de recalculer.</p></div></div>
              <form v-if="detail.is_editable && lines.length" class="order-recalculate" @submit.prevent="saveItems"><div v-for="line in lines" :key="line.product_public_id + (line.variant_public_id || '')" class="order-line-editor"><strong>{{ line.label }}</strong><label>Quantité<input v-model.number="line.quantity" type="number" min="1" max="99" required></label><label v-if="line.variants.length">Variante<select v-model="line.variant_public_id" required><option v-for="variant in line.variants" :key="variant.public_id" :value="variant.public_id">{{ variant.sku || variant.values.map(value => value.value).join(' · ') }}</option></select></label></div><button class="admin-outline" :disabled="saving">↻ <span>Recalculer les articles</span></button></form>
              <div class="order-items-table"><div class="order-items-head"><span>Article</span><span>Qté</span><span>Total</span><span>Statut</span></div><article v-for="item in detail.order.items" :key="item.product_name_snapshot + item.quantity"><span class="order-item-fallback" aria-hidden="true">P</span><div><strong>{{ item.product_name_snapshot }}</strong><small v-if="item.variant">{{ item.variant.sku || item.variant.values.map(value => value.value).join(' · ') }}</small></div><span>× {{ item.quantity }}</span><strong>{{ money(item.line_total_millimes) }}</strong><div class="item-actions"><span class="order-status" :class="'is-' + statusMeta(detail.order.status).tone">{{ statusMeta(detail.order.status).label }}</span></div></article></div>
              <section v-if="detail.allowed_transitions.length" class="order-transition-panel" aria-label="Mise à jour du statut"><div><p class="admin-eyebrow">Étape suivante</p><h3>Mettre à jour la commande</h3><p>Choisissez une action en fonction de l’avancement réel de la commande.</p></div><div class="transition-actions"><button v-for="status in detail.allowed_transitions" :key="status" type="button" class="transition-action" :class="'is-' + statusMeta(status).tone" :disabled="saving" @click="transition(status)"><strong>{{ transitionMeta(status).label }}</strong><span>{{ transitionMeta(status).description }}</span></button></div></section>
            </section>
            <section class="order-panel"><div class="order-panel-heading"><div><h2>Livraison</h2><p>Coordonnées utilisées pour la livraison de cette commande.</p></div></div><form v-if="detail.is_editable" class="delivery-form" @submit.prevent="saveCustomer"><label>Nom complet<input v-model.trim="customer.full_name" required></label><label>Téléphone<input v-model.trim="customer.phone" required></label><label>Ville<input v-model.trim="customer.city" required></label><label class="full">Adresse<textarea v-model="customer.address" required></textarea></label><button class="admin-action" :disabled="saving">Mettre à jour</button></form><p v-else class="order-readonly">Les informations de livraison ne peuvent plus être modifiées pour ce statut.</p></section>
            <section class="order-panel"><div class="order-panel-heading"><div><h2>Notes internes</h2><p>Ajoutez un contexte réservé à l’équipe, il ne sera jamais visible par le client.</p></div></div><form class="notes-form" @submit.prevent="addNote"><label class="sr-only" for="order-note">Nouvelle note interne</label><textarea id="order-note" v-model="note" placeholder="Ex. client contacté, créneau de livraison confirmé…" required></textarea><button class="admin-action" :disabled="saving || !note.trim()">Ajouter la note</button></form><ol v-if="detail.order.notes.length" class="order-notes"><li v-for="(entry, index) in detail.order.notes" :key="index"><p>{{ entry.body }}</p><small v-if="entry.created_at">{{ new Date(entry.created_at).toLocaleString('fr-TN') }}</small></li></ol></section>
          </main>
          <aside class="order-detail-side">
            <section class="order-panel order-facts"><h2>Résumé de la commande</h2><dl><div><dt>Statut</dt><dd><span class="order-status" :class="'is-' + statusMeta(detail.order.status).tone">{{ statusMeta(detail.order.status).label }}</span></dd></div><div><dt>Nombre d’articles</dt><dd>{{ detail.order.items.length }}</dd></div><div><dt>Total de la commande</dt><dd>{{ money(detail.order.total_millimes) }}</dd></div><div><dt>Date de commande</dt><dd>{{ detail.order.created_at ? new Date(detail.order.created_at).toLocaleString('fr-TN') : '—' }}</dd></div><div><dt>Référence commande</dt><dd class="reference-value">{{ detail.order.public_reference }}</dd></div><div><dt>Suivi Meta</dt><dd>{{ detail.meta_purchase.status === 'not_configured' ? 'Non configuré' : detail.meta_purchase.status }}</dd></div></dl></section>
            <section class="order-panel quick-actions"><h2>Actions rapides</h2><button type="button" @click="print">▣ <span>Imprimer la commande</span></button><button type="button" @click="copyReference">⧉ <span>Copier la référence commande</span></button></section>
            <section class="order-panel order-history"><h2>Historique de la commande</h2><ol v-if="detail.order.status_history.length"><li v-for="(event, index) in detail.order.status_history" :key="index" :class="'is-' + statusMeta(event.to_status).tone"><i aria-hidden="true"></i><div><strong>{{ statusMeta(event.to_status).label }}</strong><p>{{ event.reason || 'Statut de la commande mis à jour.' }}</p></div><time v-if="event.created_at" :datetime="event.created_at">{{ new Date(event.created_at).toLocaleString('fr-TN') }}</time></li></ol><p v-else class="order-history-empty">Aucun historique n’est encore disponible.</p></section>
          </aside>
        </div>
      </template>
    </section>`,
};

export default OrderDetailView;
