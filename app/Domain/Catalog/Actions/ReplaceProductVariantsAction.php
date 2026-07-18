<?php

namespace App\Domain\Catalog\Actions;

use App\Domain\Catalog\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ReplaceProductVariantsAction
{
    /**
     * @param  array<int, array{name: string, sort_order?: int, values: array<int, array{client_key: string, value: string, sort_order?: int}>}>  $groups
     * @param  array<int, array{option_value_client_keys: array<int, string>, stock_quantity: int, sku?: string|null, low_stock_threshold?: int|null, is_active?: bool}>  $variants
     */
    public function handle(Product $product, array $groups, array $variants, int $lockVersion): Product
    {
        if (! $product->has_variants) {
            throw ValidationException::withMessages(['has_variants' => 'Ce produit n’utilise pas de variantes.']);
        }
        if ($product->lock_version !== $lockVersion) {
            throw ValidationException::withMessages(['lock_version' => 'Le produit a été modifié par un autre utilisateur.']);
        }
        if ($variants === []) {
            throw ValidationException::withMessages(['variants' => 'Au moins une variante est requise.']);
        }

        return DB::transaction(function () use ($product, $groups, $variants): Product {
            $product->variants()->delete();
            $product->optionGroups()->delete();
            $valueMap = [];
            foreach ($groups as $groupData) {
                $group = $product->optionGroups()->create(['name' => $groupData['name'], 'sort_order' => $groupData['sort_order'] ?? 0]);
                foreach ($groupData['values'] as $valueData) {
                    $valueMap[$valueData['client_key']] = $group->values()->create(['value' => $valueData['value'], 'sort_order' => $valueData['sort_order'] ?? 0]);
                }
            }
            $seen = [];
            foreach ($variants as $variantData) {
                $ids = [];
                foreach ($variantData['option_value_client_keys'] as $optionValueKey) {
                    if (! isset($valueMap[$optionValueKey])) {
                        throw ValidationException::withMessages(['variants' => 'Combinaison de variante invalide.']);
                    }
                    $ids[] = $valueMap[$optionValueKey]->id;
                }
                sort($ids);
                if (count($ids) !== count($groups)) {
                    throw ValidationException::withMessages(['variants' => 'Combinaison de variante invalide.']);
                }
                $key = implode(':', $ids);
                if (isset($seen[$key])) {
                    throw ValidationException::withMessages(['variants' => 'Combinaison de variante dupliquée.']);
                }
                $seen[$key] = true;
                $variant = $product->variants()->create(['sku' => $variantData['sku'] ?? null, 'combination_key' => $key, 'stock_quantity' => $variantData['stock_quantity'], 'low_stock_threshold' => $variantData['low_stock_threshold'] ?? null, 'is_active' => $variantData['is_active'] ?? true]);
                $variant->values()->sync($ids);
            }
            $product->increment('lock_version');

            $product->load(['optionGroups.values', 'variants.values']);

            return $product;
        });
    }
}
