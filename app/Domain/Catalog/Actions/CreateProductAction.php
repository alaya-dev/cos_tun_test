<?php

namespace App\Domain\Catalog\Actions;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CreateProductAction
{
    /** @param array<string, mixed> $data */
    public function handle(array $data): Product
    {
        return DB::transaction(function () use ($data): Product {
            $category = Category::query()->where('public_id', $data['category_public_id'])->firstOrFail();
            $hasVariants = (bool) ($data['has_variants'] ?? false);
            $this->validateStockMode($data, $hasVariants);
            $product = Product::query()->create([
                'category_id' => $category->id, 'name' => $data['name'], 'slug' => $data['slug'], 'short_description' => $data['short_description'] ?? null,
                'full_description' => $data['full_description'] ?? null, 'regular_price_millimes' => $data['regular_price_millimes'], 'promotional_price_millimes' => $data['promotional_price_millimes'] ?? null,
                'stock_quantity' => $hasVariants ? null : $data['stock_quantity'], 'low_stock_threshold' => $hasVariants ? null : ($data['low_stock_threshold'] ?? null),
                'is_active' => (bool) ($data['is_active'] ?? false), 'has_variants' => $hasVariants, 'published_at' => $data['published_at'] ?? null,
                'seo_title' => $data['seo_title'] ?? null, 'seo_description' => $data['seo_description'] ?? null,
            ]);
            if ($hasVariants) {
                $this->replaceVariants($product, $data['option_groups'] ?? [], $data['variants'] ?? []);
            }

            $product->refresh()->load(['category', 'optionGroups.values', 'variants.values']);

            return $product;
        });
    }

    /** @param array<string, mixed> $data */
    private function validateStockMode(array $data, bool $hasVariants): void
    {
        if (($data['promotional_price_millimes'] ?? null) !== null && $data['promotional_price_millimes'] >= $data['regular_price_millimes']) {
            throw ValidationException::withMessages(['promotional_price_millimes' => 'Le prix promotionnel doit être inférieur au prix normal.']);
        }
        if (! $hasVariants && ! isset($data['stock_quantity'])) {
            throw ValidationException::withMessages(['stock_quantity' => 'Le stock produit est requis sans variantes.']);
        }
        if ($hasVariants && ! empty($data['stock_quantity'])) {
            throw ValidationException::withMessages(['stock_quantity' => 'Le stock produit doit être vide avec variantes.']);
        }
    }

    /**
     * @param  array<int, array{name: string, sort_order?: int, values: array<int, array{client_key: string, value: string, sort_order?: int}>}>  $groups
     * @param  array<int, array{option_value_client_keys: array<int, string>, stock_quantity: int, sku?: string|null, low_stock_threshold?: int|null, is_active?: bool}>  $variants
     */
    private function replaceVariants(Product $product, array $groups, array $variants): void
    {
        if ($variants === []) {
            throw ValidationException::withMessages(['variants' => 'Au moins une variante est requise.']);
        }
        $values = [];
        foreach ($groups as $groupData) {
            $group = $product->optionGroups()->create(['name' => $groupData['name'], 'sort_order' => $groupData['sort_order'] ?? 0]);
            foreach ($groupData['values'] as $valueData) {
                $values[$valueData['client_key']] = $group->values()->create(['value' => $valueData['value'], 'sort_order' => $valueData['sort_order'] ?? 0]);
            }
        }
        $seen = [];
        foreach ($variants as $variantData) {
            $ids = [];
            foreach ($variantData['option_value_client_keys'] as $optionValueKey) {
                if (! isset($values[$optionValueKey])) {
                    throw ValidationException::withMessages(['variants' => 'Combinaison de variante invalide.']);
                }
                $ids[] = $values[$optionValueKey]->id;
            }
            sort($ids);
            if (count($ids) !== count($groups)) {
                throw ValidationException::withMessages(['variants' => 'Combinaison de variante invalide.']);
            }
            $key = implode(':', $ids);
            if (isset($seen[$key])) {
                throw ValidationException::withMessages(['variants' => 'Combinaison de variante dupliquée.']);
            } $seen[$key] = true;
            $variant = $product->variants()->create(['sku' => $variantData['sku'] ?? null, 'combination_key' => $key, 'stock_quantity' => $variantData['stock_quantity'], 'low_stock_threshold' => $variantData['low_stock_threshold'] ?? null, 'is_active' => $variantData['is_active'] ?? true]);
            $variant->values()->sync($ids);
        }
    }
}
