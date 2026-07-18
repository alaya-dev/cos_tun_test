<?php

namespace Tests\Feature\Commerce;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Domain\Commerce\Actions\ReconcileOrderItemsAction;
use App\Domain\Commerce\Actions\TransitionOrderStatusAction;
use App\Domain\Commerce\Actions\UpdateOrderCustomerAction;
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

    public function test_customer_update_rejects_stale_version_and_terminal_orders(): void
    {
        [$order] = $this->orderWithItem();
        $action = app(UpdateOrderCustomerAction::class);
        $customer = ['full_name' => 'Client Modifié', 'phone' => '22 987 654', 'city' => 'Ariana', 'address' => 'Nouvelle rue'];
        $action->handle($order, 1, $customer);
        $this->assertSame('Client Modifié', $order->fresh()->customer_name);
        try {
            $action->handle($order->fresh(), 1, $customer);
            $this->fail('Une version périmée doit être refusée.');
        } catch (ValidationException) {
        }
        $order->update(['status' => 'livree']);
        try {
            $action->handle($order->fresh(), 2, $customer);
            $this->fail('Une commande terminale doit être refusée.');
        } catch (ValidationException) {
            $this->assertSame('livree', $order->fresh()->status);
        }
    }

    public function test_item_reconciliation_restores_old_stock_and_deducts_new_stock(): void
    {
        [$order, $oldProduct] = $this->orderWithItem();
        $category = $oldProduct->category;
        $replacement = Product::query()->create(['category_id' => $category->id, 'name' => 'Baume', 'slug' => 'baume-'.str()->random(6), 'regular_price_millimes' => 20_000, 'stock_quantity' => 4, 'is_active' => true]);
        $actor = User::factory()->create();
        app(ReconcileOrderItemsAction::class)->handle($order, 1, [['product_public_id' => $replacement->public_id, 'variant_public_id' => null, 'quantity' => 2]], $actor->id);
        $this->assertSame(3, $oldProduct->fresh()->stock_quantity);
        $this->assertSame(2, $replacement->fresh()->stock_quantity);
        $this->assertSame(40_000, $order->fresh()->total_millimes);
        $this->assertDatabaseHas('inventory_movements', ['type' => 'order_edit_restore', 'product_id' => $oldProduct->id]);
        $this->assertDatabaseHas('inventory_movements', ['type' => 'order_edit_deduction', 'product_id' => $replacement->id]);
    }

    public function test_item_reconciliation_locks_and_uses_the_selected_variant(): void
    {
        [$order, $oldProduct] = $this->orderWithItem();
        $replacement = Product::query()->create(['category_id' => $oldProduct->category_id, 'name' => 'Gel avec teinte', 'slug' => 'gel-'.str()->random(6), 'regular_price_millimes' => 15_000, 'stock_quantity' => 0, 'has_variants' => true, 'is_active' => true]);
        $variant = $replacement->variants()->create(['sku' => 'GEL-NUDE', 'combination_key' => 'nude', 'stock_quantity' => 3, 'is_active' => true]);
        $actor = User::factory()->create();

        app(ReconcileOrderItemsAction::class)->handle($order, 1, [['product_public_id' => $replacement->public_id, 'variant_public_id' => $variant->public_id, 'quantity' => 2]], $actor->id);

        $this->assertSame(3, $oldProduct->fresh()->stock_quantity);
        $this->assertSame(1, $variant->fresh()->stock_quantity);
        $this->assertDatabaseHas('inventory_movements', ['type' => 'order_edit_deduction', 'product_variant_id' => $variant->id, 'quantity_after' => 1]);
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
