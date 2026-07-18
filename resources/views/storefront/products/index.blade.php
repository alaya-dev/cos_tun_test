<x-layouts.storefront title="Tous les soins | Passion Cosmetic" description="Explorez tous les soins Passion Cosmetic.">
    <section class="catalogue-hero"><p class="eyebrow">La boutique</p><h1>Tous les soins</h1><p>Explorez une sélection de produits pour accompagner chaque geste du quotidien.</p></section>
    <section class="catalogue-page section">
        <div class="category-pills" aria-label="Catégories">@foreach($categories as $category)<a href="{{ route('storefront.category', $category->slug) }}">{{ $category->name }}</a>@endforeach</div>
        <x-storefront.catalogue-filters :categories="$categories" />
        <p class="result-count">{{ $products->total() }} {{ Str::plural('produit', $products->total()) }}</p>
        @if($products->isNotEmpty())<div class="product-grid">@foreach($products as $product)<x-storefront.product-card :product="$product" />@endforeach</div>{{ $products->links() }}@else<div class="catalogue-empty"><h2>Aucun produit ne correspond à ces filtres.</h2><a class="text-link" href="{{ route('storefront.products') }}">Réinitialiser les filtres</a></div>@endif
    </section>
</x-layouts.storefront>
