<?php

namespace App\Domain\IdentityAccess\Actions;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class ManageBackOfficeUserAction
{
    /** @param array<string, mixed> $data */
    public function create(array $data): User
    {
        return User::query()->create([...$data, 'password' => Hash::make($data['password']), 'is_active' => $data['is_active'] ?? true, 'force_password_change' => $data['force_password_change'] ?? true]);
    }

    /** @param array<string, mixed> $data */
    public function assertCanChange(User $target, User $actor, array $data): void
    {
        if ($target->id === $actor->id && (($data['is_active'] ?? true) === false || ($data['role'] ?? $target->role) !== 'super_admin')) {
            throw ValidationException::withMessages(['user' => 'Cette action vous bloquerait l’accès.']);
        }
        if ($target->role === 'super_admin' && $target->is_active && (($data['is_active'] ?? true) === false || ($data['role'] ?? $target->role) !== 'super_admin') && User::query()->where('role', 'super_admin')->where('is_active', true)->count() <= 1) {
            throw ValidationException::withMessages(['user' => 'Le dernier Super Admin doit rester actif.']);
        }
    }
}
