<?php

namespace Tests\Unit\Checkout;

use App\Domain\Checkout\Services\ShippingCalculator;
use Tests\TestCase;

class ShippingCalculatorTest extends TestCase
{
    public function test_shipping_fee_changes_at_threshold(): void
    {
        config()->set('commerce.shipping_fixed_fee_millimes', 3_000);
        config()->set('commerce.shipping_free_threshold_millimes', 20_000);

        $calculator = app(ShippingCalculator::class);

        $below = $calculator->calculate(19_999);
        $at = $calculator->calculate(20_000);
        $above = $calculator->calculate(20_001);

        $this->assertFalse($below['is_free']);
        $this->assertSame(3_000, $below['fee']['millimes']);
        $this->assertTrue($at['is_free']);
        $this->assertTrue($above['is_free']);
    }
}
