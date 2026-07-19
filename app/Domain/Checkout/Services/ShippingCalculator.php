<?php

namespace App\Domain\Checkout\Services;

class ShippingCalculator
{
    /** @return array{is_free: bool, fee: array{millimes: int, formatted: string}, free_threshold: array{millimes: int, formatted: string}|null} */
    public function calculate(int $subtotalMillimes): array
    {
        $threshold = config('commerce.shipping_free_threshold_millimes');
        $fixedFee = (int) config('commerce.shipping_fixed_fee_millimes');
        $isFree = $fixedFee === 0 || (is_int($threshold) && $subtotalMillimes >= $threshold);
        $fee = $isFree ? 0 : $fixedFee;

        return [
            'is_free' => $isFree,
            'fee' => $this->money($fee, $fee === 0),
            'free_threshold' => is_int($threshold) ? $this->money($threshold) : null,
        ];
    }

    /** @return array{millimes: int, formatted: string} */
    public function money(int $millimes, bool $free = false): array
    {
        return [
            'millimes' => $millimes,
            'formatted' => $free ? 'Gratuite' : number_format($millimes / 1000, 3, ',', ' ').' TND',
        ];
    }
}
