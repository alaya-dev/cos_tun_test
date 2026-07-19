<?php

namespace App\Http\Requests\Api\Admin;

use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;

class UpdateBackOfficeUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->role === 'super_admin';
    }

    /** @return array<string, array<int, string>> */
    public function rules(): array
    {
        $routeUser = $this->route('user');
        $id = $routeUser instanceof User ? $routeUser->id : null;

        return ['name' => ['sometimes', 'string', 'max:160'], 'email' => ['sometimes', 'email', 'max:255', 'unique:users,email,'.$id], 'role' => ['sometimes', 'in:admin,super_admin'], 'is_active' => ['sometimes', 'boolean'], 'password' => ['nullable', 'string', 'min:15', 'confirmed']];
    }
}
