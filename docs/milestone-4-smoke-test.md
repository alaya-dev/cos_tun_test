# Milestone 4 Smoke Test

Use synthetic catalogue and customer data only.

1. Sign in as a Super Admin and confirm the Products, Categories, Orders, and Stock navigation is visible.
2. Create a category, edit its SEO fields, change its visibility, reorder it, then confirm deletion is refused when it contains a product.
3. Create a simple product, save its price, stock, publication state, and SEO fields.
4. Upload a JPG, PNG, or WebP image. Confirm processing status, primary image, alt text, ordering, and removal.
5. Enable variants with `CONFIRMER`, add option values, generate combinations, set SKU/stock/thresholds, and save. Disable only after confirming the resulting stock.
6. Make a reasoned stock adjustment for both a simple product and a variant. Confirm before/after quantities and history.
7. Filter product and order lists, paginate, and export a filtered CSV. Confirm the export contains no address.
8. Open a new order, edit delivery data, quantity, and selected variant. Confirm totals update and a stale second edit is rejected.
9. Run each legal transition, verify the required reason on exceptional states, and verify cancelled/failed stock restores only once.
10. Add an internal note, print the order, then repeat the key flows at 390 px and 1280 px widths.

Run before smoke testing:

```powershell
php artisan migrate
php artisan admin:create-super --name "Owner" --email "owner@example.test"
```
