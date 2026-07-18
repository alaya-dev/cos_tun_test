<?php

namespace App\Domain\Commerce\Models;

use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['variant_snapshot' => 'array'];
    }
}
