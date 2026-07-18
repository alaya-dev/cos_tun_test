<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Catalog\Models\Category;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CategoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'is_active' => ['nullable', 'boolean'],
            'sort' => ['nullable', 'in:name,-name,sort_order,-sort_order,created_at,-created_at'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $sort = $data['sort'] ?? 'sort_order';
        $categories = Category::query()->withCount('products')
            ->when($data['search'] ?? null, fn ($query, $search) => $query->where('name', 'like', '%'.$search.'%'))
            ->when(array_key_exists('is_active', $data), fn ($query) => $query->where('is_active', $data['is_active']))
            ->orderBy(ltrim($sort, '-'), str_starts_with($sort, '-') ? 'desc' : 'asc')
            ->paginate($data['per_page'] ?? 25);

        return response()->json(['data' => $categories]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['slug'] ??= Str::slug($data['name']);

        return response()->json(['data' => Category::query()->create($data)], 201);
    }

    public function show(Category $category): JsonResponse
    {
        return response()->json(['data' => $category]);
    }

    public function update(Request $request, Category $category): JsonResponse
    {
        $oldSlug = $category->slug;
        $data = $this->validated($request, false);
        DB::transaction(function () use ($category, $data): void {
            $category->update($data);
            if (array_key_exists('is_active', $data) && ! $data['is_active']) {
                $category->products()->update(['is_active' => false]);
            }
        });
        if (isset($data['slug']) && $data['slug'] !== $oldSlug) {
            DB::table('url_redirects')->updateOrInsert(['from_path' => '/categories/'.$oldSlug], ['to_path' => '/categories/'.$category->slug, 'updated_at' => now(), 'created_at' => now()]);
        }

        return response()->json(['data' => $category->fresh()]);
    }

    public function destroy(Category $category): JsonResponse
    {
        if ($category->products()->exists()) {
            return response()->json(['code' => 'CATEGORY_IN_USE', 'message' => 'Cette catégorie contient des produits.'], 409);
        }
        $category->delete();

        return response()->json(['data' => null]);
    }

    public function reorder(Request $request): JsonResponse
    {
        $data = $request->validate(['items' => ['required', 'array', 'max:100'], 'items.*.public_id' => ['required', 'ulid', 'distinct'], 'items.*.sort_order' => ['required', 'integer', 'min:0']]);
        DB::transaction(function () use ($data): void {
            foreach ($data['items'] as $item) {
                Category::query()->where('public_id', $item['public_id'])->update(['sort_order' => $item['sort_order']]);
            }
        });

        return response()->json(['data' => null]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, bool $required = true): array
    {
        $category = $request->route('category');
        $ignoreId = $category instanceof Category ? ','.$category->id : '';

        return $request->validate(['name' => [$required ? 'required' : 'sometimes', 'string', 'between:2,160'], 'slug' => ['nullable', 'string', 'max:190', 'unique:categories,slug'.$ignoreId], 'description' => ['nullable', 'string', 'max:5000'], 'is_active' => [$required ? 'required' : 'sometimes', 'boolean'], 'sort_order' => [$required ? 'required' : 'sometimes', 'integer', 'min:0'], 'seo_title' => ['nullable', 'string', 'max:255'], 'seo_description' => ['nullable', 'string', 'max:320']]);
    }
}
