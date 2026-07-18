<?php

use App\Http\Controllers\Api\Admin\CategoryController;
use App\Http\Controllers\Api\Admin\OrderController;
use App\Http\Controllers\Api\Admin\ProductController;
use App\Http\Controllers\Api\Admin\ProductImageController;
use App\Http\Controllers\Api\CartQuoteController;
use App\Http\Controllers\Api\CheckoutFieldsController;
use App\Http\Controllers\Api\GuestOrderController;
use App\Http\Controllers\Api\PublicSearchController;
use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health/live', [HealthController::class, 'live'])->middleware('throttle:30,1');
Route::get('/health/ready', [HealthController::class, 'ready'])->middleware('throttle:30,1');

Route::prefix('v1/public')->group(function (): void {
    Route::get('/search/suggestions', PublicSearchController::class)->middleware('throttle:60,1');
    Route::post('/cart/quote', CartQuoteController::class)->middleware('throttle:60,1');
    Route::get('/checkout-fields', CheckoutFieldsController::class)->middleware('throttle:30,1');
    Route::post('/orders', GuestOrderController::class)->middleware('throttle:5,10');
});

Route::prefix('v1/admin')->middleware(['auth:sanctum', 'can:catalog.manage'])->group(function (): void {
    Route::post('categories/reorder', [CategoryController::class, 'reorder']);
    Route::apiResource('categories', CategoryController::class);
    Route::apiResource('products', ProductController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
    Route::post('products/{product}/status', [ProductController::class, 'status']);
    Route::post('products/{product}/variant-mode', [ProductController::class, 'variantMode']);
    Route::put('products/{product}/variants', [ProductController::class, 'replaceVariants']);
    Route::post('products/{product}/images', [ProductImageController::class, 'store']);
    Route::post('products/{product}/images/reorder', [ProductImageController::class, 'reorder']);
    Route::patch('products/{product}/images/{image:public_id}', [ProductImageController::class, 'update']);
    Route::delete('products/{product}/images/{image:public_id}', [ProductImageController::class, 'destroy']);
    Route::get('orders', [OrderController::class, 'index']);
    Route::get('orders/{order}', [OrderController::class, 'show']);
    Route::post('orders/{order}/transitions', [OrderController::class, 'transition']);
    Route::post('orders/{order}/notes', [OrderController::class, 'storeNote']);
});
