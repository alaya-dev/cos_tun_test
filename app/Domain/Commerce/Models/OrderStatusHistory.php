<?php

namespace App\Domain\Commerce\Models;

use Illuminate\Database\Eloquent\Model;

class OrderStatusHistory extends Model
{
    public const UPDATED_AT = null;

    protected $table = 'order_status_history';

    protected $guarded = [];
}
