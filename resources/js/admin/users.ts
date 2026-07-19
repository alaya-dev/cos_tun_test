import { onMounted, ref, type Component } from 'vue';

type User = { public_id: string; name: string; email: string; role: string; is_active: boolean; force_password_change: boolean };

const UsersView: Component = {
    setup() {
        const users = ref<User[]>([]);
        const error = ref('');
        onMounted(async () => {
            try {
                const response = await fetch('/api/v1/admin/users', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error('Accès refusé.');
                users.value = (await response.json()).data;
            } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Erreur de chargement.'; }
        });
        return { users, error };
    },
    template: '<section class="admin-page"><p class="admin-eyebrow">Accès</p><h1>Utilisateurs</h1><p v-if="error" role="alert">{{ error }}</p><table v-else><thead><tr><th>Nom</th><th>Email</th><th>Rôle</th><th>État</th></tr></thead><tbody><tr v-for="user in users" :key="user.public_id"><td>{{ user.name }}</td><td>{{ user.email }}</td><td>{{ user.role }}</td><td>{{ user.is_active ? \'Actif\' : \'Inactif\' }}</td></tr></tbody></table></section>',
};

export default UsersView;
