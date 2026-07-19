<?php

namespace App\Domain\Commerce\Actions;

use App\Domain\Catalog\Models\InventoryMovement;
use App\Domain\Catalog\Models\Product;
use App\Domain\Checkout\Actions\ResolveCheckoutSubmissionAction;
use App\Domain\Checkout\Models\CheckoutIdempotencyRecord;
use App\Domain\Checkout\Services\ShippingCalculator;
use App\Domain\Commerce\Exceptions\CheckoutConflictException;
use App\Domain\Commerce\Models\CheckoutField;
use App\Domain\Commerce\Models\Order;
use Illuminate\Support\Facades\DB;

class CreateGuestOrderAction
{
    public function __construct(
        private readonly ShippingCalculator $shippingCalculator,
        private readonly ResolveCheckoutSubmissionAction $resolveCheckoutSubmissionAction,
    ) {}

    /**
     * @param  array<string, mixed>  $data
     * @return array{order: Order, replayed: bool}
     */
    public function handle(array $data, string $idempotencyKey): array
    {
        return DB::transaction(function () use ($data, $idempotencyKey): array {
            $payloadHash = hash('sha256', json_encode($this->canonicalize($data), JSON_THROW_ON_ERROR));
            $existing = CheckoutIdempotencyRecord::query()->with('order.items', 'order.checkoutValues')->where('idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                if (! hash_equals($existing->canonical_payload_hash, $payloadHash)) {
                    throw new CheckoutConflictException('CHECKOUT_IDEMPOTENCY_CONFLICT', 'Cette demande de commande ne correspond pas à la précédente tentative.');
                }

                $existingOrder = $existing->order;
                abort_unless($existingOrder !== null, 500);

                return ['order' => $existingOrder->load('items', 'checkoutValues'), 'replayed' => true];
            }
            $resolved = $this->resolveCheckoutSubmissionAction->handle($data);
            $fields = CheckoutField::query()->where('is_active', true)->orderBy('sort_order')->get();
            $productIds = array_values(array_unique(array_column($data['items'], 'product_public_id')));
            sort($productIds);
            $products = Product::query()->with(['variants.values.productOptionGroup', 'images' => fn ($query) => $query->where('processing_status', 'ready')->orderByDesc('is_primary')])
                ->whereIn('public_id', $productIds)->orderBy('id')->lockForUpdate()->get()->keyBy('public_id');
            $lines = [];
            $subtotal = 0;
            $discount = 0;
            foreach ($data['items'] as $item) {
                /** @var Product|null $product */
                $product = $products->get($item['product_public_id']);
                if (! $product || ! $product->is_active || ! $product->category()->where('is_active', true)->exists()) {
                    throw new CheckoutConflictException('PRODUCT_UNAVAILABLE', 'Un produit de votre panier n’est plus disponible.');
                }
                $variant = null;
                if ($product->has_variants) {
                    $variant = $product->variants->firstWhere('public_id', $item['variant_public_id']);
                    if (! $variant || ! $variant->is_active) {
                        throw new CheckoutConflictException('VARIANT_UNAVAILABLE', 'Une variante de votre panier n’est plus disponible.');
                    }
                    if ($variant->stock_quantity < $item['quantity']) {
                        throw new CheckoutConflictException('INSUFFICIENT_STOCK', 'Le stock disponible a changé.');
                    }
                } elseif ($item['variant_public_id'] || ($product->stock_quantity ?? 0) < $item['quantity']) {
                    throw new CheckoutConflictException('INSUFFICIENT_STOCK', 'Le stock disponible a changé.');
                }
                $regular = $product->regular_price_millimes;
                $effective = $product->promotional_price_millimes ?? $regular;
                $subtotal += $effective * $item['quantity'];
                $discount += ($regular - $effective) * $item['quantity'];
                $lines[] = compact('product', 'variant', 'regular', 'effective', 'item');
            }
            $shipping = $this->shippingCalculator->calculate($subtotal);
            $order = Order::query()->create(['checkout_idempotency_key' => $idempotencyKey, 'checkout_payload_hash' => $payloadHash, 'status' => 'nouvelle', 'customer_name' => $resolved['customer']['full_name'], 'customer_phone' => $resolved['customer']['phone'], 'customer_city' => $resolved['customer']['city'], 'customer_address' => $resolved['customer']['address'], 'subtotal_millimes' => $subtotal, 'product_discount_millimes' => $discount, 'promo_code_discount_millimes' => 0, 'shipping_fee_millimes' => $shipping['fee']['millimes'], 'total_millimes' => $subtotal + $shipping['fee']['millimes']]);
            foreach ($lines as $line) {
                $product = $line['product'];
                $variant = $line['variant'];
                $quantity = $line['item']['quantity'];
                $order->items()->create(['product_id' => $product->id, 'product_variant_id' => $variant?->id, 'product_name_snapshot' => $product->name, 'variant_snapshot' => $variant ? $variant->values->map(fn ($value) => ['group' => $value->productOptionGroup?->name, 'value' => $value->value])->all() : null, 'regular_unit_price_millimes' => $line['regular'], 'effective_unit_price_millimes' => $line['effective'], 'quantity' => $quantity, 'line_total_millimes' => $line['effective'] * $quantity]);
                $before = $variant ? $variant->stock_quantity : $product->stock_quantity;
                $target = $variant ?? $product;
                $target->decrement('stock_quantity', $quantity);
                InventoryMovement::query()->create(['product_id' => $product->id, 'product_variant_id' => $variant?->id, 'type' => 'order_deduction', 'quantity_delta' => -$quantity, 'quantity_before' => $before, 'quantity_after' => $before - $quantity, 'reason' => 'Commande '.$order->public_reference]);
            }
            foreach ($resolved['checkout_values'] as $value) {
                $order->checkoutValues()->create($value);
            }
            DB::table('order_status_history')->insert(['order_id' => $order->id, 'from_status' => null, 'to_status' => 'nouvelle', 'created_at' => now()]);
            CheckoutIdempotencyRecord::query()->create(['order_id' => $order->id, 'idempotency_key' => $idempotencyKey, 'canonical_payload_hash' => $payloadHash, 'expires_at' => now()->addDays(7)]);

            return ['order' => $order->load('items', 'checkoutValues'), 'replayed' => false];
        }, 3);
    }

    /** @param array<int, array<string, mixed>> $fields */
    public function schemaVersion(array $fields): string
    {
        return $this->resolveCheckoutSubmissionAction->schemaVersion($fields);
    }

    /** @param array<string, mixed> $value
     * @return array<string, mixed>
     */
    private function canonicalize(array $value): array
    {
        ksort($value);
        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->canonicalize($item);
            }
        }

        return $value;
    }
}
