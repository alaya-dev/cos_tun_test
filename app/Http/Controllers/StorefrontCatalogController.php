<?php

namespace App\Http\Controllers;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Domain\Catalog\Services\CatalogCacheVersion;
use App\Domain\Commerce\Models\Order;
use Illuminate\Contracts\View\View;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class StorefrontCatalogController extends Controller
{
    public function cart(): View
    {
        return view('storefront.cart');
    }

    public function checkout(): View
    {
        return view('storefront.checkout');
    }

    public function confirmation(Order $order): View
    {
        return view('storefront.confirmation', compact('order'));
    }

    public function home(): View
    {
        $version = app(CatalogCacheVersion::class)->current();
        $categories = Cache::store('redis')->remember("pc:cache:storefront:home:categories:{$version}", now()->addMinutes(10), fn () => Category::query()
            ->where('is_active', true)->orderBy('sort_order')->limit(8)->get());
        $newProducts = Cache::store('redis')->remember("pc:cache:storefront:home:new-products:{$version}", now()->addMinutes(10), fn () => $this->catalogueQuery()->latest('published_at')->limit(8)->get());

        return view('storefront.home', compact('categories', 'newProducts'));
    }

    public function products(Request $request): View
    {
        $categories = Category::query()->where('is_active', true)->orderBy('sort_order')->get();
        $products = $this->applyFilters($this->catalogueQuery(), $request)->paginate(20)->withQueryString();

        return view('storefront.products.index', compact('categories', 'products'));
    }

    public function category(Request $request, string $slug): View|RedirectResponse
    {
        $category = Category::query()->where('slug', $slug)->where('is_active', true)->first();
        if (! $category) {
            return $this->redirectForLegacyPath('/categories/'.$slug) ?? abort(404);
        }
        $categories = Category::query()->where('is_active', true)->orderBy('sort_order')->get();
        $products = $this->applyFilters($this->catalogueQuery()->where('category_id', $category->id), $request)->paginate(20)->withQueryString();

        return view('storefront.categories.show', compact('category', 'categories', 'products'));
    }

    public function product(string $slug): View|RedirectResponse
    {
        $version = app(CatalogCacheVersion::class)->current();
        $product = Cache::store('redis')->remember("pc:cache:storefront:product:{$slug}:{$version}", now()->addMinutes(10), fn () => $this->catalogueQuery()->where('slug', $slug)->first());
        if (! $product) {
            return $this->redirectForLegacyPath('/produits/'.$slug) ?? abort(404);
        }
        $relatedProducts = $this->catalogueQuery()
            ->where('category_id', $product->category_id)
            ->whereKeyNot($product->id)
            ->limit(4)
            ->get();

        return view('storefront.products.show', compact('product', 'relatedProducts'));
    }

    public function search(Request $request): View
    {
        $data = $request->validate(['q' => ['nullable', 'string', 'max:100']]);
        $query = trim($data['q'] ?? '');
        $products = $query === ''
            ? collect()
            : $this->catalogueQuery()->where('name', 'like', '%'.$query.'%')->paginate(20)->withQueryString();
        $categories = $query === ''
            ? collect()
            : Category::query()->where('is_active', true)->where('name', 'like', '%'.$query.'%')->orderBy('name')->limit(8)->get();

        return view('storefront.search', compact('categories', 'products', 'query'));
    }

    /** @return Builder<Product> */
    private function catalogueQuery()
    {
        return Product::public()
            ->with([
                'category:id,name,slug',
                'images' => fn ($query) => $query->where('processing_status', 'ready')->orderByDesc('is_primary')->orderBy('sort_order'),
                'variants.values',
                'optionGroups.values',
            ]);
    }

    /** @param Builder<Product> $query */
    /**
     * @param  Builder<Product>  $query
     * @return Builder<Product>
     */
    private function applyFilters(Builder $query, Request $request): Builder
    {
        $data = $request->validate([
            'min_price' => ['nullable', 'integer', 'min:0'],
            'max_price' => ['nullable', 'integer', 'min:0'],
            'promotions' => ['nullable', 'boolean'],
            'sort' => ['nullable', 'in:newest,name_asc,price_asc,price_desc'],
        ]);
        if (isset($data['min_price'])) {
            $query->whereRaw('COALESCE(promotional_price_millimes, regular_price_millimes) >= ?', [$data['min_price']]);
        }
        if (isset($data['max_price'])) {
            $query->whereRaw('COALESCE(promotional_price_millimes, regular_price_millimes) <= ?', [$data['max_price']]);
        }
        if ($data['promotions'] ?? false) {
            $query->whereNotNull('promotional_price_millimes');
        }

        match ($data['sort'] ?? 'newest') {
            'name_asc' => $query->orderBy('name'),
            'price_asc' => $query->orderByRaw('COALESCE(promotional_price_millimes, regular_price_millimes)'),
            'price_desc' => $query->orderByRaw('COALESCE(promotional_price_millimes, regular_price_millimes) DESC'),
            default => $query->latest('published_at')->latest('id'),
        };

        return $query;
    }

    private function redirectForLegacyPath(string $path): ?RedirectResponse
    {
        $destination = DB::table('url_redirects')->where('from_path', $path)->value('to_path');

        return $destination ? redirect($destination, 301) : null;
    }
}
