# Database Schema Cheat‑Sheet (Effective Tables Used by API)

This document lists the key tables actually referenced by the backend routes, with columns and foreign keys extracted from your `DB_structure.sql`.

### `app_auth_users`

**Columns**:

`id`, `business_id`, `contact_id`, `email`, `password_hash`, `reset_token`, `reset_token_expires`, `is_active`, `created_at`, `updated_at`

**Foreign keys**:

- `contact_id` → `contacts(id)`


### `app_brand_assets`

**Columns**:

`brand_id`, `logo`, `alt_text`, `active`, `created_at`, `updated_at`

**Foreign keys**:

- `brand_id` → `brands(id)`


### `app_cart_items`

**Columns**:

`id`, `cart_id`, `product_id`, `variation_id`, `qty`, `created_at`, `updated_at`

**Foreign keys**:

- `cart_id` → `app_carts(id)`
- `product_id` → `products(id)`
- `variation_id` → `variations(id)`


### `app_carts`

**Columns**:

`id`, `user_id`, `created_at`, `updated_at`

**Foreign keys**:

- `user_id` → `app_auth_users(id)`


### `app_category_hidden_for_contacts`

**Columns**:

`category_id`, `contact_id`

**Foreign keys**:

- `contact_id` → `contacts(id)`


### `app_category_visibility`

**Columns**:

`id`, `business_id`, `category_id`, `hide_for_guests`, `hide_for_all_users`

**Foreign keys**:

- `category_id` → `categories(id)`


### `app_home_banners`

**Columns**:

`id`, `slot`, `sort_order`, `href`, `file_name`, `alt_text`, `is_gif`, `active`, `created_at`, `updated_at`


### `app_wishlists`

**Columns**:

`user_id`, `product_id`, `created_at`

**Foreign keys**:

- `product_id` → `products(id)`
- `user_id` → `app_auth_users(id)`


### `brands`

**Columns**:

`id`, `business_id`, `name`, `description`, `created_by`, `deleted_at`, `created_at`, `updated_at`

**Foreign keys**:

- `business_id` → `business(id)`
- `created_by` → `users(id)`


### `business_locations`

**Columns**:

`id`, `business_id`, `location_id`, `name`, `landmark`, `country`, `state`, `city`, `zip_code`, `invoice_scheme_id`, `sale_invoice_scheme_id`, `invoice_layout_id`, `sale_invoice_layout_id`, `selling_price_group_id`, `print_receipt_on_invoice`, `receipt_printer_type`, `printer_id`, `mobile`, `alternate_number`, `email`, `website`, `featured_products`, `is_active`, `default_payment_accounts`, `custom_field1`, `custom_field2`, `custom_field3`, `custom_field4`, `accounting_default_map`, `deleted_at`, `created_at`, `updated_at`

**Foreign keys**:

- `business_id` → `business(id)`
- `invoice_layout_id` → `invoice_layouts(id)`
- `invoice_scheme_id` → `invoice_schemes(id)`


### `categories`

**Columns**:

`id`, `name`, `business_id`, `short_code`, `parent_id`, `created_by`, `woocommerce_cat_id`, `category_type`, `description`, `slug`, `deleted_at`, `created_at`, `updated_at`, `is_active`

**Foreign keys**:

- `business_id` → `business(id)`
- `created_by` → `users(id)`


### `contacts`

**Columns**:

`id`, `woocommerce_customer_id`, `business_id`, `type`, `contact_type`, `supplier_business_name`, `name`, `prefix`, `first_name`, `middle_name`, `last_name`, `email`, `contact_id`, `contact_status`, `tax_number`, `city`, `state`, `country`, `address_line_1`, `address_line_2`, `zip_code`, `dob`, `mobile`, `landline`, `alternate_number`, `pay_term_number`, `pay_term_type`, `credit_limit`, `created_by`, `converted_by`, `converted_on`, `balance`, `total_rp`, `total_rp_used`, `total_rp_expired`, `is_default`, `shipping_address`, `shipping_custom_field_details`, `is_export`, `export_custom_field_1`, `export_custom_field_2`, `export_custom_field_3`, `export_custom_field_4`, `export_custom_field_5`, `export_custom_field_6`, `position`, `customer_group_id`, `crm_source`, `crm_life_stage`, `custom_field1`, `custom_field2`, `custom_field3`, `custom_field4`, `custom_field5`, `custom_field6`, `custom_field7`, `custom_field8`, `custom_field9`, `custom_field10`, `deleted_at`, `created_at`, `updated_at`

