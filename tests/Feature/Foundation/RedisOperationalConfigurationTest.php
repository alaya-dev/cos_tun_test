<?php

namespace Tests\Feature\Foundation;

use Illuminate\Cache\CacheManager;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\TestCase;

class RedisOperationalConfigurationTest extends TestCase
{
    public function test_operational_defaults_are_redis(): void
    {
        self::assertSame('redis', config('cache.default'));
        self::assertSame('redis', config('queue.default'));
        self::assertSame('redis', config('session.driver'));
        self::assertSame('redis', config('session.store'));
    }

    public function test_readiness_contract_is_minimal_and_safe(): void
    {
        $response = $this->getJson('/api/health/ready');
        self::assertContains($response->status(), [200, 503]);
        self::assertArrayHasKey('status', $response->json());
        self::assertArrayNotHasKey('trace', $response->json());
    }

    public function test_redis_failure_returns_safe_readiness_response(): void
    {
        $store = Mockery::mock();
        $store->shouldReceive('get')->andThrow(new \RuntimeException('redis secret detail'));
        $cache = Mockery::mock(CacheManager::class);
        $cache->shouldReceive('store')->with('redis')->andReturn($store);
        config(['session.driver' => 'array']);
        $this->app->instance(CacheManager::class, $cache);
        Cache::swap($cache);
        $response = $this->getJson('/api/health/ready')->assertStatus(503)->assertJson(['status' => 'unavailable']);
        self::assertStringNotContainsString('redis secret detail', $response->getContent());
    }
}
