import { createApp, onMounted, ref } from 'vue';
import { createPinia } from 'pinia';
import {
    createRouter,
    createWebHistory,
    RouterLink,
    RouterView,
} from 'vue-router';
import CategoriesView from './categories';
import InventoryView from './inventory';
import OrderDetailView from './order-detail';
import OrdersView from './orders';
import ProductEditorView from './product-editor';
import ProductsView from './products';
import UsersView from './users';
import AuditLogsView from './audit-logs';
import {
    dismissError,
    dismissToast,
    feedbackState,
    resolveConfirmation,
    showError,
} from './feedback';

const Shell = {
    components: { RouterLink, RouterView },
    setup() {
        const role = ref('');
        onMounted(async () => {
            const response = await fetch('/api/v1/admin/me', {
                credentials: 'same-origin',
                headers: { Accept: 'application/json' },
            });
            if (response.ok) {
                role.value = ((await response.json()) as { data: { role: string } }).data.role;
            }
        });
        const logout = async () => {
            const csrfToken =
                document.querySelector<HTMLMetaElement>(
                    'meta[name="csrf-token"]',
                )?.content || '';
            try {
                const response = await fetch('/admin/logout', {
                    method: 'POST',
                    credentials: 'same-origin',
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        Accept: 'application/json',
                    },
                });
                if (!response.ok) throw new Error('Déconnexion impossible. Réessayez dans un instant.');
                window.location.assign('/admin/login');
            } catch (cause) {
                showError(cause instanceof Error ? cause.message : 'Déconnexion impossible.');
            }
        };

        return {
            ...feedbackState,
            dismissError,
            dismissToast,
            logout,
            resolveConfirmation,
            role,
        };
    },
    template: `<div class="admin-shell">
      <aside class="admin-sidebar">
        <a class="admin-brand" href="/admin">PASSION<br><small>COSMETIC · ADMIN</small></a>
        <nav aria-label="Navigation principale">
          <RouterLink to="/products" aria-label="Produits"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg><span>Produits</span></RouterLink>
          <RouterLink to="/categories" aria-label="Catégories"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 12V5h7l9 9-7 7-9-9Z"/><path d="M8 8h.01"/></svg><span>Catégories</span></RouterLink>
          <RouterLink to="/orders" aria-label="Commandes"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 7h12l1 13H5L6 7Z"/><path d="M9 8V5a3 3 0 0 1 6 0v3"/></svg><span>Commandes</span></RouterLink>
          <RouterLink to="/inventory" aria-label="Inventaire"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 8 9-5 9 5v9l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v9"/></svg><span>Inventaire</span></RouterLink>
          <RouterLink to="/complaints" aria-label="Réclamations"><span>Réclamations</span></RouterLink>
          <RouterLink v-if="role === 'super_admin'" to="/promotions"><span>Promotions</span></RouterLink>
          <RouterLink v-if="role === 'super_admin'" to="/shipping"><span>Livraison</span></RouterLink>
          <RouterLink v-if="role === 'super_admin'" to="/checkout-fields"><span>Champs commande</span></RouterLink>
          <RouterLink v-if="role === 'super_admin'" to="/content"><span>Contenu</span></RouterLink>
          <RouterLink v-if="role === 'super_admin'" to="/static-pages"><span>Pages</span></RouterLink>
          <RouterLink v-if="role === 'super_admin'" to="/users" aria-label="Utilisateurs"><span>Utilisateurs</span></RouterLink>
          <RouterLink v-if="role === 'super_admin'" to="/audit-logs" aria-label="Journal d’audit"><span>Journal d’audit</span></RouterLink>
        </nav>
        <footer class="admin-profile"><span>Administration</span><button class="text-link" type="button" @click="logout">Déconnexion</button></footer>
      </aside>
      <main><div class="admin-topbar"><span>Passion Cosmetic</span><small>Back-office sécurisé</small></div><RouterView v-slot="{ Component }"><Transition name="admin-page" mode="out-in"><component :is="Component" /></Transition></RouterView></main>
      <TransitionGroup name="admin-toast" tag="div" class="admin-toast-stack" aria-live="polite" aria-relevant="additions">
        <article v-for="toast in toasts" :key="toast.id" class="admin-toast" :class="'is-' + toast.tone" role="status">
          <span class="admin-toast-mark" aria-hidden="true">{{ toast.tone === 'success' ? '✓' : toast.tone === 'info' ? 'i' : '!' }}</span>
          <p>{{ toast.message }}</p>
          <button type="button" :aria-label="'Fermer la notification'" @click="dismissToast(toast.id)">×</button>
        </article>
      </TransitionGroup>
      <Transition name="admin-overlay"><div v-if="errorDialog" class="admin-overlay" role="presentation" @click.self="dismissError">
        <section class="admin-feedback-dialog" role="alertdialog" aria-modal="true" aria-labelledby="admin-error-title" aria-describedby="admin-error-message">
          <span class="admin-dialog-mark is-error" aria-hidden="true">!</span>
          <div><p class="admin-eyebrow">Action requise</p><h2 id="admin-error-title">{{ errorDialog.title }}</h2><p id="admin-error-message">{{ errorDialog.message }}</p></div>
          <footer><button class="admin-action" type="button" @click="dismissError">Compris</button></footer>
        </section>
      </div></Transition>
      <Transition name="admin-overlay"><div v-if="confirmationDialog" class="admin-overlay" role="presentation" @click.self="resolveConfirmation(false)">
        <section class="admin-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-confirmation-title" aria-describedby="admin-confirmation-message">
          <span class="admin-dialog-mark" :class="confirmationDialog.tone === 'danger' ? 'is-error' : 'is-warning'" aria-hidden="true">!</span>
          <div><p class="admin-eyebrow">Confirmation</p><h2 id="admin-confirmation-title">{{ confirmationDialog.title }}</h2><p id="admin-confirmation-message">{{ confirmationDialog.message }}</p></div>
          <footer><button class="text-link" type="button" @click="resolveConfirmation(false)">Annuler</button><button class="admin-action" :class="{ 'danger-button': confirmationDialog.tone === 'danger' }" type="button" @click="resolveConfirmation(true)">{{ confirmationDialog.confirmLabel }}</button></footer>
        </section>
      </div></Transition>
    </div>`,
};

const router = createRouter({
    history: createWebHistory('/admin'),
    routes: [
        { path: '/', redirect: '/products' },
        { path: '/products', component: ProductsView },
        { path: '/products/new', component: ProductEditorView },
        { path: '/products/:reference', component: ProductEditorView },
        { path: '/categories', component: CategoriesView },
        { path: '/orders', component: OrdersView },
        { path: '/orders/:reference', component: OrderDetailView },
        { path: '/inventory', component: InventoryView },
        { path: '/complaints', component: () => import('./complaints').then((module) => module.ComplaintsView) },
        { path: '/complaints/:reference', component: () => import('./complaints').then((module) => module.ComplaintDetailView) },
        { path: '/promotions', component: () => import('./promotions') },
        { path: '/shipping', component: () => import('./shipping-settings') },
        { path: '/checkout-fields', component: () => import('./checkout-fields') },
        { path: '/content', component: () => import('./content') },
        { path: '/static-pages', component: () => import('./static-pages') },
        { path: '/users', component: UsersView },
        { path: '/audit-logs', component: AuditLogsView },
    ],
});

const app = createApp(Shell);

app.use(createPinia()).use(router).mount('#admin-app');
