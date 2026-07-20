<?php

namespace Tests\Feature\Commerce;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Domain\Commerce\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BulkOrderOperationsTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_transition_compatible_orders_in_bulk(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $orders = collect([$this->makeOrder('nouvelle'), $this->makeOrder('nouvelle')]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/orders/bulk-transition', [
            'references' => $orders->pluck('public_reference')->all(),
            'to_status' => 'confirmee',
        ])->assertOk()->assertJsonPath('data.updated', 2);

        $this->assertSame('confirmee', $orders->first()->fresh()->status);
        $this->assertDatabaseCount('order_status_history', 2);
    }

    public function test_bulk_transition_rejects_a_selection_without_a_common_next_step(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $new = $this->makeOrder('nouvelle');
        $confirmed = $this->makeOrder('confirmee');

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/orders/bulk-transition', [
            'references' => [$new->public_reference, $confirmed->public_reference],
            'to_status' => 'livree',
        ])->assertStatus(422)->assertJsonPath('code', 'BULK_TRANSITION_NOT_ALLOWED');

        $this->assertSame('nouvelle', $new->fresh()->status);
        $this->assertSame('confirmee', $confirmed->fresh()->status);
    }

    public function test_bulk_archiving_hides_orders_without_erasing_their_history(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $order = $this->makeOrder('nouvelle');

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/orders/bulk-archive', [
            'references' => [$order->public_reference],
        ])->assertOk()->assertJsonPath('data.archived', 1);

        $this->assertNotNull($order->fresh()->archived_at);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/orders')
            ->assertOk()->assertJsonMissing(['public_reference' => $order->public_reference]);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/orders?archived=1')
            ->assertOk()->assertJsonFragment(['public_reference' => $order->public_reference]);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/orders/'.$order->public_reference)->assertOk();

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/orders/bulk-restore', [
            'references' => [$order->public_reference],
        ])->assertOk()->assertJsonPath('data.restored', 1);
        $this->assertNull($order->fresh()->archived_at);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/orders')
            ->assertOk()->assertJsonFragment(['public_reference' => $order->public_reference]);
    }

    public function test_order_detail_includes_the_selected_variant_values(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $category = Category::query()->create(['name' => 'Corps', 'slug' => 'corps-'.str()->random(6), 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Baume', 'slug' => 'baume-'.str()->random(6), 'regular_price_millimes' => 10_000, 'stock_quantity' => null, 'has_variants' => true, 'is_active' => true]);
        $group = $product->optionGroups()->create(['name' => 'Format']);
        $value = $group->values()->create(['value' => '50 ml']);
        $variant = $product->variants()->create(['sku' => null, 'combination_key' => '50-ml', 'stock_quantity' => 3, 'is_active' => true]);
        $variant->values()->attach($value);
        $order = $this->makeOrder('nouvelle');
        $order->items()->create(['product_id' => $product->id, 'product_variant_id' => $variant->id, 'product_name_snapshot' => $product->name, 'regular_unit_price_millimes' => 10_000, 'effective_unit_price_millimes' => 10_000, 'quantity' => 1, 'line_total_millimes' => 10_000]);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/orders/'.$order->public_reference)
            ->assertOk()
            ->assertJsonPath('data.order.items.0.variant.values.0.value', '50 ml');
    }

    private function makeOrder(string $status): Order
    {
        return Order::query()->create([
            'checkout_idempotency_key' => (string) str()->uuid(),
            'checkout_payload_hash' => str()->random(64),
            'status' => $status,
            'customer_name' => 'Client test',
            'customer_phone' => '22123456',
            'customer_city' => 'Tunis',
            'customer_address' => 'Rue test',
            'subtotal_millimes' => 10_000,
            'product_discount_millimes' => 0,
            'promo_code_discount_millimes' => 0,
            'shipping_fee_millimes' => 0,
            'total_millimes' => 10_000,
        ]);
    }
}
