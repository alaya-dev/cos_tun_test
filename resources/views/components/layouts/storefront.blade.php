<!doctype html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title>{{ $title ?? 'Passion Cosmetic' }}</title>
    <meta name="description" content="{{ $description ?? 'Découvrez des soins et rituels de beauté choisis avec soin.' }}">
    <link rel="canonical" href="{{ $canonical ?? url()->current() }}">
    @vite(['resources/css/app.css', 'resources/js/storefront/main.ts'])
    @stack('head')
</head>
<body class="storefront-body">
    <a class="skip-link" href="#contenu">Aller au contenu</a>
    <div class="announcement-bar">Paiement à la livraison, partout en Tunisie</div>
    <header class="store-header">
        <a class="brand" href="{{ route('storefront.home') }}" aria-label="Passion Cosmetic, accueil">PASSION<span>COSMETIC</span></a>
        <nav class="desktop-nav" aria-label="Navigation principale">
            <a href="{{ route('storefront.products') }}">Tous les soins</a>
            <a href="{{ route('storefront.products', ['promotions' => 1]) }}">Sélection en douceur</a>
        </nav>
        <div class="header-actions">
            <button class="icon-button" type="button" data-search-trigger aria-label="Rechercher"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="5.8"/><path d="m16 16 4.1 4.1"/></svg></button>
            <span class="header-cart" aria-label="Panier bientôt disponible">Panier <span aria-hidden="true">0</span></span>
        </div>
        <form class="global-search" action="{{ route('storefront.search') }}" role="search" data-global-search>
            <label class="sr-only" for="global-search-input">Rechercher un produit ou une catégorie</label>
            <input id="global-search-input" name="q" type="search" autocomplete="off" placeholder="Rechercher un soin, une catégorie..." data-search-input>
            <button type="submit">Voir les résultats</button><div class="search-suggestions" data-search-suggestions role="status" aria-live="polite"></div>
        </form>
    </header>
    <main id="contenu">{{ $slot }}</main>
    <footer class="store-footer"><div><span class="eyebrow">Passion Cosmetic</span><p>Des gestes simples, des produits choisis, un rituel qui vous ressemble.</p></div><div class="footer-links"><a href="{{ route('storefront.products') }}">Tous les soins</a><span>À propos</span><span>Contact</span></div><small>© {{ now()->year }} Passion Cosmetic</small></footer>
</body>
</html>