**Foreign keys**:

- `business_id` → `business(id)`
- `created_by` → `users(id)`


### `customer_groups`

**Columns**:

`id`, `business_id`, `name`, `amount`, `price_calculation_type`, `selling_price_group_id`, `created_by`, `created_at`, `updated_at`

**Foreign keys**:

- `business_id` → `business(id)`


### `media`

**Columns**:

`id`, `business_id`, `file_name`, `description`, `uploaded_by`, `model_type`, `woocommerce_media_id`, `model_media_type`, `model_id`, `created_at`, `updated_at`


### `products`

**Columns**:

`id`, `name`, `business_id`, `type`, `unit_id`, `secondary_unit_id`, `sub_unit_ids`, `brand_id`, `category_id`, `sub_category_id`, `tax`, `tax_type`, `enable_stock`, `alert_quantity`, `sku`, `barcode_type`, `expiry_period`, `expiry_period_type`, `enable_sr_no`, `weight`, `product_custom_field1`, `product_custom_field2`, `product_custom_field3`, `product_custom_field4`, `product_custom_field5`, `product_custom_field6`, `product_custom_field7`, `product_custom_field8`, `product_custom_field9`, `product_custom_field10`, `product_custom_field11`, `product_custom_field12`, `product_custom_field13`, `product_custom_field14`, `product_custom_field15`, `product_custom_field16`, `product_custom_field17`, `product_custom_field18`, `product_custom_field19`, `product_custom_field20`, `image`, `woocommerce_media_id`, `product_description`, `created_by`, `woocommerce_product_id`, `woocommerce_disable_sync`, `preparation_time_in_minutes`, `warranty_id`, `is_inactive`, `not_for_selling`, `created_at`, `updated_at`

**Foreign keys**:

- `brand_id` → `brands(id)`
- `business_id` → `business(id)`
- `category_id` → `categories(id)`
- `created_by` → `users(id)`
- `sub_category_id` → `categories(id)`
- `tax` → `tax_rates(id)`
- `unit_id` → `units(id)`


### `tax_rates`

**Columns**:

`id`, `business_id`, `name`, `amount`, `is_tax_group`, `for_tax_group`, `created_by`, `woocommerce_tax_rate_id`, `deleted_at`, `created_at`, `updated_at`

**Foreign keys**:

- `business_id` → `business(id)`
- `created_by` → `users(id)`


### `transaction_payments`

**Columns**:

`id`, `transaction_id`, `business_id`, `is_return`, `amount`, `method`, `payment_type`, `transaction_no`, `card_transaction_number`, `card_number`, `card_type`, `card_holder_name`, `card_month`, `card_year`, `card_security`, `cheque_number`, `bank_account_number`, `paid_on`, `created_by`, `paid_through_link`, `gateway`, `is_advance`, `payment_for`, `parent_id`, `note`, `document`, `payment_ref_no`, `account_id`, `created_at`, `updated_at`

**Foreign keys**:

- `transaction_id` → `transactions(id)`


### `transaction_sell_lines`

**Columns**:

`id`, `transaction_id`, `product_id`, `variation_id`, `quantity`, `secondary_unit_quantity`, `quantity_returned`, `unit_price_before_discount`, `unit_price`, `line_discount_type`, `line_discount_amount`, `unit_price_inc_tax`, `item_tax`, `tax_id`, `discount_id`, `lot_no_line_id`, `sell_line_note`, `woocommerce_line_items_id`, `so_line_id`, `so_quantity_invoiced`, `res_service_staff_id`, `res_line_order_status`, `parent_sell_line_id`, `children_type`, `sub_unit_id`, `created_at`, `updated_at`

**Foreign keys**:

- `product_id` → `products(id)`
- `tax_id` → `tax_rates(id)`
- `transaction_id` → `transactions(id)`
- `variation_id` → `variations(id)`


### `transactions`

**Columns**:

