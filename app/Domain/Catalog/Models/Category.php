<?php

namespace App\Domain\Catalog\Models;

use App\Domain\Catalog\Services\CatalogCacheVersion;
use App\Domain\Content\Services\HomepageCache;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class Category extends Model
{
    use SoftDeletes;

    protected $fillable = ['public_id', 'name', 'slug', 'description', 'image_path', 'image_processing_status', 'image_width', 'image_height', 'is_active', 'sort_order', 'seo_title', 'seo_description'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    protected static function booted(): void
    {
        static::creating(fn (self $model) => $model->public_id ??= (string) Str::ulid());
        static::saved(function (): void {
            app(CatalogCacheVersion::class)->bump();
            app(HomepageCache::class)->forget();
        });
        static::deleted(function (): void {
            app(CatalogCacheVersion::class)->bump();
            app(HomepageCache::class)->forget();
        });
    }

    /** @return HasMany<Product, $this> */
    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function getRouteKeyName(): string
    {
        return 'public_id';
    }

    public function imageUrl(): ?string
    {
        return $this->image_path ? Storage::disk('public')->url($this->image_path) : null;
    }
}
