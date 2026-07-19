<?php

namespace App\Http\Requests\Api\Admin;

use Illuminate\Foundation\Http\FormRequest;

class UpdateComplaintRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('complaints.manage') === true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['order_reference' => ['nullable', 'ulid', 'exists:orders,public_reference']];
    }
}
