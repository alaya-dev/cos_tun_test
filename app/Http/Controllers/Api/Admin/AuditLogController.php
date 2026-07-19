<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Audit\Models\AuditLog;
use App\Http\Controllers\Controller;
use App\Http\Resources\Api\Admin\AuditLogResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;

class AuditLogController extends Controller
{
    public function index(): JsonResponse
    {
        return ApiResponse::success(AuditLogResource::collection(AuditLog::query()->latest('created_at')->paginate(50)));
    }

    public function show(AuditLog $auditLog): JsonResponse
    {
        return ApiResponse::success(new AuditLogResource($auditLog));
    }
}
