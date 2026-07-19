import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    dismissError,
    dismissToast,
    feedbackState,
    resolveConfirmation,
    showError,
    showToast,
    confirmAction,
} from './feedback';

describe('admin operational modules', () => {
    it('exports the catalogue, inventory, order list, and order detail views', () => {
        for (const file of ['products', 'inventory', 'orders', 'order-detail', 'select-control', 'users', 'audit-logs']) {
            const source = readFileSync(`resources/js/admin/${file}.ts`, 'utf8');
            expect(source).toMatch(/export (default|const)/);
        }
    });

    it('manages feedback state through shared dialogs and toasts', async () => {
        showToast('success', 'Produit enregistré.');
        expect(feedbackState.toasts.value).toHaveLength(1);
        dismissToast(feedbackState.toasts.value[0].id);
        expect(feedbackState.toasts.value).toHaveLength(0);

        showError('Le produit doit avoir un nom.');
        expect(feedbackState.errorDialog.value?.message).toBe('Le produit doit avoir un nom.');
        dismissError();
        expect(feedbackState.errorDialog.value).toBeNull();

        const confirmation = confirmAction('Supprimer ?', 'Cette action est définitive.', 'Supprimer', 'danger');
        resolveConfirmation(true);
        await expect(confirmation).resolves.toBe(true);
    });
});
