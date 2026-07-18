<?php

namespace App\Domain\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductOptionValue extends Model
{
    protected $fillable = ['value', 'sort_order'];

    /** @return BelongsTo<ProductOptionGroup, $this> */
    public function productOptionGroup(): BelongsTo
    {
        return $this->belongsTo(ProductOptionGroup::class);
    }
}
