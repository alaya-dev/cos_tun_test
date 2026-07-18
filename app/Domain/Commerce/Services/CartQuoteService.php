<?php

namespace App\Domain\Commerce\Services;

use App\Domain\Catalog\Models\Product;

class CartQuoteService
{
    /** @param array<int, array{product_public_id: string, variant_public_id: string|null, quantity: int}> $items
     * @return array<string, mixed>
     */
    public function quote(array $items): array
    {
        $products = Product::public()->with([
            'images' => fn ($query) => $query->where('processing_status', 'ready')->orderByDesc('is_primary')->orderBy('sort_order'),
            'variants.values.productOptionGroup',
        ])->whereIn('public_id', array_column($items, 'product_public_id'))->get()->keyBy('public_id');
        $quotedItems = [];
        $regularSubtotal = 0;
        $subtotal = 0;
        $canCheckout = true;
        foreach ($items as $item) {
            $line = $this->quoteLine($products->get($item['product_public_id']), $item);
            $quotedItems[] = $line;
            $regularSubtotal += $line['regular_unit_price']['millimes'] * $item['quantity'];
            $subtotal += $line['effective_unit_price']['millimes'] * $item['quantity'];
            $canCheckout = $canCheckout && $line['is_available'];
        }
        $shipping = $this->shippingFor($subtotal);

        return ['items' => $quotedItems, 'pricing' => ['regular_subtotal' => $this->money($regularSubtotal), 'product_discount' => $this->money($regularSubtotal - $subtotal), 'subtotal' => $this->money($subtotal), 'promo_code' => null, 'shipping' => $shipping, 'total' => $this->money($subtotal + $shipping['fee']['millimes'])], 'can_checkout' => $canCheckout && $items !== []];
    }

    /** @param array{product_public_id: string, variant_public_id: string|null, quantity: int} $item
     * @return array<string, mixed>
     */
    private function quoteLine(?Product $product, array $item): array
    {
        $messages = [];
        $variant = null;
        if (! $product) {
            $messages[] = 'Ce produit n’est plus disponible.';
        } elseif ($product->has_variants) {
            $variant = $item['variant_public_id'] ? $product->variants->firstWhere('public_id', $item['variant_public_id']) : null;
            if (! $variant) {
                $messages[] = 'Veuillez choisir une variante disponible.';
            } elseif (! $variant->is_active) {
                $messages[] = 'Cette variante n’est plus disponible.';
            } elseif ($variant->stock_quantity < $item['quantity']) {
                $messages[] = 'La quantité demandée n’est plus disponible.';
            }
        } elseif ($item['variant_public_id']) {
            $messages[] = 'Cette variante ne correspond pas au produit.';
        } elseif (($product->stock_quantity ?? 0) < $item['quantity']) {
            $messages[] = 'La quantité demandée n’est plus disponible.';
        }
        $regular = $product instanceof Product ? $product->regular_price_millimes : 0;
        $effective = $product instanceof Product ? ($product->promotional_price_millimes ?? $regular) : $regular;
        $variantLabel = $variant ? $variant->values->map(fn ($value) => ($value->productOptionGroup?->name ?: '').': '.$value->value)->implode(', ') : null;

        return ['product_public_id' => $item['product_public_id'], 'variant_public_id' => $item['variant_public_id'], 'name' => $product instanceof Product ? $product->name : 'Produit indisponible', 'variant_label' => $variantLabel, 'image_url' => $product?->images->first()?->publicUrl(), 'quantity_requested' => $item['quantity'], 'quantity_available' => $variant !== null ? $variant->stock_quantity : ($product instanceof Product ? $product->stock_quantity ?? 0 : 0), 'is_available' => $messages === [], 'regular_unit_price' => $this->money($regular), 'effective_unit_price' => $this->money($effective), 'line_total' => $this->money($effective * $item['quantity']), 'messages' => $messages];
    }

    /** @return array<string, mixed> */
    private function shippingFor(int $subtotal): array
    {
        $threshold = config('commerce.shipping_free_threshold_millimes');
        $free = is_int($threshold) && $subtotal >= $threshold;
        $fee = $free ? 0 : (int) config('commerce.shipping_fixed_fee_millimes');

        return ['is_free' => $free || $fee === 0, 'fee' => $this->money($fee, $fee === 0), 'free_threshold' => is_int($threshold) ? $this->money($threshold) : null];
    }

    /** @return array{millimes: int, formatted: string} */
    private function money(int $millimes, bool $free = false): array
    {
        return ['millimes' => $millimes, 'formatted' => $free ? 'Gratuite' : number_format($millimes / 1000, 3, ',', ' ').' TND'];
    }
}
