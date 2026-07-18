import { computed, onMounted, ref, type Component } from 'vue';
import { showError, showToast } from './feedback';
import SelectControl from './select-control';

type Product = { public_id: string; name: string; has_variants: boolean; stock_quantity: number | null; low_stock_threshold?: number | null; category?: { name: string } };
type Variant = { public_id: string; sku: string | null; stock_quantity: number; is_active: boolean; values?: { value: string }[] };
type Detail = Product & { variants: Variant[] };
type Movement = { public_id: string; type: string; quantity_delta: number; quantity_before: number; quantity_after: number; reason: string; created_at?: string; product?: { name: string }; variant?: { sku: string | null; values?: { value: string }[] } };
type Page<T> = { data: T[]; total?: number };
const csrf = () => document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '';
const movementOptions = [
    { value: '', label: 'Tous les mouvements' },
    { value: 'manual_adjustment', label: 'Ajustements manuels' },
    { value: 'order_deduction', label: 'Déductions de commande' },
    { value: 'order_edit_deduction', label: 'Déductions après modification' },
    { value: 'order_edit_restore', label: 'Restaurations après modification' },
    { value: 'return_restock', label: 'Retours en stock' },
];
const labelForMovement = (type: string) => ({
    manual_adjustment: 'Ajustement manuel', order_deduction: 'Déduction commande',
    order_reserved: 'Réservation commande', order_released: 'Réintégration commande',
    order_edit_deduction: 'Déduction après modification', order_edit_restore: 'Restauration après modification',
    return_restock: 'Retour en stock',
})[type] || type;
async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, { method, credentials: 'same-origin', headers: { Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const payload = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) throw new Error(payload?.message || 'Opération impossible.');
    return payload as T;
}

