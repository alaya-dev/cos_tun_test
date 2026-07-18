import { createApp, onMounted, ref, type Component } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory, RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import OrderDetailView from './order-detail';
import OrdersView from './orders';
import ProductsView from './products';
import InventoryView from './inventory';

type Page<T> = { data: T[]; current_page: number; last_page: number };
type Category = { public_id: string; name: string; slug: string; description?: string | null; is_active: boolean; sort_order: number; seo_title?: string | null; seo_description?: string | null };
type Product = { public_id: string; name: string; slug: string; stock_quantity: number | null; low_stock_threshold?: number | null; has_variants: boolean; is_active: boolean; category?: { name: string; public_id?: string }; regular_price_millimes: number; promotional_price_millimes?: number | null; short_description?: string | null; full_description?: string | null; seo_title?: string | null; seo_description?: string | null };
type ProductImage = { public_id: string; path: string | null; alt_text: string | null; is_primary: boolean; processing_status: string; sort_order: number };
type ProductDetail = Product & { category_id?: number; lock_version: number; images: ProductImage[]; option_groups: VariantGroup[]; variants: ProductVariant[] };
type Order = { public_reference: string; customer_name: string; status: string; total_millimes: number; created_at: string };
type Movement = { public_id: string; type: string; quantity_delta: number; reason: string; created_at: string; product?: { name: string } };

const money = (value: number) => `${(value / 1000).toFixed(3).replace('.', ',')} TND`;
const errorMessage = (status: number) => status === 401 || status === 403 ? 'Votre session ne permet pas cet accès.' : 'Les données sont momentanément indisponibles.';

async function api<T>(path: string): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
    if (!response.ok) throw new Error(errorMessage(response.status));
    return response.json() as Promise<T>;
}

async function write<T>(path: string, method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: unknown): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, {
        method,
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
        const payload = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(payload?.message || 'Enregistrement impossible. Vérifiez les champs.');
    }
    return response.json() as Promise<T>;
}

function collection<T>(path: string) {
    const rows = ref<T[]>([]);
    const error = ref('');
    const loading = ref(true);
    onMounted(async () => {
        try { rows.value = (await api<{ data: Page<T> }>(path)).data.data; } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { loading.value = false; }
    });
    return { rows, error, loading };
}