`id`, `business_id`, `location_id`, `journal_entry_id`, `is_kitchen_order`, `res_table_id`, `res_waiter_id`, `res_order_status`, `type`, `sub_type`, `status`, `sub_status`, `is_quotation`, `payment_status`, `adjustment_type`, `contact_id`, `customer_group_id`, `invoice_no`, `ref_no`, `source`, `subscription_no`, `subscription_repeat_on`, `transaction_date`, `total_before_tax`, `tax_id`, `tax_amount`, `discount_type`, `discount_amount`, `rp_redeemed`, `rp_redeemed_amount`, `shipping_details`, `shipping_address`, `delivery_date`, `shipping_status`, `delivered_to`, `delivery_person`, `shipping_charges`, `shipping_custom_field_1`, `shipping_custom_field_2`, `shipping_custom_field_3`, `shipping_custom_field_4`, `shipping_custom_field_5`, `additional_notes`, `staff_note`, `is_export`, `export_custom_fields_info`, `round_off_amount`, `additional_expense_key_1`, `additional_expense_value_1`, `additional_expense_key_2`, `additional_expense_value_2`, `additional_expense_key_3`, `additional_expense_value_3`, `additional_expense_key_4`, `additional_expense_value_4`, `final_total`, `expense_category_id`, `expense_sub_category_id`, `expense_for`, `commission_agent`, `document`, `is_direct_sale`, `is_suspend`, `exchange_rate`, `total_amount_recovered`, `transfer_parent_id`, `return_parent_id`, `opening_stock_product_id`, `created_by`, `crm_is_order_request`, `woocommerce_order_id`, `essentials_duration`, `essentials_duration_unit`, `essentials_amount_per_unit_duration`, `essentials_allowances`, `essentials_deductions`, `purchase_requisition_ids`, `prefer_payment_method`, `prefer_payment_account`, `sales_order_ids`, `purchase_order_ids`, `custom_field_1`, `custom_field_2`, `custom_field_3`, `custom_field_4`, `import_batch`, `import_time`, `types_of_service_id`, `packing_charge`, `packing_charge_type`, `service_custom_field_1`, `service_custom_field_2`, `service_custom_field_3`, `service_custom_field_4`, `service_custom_field_5`, `service_custom_field_6`, `is_created_from_api`, `rp_earned`, `order_addresses`, `is_recurring`, `recur_interval`, `recur_interval_type`, `recur_repetitions`, `recur_stopped_on`, `recur_parent_id`, `invoice_token`, `pay_term_number`, `pay_term_type`, `selling_price_group_id`, `hms_booking_arrival_date_time`, `hms_booking_departure_date_time`, `hms_coupon_id`, `created_at`, `updated_at`

**Foreign keys**:

- `business_id` → `business(id)`
- `contact_id` → `contacts(id)`
- `created_by` → `users(id)`
- `expense_category_id` → `expense_categories(id)`
- `expense_for` → `users(id)`
- `location_id` → `business_locations(id)`
- `tax_id` → `tax_rates(id)`


### `units`

**Columns**:

`id`, `business_id`, `actual_name`, `short_name`, `allow_decimal`, `base_unit_id`, `base_unit_multiplier`, `created_by`, `deleted_at`, `created_at`, `updated_at`

**Foreign keys**:

- `business_id` → `business(id)`
- `created_by` → `users(id)`


### `users`

**Columns**:

`id`, `user_type`, `surname`, `first_name`, `last_name`, `username`, `email`, `password`, `language`, `contact_no`, `address`, `remember_token`, `business_id`, `essentials_department_id`, `essentials_designation_id`, `essentials_salary`, `essentials_pay_period`, `essentials_pay_cycle`, `available_at`, `paused_at`, `max_sales_discount_percent`, `allow_login`, `status`, `is_enable_service_staff_pin`, `service_staff_pin`, `crm_contact_id`, `is_cmmsn_agnt`, `cmmsn_percent`, `selected_contacts`, `dob`, `gender`, `marital_status`, `blood_group`, `contact_number`, `alt_number`, `family_number`, `fb_link`, `twitter_link`, `social_media_1`, `social_media_2`, `permanent_address`, `current_address`, `guardian_name`, `custom_field_1`, `custom_field_2`, `custom_field_3`, `custom_field_4`, `bank_details`, `id_proof_name`, `id_proof_number`, `crm_department`, `crm_designation`, `location_id`, `deleted_at`, `created_at`, `updated_at`

**Foreign keys**:

- `business_id` → `business(id)`
- `crm_contact_id` → `contacts(id)`


### `variations`

**Columns**:

`id`, `name`, `product_id`, `sub_sku`, `product_variation_id`, `woocommerce_variation_id`, `variation_value_id`, `default_purchase_price`, `dpp_inc_tax`, `profit_percent`, `default_sell_price`, `sell_price_inc_tax`, `created_at`, `updated_at`, `deleted_at`, `combo_variations`

**Foreign keys**:

- `product_id` → `products(id)`
- `product_variation_id` → `product_variations(id)`
