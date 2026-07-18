import type { App } from 'vue';
import type { Router } from 'vue-router';
import * as Sentry from '@sentry/vue';

export function sanitizeFrontendSentryEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
    delete event.extra;
    delete event.request;
    delete event.user;

    return event;
}

export function configureSentry(app?: App, router?: Router): void {
    const dsn = import.meta.env.VITE_SENTRY_DSN;

    if (!dsn) return;

    Sentry.init({
        app,
        dsn,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
        release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
        sendDefaultPii: false,
        dataCollection: {
            userInfo: false,
            httpBodies: [],
        },
        enableLogs: false,
        tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || '0.1'),
        integrations: router ? [Sentry.browserTracingIntegration({ router })] : [],
        beforeBreadcrumb: (breadcrumb) => ({ ...breadcrumb, data: undefined }),
        beforeSend: sanitizeFrontendSentryEvent,
    });
}
