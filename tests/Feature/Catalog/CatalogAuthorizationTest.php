<?php

namespace Tests\Feature\Catalog;

use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\InventoryMovement;
use App\Domain\Catalog\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CatalogAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_catalog_routes_reject_guests(): void
    {
        $this->getJson('/api/v1/admin/categories')->assertUnauthorized();
    }

    public function test_active_admin_can_list_categories(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/categories')->assertOk();
    }

    public function test_inactive_admin_is_denied_catalog_access(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => false]);
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/categories')->assertForbidden();
    }

    public function test_order_and_inventory_operations_reject_guests_and_inactive_admins(): void
    {
        $this->getJson('/api/v1/admin/orders')->assertUnauthorized();
        $this->get('/api/v1/admin/orders/export')->assertUnauthorized();
        $this->getJson('/api/v1/admin/inventory/movements')->assertUnauthorized();

        $inactive = User::factory()->create(['role' => 'admin', 'is_active' => false]);
        $this->actingAs($inactive, 'sanctum')->getJson('/api/v1/admin/orders')->assertForbidden();
        $this->actingAs($inactive, 'sanctum')->get('/api/v1/admin/orders/export')->assertForbidden();
        $this->actingAs($inactive, 'sanctum')->getJson('/api/v1/admin/inventory/movements')->assertForbidden();
    }

    public function test_active_admin_can_access_the_private_operational_lists(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);

        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/orders')->assertOk();
        $this->actingAs($admin, 'sanctum')->getJson('/api/v1/admin/inventory/movements')->assertOk();
    }

    public function test_hiding_a_category_hides_its_products(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Sérum', 'slug' => 'serum', 'regular_price_millimes' => 25_000, 'stock_quantity' => 5, 'is_active' => true]);

        $this->actingAs($admin, 'sanctum')->patchJson('/api/v1/admin/categories/'.$category->public_id, [
            'is_active' => false,
        ])->assertOk();

        $this->assertFalse($category->fresh()->is_active);
        $this->assertFalse($product->fresh()->is_active);
    }

    public function test_an_active_admin_can_update_and_archive_products_in_bulk(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $category = Category::query()->create(['name' => 'Corps', 'slug' => 'corps', 'is_active' => true]);
        $products = collect(['Huile', 'Baume'])->map(fn (string $name) => Product::query()->create([
            'category_id' => $category->id,
            'name' => $name,
            'slug' => str($name)->slug().'-'.str()->random(6),
            'regular_price_millimes' => 20_000,
            'stock_quantity' => 3,
            'is_active' => false,
        ]));

        $ids = $products->pluck('public_id')->all();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/bulk-status', [
            'public_ids' => $ids,
            'is_active' => true,
        ])->assertOk()->assertJsonPath('data.updated', 2);
        $this->assertTrue($products->first()->fresh()->is_active);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/bulk-archive', [
            'public_ids' => $ids,
        ])->assertOk()->assertJsonPath('data.archived', 2);
        $this->assertCount(2, Product::withTrashed()->whereNotNull('deleted_at')->get());

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/bulk-restore', [
            'public_ids' => $ids,
        ])->assertOk()->assertJsonPath('data.restored', 2);
        $this->assertFalse($products->first()->fresh()->trashed());
        $this->assertFalse($products->first()->fresh()->is_active);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/bulk-archive', [
            'public_ids' => $ids,
        ])->assertOk();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/bulk-force-delete', [
            'public_ids' => $ids,
        ])->assertOk()->assertJsonPath('data.deleted', 2);
        $this->assertCount(0, Product::withTrashed()->whereIn('public_id', $ids)->get());
    }

    public function test_a_product_with_inventory_history_cannot_be_permanently_deleted(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $category = Category::query()->create(['name' => 'Maison', 'slug' => 'maison', 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Brume', 'slug' => 'brume', 'regular_price_millimes' => 20_000, 'stock_quantity' => 4, 'is_active' => false]);
        InventoryMovement::query()->create(['product_id' => $product->id, 'actor_user_id' => $admin->id, 'type' => 'manual_adjustment', 'quantity_delta' => 1, 'quantity_before' => 3, 'quantity_after' => 4, 'reason' => 'Historique test']);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/bulk-archive', [
            'public_ids' => [$product->public_id],
        ])->assertOk();
        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/bulk-force-delete', [
            'public_ids' => [$product->public_id],
        ])->assertStatus(422);
        $this->assertTrue($product->fresh()->trashed());
    }
}
