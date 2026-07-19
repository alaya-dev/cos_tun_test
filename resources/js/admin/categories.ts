import { onMounted, ref, type Component } from 'vue';
import { RouterLink } from 'vue-router';
import { confirmAction, showError, showToast } from './feedback';
import SelectControl from './select-control';

type Category = {
    public_id: string;
    name: string;
    slug: string;
    description?: string | null;
    image_url?: string | null;
    is_active: boolean;
    sort_order: number;
    products_count: number;
};
type Page<T> = { data: T[] };
const csrf = () =>
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
        ?.content || '';

async function jsonApi<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`/api/v1/admin/${path}`, {
        method,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            ...(method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrf() }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(failure?.message || 'Opération impossible.');
    }
    return response.json() as Promise<T>;
}

const CategoriesView: Component = {
    components: { RouterLink, SelectControl },
    setup() {
        const rows = ref<Category[]>([]);
        const loading = ref(true);
        const saving = ref(false);
        const search = ref('');
        const active = ref('');
        const activeOptions = [{ value: '', label: 'Tous les états' }, { value: 'true', label: 'Visible' }, { value: 'false', label: 'Masquée' }];
        const editing = ref<Category | 'new' | null>(null);
        const imageFile = ref<File | null>(null);
        const form = ref({ name: '', slug: '', description: '', is_active: true });

        const load = async () => {
            loading.value = true;
            try {
                const query = new URLSearchParams({ per_page: '100' });
                if (search.value) query.set('search', search.value);
                if (active.value) query.set('is_active', active.value === 'true' ? '1' : '0');
                rows.value = (await jsonApi<{ data: Page<Category> }>(`categories?${query}`)).data.data;
            } catch (cause) {
                showError(cause instanceof Error ? cause.message : 'Erreur de chargement.');
            } finally {
                loading.value = false;
            }
        };
        let timer: number | undefined;
        const queueSearch = () => {
            window.clearTimeout(timer);
            timer = window.setTimeout(load, 280);
        };
        const open = (category?: Category) => {
            imageFile.value = null;
            editing.value = category || 'new';
            form.value = category
                ? { name: category.name, slug: category.slug, description: category.description || '', is_active: category.is_active }
                : { name: '', slug: '', description: '', is_active: true };
        };
        const selectImage = (event: Event) => {
            imageFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
        };
        const uploadImage = async (publicId: string) => {
            if (!imageFile.value) return;
            const body = new FormData();
            body.append('image', imageFile.value);
            const response = await fetch(`/api/v1/admin/categories/${publicId}/image`, {
                method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json', 'X-CSRF-TOKEN': csrf() }, body,
            });
            if (!response.ok) throw new Error('L’image de la catégorie n’a pas pu être traitée.');
        };
        const save = async () => {
            if (!form.value.name.trim()) return showError('Le nom de la catégorie est obligatoire.');
            const existing = typeof editing.value === 'object' ? editing.value : null;
            saving.value = true;
            try {
                const saved = await jsonApi<{ data: Category }>(existing ? `categories/${existing.public_id}` : 'categories', existing ? 'PATCH' : 'POST', {
                    ...form.value, sort_order: existing?.sort_order ?? rows.value.length,
                });
                await uploadImage(saved.data.public_id);
                showToast('success', existing ? 'Catégorie mise à jour.' : 'Catégorie créée.');
                editing.value = null;
                await load();
            } catch (cause) {
                showError(cause instanceof Error ? cause.message : 'Enregistrement impossible.');
            } finally {
                saving.value = false;
            }
        };
        const remove = async (category: Category) => {
            if (category.products_count) return showError(`Cette catégorie contient ${category.products_count} produit(s). Réaffectez-les avant de continuer.`);
            if (!await confirmAction('Supprimer cette catégorie ?', `« ${category.name} » sera supprimée définitivement.`, 'Supprimer', 'danger')) return;
            try {
                await jsonApi(`categories/${category.public_id}`, 'DELETE');
                showToast('success', 'Catégorie supprimée.');
                await load();
            } catch (cause) {
                showError(cause instanceof Error ? cause.message : 'Suppression impossible.');
            }
        };
        onMounted(load);
        return { rows, loading, saving, search, active, activeOptions, editing, form, load, queueSearch, open, selectImage, save, remove };
    },
    template: `<section class="admin-page">
      <header><div><p class="admin-eyebrow">Catalogue / Catégories</p><h1>Catégories</h1><p class="admin-subtitle">Organisez la navigation et la découverte dans la boutique.</p></div><button class="admin-action" @click="open()">Nouvelle catégorie</button></header>
      <div class="admin-filter-bar"><label class="admin-search"><span class="sr-only">Rechercher une catégorie</span><input v-model.trim="search" @input="queueSearch" placeholder="Rechercher une catégorie…"></label><SelectControl v-model="active" :options="activeOptions" @change="load" /></div>
      <form v-if="editing !== null" class="category-form" @submit.prevent="save"><header><div><p class="admin-eyebrow">{{ editing.public_id ? 'Modifier' : 'Nouvelle' }}</p><h2>{{ editing.public_id ? editing.name : 'Créer une catégorie' }}</h2></div><button class="text-link" type="button" @click="editing = null">Fermer</button></header><div class="form-grid"><label>Nom <b aria-hidden="true">*</b><input v-model.trim="form.name" required></label><label>Slug<input v-model.trim="form.slug"></label><label class="inline-check">Visible dans la boutique <input v-model="form.is_active" type="checkbox"></label><label class="full">Description<textarea v-model="form.description"></textarea></label><label class="full">Image circulaire<input type="file" accept="image/jpeg,image/png,image/webp" @change="selectImage"><small>JPEG, PNG ou WebP. L’image est sécurisée et réencodée.</small></label><img v-if="editing.image_url" class="admin-image-preview" :src="editing.image_url" :alt="'Aperçu de ' + editing.name"></div><footer><button class="text-link" type="button" @click="editing = null">Annuler</button><button class="admin-action" :disabled="saving">{{ saving ? 'Traitement et enregistrement…' : 'Enregistrer' }}</button></footer></form>
      <p v-if="loading" class="admin-loading">Chargement des catégories…</p><p v-else-if="!rows.length" class="admin-empty">Aucune catégorie ne correspond à ces critères.</p>
      <div v-else class="admin-table categories-table"><div class="admin-table-head"><span>Catégorie</span><span>Produits</span><span>Statut</span><span>Actions</span></div><article v-for="category in rows" :key="category.public_id"><div><img v-if="category.image_url" class="admin-category-thumb" :src="category.image_url" alt=""><strong>{{ category.name }}</strong><small>{{ category.slug }}</small></div><span>{{ category.products_count }}</span><span :class="category.is_active ? 'admin-badge is-published' : 'admin-badge'">{{ category.is_active ? 'Visible' : 'Masquée' }}</span><span><button class="text-link" @click="open(category)">Modifier</button><RouterLink v-if="category.products_count" class="text-link" :to="{ path: '/products', query: { category_id: category.public_id } }">Voir produits</RouterLink><button v-else class="text-link danger" @click="remove(category)">Supprimer</button></span></article></div>
    </section>`,
};
export default CategoriesView;
