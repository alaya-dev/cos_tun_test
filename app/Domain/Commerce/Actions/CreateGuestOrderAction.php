<?php

namespace App\Domain\Commerce\Actions;

use App\Domain\Catalog\Models\InventoryMovement;
use App\Domain\Catalog\Models\Product;
use App\Domain\Commerce\Exceptions\CheckoutConflictException;
use App\Domain\Commerce\Models\CheckoutField;
use App\Domain\Commerce\Models\Order;
use Illuminate\Support\Facades\DB;

class CreateGuestOrderAction
{
    /**
     * @param  array{checkout_schema_version: string, customer: array{full_name: string, phone: string, city: string, address: string}, items: array<int, array{product_public_id: string, variant_public_id: string|null, quantity: int}>}  $data
     * @return array{order: Order, replayed: bool}
     */
    public function handle(array $data, string $idempotencyKey): array
    {
        return DB::transaction(function () use ($data, $idempotencyKey): array {
            $existing = Order::query()->where('checkout_idempotency_key', $idempotencyKey)->first();
            if ($existing) {
                return ['order' => $existing->load('items'), 'replayed' => true];
            }
            $fields = CheckoutField::query()->where('is_active', true)->orderBy('sort_order')->get();
            $schema = $this->schemaVersion($fields->map(fn (CheckoutField $field) => $field->only(['key', 'label', 'type', 'is_required', 'options']))->all());
            if (! hash_equals($schema, (string) $data['checkout_schema_version'])) {
                throw new CheckoutConflictException('CHECKOUT_FIELDS_CHANGED', 'Le formulaire a changé. Vérifiez vos informations avant de continuer.');
            }
            $productIds = array_values(array_unique(array_column($data['items'], 'product_public_id')));
            sort($productIds);
            $products = Product::query()->with(['variants.values.productOptionGroup', 'images' => fn ($query) => $query->where('processing_status', 'ready')->orderByDesc('is_primary')])
                ->whereIn('public_id', $productIds)->orderBy('id')->lockForUpdate()->get()->keyBy('public_id');
            $lines = [];
            $subtotal = 0;
            $discount = 0;
            foreach ($data['items'] as $item) {
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
            $shipping = (int) config('commerce.shipping_fixed_fee_millimes');
            $order = Order::query()->create(['checkout_idempotency_key' => $idempotencyKey, 'status' => 'nouvelle', 'customer_name' => trim($data['customer']['full_name']), 'customer_phone' => $this->phone($data['customer']['phone']), 'customer_city' => trim($data['customer']['city']), 'customer_address' => trim($data['customer']['address']), 'subtotal_millimes' => $subtotal, 'product_discount_millimes' => $discount, 'promo_code_discount_millimes' => 0, 'shipping_fee_millimes' => $shipping, 'total_millimes' => $subtotal + $shipping]);
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
            foreach ($fields as $field) {
                $order->checkoutValues()->create(['checkout_field_id' => $field->id, 'field_key_snapshot' => $field->key, 'label_snapshot' => $field->label, 'type_snapshot' => $field->type, 'value' => $data['customer'][$field->key] ?? null]);
            }
            DB::table('order_status_history')->insert(['order_id' => $order->id, 'from_status' => null, 'to_status' => 'nouvelle', 'created_at' => now()]);

            return ['order' => $order->load('items'), 'replayed' => false];
        }, 3);
    }

    /** @param array<int, array<string, mixed>> $fields */
    public function schemaVersion(array $fields): string
    {
        return hash('sha256', json_encode($fields, JSON_THROW_ON_ERROR));
    }

    private function phone(string $phone): string
    {
        return preg_replace('/[^0-9+]/', '', $phone) ?? $phone;
    }
}
