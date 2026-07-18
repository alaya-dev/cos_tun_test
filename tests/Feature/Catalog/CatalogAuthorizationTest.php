<?php

namespace Tests\Feature\Catalog;

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
}
