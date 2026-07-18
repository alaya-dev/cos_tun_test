<?php

namespace App\Domain\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ProductOptionGroup extends Model
{
    protected $fillable = ['name', 'sort_order'];

    /** @return HasMany<ProductOptionValue, $this> */
    public function values(): HasMany
    {
        return $this->hasMany(ProductOptionValue::class);
    }
}
