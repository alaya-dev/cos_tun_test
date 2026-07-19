import { onMounted, ref, type Component } from 'vue';

type AuditLog = { public_id: string; action: string; actor_role_snapshot?: string; created_at: string };

const AuditLogsView: Component = {
    setup() {
        const logs = ref<AuditLog[]>([]);
        const error = ref('');
        onMounted(async () => {
            try {
                const response = await fetch('/api/v1/admin/audit-logs', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
                if (!response.ok) throw new Error('Accès refusé.');
                logs.value = (await response.json()).data.data;
            } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Erreur de chargement.'; }
        });
        return { logs, error };
    },
    template: '<section class="admin-page"><p class="admin-eyebrow">Traçabilité</p><h1>Journal d’audit</h1><p v-if="error" role="alert">{{ error }}</p><table v-else><thead><tr><th>Action</th><th>Rôle</th><th>Date</th></tr></thead><tbody><tr v-for="log in logs" :key="log.public_id"><td>{{ log.action }}</td><td>{{ log.actor_role_snapshot }}</td><td>{{ log.created_at }}</td></tr></tbody></table></section>',
};

export default AuditLogsView;
