import { createApp } from 'vue';
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
        };
    },
    template: `<div class="admin-shell">
      <aside>
        <a class="admin-brand" href="/admin">PASSION<br><small>COSMETIC · ADMIN</small></a>
        <nav aria-label="Navigation principale">
          <RouterLink to="/products">Produits</RouterLink>
          <RouterLink to="/categories">Catégories</RouterLink>
          <RouterLink to="/orders">Commandes</RouterLink>
          <RouterLink to="/inventory">Inventaire</RouterLink>
        </nav>
        <footer class="admin-profile"><span>Administration</span><button class="text-link" type="button" @click="logout">Déconnexion</button></footer>
      </aside>
      <main><div class="admin-topbar"><span>Passion Cosmetic</span><small>Back-office sécurisé</small></div><RouterView v-slot="{ Component }"><Transition name="admin-page" mode="out-in"><component :is="Component" /></Transition></RouterView></main>
      <TransitionGroup name="admin-toast" tag="aside" class="admin-toast-stack" aria-live="polite" aria-relevant="additions">
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
          <footer><button class="admin-action" type="button" autofocus @click="dismissError">Compris</button></footer>
        </section>
      </div></Transition>
      <Transition name="admin-overlay"><div v-if="confirmationDialog" class="admin-overlay" role="presentation" @click.self="resolveConfirmation(false)">
        <section class="admin-feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-confirmation-title" aria-describedby="admin-confirmation-message">
          <span class="admin-dialog-mark" :class="confirmationDialog.tone === 'danger' ? 'is-error' : 'is-warning'" aria-hidden="true">!</span>
          <div><p class="admin-eyebrow">Confirmation</p><h2 id="admin-confirmation-title">{{ confirmationDialog.title }}</h2><p id="admin-confirmation-message">{{ confirmationDialog.message }}</p></div>
          <footer><button class="text-link" type="button" autofocus @click="resolveConfirmation(false)">Annuler</button><button class="admin-action" :class="{ 'danger-button': confirmationDialog.tone === 'danger' }" type="button" @click="resolveConfirmation(true)">{{ confirmationDialog.confirmLabel }}</button></footer>
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
    ],
});

createApp(Shell).use(createPinia()).use(router).mount('#admin-app');
