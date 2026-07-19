<?php

use App\Http\Controllers\Api\Admin\AuditLogController;
use App\Http\Controllers\Api\Admin\CategoryController;
use App\Http\Controllers\Api\Admin\CurrentUserController;
use App\Http\Controllers\Api\Admin\InventoryController;
use App\Http\Controllers\Api\Admin\OrderController;
use App\Http\Controllers\Api\Admin\PasswordController;
use App\Http\Controllers\Api\Admin\ProductController;
use App\Http\Controllers\Api\Admin\ProductImageController;
use App\Http\Controllers\Api\Admin\UserController;
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

Route::prefix('v1/admin')->middleware(['web', 'auth', 'can:catalog.manage'])->group(function (): void {
    Route::post('categories/reorder', [CategoryController::class, 'reorder']);
    Route::apiResource('categories', CategoryController::class);
    Route::apiResource('products', ProductController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
    Route::post('products/{product}/status', [ProductController::class, 'status']);
    Route::post('products/bulk-status', [ProductController::class, 'bulkStatus']);
    Route::post('products/bulk-archive', [ProductController::class, 'bulkArchive']);
    Route::post('products/bulk-restore', [ProductController::class, 'bulkRestore']);
    Route::post('products/bulk-force-delete', [ProductController::class, 'bulkForceDelete']);
    Route::post('products/{product}/variant-mode', [ProductController::class, 'variantMode']);
    Route::put('products/{product}/variants', [ProductController::class, 'replaceVariants']);
    Route::post('products/{product}/images', [ProductImageController::class, 'store'])->middleware('throttle:media-upload');
    Route::get('inventory/movements', [InventoryController::class, 'index']);
    Route::post('products/{product}/inventory-adjustments', [InventoryController::class, 'adjust']);
    Route::post('products/{product}/images/reorder', [ProductImageController::class, 'reorder']);
    Route::patch('products/{product}/images/{image:public_id}', [ProductImageController::class, 'update']);
    Route::delete('products/{product}/images/{image:public_id}', [ProductImageController::class, 'destroy']);
    Route::get('orders', [OrderController::class, 'index']);
    Route::get('orders/export', [OrderController::class, 'export']);
    Route::get('orders/{order}', [OrderController::class, 'show']);
    Route::patch('orders/{order}', [OrderController::class, 'update']);
    Route::put('orders/{order}/items', [OrderController::class, 'updateItems']);
    Route::post('orders/{order}/transitions', [OrderController::class, 'transition']);
    Route::post('orders/{order}/notes', [OrderController::class, 'storeNote']);
    Route::post('orders/bulk-archive', [OrderController::class, 'bulkArchive']);
    Route::post('orders/bulk-restore', [OrderController::class, 'bulkRestore']);
    Route::post('orders/bulk-transition', [OrderController::class, 'bulkTransition']);
});

Route::prefix('v1/admin')->middleware(['web', 'auth'])->group(function (): void {
    Route::get('me', [CurrentUserController::class, 'show']);
    Route::post('me/password', [PasswordController::class, 'update']);
});

Route::prefix('v1/admin')->middleware(['web', 'auth', 'can:users.manage'])->group(function (): void {
    Route::apiResource('users', UserController::class)->only(['index', 'store', 'show', 'update', 'destroy']);
});

Route::prefix('v1/admin')->middleware(['web', 'auth', 'can:users.manage'])->group(function (): void {
    Route::apiResource('audit-logs', AuditLogController::class)->only(['index', 'show']);
});
