<?php

namespace App\Http\Controllers\Api\Admin;

use App\Domain\Catalog\Actions\AdjustInventoryAction;
use App\Domain\Catalog\Models\InventoryMovement;
use App\Domain\Catalog\Models\Product;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class InventoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $data = $request->validate(['product_public_id' => ['nullable', 'ulid'], 'search' => ['nullable', 'string', 'max:100'], 'type' => ['nullable', 'string', 'max:60'], 'date_from' => ['nullable', 'date'], 'date_to' => ['nullable', 'date'], 'per_page' => ['nullable', 'integer', 'between:1,100']]);
        $query = InventoryMovement::query()->with(['product', 'variant'])->latest();
        if ($data['product_public_id'] ?? null) {
            $query->whereHas('product', fn ($products) => $products->where('public_id', $data['product_public_id']));
        }
        if ($data['search'] ?? null) {
            $query->whereHas('product', fn ($products) => $products->where('name', 'like', '%'.$data['search'].'%'));
        }
        if ($data['type'] ?? null) {
            $query->where('type', $data['type']);
        }
        if ($data['date_from'] ?? null) {
            $query->whereDate('created_at', '>=', $data['date_from']);
        }
        if ($data['date_to'] ?? null) {
            $query->whereDate('created_at', '<=', $data['date_to']);
        }

        return response()->json(['data' => $query->paginate($data['per_page'] ?? 25)]);
    }

    public function adjust(Request $request, Product $product, AdjustInventoryAction $action): JsonResponse
    {
        $data = $request->validate(['variant_public_id' => ['nullable', 'ulid'], 'quantity_delta' => ['required', 'integer', 'not_in:0', 'between:-100000,100000'], 'reason' => ['required', 'string', 'between:3,500']]);
        $actor = $request->user();
        if ($actor === null) {
            abort(401);
        }
        $action->handle($product, $data['variant_public_id'] ?? null, $data['quantity_delta'], $data['reason'], $actor->id);

        return response()->json(['data' => null]);
    }
}
