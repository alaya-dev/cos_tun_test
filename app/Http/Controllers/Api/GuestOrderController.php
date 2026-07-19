<?php

namespace App\Http\Controllers\Api;

use App\Domain\Checkout\Actions\ResolveCheckoutSubmissionAction;
use App\Domain\Commerce\Actions\CreateGuestOrderAction;
use App\Domain\Commerce\Exceptions\CheckoutConflictException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Api\CreateGuestOrderRequest;
use App\Http\Resources\PublicOrderResource;
use App\Http\Responses\ApiResponse;
use Illuminate\Cache\RedisStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\URL;

class GuestOrderController extends Controller
{
    public function __invoke(CreateGuestOrderRequest $request, ResolveCheckoutSubmissionAction $resolver, CreateGuestOrderAction $orders): JsonResponse
    {
        $key = (string) $request->header('Idempotency-Key');
        if (! preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i', $key)) {
            return ApiResponse::error('VALIDATION_ERROR', 'La demande de commande est invalide.', 422);
        }
        $store = Cache::store('redis')->getStore();
        if (! $store instanceof RedisStore) {
            abort(503);
        }
        $lock = $store->lock('pc:checkout:'.$key, 15);
        if (! $lock->get()) {
            return ApiResponse::error('CHECKOUT_IN_PROGRESS', 'Votre commande est en cours de traitement. Réessayez dans un instant.', 409, meta: ['request_id' => $request->attributes->get('request_id')]);
        }
        try {
            $result = $orders->handle($resolver->handle($request->all()), $key);
        } catch (CheckoutConflictException $exception) {
            return ApiResponse::error($exception->codeName, $exception->getMessage(), 409, meta: ['request_id' => $request->attributes->get('request_id')]);
        } finally {
            $lock->release();
        }
        $order = $result['order'];

        $expiresAt = now()->addDays(7);

        return ApiResponse::success(['order' => (new PublicOrderResource($order))->toArray($request), 'confirmation' => ['url' => URL::temporarySignedRoute('storefront.confirmation', $expiresAt, ['order' => $order]), 'expires_at' => $expiresAt->toIso8601String()], 'meta' => ['browser_purchase_required' => false, 'event_id' => $order->meta_event_id]], ['request_id' => $request->attributes->get('request_id')], $result['replayed'] ? 200 : 201);
    }
}
