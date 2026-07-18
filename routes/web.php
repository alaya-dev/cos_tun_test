<?php

use App\Http\Controllers\StorefrontCatalogController;
use App\Http\Controllers\AdminAuthController;
use Illuminate\Support\Facades\Route;

Route::get('/', [StorefrontCatalogController::class, 'home'])->name('storefront.home');
Route::get('/produits', [StorefrontCatalogController::class, 'products'])->name('storefront.products');
Route::get('/produits/{slug}', [StorefrontCatalogController::class, 'product'])->name('storefront.product');
Route::get('/categories/{slug}', [StorefrontCatalogController::class, 'category'])->name('storefront.category');
Route::get('/recherche', [StorefrontCatalogController::class, 'search'])->name('storefront.search');
Route::get('/panier', [StorefrontCatalogController::class, 'cart'])->name('storefront.cart');
Route::get('/commande', [StorefrontCatalogController::class, 'checkout'])->name('storefront.checkout');
Route::get('/commande/confirmee/{order}', [StorefrontCatalogController::class, 'confirmation'])->middleware('signed')->name('storefront.confirmation');

Route::get('/admin/login', [AdminAuthController::class, 'create'])->name('login');
Route::post('/admin/login', [AdminAuthController::class, 'store'])->middleware('throttle:5,1')->name('admin.login');
Route::post('/admin/logout', [AdminAuthController::class, 'destroy'])->middleware('auth')->name('admin.logout');
Route::view('/admin', 'admin.app')->middleware('auth')->name('admin.app');
