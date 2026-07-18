<?php

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health/live', [HealthController::class, 'live'])->middleware('throttle:30,1');
Route::get('/health/ready', [HealthController::class, 'ready'])->middleware('throttle:30,1');
