<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Commerce\Actions\ReconcileOrderItemsAction;
use App\Domain\Commerce\Actions\TransitionOrderStatusAction;
use App\Domain\Commerce\Actions\UpdateOrderCustomerAction;
use App\Domain\Commerce\Models\Order;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'max:180'], 'status' => ['nullable', 'in:nouvelle,confirmee,annulee,livree,echec_livraison,retournee'], 'date_from' => ['nullable', 'date'], 'date_to' => ['nullable', 'date'], 'min_total_millimes' => ['nullable', 'integer', 'min:0'], 'max_total_millimes' => ['nullable', 'integer', 'min:0'], 'sort' => ['nullable', 'in:created_at,-created_at,total_millimes,-total_millimes,status,customer_name'], 'per_page' => ['nullable', 'integer', 'between:1,100']]);
        $query = Order::query()->withCount('items');
        if ($data['search'] ?? null) {
            $query->where(fn ($q) => $q->where('public_reference', 'like', '%'.$data['search'].'%')->orWhere('customer_name', 'like', '%'.$data['search'].'%')->orWhere('customer_phone', 'like', '%'.$data['search'].'%'));
        }
        foreach (['status', 'date_from', 'date_to', 'min_total_millimes', 'max_total_millimes'] as $filter) {
            if (isset($data[$filter])) {
                match ($filter) {
                    'date_from' => $query->whereDate('created_at', '>=', $data[$filter]), 'date_to' => $query->whereDate('created_at', '<=', $data[$filter]), 'min_total_millimes' => $query->where('total_millimes', '>=', $data[$filter]), 'max_total_millimes' => $query->where('total_millimes', '<=', $data[$filter]), default => $query->where($filter, $data[$filter])
                };
            }
        }
        $sort = $data['sort'] ?? '-created_at';
        $query->orderBy(ltrim($sort, '-'), str_starts_with($sort, '-') ? 'desc' : 'asc');

        return response()->json(['data' => $query->paginate($data['per_page'] ?? 25)]);
    }

    public function show(Order $order): JsonResponse
    {
        $order->load(['items.product.variants.values', 'items.variant', 'checkoutValues', 'statusHistory', 'notes']);

        return response()->json(['data' => ['order' => $order, 'is_editable' => in_array($order->status, ['nouvelle', 'confirmee'], true), 'allowed_transitions' => $this->transitions($order->status), 'meta_purchase' => ['event_id' => $order->meta_event_id, 'status' => 'not_configured']]]);
    }

    public function transition(Request $request, Order $order, TransitionOrderStatusAction $action): JsonResponse
    {
        $data = $request->validate(['to_status' => ['required', 'in:confirmee,annulee,livree,echec_livraison,retournee'], 'reason' => ['nullable', 'string', 'max:500'], 'lock_version' => ['required', 'integer', 'min:1'], 'restock_items' => ['nullable', 'boolean']]);
        if ($data['lock_version'] !== $order->lock_version) {
            return response()->json(['code' => 'ORDER_VERSION_CONFLICT', 'message' => 'La commande a été modifiée. Actualisez-la avant de continuer.'], 409);
        }

        $actor = $request->user();
        if ($actor === null) {
            abort(401);
        }

        return response()->json(['data' => $action->handle($order, $data['to_status'], $data['reason'] ?? null, $actor->id, $data['restock_items'] ?? false)]);
    }

    public function update(Request $request, Order $order, UpdateOrderCustomerAction $action): JsonResponse
    {
        $data = $request->validate(['lock_version' => ['required', 'integer', 'min:1'], 'customer.full_name' => ['required', 'string', 'between:2,180'], 'customer.phone' => ['required', 'string', 'max:40'], 'customer.city' => ['required', 'string', 'between:2,160'], 'customer.address' => ['required', 'string', 'between:5,2000']]);
        try {
            return response()->json(['data' => $action->handle($order, $data['lock_version'], $data['customer'])]);
        } catch (ValidationException $exception) {
            $errors = $exception->errors();
            $message = collect($errors)->flatten()->first() ?? 'La commande ne peut pas Ãªtre modifiÃ©e.';

            return response()->json(['code' => array_key_exists('lock_version', $errors) ? 'ORDER_VERSION_CONFLICT' : 'ORDER_NOT_EDITABLE', 'message' => $message], 409);
        }
    }

    public function updateItems(Request $request, Order $order, ReconcileOrderItemsAction $action): JsonResponse
    {
        $data = $request->validate(['lock_version' => ['required', 'integer', 'min:1'], 'items' => ['required', 'array', 'min:1', 'max:100'], 'items.*.product_public_id' => ['required', 'ulid'], 'items.*.variant_public_id' => ['nullable', 'ulid'], 'items.*.quantity' => ['required', 'integer', 'between:1,99']]);
        $actor = $request->user();
        if ($actor === null) {
            abort(401);
        }
        try {
            return response()->json(['data' => $action->handle($order, $data['lock_version'], $data['items'], $actor->id)]);
        } catch (ValidationException $exception) {
            return response()->json(['code' => 'ORDER_UPDATE_CONFLICT', 'message' => $exception->getMessage()], 409);
        }
    }

    public function storeNote(Request $request, Order $order): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'between:1,5000']]);
        $actor = $request->user();
        if ($actor === null) {
            abort(401);
        }

        return response()->json(['data' => $order->notes()->create(['user_id' => $actor->id, 'body' => $data['body'], 'created_at' => now()])], 201);
    }

    public function export(Request $request): StreamedResponse
    {
        $data = $request->validate(['status' => ['nullable', 'in:nouvelle,confirmee,annulee,livree,echec_livraison,retournee'], 'date_from' => ['nullable', 'date'], 'date_to' => ['nullable', 'date']]);
        $query = Order::query()->select(['id', 'public_reference', 'status', 'customer_name', 'customer_phone', 'customer_city', 'total_millimes', 'created_at'])->orderByDesc('created_at')->limit(10_000);
        if ($data['status'] ?? null) {
            $query->where('status', $data['status']);
        }
        if ($data['date_from'] ?? null) {
            $query->whereDate('created_at', '>=', $data['date_from']);
        }
        if ($data['date_to'] ?? null) {
            $query->whereDate('created_at', '<=', $data['date_to']);
        }

        return response()->streamDownload(function () use ($query): void {
            $handle = fopen('php://output', 'wb');
            if ($handle === false) {
                return;
            } fputcsv($handle, ['Référence', 'Statut', 'Client', 'Téléphone', 'Ville', 'Total millimes', 'Créée le']);
            $query->chunkById(500, function ($orders) use ($handle): void {
                foreach ($orders as $order) {
                    fputcsv($handle, [$order->public_reference, $order->status, $order->customer_name, $order->customer_phone, $order->customer_city, $order->total_millimes, $order->created_at?->toIso8601String()]);
                }
            });
            fclose($handle);
        }, 'commandes.csv', ['Content-Type' => 'text/csv; charset=UTF-8', 'Cache-Control' => 'private, no-store']);
    }

    /** @return array<int, string> */
    private function transitions(string $status): array
    {
        return ['nouvelle' => ['confirmee', 'annulee'], 'confirmee' => ['livree', 'echec_livraison'], 'livree' => ['retournee']][$status] ?? [];
    }
}
