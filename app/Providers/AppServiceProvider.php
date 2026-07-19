<?php

namespace App\Providers;

use App\Policies\AuditLogPolicy;
use App\Policies\BackOfficeUserPolicy;
use App\Policies\CatalogPolicy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('media-upload', function (Request $request): Limit {
            return Limit::perMinute(20)->by((string) ($request->user()?->getAuthIdentifier() ?? $request->ip()));
        });
        Gate::define('catalog.manage', [CatalogPolicy::class, 'manage']);
        Gate::define('users.manage', [BackOfficeUserPolicy::class, 'manage']);
        Gate::define('audit.view', [AuditLogPolicy::class, 'viewAny']);
    }
}
