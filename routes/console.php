<?php

use App\Domain\Checkout\Actions\PruneExpiredCheckoutIdempotencyRecordsAction;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('checkout-idempotency:prune-expired', function () {
    $deleted = app(PruneExpiredCheckoutIdempotencyRecordsAction::class)->handle();
    $this->components->info("Removed {$deleted} expired checkout idempotency records.");
})->purpose('Prune expired checkout idempotency records');

Schedule::command('checkout-idempotency:prune-expired')->daily()->withoutOverlapping()->onOneServer();
Schedule::command('queue:prune-failed --hours=168')->daily()->withoutOverlapping()->onOneServer();
