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

    public function test_super_admin_can_search_create_and_update_a_back_office_user(): void
    {
        $owner = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $existing = User::factory()->create(['name' => 'Amira Ben Salem', 'email' => 'amira@example.test', 'role' => 'admin']);

        $this->actingAs($owner)->getJson('/api/v1/admin/users?search=Amira&per_page=15')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.data.0.public_id', $existing->public_id);

        $created = $this->actingAs($owner)->postJson('/api/v1/admin/users', [
            'name' => 'Nouvel administrateur',
            'email' => 'nouvel-admin@example.test',
            'role' => 'admin',
            'is_active' => true,
            'force_password_change' => true,
            'password' => 'mot-de-passe-solide-2026',
            'password_confirmation' => 'mot-de-passe-solide-2026',
        ])->assertCreated()->json('data.public_id');

        $this->actingAs($owner)->patchJson('/api/v1/admin/users/'.$created, [
            'is_active' => false,
            'force_password_change' => false,
        ])->assertOk()->assertJsonPath('data.is_active', false)->assertJsonPath('data.force_password_change', false);
    }
}
