<?php

namespace App\Http\Controllers;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Domain\Catalog\Services\CatalogCacheVersion;
use App\Domain\Commerce\Models\Order;
use App\Domain\Content\Services\HomepageContentService;
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

    public function home(HomepageContentService $content): View
    {
        return view('storefront.home', $content->viewModel());
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

    /** @param Builder<Product> $query
     * @return Builder<Product>
     */
    private function applyFilters(Builder $query, Request $request): Builder
    {
        $minimumPrice = $this->millimesFromDinars($request->string('min_price_dt')->toString());
        $maximumPrice = $this->millimesFromDinars($request->string('max_price_dt')->toString());
        $categorySlug = $request->string('category')->toString();
        $sort = $request->string('sort')->toString();

        $hasActiveCategory = $categorySlug !== '' && mb_strlen($categorySlug) <= 120 && Category::query()
            ->where('slug', $categorySlug)
            ->where('is_active', true)
            ->exists();
        if ($hasActiveCategory) {
            $query->whereHas('category', fn (Builder $categoryQuery) => $categoryQuery->where('slug', $categorySlug)->where('is_active', true));
        }
        if ($minimumPrice !== null) {
            $query->whereRaw('COALESCE(promotional_price_millimes, regular_price_millimes) >= ?', [$minimumPrice]);
        }
        if ($maximumPrice !== null) {
            $query->whereRaw('COALESCE(promotional_price_millimes, regular_price_millimes) <= ?', [$maximumPrice]);
        }
        if ($request->boolean('promotions')) {
            $query->whereNotNull('promotional_price_millimes');
        }

        match ($sort) {
            'name_asc' => $query->orderBy('name'),
            'price_asc' => $query->orderByRaw('COALESCE(promotional_price_millimes, regular_price_millimes)'),
            'price_desc' => $query->orderByRaw('COALESCE(promotional_price_millimes, regular_price_millimes) DESC'),
            default => $query->latest('published_at')->latest('id'),
        };

        return $query;
    }

    private function millimesFromDinars(string $amount): ?int
    {
        $normalized = str_replace(',', '.', trim($amount));
        if ($normalized === '' || ! preg_match('/^\d+(?:\.\d{1,3})?$/', $normalized)) {
            return null;
        }

        $parts = explode('.', $normalized, 2);
        $whole = $parts[0];
        $fraction = $parts[1] ?? '';

        return ((int) $whole * 1000) + (int) str_pad($fraction, 3, '0');
    }

    private function redirectForLegacyPath(string $path): ?RedirectResponse
    {
        $destination = DB::table('url_redirects')->where('from_path', $path)->value('to_path');

        return $destination ? redirect($destination, 301) : null;
    }
}
