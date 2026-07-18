<?php

namespace App\Jobs;

use App\Domain\Catalog\Models\ProductImage;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Storage;

class ProcessProductImage implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public function __construct(public int $imageId)
    {
        $this->onQueue('media');
    }

    public function handle(): void
    {
        $image = ProductImage::query()->findOrFail($this->imageId);
        if (! $image->original_path || ! Storage::disk('local')->exists($image->original_path)) {
            $image->update(['processing_status' => 'failed']);

            return;
        }

        $contents = Storage::disk('local')->get($image->original_path);
        if (! is_string($contents)) {
            $image->update(['processing_status' => 'failed']);

            return;
        }
        $source = @imagecreatefromstring($contents);
        if (! $source) {
            $image->update(['processing_status' => 'failed']);

            return;
        }
        $width = imagesx($source);
        $height = imagesy($source);
        Storage::disk('public')->makeDirectory('products');
        $base = 'products/'.str()->ulid();
        $renditions = [];

        foreach ([480, 768, 1200] as $targetWidth) {
            $renditionWidth = min($targetWidth, $width);
            $renditionHeight = max(1, (int) round($height * ($renditionWidth / $width)));
            $canvas = imagecreatetruecolor($renditionWidth, $renditionHeight);
            imagealphablending($canvas, false);
            imagesavealpha($canvas, true);
            imagecopyresampled($canvas, $source, 0, 0, 0, 0, $renditionWidth, $renditionHeight, $width, $height);
            $path = $base.'-'.$targetWidth.'.webp';
            $temporary = tempnam(sys_get_temp_dir(), 'pc-image-');
            imagewebp($canvas, $temporary, 82);
            imagedestroy($canvas);
            $encoded = file_get_contents($temporary);
            if ($encoded === false) {
                @unlink($temporary);
                imagedestroy($source);
                throw new \RuntimeException('Impossible de générer la rendition image.');
            }
            Storage::disk('public')->put($path, $encoded);
            @unlink($temporary);
            $renditions[(string) $targetWidth] = $path;
        }

        imagedestroy($source);
        $image->update([
            'path' => $renditions['1200'],
            'renditions' => $renditions,
            'width' => $width,
            'height' => $height,
            'processing_status' => 'ready',
        ]);
        Storage::disk('local')->delete($image->original_path);
    }
}
