<?php

namespace App\Http\Controllers\Api;

use App\Domain\Commerce\Actions\CreateGuestOrderAction;
use App\Domain\Commerce\Exceptions\CheckoutConflictException;
use App\Http\Controllers\Controller;
use Illuminate\Cache\RedisStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\URL;

class GuestOrderController extends Controller
{
    public function __invoke(Request $request, CreateGuestOrderAction $orders): JsonResponse
    {
        $key = (string) $request->header('Idempotency-Key');
        $data = $request->validate(['checkout_schema_version' => ['required', 'string', 'size:64'], 'customer.full_name' => ['required', 'string', 'between:2,180'], 'customer.phone' => ['required', 'string', 'max:40'], 'customer.city' => ['required', 'string', 'between:2,160'], 'customer.address' => ['required', 'string', 'between:5,2000'], 'items' => ['required', 'array', 'min:1', 'max:100'], 'items.*.product_public_id' => ['required', 'ulid'], 'items.*.variant_public_id' => ['nullable', 'ulid'], 'items.*.quantity' => ['required', 'integer', 'between:1,99'], 'promo_code' => ['nullable', 'string', 'max:80'], 'attribution' => ['nullable', 'array']]);
        if (! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $key)) {
            return response()->json(['code' => 'VALIDATION_FAILED', 'message' => 'La demande de commande est invalide.'], 422);
        }
        $store = Cache::store('redis')->getStore();
        if (! $store instanceof RedisStore) {
            abort(503);
        }
        $lock = $store->lock('pc:checkout:'.$key, 15);
        if (! $lock->get()) {
            return response()->json(['code' => 'CHECKOUT_IN_PROGRESS', 'message' => 'Votre commande est en cours de traitement. Réessayez dans un instant.'], 409);
        }
        try {
            $result = $orders->handle($data, $key);
        } catch (CheckoutConflictException $exception) {
            return response()->json(['code' => $exception->codeName, 'message' => $exception->getMessage()], 409);
        } finally {
            $lock->release();
        }
        $order = $result['order'];

        $expiresAt = now()->addDays(7);

        return response()->json(['data' => ['order' => ['public_reference' => $order->public_reference, 'status' => $order->status, 'pricing' => ['total' => ['millimes' => $order->total_millimes]], 'payment_method' => 'cash_on_delivery'], 'confirmation' => ['url' => URL::temporarySignedRoute('storefront.confirmation', $expiresAt, ['order' => $order]), 'expires_at' => $expiresAt->toIso8601String()], 'meta' => ['browser_purchase_required' => false, 'event_id' => $order->meta_event_id]], 'meta' => ['request_id' => $request->attributes->get('request_id')]], $result['replayed'] ? 200 : 201);
    }
}
