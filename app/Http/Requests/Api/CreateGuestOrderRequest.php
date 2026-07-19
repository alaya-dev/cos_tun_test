<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class CreateGuestOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'checkout_schema_version' => ['required', 'string', 'size:64'],
            'customer' => ['required', 'array'],
            'customer.full_name' => ['sometimes', 'string', 'between:2,180'],
            'customer.phone' => ['sometimes', 'string', 'max:40'],
            'customer.city' => ['sometimes', 'string', 'between:2,160'],
            'customer.address' => ['sometimes', 'string', 'between:5,2000'],
            'customer.*' => ['nullable'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.product_public_id' => ['required', 'ulid'],
            'items.*.variant_public_id' => ['nullable', 'ulid'],
            'items.*.quantity' => ['required', 'integer', 'between:1,99'],
            'promo_code' => ['nullable', 'string', 'max:80'],
            'attribution' => ['nullable', 'array'],
        ];
    }
}
