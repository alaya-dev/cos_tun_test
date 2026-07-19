import { createApp, nextTick, onMounted, reactive, ref } from 'vue';
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
import AdminNotFoundView from './not-found';
import {
    dismissError,
    dismissToast,
    feedbackState,
    resolveConfirmation,
    showError,
    showToast,
} from './feedback';

const Shell = {
    components: { RouterLink, RouterView },
    setup() {
        const role = ref('');
        const passwordModalOpen = ref(false);
        const passwordSaving = ref(false);
        const passwordError = ref('');
        const passwordForm = reactive({ current_password: '', password: '', password_confirmation: '' });
        const passwordDialog = ref<HTMLElement | null>(null);
        const passwordTrigger = ref<HTMLElement | null>(null);
        const adminNavigationOpen = ref(false);
        const adminNavigation = ref<HTMLElement | null>(null);
        const adminNavigationTrigger = ref<HTMLElement | null>(null);
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
        const openPasswordModal = async (event: MouseEvent) => {
            passwordTrigger.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
            Object.assign(passwordForm, { current_password: '', password: '', password_confirmation: '' });
            passwordError.value = '';
            passwordModalOpen.value = true;
            await nextTick();
            passwordDialog.value?.querySelector<HTMLInputElement>('input')?.focus();
        };
        const closePasswordModal = async () => {
            if (passwordSaving.value) return;
            passwordModalOpen.value = false;
            await nextTick();
            passwordTrigger.value?.focus();
        };
        const keepPasswordFocus = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { void closePasswordModal(); return; }
            if (event.key !== 'Tab' || !passwordDialog.value) return;
            const focusable = [...passwordDialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)')];
            const first = focusable[0]; const last = focusable.at(-1);
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        const openAdminNavigation = async (event: MouseEvent) => {
            adminNavigationTrigger.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
            adminNavigationOpen.value = true;
            await nextTick();
            adminNavigation.value?.querySelector<HTMLElement>('a')?.focus();
        };
        const closeAdminNavigation = async () => {
            adminNavigationOpen.value = false;
            await nextTick();
            adminNavigationTrigger.value?.focus();
        };
        const keepAdminNavigationFocus = (event: KeyboardEvent) => {
            if (event.key === 'Escape') { void closeAdminNavigation(); return; }
            if (event.key !== 'Tab' || !adminNavigation.value) return;
            const focusable = [...adminNavigation.value.querySelectorAll<HTMLElement>('a, button:not(:disabled)')];
            const first = focusable[0]; const last = focusable.at(-1);
            if (!first || !last) return;
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        };
        const changePassword = async () => {
            passwordSaving.value = true;
            passwordError.value = '';
            const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content || '';
            try {
                const response = await fetch('/api/v1/admin/me/password', {
                    method: 'POST', credentials: 'same-origin',
                    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-TOKEN': csrfToken },
                    body: JSON.stringify(passwordForm),
                });
                if (!response.ok) {
                    const failure = await response.json().catch(() => null) as { message?: string; errors?: Record<string, string[]> } | null;
                    throw new Error(failure?.errors ? Object.values(failure.errors).flat().join(' ') : failure?.message || 'La modification du mot de passe a échoué.');
                }
                passwordModalOpen.value = false;
                Object.assign(passwordForm, { current_password: '', password: '', password_confirmation: '' });
                showToast('success', 'Votre mot de passe a été mis à jour.');
            } catch (cause) {
                passwordError.value = cause instanceof Error ? cause.message : 'La modification du mot de passe a échoué.';
            } finally {
                passwordSaving.value = false;
            }
        };

        return {
            ...feedbackState,
            dismissError,
            dismissToast,
            logout,
            openPasswordModal,
            closePasswordModal,
            changePassword,
            passwordModalOpen,
            passwordSaving,
            passwordError,
            passwordForm,
            passwordDialog,
            adminNavigationOpen,
            adminNavigation,
            resolveConfirmation,
            keepPasswordFocus,
            openAdminNavigation,
            closeAdminNavigation,
            keepAdminNavigationFocus,
            role,
        };
    },
    template: `<div class="admin-shell">
      <aside class="admin-sidebar">
        <a class="admin-brand" href="/admin">PASSION<br><small>COSMETIC · ADMIN</small></a>
        <button class="admin-menu-button" type="button" aria-label="Ouvrir la navigation" :aria-expanded="adminNavigationOpen" @click="openAdminNavigation($event)"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>Menu</span></button>
        <nav ref="adminNavigation" :class="{ 'is-open': adminNavigationOpen }" aria-label="Navigation principale" @keydown="keepAdminNavigationFocus" @click="adminNavigationOpen && closeAdminNavigation()">
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
        <footer class="admin-profile"><span>Administration</span><button class="text-link" type="button" @click="openPasswordModal($event)">Mot de passe</button><button class="text-link" type="button" @click="logout">Déconnexion</button></footer>
      </aside>
      <button v-if="adminNavigationOpen" class="admin-navigation-backdrop" type="button" aria-label="Fermer la navigation" @click="closeAdminNavigation"></button>
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
      <Transition name="admin-overlay"><div v-if="passwordModalOpen" class="admin-overlay" role="presentation" @click.self="closePasswordModal">
        <section ref="passwordDialog" class="admin-password-dialog" role="dialog" aria-modal="true" aria-labelledby="password-modal-title" aria-describedby="password-modal-description" @keydown="keepPasswordFocus">
          <header><div><p class="admin-eyebrow">Sécurité du compte</p><h2 id="password-modal-title">Modifier mon mot de passe</h2><p id="password-modal-description">Pour votre sécurité, votre mot de passe actuel est requis, y compris pour les Super Admins.</p></div><button class="admin-dialog-close" type="button" aria-label="Fermer" :disabled="passwordSaving" @click="closePasswordModal">×</button></header>
          <form @submit.prevent="changePassword"><p v-if="passwordError" class="page-error" role="alert">{{ passwordError }}</p><label>Mot de passe actuel<input v-model="passwordForm.current_password" type="password" autocomplete="current-password" required></label><label>Nouveau mot de passe<input v-model="passwordForm.password" type="password" autocomplete="new-password" minlength="8" required><small>8 caractères minimum.</small></label><label>Confirmer le nouveau mot de passe<input v-model="passwordForm.password_confirmation" type="password" autocomplete="new-password" minlength="8" required></label><footer><button class="text-link" type="button" :disabled="passwordSaving" @click="closePasswordModal">Annuler</button><button class="admin-action" :disabled="passwordSaving">{{ passwordSaving ? 'Enregistrement…' : 'Mettre à jour' }}</button></footer></form>
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
        { path: '/:pathMatch(.*)*', component: AdminNotFoundView },
    ],
});

const app = createApp(Shell);

app.use(createPinia()).use(router).mount('#admin-app');
