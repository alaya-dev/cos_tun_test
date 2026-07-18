<?php

use Illuminate\Support\Facades\Route;

Route::view('/', 'storefront.home')->name('storefront.home');

Route::view('/admin', 'admin.app')->name('admin.app');
