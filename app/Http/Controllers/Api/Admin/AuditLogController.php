<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Audit\Models\AuditLog;
use App\Http\Controllers\Controller;
use App\Http\Resources\Api\Admin\AuditLogResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'search' => ['nullable', 'string', 'max:120'],
            'actor_role' => ['nullable', 'in:admin,super_admin'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $logs = AuditLog::query()
            ->when($filters['search'] ?? null, fn ($query, $search) => $query->where(fn ($nested) => $nested->where('action', 'like', '%'.$search.'%')->orWhere('request_id', 'like', '%'.$search.'%')))
            ->when($filters['actor_role'] ?? null, fn ($query, $role) => $query->where('actor_role_snapshot', $role))
            ->when($filters['date_from'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '>=', $date))
            ->when($filters['date_to'] ?? null, fn ($query, $date) => $query->whereDate('created_at', '<=', $date))
            ->latest('created_at')
            ->paginate($filters['per_page'] ?? 25);

        return ApiResponse::success([
            'data' => AuditLogResource::collection($logs->getCollection())->resolve(),
            'meta' => ['current_page' => $logs->currentPage(), 'last_page' => $logs->lastPage(), 'total' => $logs->total()],
        ]);
    }

    public function show(AuditLog $auditLog): JsonResponse
    {
        return ApiResponse::success(new AuditLogResource($auditLog));
    }
}
