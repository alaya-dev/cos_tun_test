<?php

namespace App\Domain\Content\Services;

use Illuminate\Support\Facades\Cache;

class HomepageCache
{
    public const KEY = 'pc:cache:storefront:home';

    public function forget(): void
    {
        Cache::store('redis')->forget(self::KEY);
        Cache::store('redis')->forget('pc:cache:storefront:layout');
    }
}
