<?php

namespace App\Domain\Commerce\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Order extends Model
{
    protected $guarded = [];

    protected static function booted(): void
    {
        static::creating(function (self $order): void {
            $order->public_reference ??= (string) Str::ulid();
            $order->meta_event_id ??= 'purchase_'.$order->public_reference;
        });
    }

    /** @return HasMany<OrderItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    /** @return HasMany<OrderCheckoutValue, $this> */
    public function checkoutValues(): HasMany
    {
        return $this->hasMany(OrderCheckoutValue::class);
    }

    public function getRouteKeyName(): string
    {
        return 'public_reference';
    }
}
