<?php

namespace App\Domain\Commerce\Actions;

use App\Domain\Commerce\Models\Order;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class UpdateOrderCustomerAction
{
    /** @param array{full_name: string, phone: string, city: string, address: string} $customer */
    public function handle(Order $order, int $lockVersion, array $customer): Order
    {
        return DB::transaction(function () use ($order, $lockVersion, $customer): Order {
            $order = Order::query()->whereKey($order->id)->lockForUpdate()->firstOrFail();
            if (! in_array($order->status, ['nouvelle', 'confirmee'], true)) {
                throw ValidationException::withMessages(['order' => 'Cette commande ne peut plus être modifiée.']);
            }
            if ($order->lock_version !== $lockVersion) {
                throw ValidationException::withMessages(['lock_version' => 'La commande a été modifiée.']);
            }
            $phone = preg_replace('/[^0-9+]/', '', $customer['phone']) ?? $customer['phone'];
            $order->update(['customer_name' => trim($customer['full_name']), 'customer_phone' => $phone, 'customer_city' => trim($customer['city']), 'customer_address' => trim($customer['address']), 'lock_version' => $order->lock_version + 1]);

            return $order->fresh() ?? $order;
        });
    }
}
