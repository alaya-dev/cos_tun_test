<?php

namespace App\Domain\Commerce\Models;

use Illuminate\Database\Eloquent\Model;

class OrderCheckoutValue extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['value' => 'array'];
    }
}
