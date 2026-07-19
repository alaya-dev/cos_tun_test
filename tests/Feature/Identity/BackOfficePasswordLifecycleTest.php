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

    public function test_password_change_accepts_eight_characters_and_returns_french_confirmation_feedback(): void
    {
        $user = User::factory()->create(['password' => 'old-password-123']);

        $this->actingAs($user)->postJson('/api/v1/admin/me/password', [
            'current_password' => 'old-password-123',
            'password' => 'nouveau8',
            'password_confirmation' => 'different',
        ])->assertUnprocessable()->assertJsonPath('errors.password.0', 'La confirmation du nouveau mot de passe ne correspond pas.');

        $this->actingAs($user)->postJson('/api/v1/admin/me/password', [
            'current_password' => 'old-password-123',
            'password' => 'nouveau8',
            'password_confirmation' => 'nouveau8',
        ])->assertOk();

        $this->assertTrue(password_verify('nouveau8', (string) $user->fresh()->password));
    }
}
