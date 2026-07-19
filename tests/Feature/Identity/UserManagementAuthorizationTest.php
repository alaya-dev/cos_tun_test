<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserManagementAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_cannot_manage_users_and_super_admin_can_list_users(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $owner = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);

        $this->actingAs($admin)->getJson('/api/v1/admin/users')->assertForbidden();
        $this->actingAs($owner)->getJson('/api/v1/admin/users')->assertOk()->assertJsonFragment(['public_id' => $admin->public_id]);
    }

    public function test_final_super_admin_cannot_be_disabled(): void
    {
        $owner = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);

        $this->actingAs($owner)->patchJson('/api/v1/admin/users/'.$owner->public_id, ['is_active' => false])->assertStatus(422);
        $this->assertTrue($owner->fresh()->is_active);
    }
}
