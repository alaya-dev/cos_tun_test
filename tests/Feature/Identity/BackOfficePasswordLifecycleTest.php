<?php

namespace Tests\Feature\Identity;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BackOfficePasswordLifecycleTest extends TestCase
{
    use RefreshDatabase;

    public function test_current_user_is_safe_and_password_change_is_write_only(): void
    {
        $user = User::factory()->create(['password' => 'old-password-123']);

        $this->actingAs($user)->getJson('/api/v1/admin/me')->assertOk()->assertJsonMissingPath('data.password');
        $this->actingAs($user)->postJson('/api/v1/admin/me/password', ['current_password' => 'old-password-123', 'password' => 'new-password-123', 'password_confirmation' => 'new-password-123'])->assertOk()->assertJsonMissingPath('data.password');
        $this->assertTrue(password_verify('new-password-123', (string) $user->fresh()->password));
    }
}
