<?php

namespace Tests\Feature\Commerce;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CartQuoteTest extends TestCase
{
    use RefreshDatabase;

    public function test_quote_uses_server_price_and_does_not_reserve_stock(): void
    {
        $product = $this->product(5, 12_000, 9_000);
        $response = $this->postJson('/api/v1/public/cart/quote', ['items' => [['product_public_id' => $product->public_id, 'variant_public_id' => null, 'quantity' => 2, 'effective_unit_price_millimes' => 1]]]);

        $response->assertOk()->assertJsonPath('data.items.0.effective_unit_price.millimes', 9_000)->assertJsonPath('data.pricing.total.millimes', 18_000)->assertJsonPath('data.can_checkout', true);
        $this->assertSame(5, $product->fresh()->stock_quantity);
    }

    public function test_quote_clearly_corrects_unavailable_quantity(): void
    {
        $product = $this->product(1);

        $this->postJson('/api/v1/public/cart/quote', ['items' => [['product_public_id' => $product->public_id, 'variant_public_id' => null, 'quantity' => 2]]])
            ->assertOk()->assertJsonPath('data.items.0.is_available', false)->assertJsonPath('data.can_checkout', false)->assertJsonPath('data.items.0.quantity_available', 1);
    }

    public function test_variant_product_requires_a_matching_active_variant(): void
    {
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Sérum', 'slug' => 'serum', 'regular_price_millimes' => 12_000, 'stock_quantity' => null, 'is_active' => true, 'has_variants' => true, 'published_at' => now()]);
        $group = $product->optionGroups()->create(['name' => 'Format']);
        $value = $group->values()->create(['value' => '30 ml']);
        $variant = $product->variants()->create(['combination_key' => (string) $value->id, 'stock_quantity' => 2, 'is_active' => true]);
        $variant->values()->sync([$value->id]);

        $this->postJson('/api/v1/public/cart/quote', ['items' => [['product_public_id' => $product->public_id, 'variant_public_id' => null, 'quantity' => 1]]])->assertJsonPath('data.can_checkout', false);
        $this->postJson('/api/v1/public/cart/quote', ['items' => [['product_public_id' => $product->public_id, 'variant_public_id' => $variant->public_id, 'quantity' => 1]]])->assertJsonPath('data.can_checkout', true)->assertJsonPath('data.items.0.variant_label', 'Format: 30 ml');
    }

    private function product(int $stock, int $regular = 12_000, ?int $promo = null): Product
    {
        $category = Category::query()->create(['name' => 'Corps', 'slug' => 'corps-'.str()->random(6), 'is_active' => true]);

        return Product::query()->create(['category_id' => $category->id, 'name' => 'Baume', 'slug' => 'baume-'.str()->random(6), 'regular_price_millimes' => $regular, 'promotional_price_millimes' => $promo, 'stock_quantity' => $stock, 'is_active' => true, 'has_variants' => false, 'published_at' => now()]);
    }
}
