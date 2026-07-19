<?php

namespace App\Domain\Audit\Actions;

use App\Domain\Audit\Models\AuditLog;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;

class RecordAuditEventAction
{
    /**
     * @param  array<string, mixed>  $before
     * @param  array<string, mixed>  $after
     */
    public function handle(string $action, Model $auditable, ?User $actor = null, array $before = [], array $after = [], ?string $requestId = null): AuditLog
    {
        return AuditLog::query()->create([
            'actor_user_id' => $actor?->id,
            'actor_role_snapshot' => $actor?->role,
            'action' => $action,
            'auditable_type' => $this->auditableType($auditable),
            'auditable_id' => (string) $auditable->getKey(),
            'request_id' => $requestId,
            'before' => $this->sanitize($before),
            'after' => $this->sanitize($after),
        ]);
    }

    /** @return array<string, mixed> */
    /** @param array<string, mixed> $values */
    /**
     * @param  array<string, mixed>  $values
     * @return array<string, mixed>
     */
    private function sanitize(array $values): array
    {
        $hidden = ['password', 'password_confirmation', 'password_hash', 'current_password', 'remember_token', 'session', 'session_id', 'csrf', 'csrf_token', 'token', 'access_token', 'refresh_token', 'name', 'email', 'phone', 'telephone', 'address', 'subject', 'description', 'body', 'note', 'notes', 'attachment', 'raw_attribution', 'request_body'];

        $sanitized = [];
        foreach ($values as $key => $value) {
            if (in_array((string) $key, $hidden, true)) {
                continue;
            }

            $sanitized[$key] = is_array($value) ? $this->sanitize($value) : $value;
        }

        return $sanitized;
    }

    private function auditableType(Model $auditable): string
    {
        return $auditable->getMorphClass();
    }
}