const InventoryView: Component = {
    components: { SelectControl },
    setup() {
        const tab = ref<'inventory' | 'history'>('inventory');
        const products = ref<Product[]>([]); const movements = ref<Movement[]>([]);
        const loadingInventory = ref(true); const loadingHistory = ref(false);
        const search = ref(''); const state = ref('');
        const history = ref({ search: '', type: '', date_from: '', date_to: '' });
        const drawerProduct = ref<Product | null>(null); const variants = ref<Variant[]>([]); const saving = ref(false);
        const adjustment = ref({ variant_public_id: '', direction: 'add', quantity: 1, reason: 'Réception fournisseur' });
        const filteredProducts = computed(() => products.value.filter((product) => {
            const text = `${product.name} ${product.category?.name || ''}`.toLowerCase();
            if (search.value && !text.includes(search.value.toLowerCase())) return false;
            const stock = product.stock_quantity || 0;
            if (state.value === 'low' && (!product.low_stock_threshold || stock > product.low_stock_threshold || stock === 0)) return false;
            if (state.value === 'out' && stock !== 0) return false;
            return !(state.value === 'variants' && !product.has_variants);
        }));
        const loadInventory = async () => {
            loadingInventory.value = true;
            try { products.value = (await api<{ data: Page<Product> }>('products?per_page=100')).data.data; }
            catch (cause) { showError(cause instanceof Error ? cause.message : 'Impossible de charger l’inventaire.'); }
            finally { loadingInventory.value = false; }
        };
        const loadMovements = async () => {
            loadingHistory.value = true;
            try {
                const query = new URLSearchParams({ per_page: '50' });
                if (history.value.search) query.set('search', history.value.search);
                if (history.value.type) query.set('type', history.value.type);
                if (history.value.date_from) query.set('date_from', history.value.date_from);
                if (history.value.date_to) query.set('date_to', history.value.date_to);
                movements.value = (await api<{ data: Page<Movement> }>(`inventory/movements?${query}`)).data.data;
            } catch (cause) { showError(cause instanceof Error ? cause.message : 'Impossible de charger l’historique.'); }
            finally { loadingHistory.value = false; }
        };
        let historyTimer: number | undefined;
        const queueHistory = () => { clearTimeout(historyTimer); historyTimer = window.setTimeout(loadMovements, 280); };
        const switchTab = (next: 'inventory' | 'history') => { tab.value = next; if (next === 'history' && !movements.value.length) loadMovements(); };
        const resetHistory = () => { history.value = { search: '', type: '', date_from: '', date_to: '' }; loadMovements(); };
        const openDrawer = async (product: Product) => {
            drawerProduct.value = product; variants.value = []; adjustment.value = { variant_public_id: '', direction: 'add', quantity: 1, reason: 'Réception fournisseur' };
            if (!product.has_variants) return;
            try { variants.value = (await api<{ data: Detail }>(`products/${product.public_id}`)).data.variants.filter((variant) => variant.is_active); }
            catch (cause) { showError(cause instanceof Error ? cause.message : 'Impossible de charger les variantes.'); }
        };
        const activeVariant = computed(() => variants.value.find((variant) => variant.public_id === adjustment.value.variant_public_id));
        const currentStock = computed(() => activeVariant.value?.stock_quantity ?? drawerProduct.value?.stock_quantity ?? 0);
        const nextStock = computed(() => Math.max(0, currentStock.value + (adjustment.value.direction === 'add' ? adjustment.value.quantity : -adjustment.value.quantity)));
        const submit = async () => {
            if (!drawerProduct.value) return;
            if (drawerProduct.value.has_variants && !adjustment.value.variant_public_id) { showError('Sélectionnez une variante active.'); return; }
            if (adjustment.value.direction === 'remove' && adjustment.value.quantity > currentStock.value) { showError('La quantité à retirer dépasse le stock disponible.'); return; }
            saving.value = true;
            try {
                await api(`products/${drawerProduct.value.public_id}/inventory-adjustments`, 'POST', { variant_public_id: adjustment.value.variant_public_id || null, quantity_delta: adjustment.value.direction === 'add' ? adjustment.value.quantity : -adjustment.value.quantity, reason: adjustment.value.reason });
                showToast('success', 'Stock ajusté avec succès.'); drawerProduct.value = null; await Promise.all([loadInventory(), loadMovements()]);
            } catch (cause) { showError(cause instanceof Error ? cause.message : 'Ajustement impossible.'); }
            finally { saving.value = false; }
        };
        const stockLabel = (product: Product) => product.has_variants ? 'Variantes' : `${product.stock_quantity || 0} unités`;
        const stockState = (product: Product) => product.has_variants ? 'Géré par variante' : product.stock_quantity === 0 ? 'Rupture' : product.low_stock_threshold && (product.stock_quantity || 0) <= product.low_stock_threshold ? 'Stock faible' : 'En stock';
        const variantLabel = (variant: Variant) => `${variant.sku || variant.values?.map((value) => value.value).join(' / ') || 'Variante'} · ${variant.stock_quantity}`;
        onMounted(loadInventory);
        return { tab, products, movements, loadingInventory, loadingHistory, search, state, history, drawerProduct, variants, adjustment, saving, filteredProducts, activeVariant, currentStock, nextStock, movementOptions, switchTab, queueHistory, resetHistory, loadMovements, openDrawer, submit, labelForMovement, stockLabel, stockState, variantLabel };
    },
    template: `<section class="admin-page inventory-page"><header class="admin-page-header"><div><p class="admin-eyebrow">Traçabilité</p><h1>Inventaire</h1><p class="admin-subtitle">Suivez les niveaux de stock et chaque mouvement validé.</p></div></header>
      <nav class="admin-tabs" aria-label="Vues d’inventaire"><button :class="{ active: tab === 'inventory' }" @click="switchTab('inventory')">Inventaire</button><button :class="{ active: tab === 'history' }" @click="switchTab('history')">Historique des mouvements</button></nav>
      <template v-if="tab === 'inventory'"><div class="admin-filter-bar"><label class="admin-search"><span class="sr-only">Rechercher un produit</span><input v-model.trim="search" placeholder="Rechercher un produit ou une catégorie…"></label><label class="toolbar-select"><span>État du stock</span><SelectControl v-model="state" :options="[{ value: '', label: 'Tous les états' }, { value: 'low', label: 'Stock faible' }, { value: 'out', label: 'Rupture' }, { value: 'variants', label: 'Avec variantes' }]"/></label></div><p v-if="loadingInventory" class="admin-loading">Chargement de l’inventaire…</p><p v-else-if="!filteredProducts.length" class="admin-empty">Aucun produit ne correspond à ces critères.</p><div v-else class="admin-table inventory-table"><div class="admin-table-head"><span>Produit</span><span>Stock</span><span>Seuil</span><span>État</span><span>Action</span></div><article v-for="product in filteredProducts" :key="product.public_id"><div><strong>{{ product.name }}</strong><small>{{ product.category?.name || 'Sans catégorie' }} · {{ product.has_variants ? 'Variantes' : 'Stock unique' }}</small></div><span>{{ stockLabel(product) }}</span><span>{{ product.has_variants ? '—' : (product.low_stock_threshold || 'Sans seuil') }}</span><span class="admin-badge" :class="{ 'is-low-stock': stockState(product) === 'Stock faible', warning: stockState(product) === 'Rupture' }">{{ stockState(product) }}</span><span><button class="text-link" type="button" @click="openDrawer(product)">Ajuster</button></span></article></div></template>
      <template v-else><section class="history-filter-bar" aria-label="Filtres de l’historique"><label class="admin-search"><span class="sr-only">Rechercher un produit dans l’historique</span><input v-model.trim="history.search" @input="queueHistory" placeholder="Rechercher un produit…"></label><label class="toolbar-select"><span>Type</span><SelectControl v-model="history.type" :options="movementOptions" @change="loadMovements"/></label><label>Date de début<input v-model="history.date_from" type="date" @change="loadMovements"></label><label>Date de fin<input v-model="history.date_to" type="date" @change="loadMovements"></label><button class="text-link" type="button" @click="resetHistory">Réinitialiser</button></section><p v-if="loadingHistory" class="admin-loading">Chargement de l’historique…</p><p v-else-if="!movements.length" class="admin-empty">Aucun mouvement ne correspond à ces critères.</p><div v-else class="admin-table inventory-table history-table"><div class="admin-table-head"><span>Produit</span><span>Mouvement</span><span>Avant → Après</span><span>Motif</span><span>Date</span></div><article v-for="movement in movements" :key="movement.public_id"><div><strong>{{ movement.product?.name || 'Produit archivé' }}</strong><small v-if="movement.variant">{{ movement.variant.sku || movement.variant.values?.map(value => value.value).join(' / ') || 'Variante' }}</small></div><span :class="movement.quantity_delta > 0 ? 'status-active' : 'danger'">{{ movement.quantity_delta > 0 ? '+' : '' }}{{ movement.quantity_delta }} · {{ labelForMovement(movement.type) }}</span><span>{{ movement.quantity_before }} → {{ movement.quantity_after }}</span><span>{{ movement.reason }}</span><span>{{ movement.created_at ? new Date(movement.created_at).toLocaleDateString('fr-TN') : '—' }}</span></article></div></template>
      <aside v-if="drawerProduct" class="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="adjustment-title"><div class="admin-drawer-backdrop" @click="drawerProduct = null"></div><section><header><div><p class="admin-eyebrow">Inventaire</p><h2 id="adjustment-title">Ajuster le stock</h2></div><button class="text-link" type="button" @click="drawerProduct = null">Fermer</button></header><p><strong>{{ drawerProduct.name }}</strong><br><small>{{ drawerProduct.category?.name || 'Sans catégorie' }}</small></p><label v-if="variants.length" class="toolbar-select"><span>Variante</span><SelectControl v-model="adjustment.variant_public_id" :options="[{ value: '', label: 'Choisir une variante', disabled: true }, ...variants.map(variant => ({ value: variant.public_id, label: variantLabel(variant) }))]" required/></label><p class="stock-readout">Stock actuel <strong>{{ currentStock }}</strong></p><fieldset><legend>Type d’ajustement</legend><label><input v-model="adjustment.direction" type="radio" value="add"> Ajouter</label><label><input v-model="adjustment.direction" type="radio" value="remove"> Retirer</label></fieldset><label>Quantité <b aria-hidden="true">*</b><input v-model.number="adjustment.quantity" type="number" min="1" required></label><p class="stock-readout">Nouveau stock <strong>{{ currentStock }} → {{ nextStock }}</strong></p><label class="toolbar-select"><span>Motif <b aria-hidden="true">*</b></span><SelectControl v-model="adjustment.reason" :options="[{ value: 'Réception fournisseur', label: 'Réception fournisseur' }, { value: 'Correction inventaire', label: 'Correction inventaire' }, { value: 'Produit endommagé', label: 'Produit endommagé' }, { value: 'Autre', label: 'Autre' }]" required/></label><footer><button class="text-link" type="button" @click="drawerProduct = null">Annuler</button><button class="admin-action" type="button" :disabled="saving" @click="submit">{{ saving ? 'Validation…' : 'Confirmer l’ajustement' }}</button></footer></section></aside>
    </section>`,
};

export default InventoryView;
