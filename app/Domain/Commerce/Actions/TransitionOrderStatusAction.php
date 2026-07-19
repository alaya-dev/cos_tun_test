<?php

namespace App\Domain\Commerce\Actions;

use App\Domain\Audit\Actions\RecordAuditEventAction;
use App\Domain\Commerce\Models\Order;
use App\Domain\Orders\Actions\RestoreOrderStockOnceAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TransitionOrderStatusAction
{
    /** @var array<string, array<int, string>> */
    private const TRANSITIONS = ['nouvelle' => ['confirmee', 'annulee'], 'confirmee' => ['livree', 'echec_livraison'], 'livree' => ['retournee']];

    public function __construct(private readonly RestoreOrderStockOnceAction $restoreStock, private readonly RecordAuditEventAction $audit) {}

    public function handle(Order $order, string $toStatus, ?string $reason, int $actorId, bool $restockReturn = false): Order
    {
        return DB::transaction(function () use ($order, $toStatus, $reason, $actorId, $restockReturn): Order {
            $order = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (! in_array($toStatus, self::TRANSITIONS[$order->status] ?? [], true)) {
                throw ValidationException::withMessages(['status' => 'Transition de commande non autorisée.']);
            }
            if (in_array($toStatus, ['annulee', 'echec_livraison', 'retournee'], true) && ! $reason) {
                throw ValidationException::withMessages(['reason' => 'Un motif est requis pour cette transition.']);
            }
            $fromStatus = $order->status;
            $order->update(['status' => $toStatus, 'lock_version' => $order->lock_version + 1]);
            DB::table('order_status_history')->insert(['order_id' => $order->id, 'from_status' => $fromStatus, 'to_status' => $toStatus, 'reason' => $reason, 'changed_by' => $actorId, 'created_at' => now()]);
            if (in_array($toStatus, ['annulee', 'echec_livraison'], true) || ($toStatus === 'retournee' && $restockReturn)) {
                $this->restoreStock->handle($order, $actorId, $toStatus);
            }

            $updated = $order->fresh() ?? $order;
            $this->audit->handle('order.status_changed', $updated, User::query()->find($actorId), after: ['from_status' => $fromStatus, 'to_status' => $toStatus, 'reason' => $reason]);

            return $updated;
        });
    }
}
