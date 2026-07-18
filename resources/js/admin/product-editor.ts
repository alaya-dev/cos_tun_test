import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import { RouterLink, useRoute, useRouter } from 'vue-router';

type Category = { public_id: string; name: string };
type Value = { id: number; value: string };
type Variant = {
    public_id: string;
    stock_quantity: number;
    low_stock_threshold: number | null;
    is_active: boolean;
    values: Value[];
};
type Group = { id: number; name: string; values: Value[] };
type MediaRole = 'primary' | 'secondary' | 'variant';
type Media = {
    public_id: string;
    path: string | null;
    alt_text: string | null;
    is_primary: boolean;
    processing_status: string;
    variant?: { public_id: string } | null;
    role?: MediaRole;
    variant_public_id?: string;
};
type Product = {
    public_id: string;
    lock_version: number;
    name: string;
    slug: string;
    is_active: boolean;
    has_variants: boolean;
    stock_quantity: number | null;
    low_stock_threshold: number | null;
    regular_price_millimes: number;
    promotional_price_millimes: number | null;
    short_description: string | null;
    full_description: string | null;
    seo_title: string | null;
    seo_description: string | null;
    category?: Category;
    images: Media[];
    variants: Variant[];
    option_groups: Group[];
};
type VariantDraft = {
    keys: string[];
    stock_quantity: number;
    low_stock_threshold: number;
    is_active: boolean;
};
type QueuedMedia = {
    id: string;
    file: File;
    preview: string;
    alt: string;
    role: MediaRole;
    variantIndex: string;
};
type Page<T> = { data: T[] };
const csrf = () =>
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
        ?.content || '';
const dt = (value: number | null) =>
    value === null ? '' : (value / 1000).toFixed(3).replace('.', ',');
const millimes = (value: string) =>
    Math.round(Number(value.replace(',', '.')) * 1000);
const mediaUrl = (image: Media) =>
    image.path
        ? image.path.startsWith('/') || image.path.startsWith('http')
            ? image.path
            : `/storage/${image.path}`
        : '';
async function api<T>(
    path: string,
    method = 'GET',
    body?: unknown,
): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, {
        method,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            ...(body === undefined
                ? {}
                : {
                      'Content-Type': 'application/json',
                      'X-CSRF-TOKEN': csrf(),
                  }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
            message?: string;
            errors?: Record<string, string[]>;
        } | null;
        throw new Error(
            data?.errors
                ? Object.values(data.errors).flat().join(' ')
                : data?.message || 'Enregistrement impossible.',
        );
    }
    return response.json() as Promise<T>;
}

