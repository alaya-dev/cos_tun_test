<?php

namespace App\Domain\Commerce\Actions;

use App\Domain\Catalog\Models\InventoryMovement;
use App\Domain\Catalog\Models\Product;
use App\Domain\Checkout\Services\ShippingCalculator;
use App\Domain\Commerce\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReconcileOrderItemsAction
{
    public function __construct(private readonly ShippingCalculator $shippingCalculator) {}

    /** @param array<int, array{product_public_id: string, variant_public_id: string|null, quantity: int}> $items */
    public function handle(Order $order, int $lockVersion, array $items, int $actorId): Order
    {
        return DB::transaction(function () use ($order, $lockVersion, $items, $actorId): Order {
            $order = Order::query()->with('items')->whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (! in_array($order->status, ['nouvelle', 'confirmee'], true)) {
                throw ValidationException::withMessages(['order' => 'Cette commande ne peut plus être modifiée.']);
            }
            if ($order->lock_version !== $lockVersion) {
                throw ValidationException::withMessages(['lock_version' => 'La commande a été modifiée.']);
            }
            $productPublicIds = array_unique(array_column($items, 'product_public_id'));
            sort($productPublicIds);
            $oldProductIds = $order->items->pluck('product_id')->filter()->unique()->sort()->values()->all();
            $lockedProducts = Product::query()
                ->where(function ($query) use ($productPublicIds, $oldProductIds): void {
                    $query->whereIn('public_id', $productPublicIds)
                        ->orWhereIn('id', $oldProductIds);
                })
                ->orderBy('id')
                ->lockForUpdate()
                ->get();
            $productsByPublicId = $lockedProducts->keyBy('public_id');
            $productsById = $lockedProducts->keyBy('id');
            $variants = $lockedProducts->load(['variants.values.productOptionGroup'])->pluck('variants')->flatten(1)->sortBy('id')->values();
            $variantsById = $variants->keyBy('id');
            $variantsByPublicId = $variants->keyBy('public_id');
            foreach ($order->items as $old) {
                $target = $old->product_variant_id ? $variantsById->get($old->product_variant_id) : $productsById->get($old->product_id);
                if ($target) {
                    $before = $target->stock_quantity;
                    $target->increment('stock_quantity', $old->quantity);
                    InventoryMovement::query()->create(['product_id' => $old->product_id, 'product_variant_id' => $old->product_variant_id, 'actor_user_id' => $actorId, 'type' => 'order_edit_restore', 'quantity_delta' => $old->quantity, 'quantity_before' => $before, 'quantity_after' => $before + $old->quantity, 'reason' => 'Modification commande '.$order->public_reference]);
                }
            }
            $order->items()->delete();
            $subtotal = 0;
            $discount = 0;
            foreach ($items as $line) {
                $product = $productsByPublicId->get($line['product_public_id']);
                if (! $product || ! $product->is_active) {
                    throw ValidationException::withMessages(['items' => 'Produit indisponible.']);
                }
                $variant = $line['variant_public_id'] ? $variantsByPublicId->get($line['variant_public_id']) : null;
                if ($variant && $variant->product_id !== $product->id) {
                    throw ValidationException::withMessages(['items' => 'Variante invalide pour ce produit.']);
                }
                $target = $variant ?? $product;
                if ($product->has_variants !== ($variant !== null) || ! $target->is_active || ($target->stock_quantity ?? 0) < $line['quantity']) {
                    throw ValidationException::withMessages(['items' => 'Stock insuffisant ou variante invalide.']);
                }
                $regular = $product->regular_price_millimes;
                $effective = $product->promotional_price_millimes ?? $regular;
                $before = $target->stock_quantity;
                $target->decrement('stock_quantity', $line['quantity']);
                InventoryMovement::query()->create(['product_id' => $product->id, 'product_variant_id' => $variant?->id, 'actor_user_id' => $actorId, 'type' => 'order_edit_deduction', 'quantity_delta' => -$line['quantity'], 'quantity_before' => $before, 'quantity_after' => $before - $line['quantity'], 'reason' => 'Modification commande '.$order->public_reference]);
                $order->items()->create(['product_id' => $product->id, 'product_variant_id' => $variant?->id, 'product_name_snapshot' => $product->name, 'variant_snapshot' => $variant ? $variant->values->map(fn ($value) => ['group' => $value->productOptionGroup?->name, 'value' => $value->value])->all() : null, 'regular_unit_price_millimes' => $regular, 'effective_unit_price_millimes' => $effective, 'quantity' => $line['quantity'], 'line_total_millimes' => $effective * $line['quantity']]);
                $subtotal += $effective * $line['quantity'];
                $discount += ($regular - $effective) * $line['quantity'];
            }
            $shipping = $this->shippingCalculator->calculate($subtotal);
            $order->update(['subtotal_millimes' => $subtotal, 'product_discount_millimes' => $discount, 'shipping_fee_millimes' => $shipping['fee']['millimes'], 'total_millimes' => $subtotal + $shipping['fee']['millimes'], 'lock_version' => $order->lock_version + 1]);

            return $order->fresh(['items']) ?? $order;
        });
    }
}