const Products = {
    components: { RouterLink },
    setup() {
        const state = collection<Product>('products?per_page=25');
        const categories = ref<Category[]>([]);
        const route = useRoute();
        const open = ref(route.path.endsWith('/new'));
        const saving = ref(false);
        const router = useRouter();
        const form = ref({ category_public_id: '', name: '', slug: '', short_description: '', full_description: '', regular_price_millimes: 0, promotional_price_millimes: null as number | null, stock_quantity: 0, low_stock_threshold: 0, seo_title: '', seo_description: '', is_active: false });
        onMounted(async () => { try { categories.value = (await api<{ data: Page<Category> }>('categories?per_page=100')).data.data; } catch { /* Form presents a clear required category state. */ } });
        const save = async () => {
            saving.value = true;
            state.error.value = '';
            try {
                const created = await write<{ data: Product }>('products', 'POST', { ...form.value, has_variants: false });
                await router.push(`/products/${created.data.public_id}`);
            } catch (cause: unknown) { state.error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { saving.value = false; }
        };
        return { ...state, categories, open, saving, form, save, money };
    },
    template: `<section class="admin-page"><header><div><p class="admin-eyebrow">Catalogue</p><h1>Produits</h1></div><button class="admin-action" @click="open = !open">{{ open ? 'Fermer' : 'Nouveau produit' }}</button></header>
      <form v-if="open" class="admin-form" @submit.prevent="save"><label>Catégorie<select v-model="form.category_public_id" required><option value="">Choisir</option><option v-for="category in categories" :value="category.public_id">{{ category.name }}</option></select></label><label>Nom<input v-model="form.name" required maxlength="200"></label><label>Slug<input v-model="form.slug" required maxlength="190"></label><label>Prix normal (millimes)<input v-model.number="form.regular_price_millimes" type="number" min="0" required></label><label>Prix promotionnel<input v-model.number="form.promotional_price_millimes" type="number" min="0"></label><label>Stock<input v-model.number="form.stock_quantity" type="number" min="0" required></label><label>Seuil bas<input v-model.number="form.low_stock_threshold" type="number" min="0"></label><label>Description courte<textarea v-model="form.short_description"></textarea></label><label>Description complète<textarea v-model="form.full_description"></textarea></label><label>Titre SEO<input v-model="form.seo_title" maxlength="255"></label><label>Description SEO<textarea v-model="form.seo_description" maxlength="320"></textarea></label><label class="admin-check"><input v-model="form.is_active" type="checkbox"> Publier maintenant</label><button class="admin-action" :disabled="saving" type="submit">{{ saving ? 'Enregistrement…' : 'Créer le produit' }}</button></form>
      <p v-if="loading">Chargement…</p><p v-else-if="error" class="admin-alert">{{ error }}</p><div v-else class="admin-table"><RouterLink v-for="product in rows" :key="product.public_id" :to="'/products/' + product.public_id"><article><div><strong>{{ product.name }}</strong><small>{{ product.category?.name || 'Sans catégorie' }}</small></div><span>{{ product.stock_quantity ?? 'Variantes' }}</span><span>{{ money(product.regular_price_millimes) }}</span><span :class="product.is_active ? 'status-active' : 'status-muted'">{{ product.is_active ? 'Actif' : 'Inactif' }}</span></article></RouterLink></div></section>`,
};

type VariantValue = { id: number; value: string };
type VariantGroup = { id: number; name: string; values: VariantValue[] };
type ProductVariant = { public_id: string; sku: string | null; stock_quantity: number; low_stock_threshold: number | null; is_active: boolean; values: VariantValue[] };
type VariantProduct = Product & { lock_version: number; option_groups: VariantGroup[]; variants: ProductVariant[] };
type VariantDraft = { keys: string[]; sku: string; stock_quantity: number; low_stock_threshold: number; is_active: boolean };

const VariantEditor: Component = {
    props: { product: { type: Object, required: true } },
    emits: ['updated'],
    setup(props: { product?: unknown }, { emit }: { emit: (event: string) => void }) {
        const product = props.product as VariantProduct;
        const confirmation = ref('');
        const resultingStock = ref(0);
        const saving = ref(false);
        const error = ref('');
        const groups = ref<{ name: string; valuesText: string }[]>(product.option_groups.map(group => ({ name: group.name, valuesText: group.values.map(value => value.value).join(', ') })));
        const variants = ref<VariantDraft[]>([]);
        const keyFor = (groupIndex: number, value: string) => `${groupIndex}:${value.trim().toLocaleLowerCase()}`;
        const groupValues = () => groups.value.map(group => group.valuesText.split(',').map(value => value.trim()).filter(Boolean));
        const regenerate = () => {
            const values = groupValues();
            if (!values.length || values.some(group => !group.length)) { variants.value = []; return; }
            const existing = new Map(variants.value.map(variant => [variant.keys.join('|'), variant]));
            const combinations = values.reduce<string[][]>((all, group, groupIndex) => all.flatMap(combination => group.map(value => [...combination, keyFor(groupIndex, value)])), [[]]);
            variants.value = combinations.map(keys => existing.get(keys.join('|')) || { keys, sku: '', stock_quantity: 0, low_stock_threshold: 0, is_active: true });
        };
        const addGroup = () => { if (groups.value.length < 5) groups.value.push({ name: '', valuesText: '' }); };
        const removeGroup = (index: number) => { groups.value.splice(index, 1); regenerate(); };
        if (product.has_variants) {
            variants.value = product.variants.map(variant => ({
                keys: variant.values.map(value => {
                    const groupIndex = product.option_groups.findIndex(group => group.values.some(candidate => candidate.id === value.id));
                    return keyFor(groupIndex, value.value);
                }).sort(),
                sku: variant.sku || '', stock_quantity: variant.stock_quantity, low_stock_threshold: variant.low_stock_threshold || 0, is_active: variant.is_active,
            }));
        }
        const switchMode = async (hasVariants: boolean) => {
            saving.value = true; error.value = '';
            try {
                await write(`products/${product.public_id}/variant-mode`, 'POST', { has_variants: hasVariants, confirmation: confirmation.value, resulting_stock_quantity: hasVariants ? null : resultingStock.value });
                confirmation.value = ''; emit('updated');
            } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { saving.value = false; }
        };
        const save = async () => {
            if (!groups.value.length || groups.value.some(group => !group.name.trim()) || !variants.value.length) { error.value = 'Ajoutez un nom et au moins une valeur dans chaque option, puis générez les combinaisons.'; return; }
            saving.value = true; error.value = '';
            try {
                const optionGroups = groups.value.map((group, groupIndex) => ({ name: group.name.trim(), values: groupValues()[groupIndex].map(value => ({ client_key: keyFor(groupIndex, value), value })) }));
                await write(`products/${product.public_id}/variants`, 'PUT', { lock_version: product.lock_version, option_groups: optionGroups, variants: variants.value.map(variant => ({ option_value_client_keys: variant.keys, sku: variant.sku || null, stock_quantity: variant.stock_quantity, low_stock_threshold: variant.low_stock_threshold, is_active: variant.is_active })) });
                emit('updated');
            } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { saving.value = false; }
        };
        return { confirmation, resultingStock, saving, error, groups, variants, regenerate, addGroup, removeGroup, switchMode, save };
    },
    template: '<section class="admin-variants"><div><p class="admin-eyebrow">Variantes</p><h2>Déclinaisons et stock</h2><p>Chaque enregistrement remplace les combinaisons de façon atomique. Vérifiez les stocks avant de confirmer.</p></div><p v-if="error" class="admin-alert">{{ error }}</p><template v-if="!product.has_variants"><p class="admin-empty">Ce produit utilise actuellement un stock unique.</p><form class="admin-inline-form" @submit.prevent="switchMode(true)"><label>Pour activer les variantes, saisissez CONFIRMER.<input v-model="confirmation" required pattern="CONFIRMER"></label><button class="admin-action" :disabled="saving">Activer les variantes</button></form></template><template v-else><div class="admin-variant-groups"><div v-for="(group, index) in groups" class="admin-variant-group"><label>Nom d’option<input v-model="group.name" maxlength="120" required></label><label>Valeurs, séparées par des virgules<input v-model="group.valuesText" maxlength="1000" required @change="regenerate"></label><button class="text-link" type="button" @click="removeGroup(index)">Retirer l’option</button></div></div><button class="text-link" type="button" :disabled="groups.length >= 5" @click="addGroup">Ajouter une option</button><button class="text-link" type="button" @click="regenerate">Générer les combinaisons</button><p v-if="!variants.length" class="admin-empty">Ajoutez des valeurs puis générez les combinaisons.</p><div v-else class="admin-table"><article v-for="variant in variants"><div><strong>{{ variant.keys.join(\' · \') }}</strong><label>SKU<input v-model="variant.sku" maxlength="100"></label></div><label>Stock<input v-model.number="variant.stock_quantity" type="number" min="0" required></label><label>Seuil bas<input v-model.number="variant.low_stock_threshold" type="number" min="0"></label><label class="admin-check"><input v-model="variant.is_active" type="checkbox"> Active</label></article></div><button class="admin-action" :disabled="saving" @click="save">{{ saving ? \'Enregistrement…\' : \'Enregistrer les variantes\' }}</button><form class="admin-inline-form admin-danger-zone" @submit.prevent="switchMode(false)"><label>Stock unique après désactivation<input v-model.number="resultingStock" type="number" min="0" required></label><label>Saisissez CONFIRMER pour désactiver les variantes.<input v-model="confirmation" required pattern="CONFIRMER"></label><button class="text-link" :disabled="saving">Désactiver les variantes</button></form></template></section>',
};

const ProductEditor = {
    components: { RouterLink, VariantEditor },
    setup() {
        const route = useRoute();
        const categories = ref<Category[]>([]);
        const product = ref<ProductDetail | null>(null);
        const loading = ref(true);
        const saving = ref(false);
        const uploading = ref(false);
        const error = ref('');
        const uploadError = ref('');
        const form = ref({ category_public_id: '', name: '', slug: '', short_description: '', full_description: '', regular_price_millimes: 0, promotional_price_millimes: null as number | null, stock_quantity: 0, low_stock_threshold: 0, seo_title: '', seo_description: '', is_active: false });
        const refresh = async () => {
            const detail = (await api<{ data: ProductDetail }>(`products/${route.params.reference}`)).data;
            product.value = detail;
            form.value = { category_public_id: detail.category?.public_id || '', name: detail.name, slug: detail.slug, short_description: detail.short_description || '', full_description: detail.full_description || '', regular_price_millimes: detail.regular_price_millimes, promotional_price_millimes: detail.promotional_price_millimes || null, stock_quantity: detail.stock_quantity || 0, low_stock_threshold: detail.low_stock_threshold || 0, seo_title: detail.seo_title || '', seo_description: detail.seo_description || '', is_active: detail.is_active };
        };
        onMounted(async () => {
            try {
                await Promise.all([refresh(), api<{ data: Page<Category> }>('categories?per_page=100').then(result => { categories.value = result.data.data; })]);
            } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { loading.value = false; }
        });
        const save = async () => {
            if (!product.value) return;
            saving.value = true; error.value = '';
            try { await write(`products/${product.value.public_id}`, 'PATCH', { ...form.value, ...(product.value.has_variants ? { stock_quantity: undefined, low_stock_threshold: undefined } : {}) }); await refresh(); } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { saving.value = false; }
        };
        const upload = async (event: Event) => {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            if (!file || !product.value) return;
            uploading.value = true; uploadError.value = '';
            const payload = new FormData(); payload.append('image', file); payload.append('alt_text', form.value.name);
            try {
                const response = await fetch(`/api/v1/admin/products/${product.value.public_id}/images`, { method: 'POST', headers: { Accept: 'application/json' }, credentials: 'same-origin', body: payload });
                if (!response.ok) { const data = await response.json().catch(() => null) as { message?: string } | null; throw new Error(data?.message || 'Import impossible.'); }
                input.value = ''; await refresh();
            } catch (cause: unknown) { uploadError.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { uploading.value = false; }
        };
        const updateImage = async (image: ProductImage) => {
            if (!product.value) return;
            try { await write(`products/${product.value.public_id}/images/${image.public_id}`, 'PATCH', { alt_text: image.alt_text, is_primary: image.is_primary }); await refresh(); } catch (cause: unknown) { uploadError.value = cause instanceof Error ? cause.message : 'Erreur'; }
        };
        const removeImage = async (image: ProductImage) => {
            if (!product.value || !window.confirm('Retirer cette image du produit ?')) return;
            try { await write(`products/${product.value.public_id}/images/${image.public_id}`, 'DELETE'); await refresh(); } catch (cause: unknown) { uploadError.value = cause instanceof Error ? cause.message : 'Erreur'; }
        };
        const moveImage = async (index: number, direction: number) => {
            if (!product.value) return;
            const target = index + direction;
            if (target < 0 || target >= product.value.images.length) return;
            const images = [...product.value.images]; [images[index], images[target]] = [images[target], images[index]];
            try { await write(`products/${product.value.public_id}/images/reorder`, 'POST', { items: images.map((image, sort_order) => ({ public_id: image.public_id, sort_order })) }); await refresh(); } catch (cause: unknown) { uploadError.value = cause instanceof Error ? cause.message : 'Erreur'; }
        };
        const imageUrl = (image: ProductImage) => image.path ? `/storage/${image.path}` : '';
        return { categories, product, loading, saving, uploading, error, uploadError, form, save, upload, updateImage, removeImage, moveImage, imageUrl, money, refresh };
    },
    template: `<section class="admin-page"><RouterLink class="text-link" to="/products">Retour aux produits</RouterLink><p v-if="loading">Chargement…</p><p v-else-if="error" class="admin-alert">{{ error }}</p><template v-else-if="product"><header><div><p class="admin-eyebrow">Fiche produit</p><h1>{{ product.name }}</h1></div><span :class="product.is_active ? 'status-active' : 'status-muted'">{{ product.is_active ? 'Publié' : 'Brouillon' }}</span></header>
      <form class="admin-form" @submit.prevent="save"><label>Catégorie<select v-model="form.category_public_id" required><option value="">Choisir</option><option v-for="category in categories" :value="category.public_id">{{ category.name }}</option></select></label><label>Nom<input v-model="form.name" required maxlength="200"></label><label>Slug<input v-model="form.slug" required maxlength="190"></label><label>Prix normal (millimes)<input v-model.number="form.regular_price_millimes" type="number" min="0" required></label><label>Prix promotionnel<input v-model.number="form.promotional_price_millimes" type="number" min="0"></label><label v-if="!product.has_variants">Stock<input v-model.number="form.stock_quantity" type="number" min="0" required></label><label v-if="!product.has_variants">Seuil bas<input v-model.number="form.low_stock_threshold" type="number" min="0"></label><label>Description courte<textarea v-model="form.short_description"></textarea></label><label>Description complète<textarea v-model="form.full_description"></textarea></label><label>Titre SEO<input v-model="form.seo_title" maxlength="255"></label><label>Description SEO<textarea v-model="form.seo_description" maxlength="320"></textarea></label><label class="admin-check"><input v-model="form.is_active" type="checkbox"> Publier le produit</label><button class="admin-action" :disabled="saving">{{ saving ? 'Enregistrement…' : 'Enregistrer les informations' }}</button></form>
      <section class="admin-media"><div><p class="admin-eyebrow">Médias</p><h2>Images produit</h2><p>JPG, PNG ou WebP, 10 Mo maximum. L’image est validée et traitée en arrière-plan.</p></div><label class="admin-upload"><input type="file" accept="image/jpeg,image/png,image/webp" :disabled="uploading" @change="upload"><span>{{ uploading ? 'Import en cours…' : 'Importer une image' }}</span></label><p v-if="uploadError" class="admin-alert">{{ uploadError }}</p><p v-if="!product.images.length" class="admin-empty">Aucune image. Ajoutez une image produit avec un texte alternatif précis.</p><ol v-else class="admin-image-list"><li v-for="(image, index) in product.images" :key="image.public_id"><div class="admin-image-preview"><img v-if="imageUrl(image)" :src="imageUrl(image)" :alt="image.alt_text || product.name"><span v-else>Traitement</span></div><div><strong>{{ image.is_primary ? 'Image principale' : 'Image secondaire' }}</strong><small>{{ image.processing_status }}</small><label>Texte alternatif<input v-model="image.alt_text" maxlength="255" @change="updateImage(image)"></label></div><div class="admin-image-actions"><label class="admin-check"><input v-model="image.is_primary" type="radio" name="primary-image" @change="updateImage(image)"> Principale</label><button class="text-link" :disabled="index === 0" @click="moveImage(index, -1)">Monter</button><button class="text-link" :disabled="index === product.images.length - 1" @click="moveImage(index, 1)">Descendre</button><button class="text-link" @click="removeImage(image)">Retirer</button></div></li></ol></section><VariantEditor :product="product" @updated="refresh"></VariantEditor></template></section>`,
};

const Orders = { setup() { const rows = ref<Order[]>([]); const error = ref(''); const loading = ref(true); const search = ref(''); const status = ref(''); const load = async () => { loading.value = true; try { const query = new URLSearchParams({ per_page: '25' }); if (search.value) query.set('search', search.value); if (status.value) query.set('status', status.value); rows.value = (await api<{ data: Page<Order> }>(`orders?${query}`)).data.data; } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { loading.value = false; } }; onMounted(load); const exportCsv = () => { const query = new URLSearchParams(); if (status.value) query.set('status', status.value); window.location.assign(`/api/v1/admin/orders/export?${query}`); }; return { rows, error, loading, search, status, load, exportCsv, money }; }, template: '<section class="admin-page"><header><div><p class="admin-eyebrow">Opérations</p><h1>Commandes</h1></div><button class="admin-action" @click="exportCsv">Exporter CSV</button></header><form class="admin-form" @submit.prevent="load"><label>Recherche<input v-model.trim="search" placeholder="Référence, client, téléphone"></label><label>Statut<select v-model="status"><option value="">Tous</option><option value="nouvelle">Nouvelle</option><option value="confirmee">Confirmée</option><option value="annulee">Annulée</option><option value="livree">Livrée</option><option value="echec_livraison">Échec livraison</option><option value="retournee">Retournée</option></select></label><button class="admin-action">Filtrer</button></form><p v-if="loading">Chargement…</p><p v-else-if="error" class="admin-alert">{{ error }}</p><div v-else class="admin-table"><RouterLink v-for="order in rows" :key="order.public_reference" :to="\'/orders/\' + order.public_reference"><article><div><strong>{{ order.public_reference }}</strong><small>{{ order.customer_name }}</small></div><span>{{ money(order.total_millimes) }}</span><span class="status-muted">{{ order.status }}</span></article></RouterLink></div></section>', methods: { money } };

const OrderDetail = { setup() { const route = useRoute(); const data = ref<{ order: Order & { lock_version: number; items: { product_name_snapshot: string; quantity: number }[]; notes?: { body: string }[]; status_history?: { from_status: string; to_status: string; reason?: string }[] }; allowed_transitions: string[] } | null>(null); const error = ref(''); const loading = ref(true); const note = ref(''); const refresh = async () => { data.value = (await api<{ data: typeof data.value }>(`orders/${route.params.reference}`)).data; }; onMounted(async () => { try { await refresh(); } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { loading.value = false; } }); const transition = async (status: string) => { if (!data.value) return; try { await write(`orders/${data.value.order.public_reference}/transitions`, 'POST', { to_status: status, lock_version: data.value.order.lock_version, reason: ['annulee', 'echec_livraison', 'retournee'].includes(status) ? 'Décision opérateur' : null, restock_items: status === 'retournee' }); await refresh(); } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } }; const addNote = async () => { if (!data.value || !note.value.trim()) return; try { await write(`orders/${data.value.order.public_reference}/notes`, 'POST', { body: note.value.trim() }); note.value = ''; await refresh(); } catch (cause: unknown) { error.value = cause instanceof Error ? cause.message : 'Erreur'; } }; return { data, error, loading, transition, addNote, note, money, print: () => window.print() }; }, template: '<section class="admin-page"><RouterLink class="text-link" to="/orders">Retour aux commandes</RouterLink><p v-if="loading">Chargement…</p><p v-else-if="error" class="admin-alert">{{ error }}</p><template v-else-if="data"><header><div><p class="admin-eyebrow">Commande</p><h1>{{ data.order.public_reference }}</h1></div><button class="admin-action" @click="print">Imprimer</button></header><p>{{ data.order.customer_name }} · {{ money(data.order.total_millimes) }}</p><div class="admin-table"><article v-for="item in data.order.items"><strong>{{ item.product_name_snapshot }}</strong><span>× {{ item.quantity }}</span></article></div><div class="admin-actions"><button v-for="status in data.allowed_transitions" class="admin-action" @click="transition(status)">{{ status }}</button></div><form class="admin-form" @submit.prevent="addNote"><label>Note interne<textarea v-model="note" maxlength="5000" required></textarea></label><button class="admin-action">Ajouter la note</button></form><div v-if="data.order.notes?.length" class="admin-table"><article v-for="item in data.order.notes"><strong>Note interne</strong><small>{{ item.body }}</small></article></div><div v-if="data.order.status_history?.length" class="admin-table"><article v-for="item in data.order.status_history"><strong>{{ item.from_status }} → {{ item.to_status }}</strong><small>{{ item.reason || \'Sans motif\' }}</small></article></div></template></section>', methods: { money } };

const Inventory = { setup() { const state = collection<Movement>('inventory/movements?per_page=25'); const products = ref<Product[]>([]); const form = ref({ product_public_id: '', quantity_delta: 0, reason: '' }); const saving = ref(false); onMounted(async () => { try { products.value = (await api<{ data: Page<Product> }>('products?per_page=100')).data.data; } catch { /* Page stays readable while products load. */ } }); const adjust = async () => { saving.value = true; try { await write(`products/${form.value.product_public_id}/inventory-adjustments`, 'POST', { quantity_delta: form.value.quantity_delta, reason: form.value.reason }); state.rows.value = (await api<{ data: Page<Movement> }>('inventory/movements?per_page=25')).data.data; form.value = { product_public_id: '', quantity_delta: 0, reason: '' }; } catch (cause: unknown) { state.error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { saving.value = false; } }; return { ...state, products, form, saving, adjust }; }, template: '<section class="admin-page"><header><div><p class="admin-eyebrow">Traçabilité</p><h1>Mouvements de stock</h1></div></header><form class="admin-form" @submit.prevent="adjust"><label>Produit<select v-model="form.product_public_id" required><option value="">Choisir</option><option v-for="product in products.filter(p => !p.has_variants)" :value="product.public_id">{{ product.name }}</option></select></label><label>Ajustement<input v-model.number="form.quantity_delta" type="number" required></label><label>Motif<input v-model.trim="form.reason" minlength="3" maxlength="500" required></label><button class="admin-action" :disabled="saving">{{ saving ? \'Enregistrement…\' : \'Ajuster le stock\' }}</button></form><p v-if="loading">Chargement…</p><p v-else-if="error" class="admin-alert">{{ error }}</p><div v-else class="admin-table"><article v-for="movement in rows" :key="movement.public_id"><div><strong>{{ movement.product?.name || \'Produit archivé\' }}</strong><small>{{ movement.reason }}</small></div><span :class="movement.quantity_delta > 0 ? \'status-active\' : \'status-muted\'">{{ movement.quantity_delta > 0 ? \'+\' : \'\' }}{{ movement.quantity_delta }}</span><span>{{ movement.type }}</span></article></div></section>' };

const Categories = { setup() { const state = collection<Category>('categories?per_page=100'); const open = ref(false); const saving = ref(false); const search = ref(''); const editing = ref<string | null>(null); const form = ref({ name: '', slug: '', description: '', is_active: true, seo_title: '', seo_description: '' }); const reload = async () => { state.rows.value = (await api<{ data: Page<Category> }>(`categories?per_page=100&search=${encodeURIComponent(search.value)}`)).data.data; }; const edit = (category: Category) => { editing.value = category.public_id; form.value = { name: category.name, slug: category.slug, description: category.description || '', is_active: category.is_active, seo_title: category.seo_title || '', seo_description: category.seo_description || '' }; open.value = true; }; const save = async () => { saving.value = true; try { const payload = { ...form.value, sort_order: editing.value ? undefined : state.rows.value.length }; await write(editing.value ? `categories/${editing.value}` : 'categories', editing.value ? 'PATCH' : 'POST', payload); form.value = { name: '', slug: '', description: '', is_active: true, seo_title: '', seo_description: '' }; editing.value = null; open.value = false; await reload(); } catch (cause: unknown) { state.error.value = cause instanceof Error ? cause.message : 'Erreur'; } finally { saving.value = false; } }; const remove = async (category: Category) => { if (!window.confirm(`Supprimer « ${category.name} » ?`)) return; try { await write(`categories/${category.public_id}`, 'DELETE'); await reload(); } catch (cause: unknown) { state.error.value = cause instanceof Error ? cause.message : 'Erreur'; } }; const move = async (index: number, direction: number) => { const target = index + direction; if (target < 0 || target >= state.rows.value.length) return; const rows = [...state.rows.value]; [rows[index], rows[target]] = [rows[target], rows[index]]; state.rows.value = rows; try { await write('categories/reorder', 'POST', { items: rows.map((item, sort_order) => ({ public_id: item.public_id, sort_order })) }); } catch (cause: unknown) { state.error.value = cause instanceof Error ? cause.message : 'Erreur'; await reload(); } }; return { ...state, open, saving, search, editing, form, save, edit, remove, move, reload }; }, template: '<section class="admin-page"><header><div><p class="admin-eyebrow">Catalogue</p><h1>Catégories</h1></div><button class="admin-action" @click="open = !open; editing = null">{{ open ? \'Fermer\' : \'Nouvelle catégorie\' }}</button></header><form class="admin-form" @submit.prevent="reload"><label>Rechercher<input v-model.trim="search" placeholder="Nom"></label><button class="admin-action">Rechercher</button></form><form v-if="open" class="admin-form" @submit.prevent="save"><label>Nom<input v-model.trim="form.name" required minlength="2" maxlength="160"></label><label>Slug<input v-model.trim="form.slug" maxlength="190"></label><label>Description<textarea v-model="form.description" maxlength="5000"></textarea></label><label>Titre SEO<input v-model="form.seo_title" maxlength="255"></label><label>Description SEO<textarea v-model="form.seo_description" maxlength="320"></textarea></label><label class="admin-check"><input v-model="form.is_active" type="checkbox"> Visible</label><button class="admin-action" :disabled="saving">{{ saving ? \'Enregistrement…\' : (editing ? \'Mettre à jour\' : \'Créer la catégorie\') }}</button></form><p v-if="loading">Chargement…</p><p v-else-if="error" class="admin-alert">{{ error }}</p><div v-else class="admin-table"><article v-for="(category, index) in rows" :key="category.public_id"><div><strong>{{ category.name }}</strong><small>{{ category.slug }} · {{ category.is_active ? \'Visible\' : \'Masquée\' }}</small></div><span><button class="text-link" @click="move(index, -1)">↑</button> <button class="text-link" @click="move(index, 1)">↓</button></span><span><button class="text-link" @click="edit(category)">Éditer</button> <button class="text-link" @click="remove(category)">Supprimer</button></span></article></div></section>' };

const Shell = { components: { RouterLink, RouterView }, template: '<div class="admin-shell"><aside><a class="admin-brand" href="/admin">PASSION<br><small>COSMETIC · ADMIN</small></a><nav><RouterLink to="/products">Produits</RouterLink><RouterLink to="/categories">Catégories</RouterLink><RouterLink to="/orders">Commandes</RouterLink><RouterLink to="/inventory">Stock</RouterLink></nav></aside><main><RouterView /></main></div>' };

const router = createRouter({ history: createWebHistory('/admin'), routes: [{ path: '/', redirect: '/products' }, { path: '/products', component: ProductsView }, { path: '/products/new', component: Products }, { path: '/products/:reference', component: ProductEditor }, { path: '/categories', component: Categories }, { path: '/orders', component: OrdersView }, { path: '/orders/:reference', component: OrderDetailView }, { path: '/inventory', component: InventoryView }] });
createApp(Shell).use(createPinia()).use(router).mount('#admin-app');