const ProductEditorView: Component = {
    components: { RouterLink },
    setup() {
        const route = useRoute();
        const router = useRouter();
        const isNew = computed(() => route.path.endsWith('/new'));
        const product = ref<Product | null>(null);
        const categories = ref<Category[]>([]);
        const loading = ref(true);
        const saving = ref(false);
        const error = ref('');
        const notice = ref('');
        const variantMode = ref(false);
        const groups = ref<{ name: string; valuesText: string }[]>([]);
        const variants = ref<VariantDraft[]>([]);
        const queued = ref<QueuedMedia[]>([]);
        const form = ref({
            category_public_id: '',
            name: '',
            slug: '',
            short_description: '',
            full_description: '',
            regular_price_dt: '',
            promotional_price_dt: '',
            stock_quantity: 0,
            low_stock_threshold: 0,
            promotion: false,
            stock_alert: false,
            is_active: false,
            seo_title: '',
            seo_description: '',
        });
        const values = () =>
            groups.value.map((group) =>
                group.valuesText
                    .split(',')
                    .map((value) => value.trim())
                    .filter(Boolean),
            );
        const key = (group: number, value: string) =>
            `${group}:${value.toLocaleLowerCase()}`;
        const variantLabel = (row: VariantDraft) =>
            row.keys
                .map((item) => item.split(':').slice(1).join(':'))
                .join(' / ');
        const totalStock = computed(() =>
            variants.value
                .filter((row) => row.is_active)
                .reduce((total, row) => total + row.stock_quantity, 0),
        );
        const hydrate = (item: Product) => {
            product.value = item;
            variantMode.value = item.has_variants;
            form.value = {
                category_public_id: item.category?.public_id || '',
                name: item.name,
                slug: item.slug,
                short_description: item.short_description || '',
                full_description: item.full_description || '',
                regular_price_dt: dt(item.regular_price_millimes),
                promotional_price_dt: dt(item.promotional_price_millimes),
                stock_quantity: item.stock_quantity || 0,
                low_stock_threshold: item.low_stock_threshold || 0,
                promotion: item.promotional_price_millimes !== null,
                stock_alert: (item.low_stock_threshold || 0) > 0,
                is_active: item.is_active,
                seo_title: item.seo_title || '',
                seo_description: item.seo_description || '',
            };
            groups.value = item.option_groups.map((group) => ({
                name: group.name,
                valuesText: group.values.map((value) => value.value).join(', '),
            }));
            variants.value = item.variants.map((row) => ({
                keys: row.values
                    .map((value) => {
                        const groupIndex = item.option_groups.findIndex(
                            (group) =>
                                group.values.some(
                                    (candidate) => candidate.id === value.id,
                                ),
                        );
                        return key(groupIndex, value.value);
                    })
                    .sort(),
                stock_quantity: row.stock_quantity,
                low_stock_threshold: row.low_stock_threshold || 0,
                is_active: row.is_active,
            }));
            item.images.forEach((image) => {
                image.variant_public_id = image.variant?.public_id || '';
                image.role = image.is_primary
                    ? 'primary'
                    : image.variant_public_id
                      ? 'variant'
                      : 'secondary';
            });
        };
        const refresh = async (reference?: string) =>
            hydrate(
                (
                    await api<{ data: Product }>(
                        `products/${reference || product.value?.public_id}`,
                    )
                ).data,
            );
        const load = async () => {
            try {
                const [categoryResult, detail] = await Promise.all([
                    api<{ data: Page<Category> }>('categories?per_page=100'),
                    isNew.value
                        ? Promise.resolve(null)
                        : api<{ data: Product }>(
                              `products/${route.params.reference}`,
                          ),
                ]);
                categories.value = categoryResult.data.data;
                if (detail) hydrate(detail.data);
            } catch (cause) {
                error.value =
                    cause instanceof Error
                        ? cause.message
                        : 'Chargement impossible.';
            } finally {
                loading.value = false;
            }
        };
        const regenerate = () => {
            const sets = values();
            if (!sets.length || sets.some((set) => !set.length)) {
                variants.value = [];
                return;
            }
            const old = new Map(
                variants.value.map((row) => [row.keys.join('|'), row]),
            );
            const combinations = sets.reduce<string[][]>(
                (all, set, index) =>
                    all.flatMap((combination) =>
                        set.map((value) => [...combination, key(index, value)]),
                    ),
                [[]],
            );
            variants.value = combinations.map(
                (keys) =>
                    old.get(keys.join('|')) || {
                        keys,
                        stock_quantity: 0,
                        low_stock_threshold: 0,
                        is_active: true,
                    },
            );
        };
        const addGroup = () => {
            groups.value.push({ name: '', valuesText: '' });
        };
        const toggleVariants = async () => {
            const enable = !variantMode.value;
            variantMode.value = enable;
            if (enable && !groups.value.length) addGroup();
            if (!product.value) return;
            saving.value = true;
            try {
                await api(
                    `products/${product.value.public_id}/variant-mode`,
                    'POST',
                    {
                        has_variants: enable,
                        resulting_stock_quantity: enable
                            ? null
                            : totalStock.value,
                    },
                );
                await refresh();
                if (enable && !groups.value.length) addGroup();
                notice.value = enable
                    ? 'Variantes activées. Ajoutez les options ci-dessous.'
                    : 'Stock unique activé.';
            } catch (cause) {
                variantMode.value = !enable;
                error.value =
                    cause instanceof Error
                        ? cause.message
                        : 'Changement impossible.';
            } finally {
                saving.value = false;
            }
        };
        const variantPayload = () => ({
            option_groups: groups.value.map((group, index) => ({
                name: group.name.trim(),
                values: values()[index].map((value) => ({
                    client_key: key(index, value),
                    value,
                })),
            })),
            variants: variants.value.map((row) => ({
                option_value_client_keys: row.keys,
                stock_quantity: row.stock_quantity,
                low_stock_threshold: row.low_stock_threshold,
                is_active: row.is_active,
            })),
        });
        const addMedia = (event: Event) => {
            const input = event.target as HTMLInputElement;
            Array.from(input.files || []).forEach((file, index) =>
                queued.value.push({
                    id: `${Date.now()}-${index}`,
                    file,
                    preview: URL.createObjectURL(file),
                    alt: form.value.name,
                    role: queued.value.length ? 'secondary' : 'primary',
                    variantIndex: '',
                }),
            );
            input.value = '';
        };
        const removeQueued = (item: QueuedMedia) => {
            URL.revokeObjectURL(item.preview);
            queued.value = queued.value.filter(
                (candidate) => candidate.id !== item.id,
            );
        };
        const uploadQueued = async (savedProduct: Product) => {
            for (const media of [...queued.value]) {
                const payload = new FormData();
                payload.append('image', media.file);
                payload.append('alt_text', media.alt);
                payload.append(
                    'is_primary',
                    media.role === 'primary' ? '1' : '0',
                );
                if (media.role === 'variant')
                    payload.append(
                        'variant_public_id',
                        savedProduct.variants[Number(media.variantIndex)]
                            ?.public_id || '',
                    );
                const response = await fetch(
                    `/api/v1/admin/products/${savedProduct.public_id}/images`,
                    {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: {
                            Accept: 'application/json',
                            'X-CSRF-TOKEN': csrf(),
                        },
                        body: payload,
                    },
                );
                if (!response.ok)
                    throw new Error(
                        `L’image « ${media.file.name} » n’a pas pu être importée.`,
                    );
                removeQueued(media);
            }
        };
        const updateMedia = async (image: Media) => {
            if (!product.value) return;
            if (image.role === 'variant' && !image.variant_public_id) return;
            await api(
                `products/${product.value.public_id}/images/${image.public_id}`,
                'PATCH',
                {
                    alt_text: image.alt_text,
                    is_primary: image.role === 'primary',
                    variant_public_id:
                        image.role === 'variant'
                            ? image.variant_public_id
                            : null,
                },
            );
            await refresh();
        };
        const removeMedia = async (image: Media) => {
            if (!product.value || !window.confirm('Retirer cette image ?'))
                return;
            await api(
                `products/${product.value.public_id}/images/${image.public_id}`,
                'DELETE',
            );
            await refresh();
        };
        const validationError = () => {
            if (
                !form.value.category_public_id ||
                !form.value.name.trim() ||
                !form.value.slug.trim() ||
                !form.value.regular_price_dt
            ) return 'Complétez les champs obligatoires.';
            if (
                variantMode.value &&
                (!groups.value.length ||
                    groups.value.some((group) => !group.name.trim()) ||
                    !variants.value.length)
            ) return 'Ajoutez les options puis générez les variantes.';
            if (
                queued.value.some(
                    (media) =>
                        media.role === 'variant' && media.variantIndex === '',
                )
            ) return 'Choisissez une variante pour chaque image de variante.';
            if (!isNew.value && !product.value) return 'Rechargez le produit avant de l’enregistrer.';
            return '';
        };
        const productFields = () => ({
            category_public_id: form.value.category_public_id,
            name: form.value.name.trim(),
            slug: form.value.slug.trim(),
            short_description: form.value.short_description || null,
            full_description: form.value.full_description || null,
            regular_price_millimes: millimes(form.value.regular_price_dt),
            promotional_price_millimes:
                form.value.promotion && form.value.promotional_price_dt
                    ? millimes(form.value.promotional_price_dt)
                    : null,
            is_active: form.value.is_active,
            seo_title: form.value.seo_title || null,
            seo_description: form.value.seo_description || null,
            ...(!variantMode.value
                ? {
                      stock_quantity: form.value.stock_quantity,
                      low_stock_threshold: form.value.stock_alert
                          ? form.value.low_stock_threshold
                          : null,
                  }
                : isNew.value
                  ? { stock_quantity: null, low_stock_threshold: null }
                  : {}),
        });
        const createProduct = async () => {
            const savedProduct = (
                await api<{ data: Product }>('products', 'POST', {
                    ...productFields(),
                    has_variants: variantMode.value,
                    ...(variantMode.value ? variantPayload() : {}),
                })
            ).data;
            await router.replace(`/products/${savedProduct.public_id}`);
            return savedProduct;
        };
        const updateProduct = async () => {
            const currentProduct = product.value as Product;
            let savedProduct = (
                await api<{ data: Product }>(
                    `products/${currentProduct.public_id}`,
                    'PATCH',
                    productFields(),
                )
            ).data;
            if (!variantMode.value) return savedProduct;
            await api(`products/${currentProduct.public_id}/variants`, 'PUT', {
                lock_version: currentProduct.lock_version,
                ...variantPayload(),
            });
            await refresh();
            savedProduct = product.value as Product;
            return savedProduct;
        };
        const save = async () => {
            error.value = validationError();
            notice.value = '';
            if (error.value) return;
            saving.value = true;
            try {
                const savedProduct = isNew.value
                    ? await createProduct()
                    : await updateProduct();
                await uploadQueued(savedProduct);
                await refresh(savedProduct.public_id);
                notice.value = 'Produit enregistré.';
            } catch (cause) {
                error.value =
                    cause instanceof Error
                        ? cause.message
                        : 'Enregistrement impossible.';
            } finally {
                saving.value = false;
            }
        };
        onMounted(load);
        onBeforeUnmount(() =>
            queued.value.forEach((media) => URL.revokeObjectURL(media.preview)),
        );
        return {
            isNew,
            product,
            categories,
            loading,
            saving,
            error,
            notice,
            variantMode,
            groups,
            variants,
            queued,
            form,
            totalStock,
            variantLabel,
            mediaUrl,
            regenerate,
            addGroup,
            toggleVariants,
            addMedia,
            removeQueued,
            updateMedia,
            removeMedia,
            save,
        };
    },
    template:
        '<section class="admin-page product-editor"><header class="editor-toolbar"><RouterLink class="back-button" to="/products">← Produits</RouterLink><div><p class="admin-eyebrow">{{ isNew ? \'Nouveau produit\' : \'Modifier le produit\' }}</p><h1>{{ isNew ? \'Créer un produit\' : form.name }}</h1></div><label class="visibility-control"><input v-model="form.is_active" type="checkbox"><span>Visible dans la boutique</span></label></header><p v-if="loading" class="admin-loading">Chargement…</p><template v-else><p v-if="error" class="admin-alert" role="alert">{{ error }}</p><p v-if="notice" class="admin-notice" role="status">{{ notice }}</p><form class="product-form" @submit.prevent="save"><section><h2>Informations</h2><div class="form-grid"><label>Nom <b>*</b><input v-model="form.name" required></label><label>Catégorie <b>*</b><select v-model="form.category_public_id" required><option value="">Choisir</option><option v-for="category in categories" :key="category.public_id" :value="category.public_id">{{ category.name }}</option></select></label><label>Slug <b>*</b><input v-model="form.slug" required><small>Mot court utilisé dans l’adresse, par exemple « huile-argan ».</small></label><label class="full">Description courte<textarea v-model="form.short_description"></textarea></label><label class="full">Description complète<textarea v-model="form.full_description"></textarea></label></div></section><section><h2>Tarification</h2><div class="form-grid"><label>Prix normal <b>*</b><span class="price-input"><input v-model="form.regular_price_dt" required inputmode="decimal"><em>DT</em></span></label><label class="switch-row"><span><strong>En promotion</strong><small>Afficher un prix réduit.</small></span><input v-model="form.promotion" type="checkbox" role="switch"></label><label v-if="form.promotion">Prix promotionnel <span class="price-input"><input v-model="form.promotional_price_dt" inputmode="decimal"><em>DT</em></span></label></div></section><section class="media-section"><div class="section-heading"><div><h2>Médias</h2><p>Ajoutez les images dès la création, puis choisissez leur rôle.</p></div><label class="admin-action upload-control"><input type="file" multiple accept="image/jpeg,image/png,image/webp" @change="addMedia">Ajouter des images</label></div><div v-if="!queued.length && !product?.images.length" class="admin-empty">Aucune image ajoutée.</div><div class="media-grid"><article v-for="item in queued" :key="item.id" class="media-card"><img :src="item.preview" :alt="item.alt"><label>Rôle<select v-model="item.role"><option value="primary">Image principale</option><option value="secondary">Galerie secondaire</option><option v-if="variantMode" value="variant">Image de variante</option></select></label><label v-if="item.role === \'variant\'">Variante<select v-model="item.variantIndex"><option value="">Choisir</option><option v-for="(variant, index) in variants" :key="index" :value="String(index)">{{ variantLabel(variant) }}</option></select></label><label>Texte alternatif<input v-model="item.alt"></label><button class="list-action danger" type="button" @click="removeQueued(item)">Retirer</button></article><article v-for="image in product?.images" :key="image.public_id" class="media-card"><img v-if="mediaUrl(image)" :src="mediaUrl(image)" :alt="image.alt_text || form.name"><div v-else class="media-processing">Traitement…</div><label>Rôle<select v-model="image.role" @change="updateMedia(image)"><option value="primary">Image principale</option><option value="secondary">Galerie secondaire</option><option v-if="variantMode" value="variant">Image de variante</option></select></label><label v-if="image.role === \'variant\'">Variante<select v-model="image.variant_public_id" @change="updateMedia(image)"><option value="">Choisir</option><option v-for="variant in product?.variants" :key="variant.public_id" :value="variant.public_id">{{ variant.values.map(value => value.value).join(\' / \') }}</option></select></label><label>Texte alternatif<input v-model="image.alt_text" @change="updateMedia(image)"></label><button class="list-action danger" type="button" @click="removeMedia(image)">Retirer</button></article></div></section><section><div class="switch-panel"><div><h2>Stock et variantes</h2><p>{{ variantMode ? \'Un stock distinct pour chaque déclinaison.\' : \'Un seul stock pour ce produit.\' }}</p></div><label class="mode-switch"><input :checked="variantMode" type="checkbox" role="switch" :disabled="saving" @change="toggleVariants"><span>Ce produit possède des variantes</span></label></div><div v-if="!variantMode" class="form-grid"><label>Stock <b>*</b><input v-model.number="form.stock_quantity" type="number" min="0"></label><label class="switch-row"><span><strong>Alerte stock faible</strong></span><input v-model="form.stock_alert" type="checkbox" role="switch"></label><label v-if="form.stock_alert">Seuil<input v-model.number="form.low_stock_threshold" type="number" min="0"></label></div><div v-else class="variant-workspace"><p class="stock-summary">Stock total vendable <strong>{{ totalStock }} unités</strong></p><div class="option-list"><article v-for="(group, index) in groups" :key="index"><label>Option <input v-model="group.name" placeholder="Couleur"></label><label>Valeurs <input v-model="group.valuesText" placeholder="Rose, Nude" @change="regenerate"></label><button class="list-action danger" type="button" @click="groups.splice(index,1); regenerate()">Retirer</button></article></div><div class="variant-actions"><button class="list-action" type="button" :disabled="groups.length >= 5" @click="addGroup">Ajouter une option</button><button class="list-action primary" type="button" @click="regenerate">Générer les variantes</button></div><div v-if="variants.length" class="variant-cards"><article v-for="variant in variants" :key="variant.keys.join(\'|\')"><strong>{{ variantLabel(variant) }}</strong><label>Stock <input v-model.number="variant.stock_quantity" type="number" min="0"></label><label>Seuil <input v-model.number="variant.low_stock_threshold" type="number" min="0"></label><label class="inline-check"><input v-model="variant.is_active" type="checkbox"> Active</label></article></div><p v-else class="admin-empty">Ajoutez une option et ses valeurs, puis générez les variantes.</p></div></section><details><summary>Référencement</summary><div class="form-grid"><label>Titre SEO<input v-model="form.seo_title"></label><label>Description SEO<textarea v-model="form.seo_description"></textarea></label></div></details><footer class="sticky-actions"><span>{{ saving ? \'Enregistrement…\' : \'Prêt à enregistrer\' }}</span><RouterLink class="list-action" to="/products">Annuler</RouterLink><button class="admin-action" :disabled="saving">{{ isNew ? \'Créer le produit\' : \'Enregistrer\' }}</button></footer></form></template></section>',
};
export default ProductEditorView;
