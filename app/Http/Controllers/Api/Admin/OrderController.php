<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Commerce\Actions\TransitionOrderStatusAction;
use App\Domain\Commerce\Models\Order;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        $order->load(['items', 'checkoutValues', 'statusHistory']);

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

    /** @return array<int, string> */
    private function transitions(string $status): array
    {
        return ['nouvelle' => ['confirmee', 'annulee'], 'confirmee' => ['livree', 'echec_livraison'], 'livree' => ['retournee']][$status] ?? [];
    }
}
