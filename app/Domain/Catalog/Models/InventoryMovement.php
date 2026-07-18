<?php

namespace App\Domain\Catalog\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class InventoryMovement extends Model
{
    protected $fillable = [
        'public_id',
        'product_id',
        'product_variant_id',
        'actor_user_id',
        'type',
        'quantity_delta',
        'quantity_before',
        'quantity_after',
        'reason',
    ];

    protected static function booted(): void
    {
        static::creating(fn (self $model) => $model->public_id ??= (string) Str::ulid());
    }
}
