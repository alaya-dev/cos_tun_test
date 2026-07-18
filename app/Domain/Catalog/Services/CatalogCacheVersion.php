<?php

namespace App\Domain\Catalog\Services;

use Illuminate\Support\Facades\Cache;

class CatalogCacheVersion
{
    private const KEY = 'pc:cache:catalog:version';

    public function current(): int
    {
        return (int) Cache::store('redis')->rememberForever(self::KEY, fn () => 1);
    }

    public function bump(): void
    {
        Cache::store('redis')->increment(self::KEY);
    }
}
