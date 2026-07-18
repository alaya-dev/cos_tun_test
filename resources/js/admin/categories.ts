import { onMounted, ref, type Component } from 'vue';
import { RouterLink } from 'vue-router';
import { confirmAction, showError, showToast } from './feedback';

type Category = {
    public_id: string;
    name: string;
    slug: string;
    description?: string | null;
    is_active: boolean;
    sort_order: number;
    products_count: number;
    seo_title?: string | null;
    seo_description?: string | null;
};
type Page<T> = { data: T[] };
const csrf = () =>
    document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
        ?.content || '';
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
            ...(method === 'GET'
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
        } | null;
        throw new Error(data?.message || 'Opération impossible.');
    }
    return response.json() as Promise<T>;
}

const CategoriesView: Component = {
    components: { RouterLink },
    setup() {
        const rows = ref<Category[]>([]);
        const loading = ref(true);
        const saving = ref(false);
        const error = ref('');
        const notice = ref('');
        const search = ref('');
        const active = ref('');
        const editing = ref<Category | 'new' | null>(null);
        const form = ref({
            name: '',
            slug: '',
            description: '',
            is_active: true,
            seo_title: '',
            seo_description: '',
        });
        const load = async () => {
            loading.value = true;
            try {
                const query = new URLSearchParams({ per_page: '100' });
                if (search.value) query.set('search', search.value);
                if (active.value)
                    query.set('is_active', active.value === 'true' ? '1' : '0');
                rows.value = (
                    await api<{ data: Page<Category> }>(`categories?${query}`)
                ).data.data;
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
        const open = (item?: Category) => {
            editing.value = item || 'new';
            form.value = item
                ? {
                      name: item.name,
                      slug: item.slug,
                      description: item.description || '',
                      is_active: item.is_active,
                      seo_title: item.seo_title || '',
                      seo_description: item.seo_description || '',
                  }
                : {
                      name: '',
                      slug: '',
                      description: '',
                      is_active: true,
                      seo_title: '',
                      seo_description: '',
                  };
        };
        const save = async () => {
            if (!form.value.name.trim()) {
                showError('Le nom de la catégorie est obligatoire.');
                return;
            }
            const existing =
                typeof editing.value === 'object' ? editing.value : null;
            saving.value = true;
            try {
                await api(
                    existing
                        ? `categories/${existing.public_id}`
                        : 'categories',
                    existing ? 'PATCH' : 'POST',
                    {
                        ...form.value,
                        sort_order: existing?.sort_order ?? rows.value.length,
                    },
                );
                showToast('success', existing ? 'Catégorie mise à jour.' : 'Catégorie créée.');
                editing.value = null;
                await load();
            } catch (cause) {
                showError(cause instanceof Error ? cause.message : 'Enregistrement impossible.');
            } finally {
                saving.value = false;
            }
        };
        const remove = async (item: Category) => {
            if (item.products_count) {
                showError(`Cette catégorie contient ${item.products_count} produit(s). Utilisez « Voir produits » pour les réaffecter ou les archiver.`);
                return;
            }
            const confirmed = await confirmAction('Supprimer cette catégorie ?', `« ${item.name} » sera supprimée définitivement.`, 'Supprimer', 'danger');
            if (!confirmed) return;
            try {
                await api(`categories/${item.public_id}`, 'DELETE');
                showToast('success', 'Catégorie supprimée.');
                await load();
            } catch (cause) {
                showError(cause instanceof Error ? cause.message : 'Suppression impossible.');
            }
        };
        onMounted(load);
        return {
            rows,
            loading,
            saving,
            error,
            notice,
            search,
            active,
            editing,
            form,
            load,
            queueSearch,
            open,
            save,
            remove,
        };
    },
    template:
        '<section class="admin-page"><header><div><p class="admin-eyebrow">Catalogue / Catégories</p><h1>Catégories</h1><p class="admin-subtitle">Organisez la navigation et la découverte dans la boutique.</p></div><button class="admin-action" @click="open()">Nouvelle catégorie</button></header><p v-if="error" class="admin-alert" role="alert">{{ error }}</p><p v-if="notice" class="admin-notice" role="status">{{ notice }}</p><div class="admin-filter-bar"><label class="admin-search"><span class="sr-only">Rechercher une catégorie</span><input v-model.trim="search" @input="queueSearch" placeholder="Rechercher une catégorie…"></label><select v-model="active" @change="load"><option value="">Tous les états</option><option value="true">Visible</option><option value="false">Masquée</option></select></div><form v-if="editing !== null" class="category-form" @submit.prevent="save"><header><div><p class="admin-eyebrow">{{ editing.public_id ? \'Modifier\' : \'Nouvelle\' }}</p><h2>{{ editing.public_id ? editing.name : \'Créer une catégorie\' }}</h2></div><button class="text-link" type="button" @click="editing = null">Fermer</button></header><div class="form-grid"><label>Nom <b aria-hidden="true">*</b><input v-model.trim="form.name" required></label><label>Slug<input v-model.trim="form.slug"><small>Mot court utilisé dans l’adresse de la catégorie, par exemple « soins-corps ».</small></label><label class="inline-check">Visible dans la boutique <input v-model="form.is_active" type="checkbox"></label><label class="full">Description<textarea v-model="form.description"></textarea></label></div><footer><button class="text-link" type="button" @click="editing = null">Annuler</button><button class="admin-action" :disabled="saving">{{ saving ? \'Enregistrement…\' : \'Enregistrer\' }}</button></footer></form><p v-if="loading" class="admin-loading">Chargement des catégories…</p><p v-else-if="!rows.length" class="admin-empty">Aucune catégorie ne correspond à ces critères.</p><div v-else class="admin-table categories-table"><div class="admin-table-head"><span>Catégorie</span><span>Produits</span><span>Statut</span><span>Actions</span></div><article v-for="category in rows" :key="category.public_id"><div><strong>{{ category.name }}</strong><small>{{ category.slug }}</small></div><span>{{ category.products_count }}</span><span :class="category.is_active ? \'admin-badge is-published\' : \'admin-badge\'">{{ category.is_active ? \'Visible\' : \'Masquée\' }}</span><span><button class="text-link" @click="open(category)">Modifier</button><RouterLink v-if="category.products_count" class="text-link" :to="{ path: \'/products\', query: { category_id: category.public_id } }">Voir produits</RouterLink><button v-else class="text-link danger" @click="remove(category)">Supprimer</button></span></article></div></section>',
};
export default CategoriesView;
