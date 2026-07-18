<x-layouts.storefront title="Commande confirmée | Passion Cosmetic" description="Votre commande a été enregistrée.">
    @push('head')<meta name="robots" content="noindex,nofollow">@endpush
    <section class="section confirmation-page">
        <div class="confirmation-mark" aria-hidden="true">✓</div>
        <p class="eyebrow">Commande confirmée</p>
        <h1>Merci, <em>votre rituel est en route.</em></h1>
        <p>Votre commande a bien été enregistrée. Notre équipe pourra vous contacter pour la confirmer.</p>
        <dl><div><dt>Référence</dt><dd>{{ $order->public_reference }}</dd></div><div><dt>Total</dt><dd>{{ number_format($order->total_millimes / 1000, 3, ',', ' ') }} TND</dd></div><div><dt>Paiement</dt><dd>À la livraison</dd></div></dl>
        <div class="confirmation-actions"><a class="button button-dark" href="{{ route('storefront.home') }}">Retour à l’accueil</a><a class="button button-outline" href="{{ route('storefront.products') }}">Continuer mes achats</a></div>
    </section>
</x-layouts.storefront>
