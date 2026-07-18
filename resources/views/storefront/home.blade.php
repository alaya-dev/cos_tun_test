<x-layouts.storefront title="Passion Cosmetic | Soins choisis avec intention">
    <section class="hero-section">
        <div class="hero-copy reveal">
            <p class="eyebrow">Le rituel, à votre rythme</p>
            <h1>Des soins qui invitent à <em>ralentir.</em></h1>
            <p>Une sélection de gestes simples, de textures sensorielles et de produits choisis avec intention.</p>
            <a class="button button-dark" href="{{ route('storefront.products') }}">Découvrir les soins <span aria-hidden="true">↗</span></a>
        </div>
        <div class="hero-still-life reveal" style="--i: 1" aria-label="Composition éditoriale de produits et de plantes" role="img">
            <div class="still-life-orb orb-one"></div><div class="still-life-orb orb-two"></div>
            <div class="still-life-bottle bottle-one">PASSION<small>huile</small></div>
            <div class="still-life-bottle bottle-two">PC<small>rituel</small></div>
            <div class="still-life-leaf leaf-one"></div><div class="still-life-leaf leaf-two"></div>
        </div>
    </section>

    <section class="section category-section" aria-labelledby="categories-title">
        <div class="section-heading"><div><p class="eyebrow">Choisir son moment</p><h2 id="categories-title">Par catégorie</h2></div><a class="text-link" href="{{ route('storefront.products') }}">Voir tous les soins <span aria-hidden="true">→</span></a></div>
        @if($categories->isNotEmpty())
            <div class="category-rail">
                @foreach($categories as $category)
                    <a class="category-link" href="{{ route('storefront.category', $category->slug) }}"><span>{{ $category->name }}</span><i aria-hidden="true">↗</i></a>
                @endforeach
            </div>
        @else
            <p class="empty-inline">Les catégories seront bientôt disponibles.</p>
        @endif
    </section>

    <section class="section products-section" aria-labelledby="new-products-title">
        <div class="section-heading"><div><p class="eyebrow">À découvrir</p><h2 id="new-products-title">Les nouveaux rituels</h2></div><a class="text-link" href="{{ route('storefront.products') }}">Voir la boutique <span aria-hidden="true">→</span></a></div>
        @if($newProducts->isNotEmpty())
            <div class="product-grid">@foreach($newProducts as $product)<x-storefront.product-card :product="$product" />@endforeach</div>
        @else
            <div class="catalogue-empty"><p class="eyebrow">Une sélection arrive</p><h3>Le premier rituel se prépare.</h3><p>Revenez bientôt découvrir nos produits.</p></div>
        @endif
    </section>

    <section class="ritual-section section" aria-labelledby="ritual-title" data-ritual-finder data-categories='@json($categories->map(fn($category) => ['name' => $category->name, 'url' => route('storefront.category', $category->slug)]))'>
        <div><p class="eyebrow">Un peu d’aide</p><h2 id="ritual-title">Trouver son rituel</h2><p>Quelques choix, une sélection à explorer selon votre envie du moment.</p></div>
        <div id="ritual-finder" aria-live="polite"></div>
    </section>

    <section class="editorial-section">
        <div class="editorial-graphic" aria-hidden="true"><span>01</span><div></div><i></i></div>
        <div><p class="eyebrow">Le geste juste</p><h2>Un rituel n’a pas besoin d’être compliqué pour faire la différence.</h2><p>Accordez-vous quelques minutes, choisissez une texture que vous aimez, et laissez le reste attendre.</p><a class="text-link" href="{{ route('storefront.products') }}">Composer mon rituel <span aria-hidden="true">→</span></a></div>
    </section>
</x-layouts.storefront>
