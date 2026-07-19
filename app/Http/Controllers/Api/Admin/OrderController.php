<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Audit\Actions\RecordAuditEventAction;
use App\Domain\Commerce\Actions\ReconcileOrderItemsAction;
use App\Domain\Commerce\Actions\TransitionOrderStatusAction;
use App\Domain\Commerce\Actions\UpdateOrderCustomerAction;
use App\Domain\Commerce\Models\Order;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class OrderController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['search' => ['nullable', 'string', 'max:180'], 'status' => ['nullable', 'in:nouvelle,confirmee,annulee,livree,echec_livraison,retournee'], 'archived' => ['nullable', 'boolean'], 'date_from' => ['nullable', 'date'], 'date_to' => ['nullable', 'date'], 'min_total_millimes' => ['nullable', 'integer', 'min:0'], 'max_total_millimes' => ['nullable', 'integer', 'min:0'], 'sort' => ['nullable', 'in:created_at,-created_at,total_millimes,-total_millimes,status,customer_name'], 'per_page' => ['nullable', 'integer', 'between:1,100']]);
        $query = Order::query()->withCount('items');
        ($data['archived'] ?? false) ? $query->whereNotNull('archived_at') : $query->whereNull('archived_at');
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

    public function update(Request $request, Order $order, UpdateOrderCustomerAction $action, RecordAuditEventAction $audit): JsonResponse
    {
        $data = $request->validate(['lock_version' => ['required', 'integer', 'min:1'], 'customer.full_name' => ['required', 'string', 'between:2,180'], 'customer.phone' => ['required', 'string', 'max:40'], 'customer.city' => ['required', 'string', 'between:2,160'], 'customer.address' => ['required', 'string', 'between:5,2000']]);
        try {
            $before = $order->only(['customer_name', 'customer_phone', 'customer_city', 'customer_address']);
            $result = $action->handle($order, $data['lock_version'], $data['customer']);
            $fresh = $order->fresh();
            abort_unless($fresh !== null, 500);
            $audit->handle('order.customer_updated', $fresh, $request->user(), before: $before, after: $fresh->only(array_keys($before)));

            return response()->json(['data' => $result]);
        } catch (ValidationException $exception) {
            $errors = $exception->errors();
            $message = collect($errors)->flatten()->first() ?? 'La commande ne peut pas Ãªtre modifiÃ©e.';

            return response()->json(['code' => array_key_exists('lock_version', $errors) ? 'ORDER_VERSION_CONFLICT' : 'ORDER_NOT_EDITABLE', 'message' => $message], 409);
        }
    }

    public function updateItems(Request $request, Order $order, ReconcileOrderItemsAction $action, RecordAuditEventAction $audit): JsonResponse
    {
        $data = $request->validate(['lock_version' => ['required', 'integer', 'min:1'], 'items' => ['required', 'array', 'min:1', 'max:100'], 'items.*.product_public_id' => ['required', 'ulid'], 'items.*.variant_public_id' => ['nullable', 'ulid'], 'items.*.quantity' => ['required', 'integer', 'between:1,99']]);
        $actor = $request->user();
        if ($actor === null) {
            abort(401);
        }
        try {
            $result = $action->handle($order, $data['lock_version'], $data['items'], $actor->id);
            $audit->handle('order.items_updated', $order, $actor, after: ['item_count' => count($data['items'])]);

            return response()->json(['data' => $result]);
        } catch (ValidationException $exception) {
            return response()->json(['code' => 'ORDER_UPDATE_CONFLICT', 'message' => $exception->getMessage()], 409);
        }
    }

    public function storeNote(Request $request, Order $order, RecordAuditEventAction $audit): JsonResponse
    {
        $data = $request->validate(['body' => ['required', 'string', 'between:1,5000']]);
        $actor = $request->user();
        if ($actor === null) {
            abort(401);
        }

        $note = $order->notes()->create(['user_id' => $actor->id, 'body' => $data['body'], 'created_at' => now()]);
        $audit->handle('order.note_added', $order, $actor, after: ['note_id' => $note->getKey()]);

        return response()->json(['data' => $note], 201);
    }

    public function bulkArchive(Request $request, RecordAuditEventAction $audit): JsonResponse
    {
        $data = $request->validate(['references' => ['required', 'array', 'min:1', 'max:100'], 'references.*' => ['ulid', 'distinct']]);
        $archived = DB::transaction(function () use ($data): int {
            $orders = Order::query()->whereIn('public_reference', $data['references'])->whereNull('archived_at')->lockForUpdate()->get();
            abort_if($orders->count() !== count($data['references']), 404);

            $orders->each->update(['archived_at' => now()]);

            return $orders->count();
        });

        $audit->handle('order.bulk_archived', Order::query()->whereIn('public_reference', $data['references'])->firstOrFail(), $request->user(), after: ['count' => $archived]);

        return response()->json(['data' => ['archived' => $archived]]);
    }

    public function bulkRestore(Request $request, RecordAuditEventAction $audit): JsonResponse
    {
        $data = $request->validate(['references' => ['required', 'array', 'min:1', 'max:100'], 'references.*' => ['ulid', 'distinct']]);
        $restored = DB::transaction(function () use ($data): int {
            $orders = Order::query()->whereIn('public_reference', $data['references'])->whereNotNull('archived_at')->lockForUpdate()->get();
            abort_if($orders->count() !== count($data['references']), 404);
            $orders->each->update(['archived_at' => null]);

            return $orders->count();
        });

        $audit->handle('order.bulk_restored', Order::query()->whereIn('public_reference', $data['references'])->firstOrFail(), $request->user(), after: ['count' => $restored]);

        return response()->json(['data' => ['restored' => $restored]]);
    }

    public function bulkTransition(Request $request, TransitionOrderStatusAction $action, RecordAuditEventAction $audit): JsonResponse
    {
        $data = $request->validate(['references' => ['required', 'array', 'min:1', 'max:100'], 'references.*' => ['ulid', 'distinct'], 'to_status' => ['required', 'in:confirmee,annulee,livree,echec_livraison,retournee']]);
        $actor = $request->user();
        if ($actor === null) {
            abort(401);
        }
        $orders = Order::query()->whereIn('public_reference', $data['references'])->whereNull('archived_at')->get();
        if ($orders->count() !== count($data['references'])) {
            abort(404);
        }
        foreach ($orders as $order) {
            if (! in_array($data['to_status'], $this->transitions($order->status), true)) {
                return response()->json(['code' => 'BULK_TRANSITION_NOT_ALLOWED', 'message' => 'Toutes les commandes sélectionnées doivent permettre cette transition.'], 422);
            }
        }
        $updated = DB::transaction(function () use ($data, $action, $actor): int {
            $orders = Order::query()->whereIn('public_reference', $data['references'])->whereNull('archived_at')->lockForUpdate()->get();
            abort_if($orders->count() !== count($data['references']), 404);

            foreach ($orders as $order) {
                if (! in_array($data['to_status'], $this->transitions($order->status), true)) {
                    throw ValidationException::withMessages(['to_status' => 'La transition groupée n’est plus autorisée. Actualisez la liste.']);
                }
            }

            foreach ($orders as $order) {
                $terminal = in_array($data['to_status'], ['annulee', 'echec_livraison', 'retournee'], true);
                $action->handle($order, $data['to_status'], $terminal ? 'Action groupée opérateur' : null, $actor->id, $data['to_status'] === 'retournee');
            }

            return $orders->count();
        });

        $audit->handle('order.bulk_transitioned', Order::query()->whereIn('public_reference', $data['references'])->firstOrFail(), $actor, after: ['count' => $updated, 'to_status' => $data['to_status']]);

        return response()->json(['data' => ['updated' => $updated]]);
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
