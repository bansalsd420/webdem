# Database Schema Cheat‑Sheet (Effective Tables Used by API)

This document lists the key tables actually referenced by the backend routes, with columns and foreign keys extracted from your `DB_structure.sql`.

```markdown
# MJ Web — Schema cheat-sheet (compact)

Purpose: quick reference to the DB tables the API uses most. This is not a full schema dump — it highlights the fields and relations the code expects.

Core app tables
- `app_auth_users` — maps web user → UltimatePOS contact
	- key fields: `id`, `business_id`, `contact_id`, `email`, `password_hash`

- `app_carts`, `app_cart_items`
	- `app_carts(id, user_id)`
	- `app_cart_items(id, cart_id, product_id, variation_id, qty)`

- `app_wishlists(user_id, product_id)`

- `app_home_banners` — hero/wall banners for home UI (slot, file_name, href, active)
 - `app_home_broadcasts` — admin broadcast messages shown on home (business_id, title, body, active, created_at)

Important UltimatePOS tables referenced by APIs
- `products(id, business_id, name, sku, image, category_id, sub_category_id, brand_id, is_inactive, not_for_selling)`
- `variations(id, product_id, sub_sku, default_sell_price, sell_price_inc_tax)`
- `variation_location_details` (used in connector responses) — contains `location_id` and `qty_available` (used to compute per-location stock)
- `contacts(id, business_id, name, email, customer_group_id)`
- `customer_groups(id, selling_price_group_id)`
- `transaction_sell_lines` and `transactions` — used to compute trending/best sellers and for order history

Notes for developers
- `variation_location_details` is typically present in connector product responses (ERP) and is relied upon by product routes to compute per-location stock.
- Prices for customers depend on selling price groups; server code resolves price group via contact → customer_group → selling_price_group.
- Custom `app_` tables are small and only keep web-specific state: carts, wishlist, banners, small auth wrapper.

If you need a full schema dump, run the DB schema export and I can normalize it into a readable reference.
```
- `variation_id` → `variations(id)`
