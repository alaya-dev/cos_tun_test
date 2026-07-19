<?php

namespace Tests\Feature\Audit;

use App\Domain\Audit\Models\AuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditLogApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_only_super_admin_can_read_audit_logs(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);
        $owner = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        AuditLog::query()->create(['action' => 'test', 'auditable_type' => 'test', 'auditable_id' => '1', 'before' => ['password' => 'secret', 'email' => 'client@example.test'], 'after' => ['safe' => true]]);

        $this->actingAs($admin)->getJson('/api/v1/admin/audit-logs')->assertForbidden();
        $this->actingAs($owner)->getJson('/api/v1/admin/audit-logs')->assertOk()->assertJsonMissing(['password' => 'secret'])->assertJsonMissing(['email' => 'client@example.test']);
    }

    public function test_super_admin_can_filter_the_paginated_audit_log(): void
    {
        $owner = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        AuditLog::query()->create(['action' => 'user.updated', 'auditable_type' => User::class, 'auditable_id' => '1', 'actor_role_snapshot' => 'super_admin', 'after' => ['is_active' => false]]);
        AuditLog::query()->create(['action' => 'catalog.product_updated', 'auditable_type' => 'product', 'auditable_id' => '2', 'actor_role_snapshot' => 'admin']);

        $this->actingAs($owner)->getJson('/api/v1/admin/audit-logs?search=user&actor_role=super_admin')
            ->assertOk()
            ->assertJsonPath('data.meta.total', 1)
            ->assertJsonPath('data.data.0.action', 'user.updated');
    }
}
