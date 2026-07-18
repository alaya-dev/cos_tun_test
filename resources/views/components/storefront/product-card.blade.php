@props(['product'])
@php
    $image = $product->images->first();
    $renditions = $image?->publicRenditions() ?? [];
    $price = $product->promotional_price_millimes ?? $product->regular_price_millimes;
@endphp
<article class="product-card">
    <a class="product-card-image" href="{{ route('storefront.product', $product->slug) }}">
        @if($image && $image->publicUrl())
            <img src="{{ $image->publicUrl() }}"
                 @if($renditions) srcset="@foreach($renditions as $width => $url) {{ $url }} {{ $width }}w{{ !$loop->last ? ',' : '' }} @endforeach" sizes="(min-width: 1024px) 25vw, 50vw" @endif
                 width="{{ $image->width }}" height="{{ $image->height }}" loading="lazy" alt="{{ $image->alt_text ?: $product->name }}">
        @else
            <span class="product-image-placeholder" aria-hidden="true">PC</span>
        @endif
        @if($product->promotional_price_millimes)
            <span class="sale-badge">Offre</span>
        @endif
    </a>
    <div class="product-card-copy">
        <a class="product-category" href="{{ route('storefront.category', $product->category->slug) }}">{{ $product->category->name }}</a>
        <h3><a href="{{ route('storefront.product', $product->slug) }}">{{ $product->name }}</a></h3>
        <p class="price">
            <strong>{{ number_format($price / 1000, 3, ',', ' ') }} TND</strong>
            @if($product->promotional_price_millimes)<del>{{ number_format($product->regular_price_millimes / 1000, 3, ',', ' ') }} TND</del>@endif
        </p>
    </div>
</article>
