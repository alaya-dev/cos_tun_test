<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Audit\Actions\RecordAuditEventAction;
use App\Domain\IdentityAccess\Actions\ManageBackOfficeUserAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\Api\Admin\UserResource;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(): JsonResponse
    {
        return ApiResponse::success(UserResource::collection(User::query()->orderBy('name')->get()));
    }

    public function show(User $user): JsonResponse
    {
        return ApiResponse::success(new UserResource($user));
    }

    public function store(Request $request, RecordAuditEventAction $audit, ManageBackOfficeUserAction $manage): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:160'], 'email' => ['required', 'email', 'max:255', 'unique:users,email'], 'role' => ['required', 'in:admin,super_admin'], 'is_active' => ['boolean'], 'password' => ['required', 'string', 'min:15', 'confirmed'], 'force_password_change' => ['boolean']]);
        $user = $manage->create($data);
        unset($data['password'], $data['password_confirmation']);
        $audit->handle('user.created', $user, $request->user(), after: ['role' => $user->role, 'is_active' => $user->is_active]);

        return ApiResponse::success($user->only(['public_id', 'name', 'email', 'role', 'is_active', 'force_password_change']), status: 201);
    }

    public function update(Request $request, User $user, RecordAuditEventAction $audit): JsonResponse
    {
        $data = $request->validate(['name' => ['sometimes', 'string', 'max:160'], 'email' => ['sometimes', 'email', 'max:255', 'unique:users,email,'.$user->id], 'role' => ['sometimes', 'in:admin,super_admin'], 'is_active' => ['sometimes', 'boolean']]);
        if ($user->id === $request->user()?->id && (($data['is_active'] ?? true) === false || ($data['role'] ?? $user->role) !== 'super_admin')) {
            return ApiResponse::error('SELF_LOCKOUT_PROTECTED', 'Cette action vous bloquerait l’accès.', 422);
        }
        if ($user->role === 'super_admin' && $user->is_active && (($data['is_active'] ?? true) === false || ($data['role'] ?? $user->role) !== 'super_admin') && User::query()->where('role', 'super_admin')->where('is_active', true)->count() <= 1) {
            return ApiResponse::error('LAST_SUPER_ADMIN_PROTECTED', 'Le dernier Super Admin doit rester actif.', 422);
        }
        $before = $user->only(['name', 'email', 'role', 'is_active']);
        $user->fill($data)->save();
        $user->increment('auth_version');
        $audit->handle('user.updated', $user, $request->user(), before: $before, after: $user->only(['name', 'email', 'role', 'is_active']));

        $fresh = $user->fresh();
        abort_unless($fresh !== null, 500);

        return ApiResponse::success($fresh->only(['public_id', 'name', 'email', 'role', 'is_active', 'force_password_change']));
    }

    public function destroy(Request $request, User $user, RecordAuditEventAction $audit): JsonResponse
    {
        return $this->update($request, $user, $audit);
    }
}
