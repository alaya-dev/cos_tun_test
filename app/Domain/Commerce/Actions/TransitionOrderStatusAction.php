<?php

namespace App\Domain\Commerce\Actions;

use App\Domain\Catalog\Models\InventoryMovement;
use App\Domain\Commerce\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TransitionOrderStatusAction
{
    /** @var array<string, array<int, string>> */
    private const TRANSITIONS = ['nouvelle' => ['confirmee', 'annulee'], 'confirmee' => ['livree', 'echec_livraison'], 'livree' => ['retournee']];

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
                $this->restoreStockOnce($order, $actorId, $toStatus);
            }

            return $order->fresh() ?? $order;
        });
    }

    private function restoreStockOnce(Order $order, int $actorId, string $reason): void
    {
        if (DB::table('inventory_movements')->where('reason', 'Restauration commande '.$order->public_reference)->exists()) {
            return;
        }
        foreach ($order->items()->with(['product', 'variant'])->get() as $item) {
            $target = $item->variant ?? $item->product;
            if (! $target) {
                continue;
            }
            $before = $target->stock_quantity;
            $target->increment('stock_quantity', $item->quantity);
            InventoryMovement::query()->create(['product_id' => $item->product_id, 'product_variant_id' => $item->product_variant_id, 'actor_user_id' => $actorId, 'type' => 'order_restoration', 'quantity_delta' => $item->quantity, 'quantity_before' => $before, 'quantity_after' => $before + $item->quantity, 'reason' => 'Restauration commande '.$order->public_reference]);
        }
    }
}
