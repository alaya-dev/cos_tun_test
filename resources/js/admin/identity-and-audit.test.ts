import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('identity and audit modules', () => {
    it('uses French labels and safe fields', () => {
        const users = readFileSync('resources/js/admin/users.ts', 'utf8');
        const audit = readFileSync('resources/js/admin/audit-logs.ts', 'utf8');
        expect(users).toContain('Utilisateurs');
        expect(audit).toContain('Journal d’audit');
        expect(users).not.toMatch(/['"](password|token|address)['"]/i);
        expect(audit).not.toMatch(/['"](password|token|address)['"]/i);
    });
});
