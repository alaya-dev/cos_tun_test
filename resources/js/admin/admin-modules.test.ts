import { describe, expect, it } from 'vitest';
import InventoryView from './inventory';
import OrderDetailView from './order-detail';
import OrdersView from './orders';
import ProductsView from './products';

describe('admin operational modules', () => {
    it('exports the catalogue, inventory, order list, and order detail views', () => {
        expect(ProductsView).toBeTruthy();
        expect(InventoryView).toBeTruthy();
        expect(OrdersView).toBeTruthy();
        expect(OrderDetailView).toBeTruthy();
    });
});
