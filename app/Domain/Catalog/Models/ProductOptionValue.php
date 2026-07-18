<?php

namespace App\Domain\Catalog\Models;

use Illuminate\Database\Eloquent\Model;

class ProductOptionValue extends Model
{
    protected $fillable = ['value', 'sort_order'];
}
