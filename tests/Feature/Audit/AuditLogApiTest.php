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
        AuditLog::query()->create(['action' => 'test', 'auditable_type' => 'test', 'auditable_id' => '1', 'before' => ['password' => 'secret'], 'after' => ['safe' => true]]);

        $this->actingAs($admin)->getJson('/api/v1/admin/audit-logs')->assertForbidden();
        $this->actingAs($owner)->getJson('/api/v1/admin/audit-logs')->assertOk()->assertJsonMissing(['password' => 'secret']);
    }
}
