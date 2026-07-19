<?php

use App\Http\Controllers\Api\Admin\AuditLogController;
use App\Http\Controllers\Api\Admin\CategoryController;
use App\Http\Controllers\Api\Admin\CategoryImageController;
use App\Http\Controllers\Api\Admin\CheckoutFieldController as AdminCheckoutFieldController;
use App\Http\Controllers\Api\Admin\ComplaintController;
use App\Http\Controllers\Api\Admin\CurrentUserController;
use App\Http\Controllers\Api\Admin\HeroSlideController;
use App\Http\Controllers\Api\Admin\HomepageItemController;
use App\Http\Controllers\Api\Admin\HomepageSectionController;
use App\Http\Controllers\Api\Admin\InventoryController;
use App\Http\Controllers\Api\Admin\OrderController;
use App\Http\Controllers\Api\Admin\PasswordController;
use App\Http\Controllers\Api\Admin\ProductController;
use App\Http\Controllers\Api\Admin\ProductImageController;
use App\Http\Controllers\Api\Admin\PromoCodeController;
use App\Http\Controllers\Api\Admin\SettingsController;
use App\Http\Controllers\Api\Admin\StaticPageController as AdminStaticPageController;
use App\Http\Controllers\Api\Admin\UserController;
use App\Http\Controllers\Api\CartQuoteController;
use App\Http\Controllers\Api\CheckoutFieldsController;
use App\Http\Controllers\Api\GuestOrderController;
use App\Http\Controllers\Api\PublicComplaintController;
use App\Http\Controllers\Api\PublicSearchController;
use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health/live', [HealthController::class, 'live'])->middleware('throttle:30,1');
Route::get('/health/ready', [HealthController::class, 'ready'])->middleware('throttle:30,1');

Route::prefix('v1/public')->group(function (): void {
    Route::get('/search/suggestions', PublicSearchController::class)->middleware('throttle:60,1');
    Route::post('/cart/quote', CartQuoteController::class)->middleware('throttle:60,1');
    Route::get('/checkout-fields', CheckoutFieldsController::class)->middleware('throttle:30,1');
    Route::post('/orders', GuestOrderController::class)->middleware('throttle:checkout-orders');
    Route::post('/complaints', PublicComplaintController::class)->middleware('throttle:complaints');
});

Route::prefix('v1/admin')->middleware(['web', 'auth', 'can:catalog.manage'])->group(function (): void {
    Route::post('categories/reorder', [CategoryController::class, 'reorder']);
    Route::apiResource('categories', CategoryController::class);
    Route::post('categories/{category}/image', [CategoryImageController::class, 'store'])->middleware('throttle:media-upload');
    Route::delete('categories/{category}/image', [CategoryImageController::class, 'destroy']);
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

Route::prefix('v1/admin')->middleware(['web', 'auth', 'can:complaints.manage'])->group(function (): void {
    Route::get('complaints', [ComplaintController::class, 'index']);
    Route::get('complaints/{complaint}', [ComplaintController::class, 'show']);
    Route::patch('complaints/{complaint}', [ComplaintController::class, 'update']);
    Route::post('complaints/{complaint}/transitions', [ComplaintController::class, 'transition']);
    Route::post('complaints/{complaint}/notes', [ComplaintController::class, 'note']);
    Route::get('complaints/{complaint}/attachment', [ComplaintController::class, 'attachment']);
});

Route::prefix('v1/admin')->middleware(['web', 'auth', 'can:store.manage'])->group(function (): void {
    Route::get('promo-codes', [PromoCodeController::class, 'index']);
    Route::post('promo-codes', [PromoCodeController::class, 'store']);
    Route::patch('promo-codes/{promoCode}', [PromoCodeController::class, 'update']);
    Route::post('promo-codes/{promoCode}/status', [PromoCodeController::class, 'status']);
    Route::delete('promo-codes/{promoCode}', [PromoCodeController::class, 'destroy']);
    Route::get('checkout-fields', [AdminCheckoutFieldController::class, 'index']);
    Route::post('checkout-fields', [AdminCheckoutFieldController::class, 'store']);
    Route::patch('checkout-fields/{checkoutField}', [AdminCheckoutFieldController::class, 'update']);
    Route::delete('checkout-fields/{checkoutField}', [AdminCheckoutFieldController::class, 'destroy']);
    Route::post('checkout-fields/reorder', [AdminCheckoutFieldController::class, 'reorder']);
    Route::get('settings/shipping', [SettingsController::class, 'shipping']);
    Route::patch('settings/shipping', [SettingsController::class, 'updateShipping']);
    Route::get('settings/store', [SettingsController::class, 'store']);
    Route::patch('settings/store', [SettingsController::class, 'updateStore']);
    Route::patch('settings/checkout', [SettingsController::class, 'updateCheckout']);
    Route::get('content/homepage-sections', [HomepageSectionController::class, 'index']);
    Route::post('content/homepage-sections', [HomepageSectionController::class, 'store']);
    Route::patch('content/homepage-sections/{homepageSection}', [HomepageSectionController::class, 'update']);
    Route::delete('content/homepage-sections/{homepageSection}', [HomepageSectionController::class, 'destroy']);
    Route::post('content/homepage-sections/reorder', [HomepageSectionController::class, 'reorder']);
    Route::get('content/banners', [HeroSlideController::class, 'index']);
    Route::post('content/banners/reorder', [HeroSlideController::class, 'reorder']);
    Route::post('content/banners', [HeroSlideController::class, 'store']);
    Route::post('content/banners/{heroSlide}', [HeroSlideController::class, 'update']);
    Route::delete('content/banners/{heroSlide}', [HeroSlideController::class, 'destroy']);
    Route::get('content/items/{contentType}', [HomepageItemController::class, 'index']);
    Route::post('content/items/{contentType}/reorder', [HomepageItemController::class, 'reorder']);
    Route::post('content/items/{contentType}', [HomepageItemController::class, 'store']);
    Route::post('content/items/{contentType}/{contentItem}', [HomepageItemController::class, 'update']);
    Route::delete('content/items/{contentType}/{contentItem}', [HomepageItemController::class, 'destroy']);
    Route::get('content/pages', [AdminStaticPageController::class, 'index']);
    Route::get('content/pages/{staticPage}', [AdminStaticPageController::class, 'show']);
    Route::patch('content/pages/{staticPage}', [AdminStaticPageController::class, 'update']);
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
