<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Catalog\Actions\CreateProductAction;
use App\Domain\Catalog\Actions\ReplaceProductVariantsAction;
use App\Domain\Catalog\Actions\SwitchProductVariantModeAction;
use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ProductController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'category_id' => ['nullable', 'ulid'],
            'is_active' => ['nullable', 'boolean'],
            'has_variants' => ['nullable', 'boolean'],
            'stock_state' => ['nullable', 'in:in_stock,low_stock,out_of_stock'],
            'is_promotional' => ['nullable', 'boolean'],
            'created_from' => ['nullable', 'date'],
            'created_to' => ['nullable', 'date'],
            'sort' => ['nullable', 'in:name,-name,created_at,-created_at,regular_price_millimes,-regular_price_millimes'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $query = Product::query()->with('category');

        if ($data['search'] ?? null) {
            $query->where('name', 'like', '%'.$data['search'].'%');
        }
        if ($data['category_id'] ?? null) {
            $query->whereHas('category', fn ($category) => $category->where('public_id', $data['category_id']));
        }
        foreach (['is_active', 'has_variants'] as $filter) {
            if (array_key_exists($filter, $data)) {
                $query->where($filter, $data[$filter]);
            }
        }
        if (array_key_exists('is_promotional', $data)) {
            $data['is_promotional'] ? $query->whereNotNull('promotional_price_millimes') : $query->whereNull('promotional_price_millimes');
        }
        if ($data['created_from'] ?? null) {
            $query->whereDate('created_at', '>=', $data['created_from']);
        }
        if ($data['created_to'] ?? null) {
            $query->whereDate('created_at', '<=', $data['created_to']);
        }
        if ($data['stock_state'] ?? null) {
            $state = $data['stock_state'];
            $query->where(function ($stock) use ($state): void {
                if ($state === 'out_of_stock') {
                    $stock->where('has_variants', false)->where('stock_quantity', 0);
                } elseif ($state === 'low_stock') {
                    $stock->where('has_variants', false)->whereColumn('stock_quantity', '<=', 'low_stock_threshold')->where('stock_quantity', '>', 0);
                } else {
                    $stock->where('has_variants', false)->where('stock_quantity', '>', 0);
                }
            });
        }
        $sort = $data['sort'] ?? '-created_at';
        $query->orderBy(ltrim($sort, '-'), str_starts_with($sort, '-') ? 'desc' : 'asc');

        return response()->json(['data' => $query->paginate($data['per_page'] ?? 25)]);
    }

    public function store(Request $request, CreateProductAction $action): JsonResponse
    {
        $data = $request->validate(['category_public_id' => ['required', 'ulid'], 'name' => ['required', 'string', 'max:200'], 'slug' => ['required', 'string', 'max:190', 'unique:products,slug'], 'regular_price_millimes' => ['required', 'integer', 'min:0'], 'promotional_price_millimes' => ['nullable', 'integer', 'min:0'], 'stock_quantity' => ['nullable', 'integer', 'min:0'], 'low_stock_threshold' => ['nullable', 'integer', 'min:0'], 'is_active' => ['required', 'boolean'], 'has_variants' => ['required', 'boolean'], 'short_description' => ['nullable', 'string'], 'full_description' => ['nullable', 'string'], 'published_at' => ['nullable', 'date'], 'seo_title' => ['nullable', 'string', 'max:255'], 'seo_description' => ['nullable', 'string', 'max:320'], 'option_groups' => ['nullable', 'array', 'max:5'], 'variants' => ['nullable', 'array', 'max:250']]);

        return response()->json(['data' => $action->handle($data)], 201);
    }

    public function show(Product $product): JsonResponse
    {
        return response()->json(['data' => $product->load('category', 'images', 'optionGroups.values', 'variants.values')]);
    }

    public function update(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate(['category_public_id' => ['sometimes', 'ulid'], 'name' => ['sometimes', 'string', 'max:200'], 'slug' => ['sometimes', 'string', 'max:190', 'unique:products,slug,'.$product->id], 'short_description' => ['nullable', 'string'], 'full_description' => ['nullable', 'string'], 'regular_price_millimes' => ['sometimes', 'integer', 'min:0'], 'promotional_price_millimes' => ['nullable', 'integer', 'min:0'], 'is_active' => ['sometimes', 'boolean'], 'published_at' => ['nullable', 'date'], 'seo_title' => ['nullable', 'string', 'max:255'], 'seo_description' => ['nullable', 'string', 'max:320']]);
        if (isset($data['category_public_id'])) {
            $data['category_id'] = Category::query()->where('public_id', $data['category_public_id'])->firstOrFail()->id;
            unset($data['category_public_id']);
        }
        $regular = $data['regular_price_millimes'] ?? $product->regular_price_millimes;
        if (($data['promotional_price_millimes'] ?? $product->promotional_price_millimes) !== null && ($data['promotional_price_millimes'] ?? $product->promotional_price_millimes) >= $regular) {
            return response()->json(['code' => 'VALIDATION_FAILED', 'message' => 'Le prix promotionnel doit être inférieur au prix normal.'], 422);
        }
        $previousSlug = $product->slug;
        $product->update($data);
        if (isset($data['slug']) && $data['slug'] !== $previousSlug) {
            DB::table('url_redirects')->updateOrInsert(['from_path' => '/produits/'.$previousSlug], ['to_path' => '/produits/'.$product->slug, 'updated_at' => now(), 'created_at' => now()]);
        }

        return response()->json(['data' => $product->fresh()]);
    }

    public function destroy(Product $product): JsonResponse
    {
        $product->update(['is_active' => false]);
        $product->delete();

        return response()->json(['data' => null]);
    }

    public function status(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate(['is_active' => ['required', 'boolean']]);
        $product->update(['is_active' => $data['is_active'], 'published_at' => $data['is_active'] ? ($product->published_at ?? now()) : $product->published_at]);

        return response()->json(['data' => $product->fresh()]);
    }

    public function variantMode(Request $request, Product $product, SwitchProductVariantModeAction $action): JsonResponse
    {
        $data = $request->validate(['has_variants' => ['required', 'boolean'], 'confirmation' => ['required', 'in:CONFIRMER'], 'resulting_stock_quantity' => ['nullable', 'integer', 'min:0']]);

        return response()->json(['data' => $action->handle($product, $data['has_variants'], $data['resulting_stock_quantity'] ?? null)]);
    }

    public function replaceVariants(Request $request, Product $product, ReplaceProductVariantsAction $action): JsonResponse
    {
        $data = $request->validate(['lock_version' => ['required', 'integer', 'min:1'], 'option_groups' => ['required', 'array', 'min:1', 'max:5'], 'option_groups.*.name' => ['required', 'string', 'max:120'], 'option_groups.*.values' => ['required', 'array', 'min:1', 'max:50'], 'option_groups.*.values.*.client_key' => ['required', 'string', 'max:120', 'distinct'], 'option_groups.*.values.*.value' => ['required', 'string', 'max:120'], 'variants' => ['required', 'array', 'min:1', 'max:250'], 'variants.*.option_value_client_keys' => ['required', 'array'], 'variants.*.stock_quantity' => ['required', 'integer', 'min:0'], 'variants.*.sku' => ['nullable', 'string', 'max:100'], 'variants.*.low_stock_threshold' => ['nullable', 'integer', 'min:0'], 'variants.*.is_active' => ['nullable', 'boolean']]);

        return response()->json(['data' => $action->handle($product, $data['option_groups'], $data['variants'], $data['lock_version'])]);
    }
}
