<?php

namespace Tests\Feature\Commerce;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Domain\Commerce\Actions\TransitionOrderStatusAction;
use App\Domain\Commerce\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class OrderTransitionTest extends TestCase
{
    use RefreshDatabase;

    public function test_cancellation_restores_stock_once_and_records_history(): void
    {
        [$order, $product] = $this->orderWithItem();
        $actor = User::factory()->create();
        $action = app(TransitionOrderStatusAction::class);

        $action->handle($order, 'annulee', 'Client indisponible', $actor->id);
        $this->assertSame(3, $product->fresh()->stock_quantity);
        $this->assertDatabaseHas('order_status_history', ['order_id' => $order->id, 'from_status' => 'nouvelle', 'to_status' => 'annulee', 'changed_by' => $actor->id]);
        try {
            $action->handle($order->fresh(), 'annulee', 'Deuxième essai', $actor->id);
            $this->fail('Une transition terminale doit être refusée.');
        } catch (ValidationException) {
            $this->assertSame(3, $product->fresh()->stock_quantity);
        }
    }

    public function test_invalid_transition_does_not_change_stock_or_status(): void
    {
        [$order, $product] = $this->orderWithItem();
        $actor = User::factory()->create();
        try {
            app(TransitionOrderStatusAction::class)->handle($order, 'livree', null, $actor->id);
            $this->fail('Une transition non autorisée doit être refusée.');
        } catch (ValidationException) {
        }
        $this->assertSame('nouvelle', $order->fresh()->status);
        $this->assertSame(2, $product->fresh()->stock_quantity);
    }

    /** @return array{Order, Product} */
    private function orderWithItem(): array
    {
        $category = Category::query()->create(['name' => 'Corps', 'slug' => 'corps-'.str()->random(6), 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Huile', 'slug' => 'huile-'.str()->random(6), 'regular_price_millimes' => 10_000, 'stock_quantity' => 2, 'is_active' => true]);
        $order = Order::query()->create(['checkout_idempotency_key' => (string) str()->uuid(), 'checkout_payload_hash' => str()->random(64), 'status' => 'nouvelle', 'customer_name' => 'Client', 'customer_phone' => '22123456', 'customer_city' => 'Tunis', 'customer_address' => 'Rue test', 'subtotal_millimes' => 10_000, 'product_discount_millimes' => 0, 'promo_code_discount_millimes' => 0, 'shipping_fee_millimes' => 0, 'total_millimes' => 10_000]);
        $order->items()->create(['product_id' => $product->id, 'product_name_snapshot' => $product->name, 'regular_unit_price_millimes' => 10_000, 'effective_unit_price_millimes' => 10_000, 'quantity' => 1, 'line_total_millimes' => 10_000]);

        return [$order, $product];
    }
}
