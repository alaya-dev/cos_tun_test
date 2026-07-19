<?php

namespace App\Http\Resources\Api\Admin;

use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray($request): array
    {
        $hidden = ['password', 'password_confirmation', 'token', 'session', 'phone', 'telephone', 'email', 'address', 'name', 'subject', 'description', 'body', 'note', 'notes', 'attachment'];
        $clean = function (mixed $value) use (&$clean, $hidden): mixed {
            if (! is_array($value)) {
                return $value;
            }
            $result = [];
            foreach ($value as $key => $item) {
                if (! in_array((string) $key, $hidden, true)) {
                    $result[$key] = $clean($item);
                }
            }

            return $result;
        };

        $resource = $this->resource;

        return [...$resource->only(['public_id', 'actor_user_id', 'actor_role_snapshot', 'action', 'auditable_type', 'auditable_id', 'request_id', 'created_at']), 'before' => $clean($resource->before), 'after' => $clean($resource->after)];
    }
}
