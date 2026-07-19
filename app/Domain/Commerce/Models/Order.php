<?php

namespace App\Domain\Commerce\Models;

use App\Domain\Checkout\Models\CheckoutIdempotencyRecord;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Order extends Model
{
    protected $fillable = [
        'checkout_idempotency_key', 'checkout_payload_hash', 'status', 'customer_name', 'customer_phone',
        'customer_city', 'customer_address', 'subtotal_millimes', 'product_discount_millimes',
        'promo_code_discount_millimes', 'shipping_fee_millimes', 'total_millimes', 'promo_code_id',
        'promo_code_snapshot', 'lock_version', 'archived_at',
    ];

    protected function casts(): array
    {
        return ['archived_at' => 'datetime', 'promo_code_snapshot' => 'array'];
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

    public function promoDiscountPercentage(): int
    {
        $snapshot = $this->getAttribute('promo_code_snapshot');

        return is_array($snapshot) && is_numeric($snapshot['discount_percentage'] ?? null)
            ? (int) $snapshot['discount_percentage']
            : 0;
    }
}
