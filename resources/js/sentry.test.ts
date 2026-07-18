import { describe, expect, it } from 'vitest';
import type { ErrorEvent } from '@sentry/vue';
import { sanitizeFrontendSentryEvent } from './sentry';

describe('frontend Sentry sanitization', () => {
    it('removes user, request, and extra payloads', () => {
        const event = sanitizeFrontendSentryEvent({
            extra: { phone: '22123456' },
            request: { data: { customer: 'Ada' } },
            type: undefined,
            user: { email: 'ada@example.test' },
        } as ErrorEvent);

        expect(event.extra).toBeUndefined();
        expect(event.request).toBeUndefined();
        expect(event.user).toBeUndefined();
    });
});
