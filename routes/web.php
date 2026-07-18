<?php

use App\Http\Controllers\StorefrontCatalogController;
use Illuminate\Support\Facades\Route;

Route::get('/', [StorefrontCatalogController::class, 'home'])->name('storefront.home');
Route::get('/produits', [StorefrontCatalogController::class, 'products'])->name('storefront.products');
Route::get('/produits/{slug}', [StorefrontCatalogController::class, 'product'])->name('storefront.product');
Route::get('/categories/{slug}', [StorefrontCatalogController::class, 'category'])->name('storefront.category');
Route::get('/recherche', [StorefrontCatalogController::class, 'search'])->name('storefront.search');

Route::view('/admin', 'admin.app')->name('admin.app');
