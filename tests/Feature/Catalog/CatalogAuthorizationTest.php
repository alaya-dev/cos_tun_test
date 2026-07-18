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
}
