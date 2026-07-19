<?php

namespace Tests\Feature\Commerce;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Domain\Commerce\Actions\CreateGuestOrderAction;
use App\Domain\Commerce\Actions\ReconcileOrderItemsAction;
use App\Domain\Commerce\Models\CheckoutField;
use App\Domain\Commerce\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ReconcileOrderItemsTest extends TestCase
{
    use RefreshDatabase;

    public function test_reconcile_uses_same_shipping_rule_and_preserves_stock_locking(): void
    {
        config()->set('commerce.shipping_fixed_fee_millimes', 2_000);
        config()->set('commerce.shipping_free_threshold_millimes', 10_000);

        $product = $this->product(5, 7_000);
        $order = $this->createOrder($product);
        $actor = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);

        $updated = app(ReconcileOrderItemsAction::class)->handle($order, $order->lock_version, [['product_public_id' => $product->public_id, 'variant_public_id' => null, 'quantity' => 2]], $actor->id);

        $this->assertSame(14_000, $updated->total_millimes);
        $this->assertSame(0, $updated->shipping_fee_millimes);
    }

    private function createOrder(Product $product)
    {
        $payload = $this->payload($product);
        $response = $this->withHeader('Idempotency-Key', '4af95712-4d91-4c57-8d29-917324201301')->postJson('/api/v1/public/orders', $payload)->assertCreated();

        return Order::query()->where('public_reference', $response->json('data.order.public_reference'))->firstOrFail();
    }

    private function payload(Product $product): array
    {
        $fields = CheckoutField::query()->where('is_active', true)->orderBy('sort_order')->get()->map(fn (CheckoutField $field) => $field->only(['key', 'label', 'type', 'is_required', 'options', 'sort_order']))->all();

        return ['checkout_schema_version' => app(CreateGuestOrderAction::class)->schemaVersion($fields), 'customer' => ['full_name' => 'Client Test', 'phone' => '22 123 456', 'city' => 'Tunis', 'address' => '10 rue de la Paix'], 'items' => [['product_public_id' => $product->public_id, 'variant_public_id' => null, 'quantity' => 2]]];
    }

    private function product(int $stock, int $regular = 12_000, ?int $promo = null): Product
    {
        $category = Category::query()->create(['name' => 'Corps', 'slug' => 'corps-'.str()->random(6), 'is_active' => true]);

        return Product::query()->create(['category_id' => $category->id, 'name' => 'Baume', 'slug' => 'baume-'.str()->random(6), 'regular_price_millimes' => $regular, 'promotional_price_millimes' => $promo, 'stock_quantity' => $stock, 'is_active' => true, 'has_variants' => false, 'published_at' => now()]);
    }
}
