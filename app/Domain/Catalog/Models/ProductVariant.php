<?php

namespace App\Domain\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;

class ProductVariant extends Model
{
    protected $fillable = ['public_id', 'sku', 'combination_key', 'stock_quantity', 'low_stock_threshold', 'is_active'];

    protected static function booted(): void
    {
        static::creating(fn (self $model) => $model->public_id ??= (string) Str::ulid());
    }

    /** @return BelongsToMany<ProductOptionValue, $this> */
    public function values(): BelongsToMany
    {
        return $this->belongsToMany(ProductOptionValue::class, 'product_variant_values');
    }
}
