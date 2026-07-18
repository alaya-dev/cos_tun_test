@props(['categories', 'currentCategory' => null])
<form class="catalogue-filters" method="get" aria-label="Filtrer les produits">
    @if($currentCategory)<input type="hidden" name="category" value="{{ $currentCategory->slug }}">@endif
    <label>Prix min. <input name="min_price" type="number" min="0" step="1000" value="{{ request('min_price') }}" inputmode="numeric"></label>
    <label>Prix max. <input name="max_price" type="number" min="0" step="1000" value="{{ request('max_price') }}" inputmode="numeric"></label>
    <label class="check-label"><input name="promotions" type="checkbox" value="1" @checked(request()->boolean('promotions'))> Offres uniquement</label>
    <label>Trier <select name="sort"><option value="newest">Nouveautés</option><option value="name_asc" @selected(request('sort') === 'name_asc')>Nom, A à Z</option><option value="price_asc" @selected(request('sort') === 'price_asc')>Prix croissant</option><option value="price_desc" @selected(request('sort') === 'price_desc')>Prix décroissant</option></select></label>
    <button class="button button-outline" type="submit">Appliquer</button>
</form>
