<?php

namespace Tests\Feature\Catalog;

use App\Domain\Catalog\Actions\AdjustInventoryAction;
use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class InventoryAdjustmentTest extends TestCase
{
    use RefreshDatabase;

    public function test_adjustment_is_audited_and_cannot_make_stock_negative(): void
    {
        $category = Category::query()->create(['name' => 'Corps', 'slug' => 'corps', 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Huile', 'slug' => 'huile', 'regular_price_millimes' => 10_000, 'stock_quantity' => 3, 'is_active' => true]);
        $actor = User::factory()->create();
        $action = app(AdjustInventoryAction::class);
        $action->handle($product, null, -2, 'Correction après comptage', $actor->id);
        $this->assertSame(1, $product->fresh()->stock_quantity);
        $this->assertDatabaseHas('inventory_movements', ['product_id' => $product->id, 'actor_user_id' => $actor->id, 'type' => 'manual_adjustment', 'quantity_delta' => -2]);
        try {
            $action->handle($product, null, -2, 'Erreur', $actor->id);
            $this->fail('Le stock négatif doit être refusé.');
        } catch (ValidationException) {
            $this->assertSame(1, $product->fresh()->stock_quantity);
        }
    }

    public function test_admin_can_filter_movement_history_by_product_type_and_date(): void
    {
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $matching = Product::query()->create(['category_id' => $category->id, 'name' => 'Sérum rose', 'slug' => 'serum-rose', 'regular_price_millimes' => 15_000, 'stock_quantity' => 5, 'is_active' => true]);
        $other = Product::query()->create(['category_id' => $category->id, 'name' => 'Huile dorée', 'slug' => 'huile-doree', 'regular_price_millimes' => 15_000, 'stock_quantity' => 5, 'is_active' => true]);
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $action = app(AdjustInventoryAction::class);
        $action->handle($matching, null, 1, 'Réception fournisseur', $admin->id);
        $action->handle($other, null, -1, 'Correction inventaire', $admin->id);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/inventory/movements?search=sérum&type=manual_adjustment&date_from='.now()->toDateString().'&date_to='.now()->toDateString())
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.product.name', 'Sérum rose');
    }
}
