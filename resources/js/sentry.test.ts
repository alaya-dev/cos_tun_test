import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ErrorEvent } from '@sentry/vue';
import * as Sentry from '@sentry/vue';
import { configureSentry, sanitizeFrontendSentryEvent } from './sentry';

vi.mock('@sentry/vue', () => ({
    init: vi.fn(),
    browserTracingIntegration: vi.fn(() => 'browser-tracing'),
}));

describe('frontend Sentry sanitization', () => {
    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

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

    it('does not initialize without a DSN', () => {
        vi.stubEnv('VITE_SENTRY_DSN', '');
        configureSentry();
        expect(Sentry.init).not.toHaveBeenCalled();
    });

    it('initializes without PII and strips breadcrumb data', () => {
        vi.stubEnv('VITE_SENTRY_DSN', 'https://public@example.test/1');
        vi.stubEnv('VITE_SENTRY_TRACES_SAMPLE_RATE', '0.2');
        const router = {} as Parameters<typeof configureSentry>[1];

        configureSentry(undefined, router);

        expect(Sentry.browserTracingIntegration).toHaveBeenCalledWith({ router });
        expect(Sentry.init).toHaveBeenCalledWith(expect.objectContaining({
            dsn: 'https://public@example.test/1',
            sendDefaultPii: false,
            tracesSampleRate: 0.2,
        }));
        const options = vi.mocked(Sentry.init).mock.calls[0][0]!;
        expect(options.beforeBreadcrumb?.({ message: 'chargement', data: { phone: '22123456' } }, {})).toEqual({
            message: 'chargement',
            data: undefined,
        });
        expect(options.beforeSend?.({ extra: { secret: true } } as unknown as ErrorEvent, {})).toEqual({});
    });
});
