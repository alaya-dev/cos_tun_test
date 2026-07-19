<?php

namespace App\Domain\Commerce\Models;

use App\Domain\Checkout\Models\CheckoutIdempotencyRecord;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Order extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['archived_at' => 'datetime'];
    }

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

    /** @return HasOne<CheckoutIdempotencyRecord, $this> */
    public function checkoutIdempotencyRecord(): HasOne
    {
        return $this->hasOne(CheckoutIdempotencyRecord::class);
    }

    /** @return HasMany<OrderStatusHistory, $this> */
    public function statusHistory(): HasMany
    {
        return $this->hasMany(OrderStatusHistory::class);
    }

    /** @return HasMany<OrderNote, $this> */
    public function notes(): HasMany
    {
        return $this->hasMany(OrderNote::class);
    }

    public function getRouteKeyName(): string
    {
        return 'public_reference';
    }
}
