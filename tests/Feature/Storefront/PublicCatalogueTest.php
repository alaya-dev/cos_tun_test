<?php

namespace Tests\Feature\Storefront;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PublicCatalogueTest extends TestCase
{
    use RefreshDatabase;

    public function test_homepage_hides_inactive_catalogue_records(): void
    {
        $active = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $inactive = Category::query()->create(['name' => 'Cachée', 'slug' => 'cachee', 'is_active' => false]);
        $this->product($active, 'Sérum visible', 'serum-visible');
        $this->product($inactive, 'Sérum caché', 'serum-cache');

        $this->get('/')
            ->assertOk()
            ->assertSee('Sérum visible')
            ->assertDontSee('Sérum caché')
            ->assertSee('Visage')
            ->assertDontSee('Cachée');
    }

    public function test_shop_filters_sorts_and_paginates_products_server_side(): void
    {
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $this->product($category, 'Zeste', 'zeste', 30_000);
        $this->product($category, 'Aube', 'aube', 10_000, 8_000);

        $this->get('/produits?promotions=1&sort=price_asc')
            ->assertOk()
            ->assertSeeInOrder(['Aube', '8,000 TND'])
            ->assertDontSee('Zeste');
    }

    public function test_product_page_is_server_rendered_with_canonical_and_structured_data(): void
    {
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $this->product($category, 'Sérum éclat', 'serum-eclat', 25_000);

        $this->get('/produits/serum-eclat')
            ->assertOk()
            ->assertSee('Sérum éclat')
            ->assertSee('application/ld+json', false)
            ->assertSee('rel="canonical"', false)
            ->assertSee('schema.org', false);
    }

    public function test_legacy_product_slug_redirects_permanently(): void
    {
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $this->product($category, 'Sérum éclat', 'serum-eclat');
        DB::table('url_redirects')->insert(['from_path' => '/produits/ancien-serum', 'to_path' => '/produits/serum-eclat', 'created_at' => now(), 'updated_at' => now()]);

        $this->get('/produits/ancien-serum')->assertRedirect('/produits/serum-eclat')->assertStatus(301);
    }

    public function test_search_page_returns_matching_products_and_categories(): void
    {
        $category = Category::query()->create(['name' => 'Rituels du visage', 'slug' => 'rituels-visage', 'is_active' => true]);
        $this->product($category, 'Huile visage', 'huile-visage');

        $this->get('/recherche?q=visage')
            ->assertOk()
            ->assertSee('Huile visage')
            ->assertSee('Rituels du visage');
    }

    public function test_product_page_exposes_variant_selection_data(): void
    {
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Sérum nuancé', 'slug' => 'serum-nuance', 'regular_price_millimes' => 25_000, 'stock_quantity' => null, 'is_active' => true, 'has_variants' => true, 'published_at' => now()]);
        $group = $product->optionGroups()->create(['name' => 'Format', 'sort_order' => 0]);
        $value = $group->values()->create(['value' => '30 ml', 'sort_order' => 0]);
        $variant = $product->variants()->create(['combination_key' => (string) $value->id, 'stock_quantity' => 3, 'is_active' => true]);
        $variant->values()->sync([$value->id]);

        $this->get('/produits/serum-nuance')
            ->assertOk()
            ->assertSee('Format')
            ->assertSee('30 ml')
            ->assertSee('data-product-variants', false);
    }

    public function test_homepage_cache_is_invalidated_when_a_product_changes(): void
    {
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $product = $this->product($category, 'Ancien nom', 'ancien-nom');
        $this->get('/')->assertSee('Ancien nom');
        $product->update(['name' => 'Nouveau nom']);

        $this->get('/')->assertSee('Nouveau nom')->assertDontSee('Ancien nom');
    }

    private function product(Category $category, string $name, string $slug, int $regularPrice = 20_000, ?int $promotionalPrice = null): Product
    {
        return Product::query()->create([
            'category_id' => $category->id,
            'name' => $name,
            'slug' => $slug,
            'regular_price_millimes' => $regularPrice,
            'promotional_price_millimes' => $promotionalPrice,
            'stock_quantity' => 4,
            'is_active' => true,
            'published_at' => now(),
        ]);
    }
}
