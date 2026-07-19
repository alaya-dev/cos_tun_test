<?php

namespace Tests\Feature\Audit;

use App\Domain\Audit\Actions\RecordAuditEventAction;
use App\Domain\Catalog\Models\Category;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\AssertsApiEnvelope;
use Tests\TestCase;

class AuditLogTest extends TestCase
{
    use AssertsApiEnvelope;
    use RefreshDatabase;

    public function test_audit_log_redacts_sensitive_values_and_is_append_only(): void
    {
        $user = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $category = Category::query()->create(['name' => 'Audit', 'slug' => 'audit-'.str()->random(8), 'is_active' => true]);

        $log = app(RecordAuditEventAction::class)->handle('update', $category, $user, ['password' => 'secret', 'phone' => '22123456'], ['token' => 'abc', 'name' => 'Produit']);

        $this->assertDatabaseHas('audit_logs', ['id' => $log->id, 'actor_user_id' => $user->id, 'action' => 'update']);
        $this->assertSame(['name' => 'Produit'], $log->fresh()->after);
        $this->assertSame([], $log->fresh()->before);

        $this->expectException(\LogicException::class);
        $log->update(['action' => 'delete']);
    }
}
