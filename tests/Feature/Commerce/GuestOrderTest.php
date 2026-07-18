<?php

namespace Tests\Feature\Commerce;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Domain\Commerce\Actions\CreateGuestOrderAction;
use App\Domain\Commerce\Models\CheckoutField;
use App\Domain\Commerce\Models\Order;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Middleware\ThrottleRequests;
use Tests\TestCase;

class GuestOrderTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ThrottleRequests::class);
    }

    public function test_order_uses_server_price_deducts_stock_and_replays_once(): void
    {
        $product = $this->product(2, 15_000, 10_000);
        $payload = $this->payload($product);
        $key = '4af95712-4d91-4c57-8d29-917324200001';

        $first = $this->withHeader('Idempotency-Key', $key)->postJson('/api/v1/public/orders', $payload)->assertCreated()->assertJsonPath('data.order.pricing.total.millimes', 20_000);
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/v1/public/orders', $payload)->assertOk()->assertJsonPath('data.order.public_reference', $first->json('data.order.public_reference'));
        $this->assertSame(0, $product->fresh()->stock_quantity);
        $this->assertSame(1, Order::query()->count());
        $this->assertDatabaseHas('inventory_movements', ['type' => 'order_deduction', 'quantity_delta' => -2]);
    }

    public function test_order_rejects_stock_change_without_creating_partial_order(): void
    {
        $product = $this->product(1);

        $this->withHeader('Idempotency-Key', '4af95712-4d91-4c57-8d29-917324200002')->postJson('/api/v1/public/orders', $this->payload($product, 2))
            ->assertConflict()->assertJsonPath('code', 'INSUFFICIENT_STOCK');
        $this->assertSame(0, Order::query()->count());
        $this->assertSame(1, $product->fresh()->stock_quantity);
    }

    public function test_idempotency_key_rejects_a_different_payload(): void
    {
        $product = $this->product(4);
        $key = '4af95712-4d91-4c57-8d29-917324200004';
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/v1/public/orders', $this->payload($product, 1))->assertCreated();
        $this->withHeader('Idempotency-Key', $key)->postJson('/api/v1/public/orders', $this->payload($product, 2))->assertConflict()->assertJsonPath('code', 'CHECKOUT_IDEMPOTENCY_CONFLICT');
        $this->assertSame(1, Order::query()->count());
    }

    /** @return array<string, mixed> */
    private function payload(Product $product, int $quantity = 2): array
    {
        $fields = CheckoutField::query()->where('is_active', true)->orderBy('sort_order')->get()->map(fn (CheckoutField $field) => $field->only(['key', 'label', 'type', 'is_required', 'options']))->all();

        return ['checkout_schema_version' => app(CreateGuestOrderAction::class)->schemaVersion($fields), 'customer' => ['full_name' => 'Client Test', 'phone' => '22 123 456', 'city' => 'Tunis', 'address' => '10 rue de la Paix'], 'items' => [['product_public_id' => $product->public_id, 'variant_public_id' => null, 'quantity' => $quantity, 'price' => 1]]];
    }

    private function product(int $stock, int $regular = 15_000, ?int $promotion = null): Product
    {
        $category = Category::query()->create(['name' => 'Soin', 'slug' => 'soin-'.str()->random(6), 'is_active' => true]);

        return Product::query()->create(['category_id' => $category->id, 'name' => 'Huile', 'slug' => 'huile-'.str()->random(6), 'regular_price_millimes' => $regular, 'promotional_price_millimes' => $promotion, 'stock_quantity' => $stock, 'is_active' => true, 'has_variants' => false, 'published_at' => now()]);
    }
}
