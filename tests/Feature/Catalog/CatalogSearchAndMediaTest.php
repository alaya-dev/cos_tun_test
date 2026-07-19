<?php

namespace Tests\Feature\Catalog;

use App\Domain\Catalog\Actions\ReplaceProductVariantsAction;
use App\Domain\Catalog\Actions\SwitchProductVariantModeAction;
use App\Domain\Catalog\Models\Category;
use App\Domain\Catalog\Models\Product;
use App\Domain\Catalog\Models\ProductImage;
use App\Jobs\ProcessProductImage;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class CatalogSearchAndMediaTest extends TestCase
{
    use RefreshDatabase;

    public function test_search_returns_only_active_catalogue_items_in_the_public_contract(): void
    {
        $activeCategory = Category::query()->create(['name' => 'Crèmes', 'slug' => 'cremes', 'is_active' => true]);
        $inactiveCategory = Category::query()->create(['name' => 'Crème inactive', 'slug' => 'creme-inactive', 'is_active' => false]);
        Product::query()->create(['category_id' => $activeCategory->id, 'name' => 'Crème visage', 'slug' => 'creme-visage', 'regular_price_millimes' => 12_500, 'stock_quantity' => 3, 'is_active' => true]);
        Product::query()->create(['category_id' => $inactiveCategory->id, 'name' => 'Crème cachée', 'slug' => 'creme-cachee', 'regular_price_millimes' => 12_500, 'stock_quantity' => 3, 'is_active' => true]);

        $this->getJson('/api/v1/public/search/suggestions?q=crème')
            ->assertOk()
            ->assertJsonPath('data.products.0.name', 'Crème visage')
            ->assertJsonPath('data.products.0.effective_price.millimes', 12_500)
            ->assertJsonPath('data.products.0.effective_price.formatted', '12,500 TND')
            ->assertJsonCount(1, 'data.products')
            ->assertJsonCount(1, 'data.categories');
    }

    public function test_product_image_is_staged_then_processed_into_webp_renditions(): void
    {
        Queue::fake();
        Storage::fake('local');
        Storage::fake('public');
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Crème', 'slug' => 'creme', 'regular_price_millimes' => 12_500, 'stock_quantity' => 3, 'is_active' => false]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/'.$product->public_id.'/images', [
            'image' => UploadedFile::fake()->image('creme.jpg', 1600, 1000),
            'is_primary' => true,
        ])->assertCreated()->assertJsonPath('data.processing_status', 'pending');

        $image = ProductImage::query()->firstOrFail();
        Storage::disk('local')->assertExists($image->original_path);
        Queue::assertPushed(ProcessProductImage::class, fn (ProcessProductImage $job) => true);

        (new ProcessProductImage($image->id))->handle();
        $image->refresh();
        $this->assertSame('ready', $image->processing_status);
        $this->assertSame([480, 768, 1200], array_keys($image->renditions));
        Storage::disk('public')->assertExists($image->renditions['1200']);
        Storage::disk('local')->assertMissing($image->original_path);
    }

    public function test_product_image_rejects_an_invalid_image_signature(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Crème', 'slug' => 'creme', 'regular_price_millimes' => 12_500, 'stock_quantity' => 3, 'is_active' => false]);

        $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/'.$product->public_id.'/images', [
            'image' => UploadedFile::fake()->createWithContent('not-an-image.jpg', 'not an image'),
        ])->assertStatus(422);
    }

    public function test_product_image_upload_route_has_named_throttle_and_pixel_ceiling(): void
    {
        $route = Route::getRoutes()->match(Request::create('/api/v1/admin/products/test/images', 'POST'));
        $this->assertContains('throttle:media-upload', $route->middleware());
        $this->assertStringContainsString('20_000_000', file_get_contents(base_path('app/Http/Controllers/Api/Admin/ProductImageController.php')));
    }

    public function test_product_image_upload_throttle_returns_retry_after(): void
    {
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage-throttle', 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Crème throttle', 'slug' => 'creme-throttle', 'regular_price_millimes' => 12_500, 'stock_quantity' => 3, 'is_active' => false]);
        $limited = null;
        for ($attempt = 0; $attempt < 22; $attempt++) {
            $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/'.$product->public_id.'/images', []);
            if ($response->status() === 429) {
                $limited = $response;
                break;
            }
        }
        self::assertNotNull($limited);
        $limited->assertHeader('Retry-After');
    }

    public function test_admin_can_assign_images_to_the_gallery_primary_slot_or_a_variant(): void
    {
        Queue::fake();
        Storage::fake('local');
        $admin = User::factory()->create(['role' => 'admin', 'is_active' => true]);
        $category = Category::query()->create(['name' => 'Visage', 'slug' => 'visage', 'is_active' => true]);
        $product = Product::query()->create(['category_id' => $category->id, 'name' => 'Crème', 'slug' => 'creme', 'regular_price_millimes' => 12_500, 'stock_quantity' => 3, 'is_active' => false]);
        $product = app(SwitchProductVariantModeAction::class)->handle($product, true);
        $product = app(ReplaceProductVariantsAction::class)->handle($product, [['name' => 'Couleur', 'values' => [['client_key' => 'rose', 'value' => 'Rose']]]], [['option_value_client_keys' => ['rose'], 'stock_quantity' => 3]], $product->lock_version);
        $variant = $product->variants()->firstOrFail();

        $response = $this->actingAs($admin, 'sanctum')->postJson('/api/v1/admin/products/'.$product->public_id.'/images', [
            'image' => UploadedFile::fake()->image('rose.jpg'),
            'variant_public_id' => $variant->public_id,
            'is_primary' => false,
        ])->assertCreated();

        $image = ProductImage::query()->where('public_id', $response->json('data.public_id'))->firstOrFail();
        $this->assertSame($variant->id, $image->product_variant_id);
        $this->assertFalse($image->is_primary);

        $this->patchJson('/api/v1/admin/products/'.$product->public_id.'/images/'.$image->public_id, [
            'variant_public_id' => null,
            'is_primary' => true,
        ])->assertOk();

        $this->assertNull($image->fresh()->product_variant_id);
        $this->assertTrue($image->fresh()->is_primary);
    }
}
