<?php

namespace App\Http\Controllers\Api;

use App\Domain\Checkout\Actions\ResolveCheckoutSubmissionAction;
use App\Domain\Commerce\Models\CheckoutField;
use App\Domain\Settings\Services\StoreSettings;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CheckoutFieldsController extends Controller
{
    public function __invoke(Request $request, ResolveCheckoutSubmissionAction $resolver, StoreSettings $settings): JsonResponse
    {
        $fields = CheckoutField::query()->where('is_active', true)->orderBy('sort_order')->get();
        $data = $fields->map(fn (CheckoutField $field) => $field->only(['key', 'label', 'type', 'is_required', 'options', 'sort_order']))->values();

        return ApiResponse::success($data, ['schema_version' => $resolver->schemaVersion($data->all()), 'promo_code_field_visible' => (bool) $settings->get('checkout.promo_field_visible'), 'request_id' => $request->attributes->get('request_id')]);
    }
}
