@php
    $price = $product->promotional_price_millimes ?? $product->regular_price_millimes;
    $primaryImage = $product->images->first();
    $structuredData = [
        '@context' => 'https://schema.org', '@type' => 'Product', 'name' => $product->name,
        'description' => strip_tags($product->short_description ?: $product->full_description ?: $product->name),
        'url' => route('storefront.product', $product->slug),
        'offers' => ['@type' => 'Offer', 'priceCurrency' => 'TND', 'price' => number_format($price / 1000, 3, '.', ''), 'availability' => 'https://schema.org/'.($product->has_variants ? 'InStock' : ($product->stock_quantity > 0 ? 'InStock' : 'OutOfStock'))],
    ];
    $variantsForClient = $product->variants->map(fn ($variant) => ['public_id' => $variant->public_id, 'stock_quantity' => $variant->stock_quantity, 'is_active' => $variant->is_active, 'value_ids' => $variant->values->pluck('id')->values(), 'image_url' => $product->images->firstWhere('product_variant_id', $variant->id)?->public_url]);
    if ($primaryImage?->public_url) $structuredData['image'] = $primaryImage->public_url;
@endphp
<x-layouts.storefront :title="($product->seo_title ?: $product->name).' | Passion Cosmetic'" :description="$product->seo_description ?: ($product->short_description ?: Str::limit(strip_tags($product->full_description ?: ''), 155))" :canonical="route('storefront.product', $product->slug)">
    @push('head')<script type="application/ld+json">@json($structuredData, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES)</script>@endpush
    <section class="product-page section">
        <nav class="breadcrumb" aria-label="Fil d’Ariane"><a href="{{ route('storefront.home') }}">Accueil</a><span>/</span><a href="{{ route('storefront.category', $product->category->slug) }}">{{ $product->category->name }}</a><span>/</span><span aria-current="page">{{ $product->name }}</span></nav>
        <div class="product-layout" data-product-detail data-product-public-id="{{ $product->public_id }}" data-product-variants='@json($variantsForClient)'>
            <div class="product-gallery" data-gallery>
                <div class="product-main-image">@if($primaryImage && $primaryImage->public_url)<img src="{{ $primaryImage->public_url }}" width="{{ $primaryImage->width }}" height="{{ $primaryImage->height }}" alt="{{ $primaryImage->alt_text ?: $product->name }}" data-gallery-main>@else<span class="product-image-placeholder">PC</span>@endif</div>
                @if($product->images->count() > 1)<div class="gallery-thumbnails">@foreach($product->images as $image)<button type="button" data-gallery-image="{{ $image->public_url }}" aria-label="Voir l’image {{ $loop->iteration }}"><img src="{{ $image->public_url }}" width="96" height="96" alt=""></button>@endforeach</div>@endif
            </div>
            <div class="product-details">
                <a class="product-category" href="{{ route('storefront.category', $product->category->slug) }}">{{ $product->category->name }}</a>
                <h1>{{ $product->name }}</h1>
                @if($product->short_description)<p class="product-lead">{{ $product->short_description }}</p>@endif
                <p class="price price-large"><strong>{{ number_format($price / 1000, 3, ',', ' ') }} TND</strong>@if($product->promotional_price_millimes)<del>{{ number_format($product->regular_price_millimes / 1000, 3, ',', ' ') }} TND</del><span class="sale-badge">Offre</span>@endif</p>
                @if($product->has_variants)
                    <div class="variant-picker" data-variant-picker>
                        @foreach($product->optionGroups as $group)<fieldset><legend>{{ $group->name }}</legend><div>@foreach($group->values as $value)<button type="button" data-option-value="{{ $value->id }}">{{ $value->value }}</button>@endforeach</div></fieldset>@endforeach
                        <p class="stock-message" data-stock-message>Sélectionnez vos options.</p>
                    </div>
                @else
                    <p class="stock-message {{ $product->stock_quantity > 0 ? 'in-stock' : 'out-stock' }}">{{ $product->stock_quantity > 0 ? 'En stock' : 'Indisponible' }}</p>
                @endif
                <div class="product-actions"><label class="quantity-control">Quantité <span><button type="button" data-quantity-minus aria-label="Réduire la quantité">−</button><output data-quantity>1</output><button type="button" data-quantity-plus aria-label="Augmenter la quantité">+</button></span></label><button class="button button-dark" type="button" disabled data-add-to-cart>Ajouter au panier</button></div>
                <div class="reassurance-row"><span>Paiement à la livraison</span><span>Confirmation par téléphone</span><span>Livraison partout en Tunisie</span></div>
                @if($product->full_description)<div class="product-description"><h2>À propos de ce soin</h2><div>{!! nl2br(e($product->full_description)) !!}</div></div>@endif
            </div>
        </div>
    </section>
    @if($relatedProducts->isNotEmpty())<section class="section related-products"><div class="section-heading"><div><p class="eyebrow">À associer</p><h2>Dans la même collection</h2></div></div><div class="product-grid">@foreach($relatedProducts as $related)<x-storefront.product-card :product="$related" />@endforeach</div></section>@endif
</x-layouts.storefront>
