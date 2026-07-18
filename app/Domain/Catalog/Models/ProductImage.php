<?php

namespace App\Domain\Catalog\Models;

use App\Domain\Catalog\Services\CatalogCacheVersion;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * @property int $id
 * @property int $product_id
 * @property string|null $path
 * @property string|null $original_path
 * @property array<int|string, string>|null $renditions
 * @property bool $is_primary
 * @property string $processing_status
 */
class ProductImage extends Model
{
    protected $fillable = ['public_id', 'product_id', 'product_variant_id', 'path', 'renditions', 'original_path', 'alt_text', 'width', 'height', 'sort_order', 'is_primary', 'processing_status'];

    protected function casts(): array
    {
        return ['renditions' => 'array', 'is_primary' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::creating(fn (self $model) => $model->public_id ??= (string) Str::ulid());
        static::saved(fn () => app(CatalogCacheVersion::class)->bump());
        static::deleted(fn () => app(CatalogCacheVersion::class)->bump());
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    public function publicUrl(): ?string
    {
        return $this->path ? Storage::disk('public')->url($this->path) : null;
    }

    /** @return array<int, string> */
    public function publicRenditions(): array
    {
        return collect($this->renditions ?? [])
            ->mapWithKeys(fn (string $path, int|string $width): array => [(int) $width => Storage::disk('public')->url($path)])
            ->all();
    }
}
