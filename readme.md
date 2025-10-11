MojiStore — README (short and actionable)

What this repository contains
- `mojistore/` — React + Vite storefront (customer-facing UI)
- `api/` — Node.js + Express backend that exposes JSON APIs under `/api/*`
- `api/src/lib` — backend helpers (ERP connector, cache, image proxy, utilities)
- `api/migrations` — optional SQL migrations (e.g. cache invalidation table)
- `api/ADMIN_FILE_README.md` — quick guide for file-based admin commands

Goal
This project integrates a storefront UI with a local backend that talks to UltimatePOS (ERP) for authoritative product pricing, stock and order posting. The frontend never calls the ERP directly; it always talks to `api/` which either reads local DB tables or proxies/requests the ERP connector.

Quick answers to "how do I run / test / call routes?" (layman-friendly)
- Running locally: start backend then frontend.
	- Backend (from `api/`): set env and run `node src/server.js` (or `npm run dev` to use nodemon).
	- Frontend (from `mojistore/`): run `npm run dev` (Vite) and open http://localhost:5173 (or the port Vite prints).
- Calling APIs:
	- Browser: use the address bar for simple GET routes (for example `http://localhost:4000/api/health`).
	- Scripts / CLI: use `curl` or PowerShell `Invoke-RestMethod` for requests that need headers/body (recommended for admin endpoints).
	- Postman: you can import requests if you prefer GUI testing.

Admin options for cache & quick operations (simplified)
- HTTP admin endpoints (recommended for ad-hoc calls):
	- POST /api/admin/cache/flush (requires ADMIN_CACHE_SECRET) — flush a specific cache key.
	- GET  /api/admin/cache/stats  (requires ADMIN_CACHE_SECRET) — get in-process cache stats.
	Usage (PowerShell):
	$headers = @{ 'x-admin-cache-secret' = 'YOUR_SECRET' }
	Invoke-RestMethod -Uri 'http://localhost:4000/api/admin/cache/stats' -Headers $headers

- File-based admin (convenient, no headers):
	- Enable by setting env: ADMIN_COMMANDS_FILE to a local JSON file path and restart the API.
	- Drop JSON commands into that file to ask the server to flush keys or write stats.
	- Example `admin_cache_commands.json`:
		{
			"flush": ["products:v1:abcd*"],
			"stats": true
		}
	- The server will process the file, run commands and (if requested) write `admin_cache_stats.json` next to it.

File-admin CLI helper
---------------------
If you prefer to script atomic updates to the file-admin commands file, there's a small helper at `api/tools/admin-file-cli.js`.
Examples:

PowerShell:
```powershell
# Write flush + stats in one atomic step
node api/tools/admin-file-cli.js --file .\api\admin_cache_commands.json --flush "products:v1:*,home:v1" --stats
```

# Or pipe JSON:
Get-Content payload.json | node api/tools/admin-file-cli.js --file .\api\admin_cache_commands.json

This writes the commands file atomically (temp file + rename) so partial edits are avoided. The running server (if started with `ADMIN_COMMANDS_FILE` pointing to that file) will pick up commands and act on them.

Should I type admin routes in the browser? 
- GET requests you can open directly in a browser (if protected by a cookie or secret you may get 403). 
- POST/DELETE/PATCH calls are easier from curl/PowerShell/Postman since they allow headers and JSON bodies.

Common example commands (PowerShell)
```powershell
# Get health
Invoke-RestMethod -Uri 'http://localhost:4000/api/health'

# Get cache stats (requires ADMIN_CACHE_SECRET env var set on server)
$headers = @{ 'x-admin-cache-secret' = 'mysecret' }
Invoke-RestMethod -Uri 'http://localhost:4000/api/admin/cache/stats' -Headers $headers

# Flush an exact cache key
$body = @{ key = 'products:v1:abcd1234' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:4000/api/admin/cache/flush' -Headers $headers -Method Post -Body $body -ContentType 'application/json'

# Using the file-based admin: edit admin_cache_commands.json and add {"flush":["products:v1:abcd*"]}
```

Where to look in the codebase (quick pointers)
- Backend entry: `api/src/server.js` (mounts routes and starts optional file-admin runner)
- API routes: `api/src/routes/*.js` (products.js, home.js, locations.js, cart.js, checkout.js, admin_cache.js)
	- New: `app_home_broadcasts` table and `/api/test/broadcasts` dev endpoints to manage home broadcast modal messages. The `/api/home` endpoint now returns `broadcast` (most recent active) in its payload.
- ERP helper: `api/src/lib/erp.js` (all ERP connector calls are centralized here)
- Shared cache: `api/src/lib/cache.js` (in-process LRU + optional DB invalidation)
- File-based admin: `api/src/lib/fileAdmin.js` (watch JSON commands file)

Running checklist (minimal)
1) From `api/`: `npm install` then (optionally) set env in PowerShell and run backend:
	 $env:PORT='4000'; $env:ADMIN_COMMANDS_FILE='C:\path\to\admin_cache_commands.json'; node src/server.js
2) From `mojistore/`: `npm install`; `npm run dev` and open the Vite URL.

If you want me to: I can rewrite the long docs in this repo (`system_blueprint.md`, `mj_web_schema_cheatsheet.md`, and `mj_web_openapi.yaml`) to be shorter and accurate to the current codebase. I will do that if you confirm.

Data Flow & Integration: For most read operations (product listings, search suggestions, home page sections, etc.), the backend queries the local MySQL database (which contains synced product, category, and transaction data from UltimatePOS) for performance. For certain real-time or detailed data (individual product details with stock and price, customer contact info, or posting new orders), the backend calls UltimatePOS’s REST API to ensure up-to-date ERP logic is applied. This hybrid approach means some data is served from the local DB while some flows delegate to UltimatePOS. Authentication and session management are handled via JWT cookies issued by our backend (not directly exposing UltimatePOS credentials), and customer actions like checkout trigger ERP operations (e.g. creating a sale in UltimatePOS).

Authentication & Authorization: User login is managed by our backend – credentials are verified against a local app_auth_users table which maps to an UltimatePOS Contact (customer). On successful login, the backend issues a signed JWT (stored as an HttpOnly cookie token) containing the user’s internal uid, their UltimatePOS contact_id (cid), and their price group (pgid). The JWT is used on subsequent API calls (verified by middleware) to identify the user. There are two major roles in this system: guest (not logged in) and authenticated customer. Only authenticated customers can see prices and perform checkout/payment; guests can browse products (with prices hidden) and manage a local cart/wishlist that merges upon login (see below). Note: Admin/staff functions (product management, etc.) are not handled in this web app – those are done in UltimatePOS’s own interface. Thus, “admin” role is out-of-scope in this eCommerce front, which focuses on customer-facing features.

Product Catalog & Inventory: Product data is primarily stored in UltimatePOS’s tables (e.g. products, variations, categories, brands, etc.) in the MySQL DB. The backend directly queries these tables for things like search suggestions and filter counts. For example, the Search API (GET /api/search/suggest) performs SQL queries against products, categories, and brands tables to find names or SKUs matching the query. Likewise, the Filters API (GET /api/filters) runs aggregation queries to count products by brand, category, and subcategory given optional search filters. These direct DB queries use the configured BUSINESS_ID to scope results to this business’s data.

However, for detailed product info (e.g. a Product Detail Page request), the backend defers to the UltimatePOS Connector API. The Products API in our backend (GET /api/products/:id) calls erpGetAny() with multiple candidate endpoints (like /connector/api/product/{id}). It passes query params such as business_id, include_location_details=1 (to get stock by location), and if the user is logged in, their UltimatePOS contact_id for price group pricing. UltimatePOS returns product data including variations, prices, and stock per location. The backend shapes this into a simplified JSON for the frontend: fields like id, name, description, image URL, category names, etc., plus an array of variants. Importantly, pricing is login-gated: the backend sets minPrice to null for guests (no price leakage). For each variant, if the user is not logged in, price is set to null as well. Thus the frontend will only display prices when user is authenticated. Stock availability (in_stock) is computed using the variation’s variation_location_details from UltimatePOS’s response, or aggregated across all locations. This on-demand fetch ensures that when a customer views a product, they see accurate stock and their specific pricing (including any price group discounts).

Shopping Cart: The cart system has two modes: guest cart (stored in the browser’s Redux state/localStorage) and authenticated cart (stored server-side in the database). On the backend, the app_carts and app_cart_items tables maintain persistent carts. When a logged-in user hits GET /api/cart, the backend ensures a cart record exists for their user_id and returns the cart items with product info. For each item, it calculates the price using the user’s price group (via priceForVariation) before responding. The frontend uses this to populate the Redux cart state by dispatching setCart with the returned items. Guests, on the other hand, have their cart solely in Redux state initially. If a guest logs in, the app triggers a cart merge: the utility mergeGuestCartToServer(items) posts each local item to /api/cart/add. Our POST /api/cart/add endpoint will insert or update the item in app_cart_items (after validating the product & variation IDs). After merging, the local guest cart is cleared and the server cart becomes authoritative.

All cart modifications funnel through the backend for logged-in users. For example, the frontend’s Cart page calls PATCH /api/cart/update to set a specific quantity or DELETE /api/cart/remove/:itemId to remove a line; after each change it refreshes the cart via GET /api/cart. Guest cart updates simply dispatch Redux actions (e.g. cartSlice.addToCart for adding or adjusting quantity) which update local state. The frontend gatekeeps cart actions: if a guest clicks “Add to Cart”, the QuickView or ProductCard will not actually call the API (since not logged in) – it either no-ops or could prompt login. In our QuickView component, for instance, the addToCart button does nothing if !user (not logged in). This encourages guests to log in to proceed to checkout.

Checkout & Order Placement: The checkout process involves selecting a business location (for stock fulfilment) and placing the order, which creates an invoice/sale in UltimatePOS. When an authenticated user proceeds to checkout, the frontend calls GET /api/checkout/bootstrap to fetch available shipping/pickup locations and a default location. The backend calls listLocations() which hits UltimatePOS’s API (trying endpoints like /business-location or /locations) to retrieve the list of active business locations. The bootstrap response sends an array of {id, name} locations (with a special {id: null, name: "All locations"} entry). The frontend uses this to let the user choose a fulfillment location (stored in component state).

On placing the order, the frontend sends a POST /api/checkout/create with the chosen location_id, and optionally payment info or shipping details (if implemented). Notably, the frontend does not send prices – it only sends product and variation IDs and quantities. The backend’s /checkout/create handler then: (1) Confirms the user’s UltimatePOS contact ID (ensuring they exist), (2) Determines the effective location_id (using the provided one or default), (3) Gathers the line items – if the request had a products array it uses that, otherwise it loads the items from the server-side cart (loadServerCartItems), (4) Computes the applicable price group ID for the user via priceGroupIdForContact, and (5) Calculates each line’s unit price on the server using priceForVariation(vid, pgId). By recalculating prices at checkout, the server ensures the total matches UltimatePOS rules and the user’s price group (preventing any client-side tampering). It then constructs a payload in the format UltimatePOS expects (a “sell” object), including business_id, location_id, contact_id, status (final for a completed order), payment status (due or paid depending on if payment info was collected), an array of product lines with product_id, variation_id, quantity, and unit_price. This payload is sent via erpFetch('/sell', { method: 'POST', ... }) to UltimatePOS.

UltimatePOS processes the sale and returns data about the created invoice. Our backend uses extractSell(resp) to parse out the new transaction’s id and invoice_no. If successful, the API responds to the frontend with { ok: true, id, invoice_no }. The user sees an order confirmation (the React app navigates to an Order Complete page showing the invoice number). Meanwhile, the backend clears the user’s cart (deletes app_cart_items for that cart) as a best-effort cleanup. The order details now reside in UltimatePOS (as a transaction of type “sell”).

Post-Order and Accounts: The application provides an “My Account” area where users can view their profile, addresses, and orders. The Account Profile (GET /api/account/profile) is implemented by calling UltimatePOS’s contact API to get the latest info on the customer. This returns fields like name, email, phone, company, tax number, credit limit, etc., which the backend forwards as JSON. Similarly, GET /api/account/addresses pulls the billing and shipping address from the contact details (combining fields into a formatted address). For order history, our backend queries the local DB: GET /api/account/invoices finds past transactions for the user’s contact (using transactions table where contact_id matches) and paginates them. It returns basic info (transaction id, invoice_no, date, total) for display. If the user clicks an order, we even allow them to download the invoice PDF: GET /api/account/orders/:invoiceNo/pdf will generate a PDF on the fly. The backend’s Invoice generator uses Puppeteer to render HTML – it queries the DB for the transaction, its lines and payments, then feeds that into an HTML template which is converted to PDF. The PDF streaming ensures the user can get a copy of the invoice that mirrors the UltimatePOS invoice format.

Wishlist and Other Features: The system also includes a wishlist for logged-in users. The frontend has a Wishlist context that manages a set of product IDs. Guests’ wishlist items are stored in localStorage (under key guest_wishlist), while logged-in users’ wishlist items are stored in the database (app_wishlists table). On login, the app merges the guest wishlist to the server similar to the cart: it iterates local wishlist IDs and sends them to POST /api/wishlist/:productId. The wishlist API endpoints simply insert or delete entries in app_wishlists (with INSERT IGNORE to avoid duplicates). When viewing the wishlist page, GET /api/wishlist returns the list of products the user saved, by joining app_wishlists with the products table to get names and images. The frontend displays those as ProductCards. The ProductCard component shows a heart icon (wishlist toggle) and uses the Wishlist context’s add/remove methods when clicked. ProductCard also interacts with QuickView (eye icon) and handles the login-gating for price/cart: if a guest clicks the product image or name, the component can intercept and show a login prompt overlay instead of navigating (to enforce login before viewing full details). In our implementation, ProductCard tracks isAuthed via Auth context and listens for global auth:login/logout events. If a guest tries to open the QuickView or navigate, we could require login – e.g. showLoginPrompt state flips and the card renders a modal to ask for login. (This behavior is configurable; currently, prices and add-to-cart are the only gated actions, while viewing details is allowed).

System Diagram – Entity Relationships: The following key entities illustrate how data is structured across the system (tables in UltimatePOS DB vs Custom tables):

Contacts – UltimatePOS table for customers. Each contact has a customer_group_id which links to CustomerGroups, and ultimately to a SellingPriceGroup (price level). Our app_auth_users stores a reference to the contact (so the web user corresponds to an UltimatePOS contact).

Products – Core table for items being sold. Linked to a Category (and optional sub-category) and a Brand. Products can be single or have multiple Variations (variants). Variations carry stock and price info. UltimatePOS supports multiple price groups via variation_group_prices (each Variation × PriceGroup with a price).

Transactions – Represents orders/invoices in UltimatePOS. A transaction has a customer (contact_id), a location (location_id for store/warehouse), status (final for completed sale), payment status, etc. Each transaction has one or many TransactionSellLines (line items linking to a product & variation and quantity sold), and zero or more TransactionPayments (payments made). In our integration, when an order is placed, we create a transaction in UltimatePOS, and we reference it for order history and PDF generation.

Custom Tables: We introduced:

app_auth_users: maps a web user to UltimatePOS contact (fields: id, business_id, contact_id, email, password_hash, reset tokens).

app_wishlists: simple mapping of user_id to product_id for wishlisted items.

app_carts and app_cart_items: persistent cart per user. app_cart_items link to product_id and variation_id; this denormalization (storing both) is convenient for quick lookups and joins with product info. Cart items are cleared on checkout.

app_brand_assets and app_home_banners: support content management – e.g. storing brand logos (image file paths) and homepage banner images. Our home API joins app_brand_assets to brands to retrieve logo files for the featured brands carousel, and queries app_home_banners for hero and wall banners. These images are served via the Express /img route, which uses Sharp to resize/format images on the fly (images are stored on the server and delivered as /img/filename?... URLs).

In summary, the architecture is integrated but decoupled: The React frontend never talks to the UltimatePOS API or DB directly – it goes through our Node backend APIs. The Node backend uses the local MySQL for fast reads and sync, but delegates to UltimatePOS for critical operations and data (ensuring consistency with the ERP). This design provides a seamless eCommerce experience (fast browsing from cached DB data, real-time ERP updates for stock/pricing, and all transactions ultimately recorded in the ERP).

Developer Handbook

This section is a practical onboarding guide to the codebase, explaining the structure and key components on both front-end and back-end, and how they work together. We’ll go through the repository layout, important files, and how to extend or modify common functionality.

Project Structure

Backend (Express API) – The Node backend code (likely in an api or backend folder) is structured by feature via Express router modules. Key files and folders include:

server.js: The entry point that configures Express app settings and mounts all route modules.

routes/ directory: Contains modules corresponding to API endpoints (e.g. auth.js, products.js, cart.js, checkout.js, account.js, etc.). Each exports an Express Router with route handlers.

middleware/auth.js: Defines authRequired and authOptional middleware for JWT cookie verification.

db.js: Sets up the MySQL connection pool (using credentials from env).

config/env.js: Loads environment variables (like BUSINESS_ID, API base URL for UltimatePOS, etc.).

lib/ directory: Utility modules. For example, lib/price.js contains helpers for pricing logic (e.g. fetching a variation’s price given a price group).

utils/jwt.js: Utilities for signing and verifying JWT tokens.

utils/erpFetch.js (or similar): A wrapper around node-fetch to call UltimatePOS APIs (setting auth headers, base URL, etc.). In products.js we see erpGetAny([...]) and in checkout.js we see erpFetch('/sell', {...}) being used to communicate with the ERP.

Frontend (React app) – The React code (likely in src/ directory of a Vite project) is organized into:

src/pages/: Page-level components corresponding to routes (e.g. Home.jsx, Products.jsx for product listing, ProductDetail.jsx for PDP, CartPage.jsx, Checkout.jsx, Account.jsx with nested tabs like Profile, Orders, etc.).

src/components/: Reusable components. For example:

Navbar.jsx and SubNavbar.jsx: The header bars. Navbar includes logo, search bar, user menu, cart icon, etc., while SubNavbar might show category navigation links or subcategories. These components use global state (Auth, Cart, Location) to display current user or location. For instance, Navbar uses useAuth() to decide whether to show “Login” vs. user’s name and uses the Cart Redux state to show the cart item count badge.

SideNav.jsx and SideNavContext.jsx: For mobile view, a slide-out side navigation. SideNavContext provides context state (open/close) and a hook to trigger it. Navbar likely toggles this context when the hamburger menu is clicked.

ProductCard.jsx: Card display for a product (used in lists, carousels, etc.). Shows product image, name, maybe category, and price/stock. It imports useAuth and useWishlist to integrate login gating and wishlist functionality. It also uses QuickView and triggers it on a button (eye icon).

QuickView.jsx: A modal that shows a product’s details quickly (without navigating to PDP). It fetches the product details (calls /api/products/:id) when opened, and allows adding to cart from within (with the same login check).

SmartImage.jsx: An image loader component that uses the /img proxy for optimized loading. It builds the image URL with desired width/format and handles low-quality placeholder and retina srcSet.

HeroCarousel.jsx and other home-specific components: for displaying the hero banners, using SmartImage and embla carousel for sliding images.

src/redux/: Redux store setup and slices. We use Redux Toolkit (@reduxjs/toolkit) to manage global state for cart (and possibly auth):

store.js: Configures the Redux store with slices (cartSlice, authSlice, etc.).

slices/cartSlice.js: Defines the cart state shape and reducers. We saw how it has actions like setCart (replace state with server-provided cart), addToCart, removeFromCart, etc., and cleverly normalizes items to avoid duplicates. It also keeps derived fields count and subtotal updated. Note: The cart slice is used for both guest and logged-in scenarios – e.g. addToCart simply updates state (for guest usage), and setCart is used after fetching server cart to sync state.

slices/authSlice.js: This slice holds auth token and related info in Redux. In our app, we ended up using React Context for auth instead, so this slice is minimal – it stores JWT and contact/price group IDs, and has actions loginOk and logout that also sync to localStorage. Depending on the evolution of the app, this slice could be unused if context took over, but it’s there in case we needed to store auth in Redux (e.g. for a non-context approach or other uses).

We do not see a specific wishlistSlice, because wishlist is handled via context.

src/state/: React Context providers for global state not in Redux:

auth.jsx (AuthProvider): Provides the auth context (current user, loading state, and login/logout functions). It uses api.get('/account/me') on mount to check session. The login(email, password) method calls our backend and if 200 OK, it triggers a refresh and emits a global auth:login event. Components can access useAuth() to get { user, login, logout, isAuthenticated }. We see AuthProvider also listens for auth:logout events to clear the user on token expiration or manual logout.

Wishlist.jsx (WishlistProvider): Manages the wishlist context, as described. It exposes ids (a Set of product IDs wishlisted) and methods add(productId) and remove(productId). On mount or auth changes, it merges guest <-> server as needed and loads the current wishlist.

(Possibly a FiltersProvider if complex filter state is needed, or a simple hook for search filters. The code snippet references a FiltersProvider in App.jsx that might handle filter state across pages.)

src/api/axios.js: an Axios instance preconfigured with baseURL = import.meta.env.VITE_API_URL (likely /api) and withCredentials: true so that JWT cookie is sent on requests. This simplifies API calls in components: e.g. axios.get('/cart', { withCredentials:true }).

Routing (React Router): The routes are defined likely in App.jsx using <Routes> and <Route> from react-router-dom. In the snippet we have, inside the <Layout> wrapper, routes for each page are declared. They wrap protected pages in RequireAuth and prevent logged-in users from seeing login/register via RedirectIfAuthed. The Account page is a parent with nested <Route path="profile" element={<Profile/>}> etc. for sub-sections. This structure matches the tabbed account UI.

Styling: The project uses CSS modules or plain CSS for components (as seen by imports like import "./product-card.css"). The CSS is organized by component or page (e.g. cart.css, checkout.css, etc. in the search results). Tailwind is also configured (we saw Vite plugin for tailwind), so utility classes might be used in JSX (e.g. classes for layout in HeroCarousel.jsx snippet).

Notable Components and Connections

Navbar & SubNavbar: These provide site navigation. The Navbar likely contains logic to display different menu items for logged in users vs guests (e.g. “My Account” link if auth.user exists, otherwise “Login”). It might import useAuth() and useCart (Redux) to get cart.count. It also integrates location selection: possibly a dropdown or button to select the current store location (for stock filtering). In the code, Navbar or SubNavbar uses a piece of state (perhaps from SideNavContext or directly reading ms_location_id from localStorage) to show the selected location and toggle a location list. Indeed, the Navbar.jsx likely has a piece of state like selectedLocName and an effect to load locations from /locations API on mount. The locations API returns the list including "All locations", which the Navbar uses to populate a dropdown. On selection, it stores the chosen location ID in localStorage and dispatches a global event location:changed (the code snippet shows an event dispatch on storage and focus). Many components (Home, Product list, etc.) listen for location changes to refetch data.

SideNav (mobile menu): The SideNavContext provides { sideNavOpen, setSideNavOpen }. Navbar likely has a burger icon that calls setSideNavOpen(true). The SideNav.jsx component reads the context and, if open, renders an overlay with navigation links (possibly reusing the same links as the main navbar, but vertical). This context approach avoids prop drilling.

ProductCard & QuickView: Each product listing (on home or category page) is a ProductCard. Important interactions:

Wishlist: The heart icon on ProductCard uses useWishlist(). It checks if p.id is in wishlist.ids to decide filled heart vs outline (via isWishlisted prop or internal state). On click, if saved was false it calls add(p.id), otherwise remove(p.id). These in turn either update localStorage (guest) or call API (user) and update context state.

Quick View: The eye icon sets openQV state true, which conditionally renders the QuickView component (likely as a modal). QuickView accepts a productId and possibly the already loaded product data as a prop. If product data isn’t provided, it will fetch from /api/products/:id. In our QuickView.jsx, on mount it triggers an API call to /products/{productId} and then populates state. It also locks page scrolling while open. The QuickView shows the product image(s), name, variant options, etc. It determines if the product has exactly one variant, then it can show an “Add to Cart” button directly (since no variant selection needed). That button calls api.post('/cart/add', { product_id, variation_id, quantity:1 }) for logged-in users. If the user is not logged in (!user), the handler simply returns (so nothing happens). This is intentionally left as a no-op to require login before adding to cart (we might improve UX by prompting login here).

Login Prompt gating: In ProductCard, we maintain showLoginPrompt state. By default, clicking the card’s image/title navigates to the product page via <Link to={/products/${p.id}}>. But if we want to force login for detailed view, we could intercept that click when !user and instead show a modal asking to log in. The code indicates that if onCardClick prop is not provided (meaning default behavior) and user is not authed, they set showLoginPrompt = true instead of navigating. The presence of logic around isAuthed and showLoginPrompt in ProductCard suggests this feature. If showLoginPrompt is true, ProductCard might render an overlay with a message and a Login button (which likely navigates to /login?next= the current page). Indeed, we see toLogin = "/login?next=<currentPath>" computed.

Account Pages: The Account parent page (Account.jsx) likely sets up the layout for tabs and an <Outlet> for sub-routes. The sub-pages like Profile.jsx, Orders.jsx, Addresses.jsx each fetch their data via the APIs:

Profile.jsx: On mount, calls axios.get('/account/profile') and populates fields. It likely displays profile info and maybe allows editing (if editing were allowed, we would have a PUT route – not explicitly seen, possibly out of scope).

Orders.jsx: This would call /account/invoices (with pagination params) to list orders. The code for ledger (if there is a “Ledger” or payments tab) shows caching and pagination logic for account data. Orders.jsx likely follows similar pattern: hitting /account/invoices?page=… and rendering a list. Each item can link to an Order Detail page or trigger a download. We provided /account/orders/:invoiceNo/pdf for PDF. Possibly clicking an order might simply download PDF or open it inline via the /preview route we have. The AccountDocuments.jsx (if any) might list PDF links like invoices or other documents.

CMS (Content) Pages: Static pages like “About”, “FAQ”, “Terms” are simple React components (e.g. About.jsx) likely containing static HTML or markdown. The Contact page might have a form. The backend has a /api/cms/contact POST route which currently just logs the message and returns ok. This is a stub for future integration (like sending an email). The frontend’s Contact page should post the form to this endpoint and show a success message.

API Layer and Config: The React app is configured (see vite.config.js) to proxy ^/api calls to the backend server (dev on localhost:4000). The env variable VITE_API_URL is set to /api, so axios calls use relative /api/*. This means in development the Vite dev server proxies to Express, and in production, the frontend and backend likely run under the same domain (with /api prefix for backend). Also note we have import.meta.env.VITE_BUSINESS_ID in the frontend .env; this is likely used just to identify the business in UI if needed (or possibly not used at all on frontend, since backend already knows BUSINESS_ID).

State Management Details

Auth State: We have a dual approach: React Context (AuthProvider) and a Redux slice (authSlice). The context is the source of truth for whether a user is logged in (user object) and provides the login/logout methods. Redux authSlice is mostly redundant here; it stores the JWT token, but since we use cookies for auth, we don’t need to manually pass the token in most requests. Possibly the token in Redux is unused. The context, on login, calls window.dispatchEvent(new CustomEvent('auth:login')). This event is a neat way to notify any part of the app (even outside React) of login status changes. We see ProductCard and WishlistProvider listening for these events to update state accordingly.

Cart State: Redux manages the cart items. The CartPage component uses useSelector(s => s.cart) to get the cart state and dispatch to update it. On page load, it calls load() which if user is logged in, fetches from /cart and then dispatch(setServer(items)) to replace the state. The slice’s setCart and setServer do the same thing (we kept setServer as alias). For guest, load() doesn’t fetch, so the state remains whatever was in Redux (persisted via Redux state or possibly refreshed from localStorage – though in our implementation, we did not explicitly persist cart in localStorage except via the slices using localStorage for token only). We might add persistence for cart in future (e.g. save to localStorage on unload and load on init).

Wishlist State: Managed similarly but via context. It uses localStorage for guests (key guest_wishlist). On login, it posts all guest wishlist items then clears them from localStorage. The Wishlist context’s ids set is updated after any add/remove (immediately on the client for snappy UI, then confirmed by server if needed). Components (ProductCard) derive saved status from that ids set.

SideNav State: Likely trivial – could be context or local component state in a Layout component. Possibly Layout.jsx has state for mobile menu open, and passes a prop or uses context for SideNav.

Location State: The selected location is stored in localStorage (ms_location_id). The Home page and others use an effect to listen for changes to this (via window.addEventListener('storage', ...) and a custom event moji:location-change). They then refetch data when location changes (we see locVersion state being bumped to trigger useEffect re-runs on Home). The Navbar when user picks a location sets localStorage and fires an event (maybe using window.dispatchEvent(new Event('moji:location-change'))). This setup ensures if you switch location, product lists and home sections refresh to show stock availability or best-sellers for that location (our APIs accept ?locationId= – e.g., home trending could be adjusted by location though currently it doesn’t filter by location in SQL, it always aggregates all locations’ sales).

Folder and File Guide (Editing How-To)

Here’s a breakdown of important files with their roles and tips on modifying them:

api/routes/auth.js: Handles login, logout, and password reset flows. If you need to change authentication logic (e.g. add email verification or adjust password rules), this is where to do it. The login route queries app_auth_users for the user’s email and verifies the password hash. If you wanted to integrate with an OAuth provider or an external auth, you would modify or add routes here. It also contains the password reset logic (two-step: request reset token via email, then reset password) – including token generation and validation.

api/routes/products.js: Implements product list/detail APIs. It currently doesn’t have a generic “list all products” route (we rely on home and search for that). The key one is GET /api/products/:id which fetches product details via ERP. If products need additional processing (say, combine with some app-specific metadata), you would modify the shaping logic here. There’s also a /api/products/:id/related stub that appears to fetch related products by category or brand – this uses UltimatePOS data as well, and ensures not to leak prices to guests. If the site needs a product search or category listing endpoint, you could create a new route here (or in search.js) using similar patterns (either query the DB or call ERP’s listing API such as GET /connector/api/variation?category_id=... which UltimatePOS provides).

api/routes/cart.js: Manages cart CRUD. Functions: GET /api/cart returns the current cart items, POST /api/cart/add to add an item, PATCH /api/cart/update (not shown above but implied from frontend calls) to set an item’s quantity, and DELETE /api/cart/remove/:id to remove an item. These all reference the app_carts tables. To adjust cart behavior (e.g. implement a max item limit or handle out-of-stock), you would add checks in these handlers (they already compute price fresh via priceForVariation, so any stock check could similarly query variations for quantity).

api/routes/checkout.js: Orchestrates order creation. The main POST /api/checkout/create is complex – if altering checkout logic (like applying coupon codes, adding shipping fee, etc.), this is where to insert it. For example, to add a coupon feature, you might: accept a coupon_code in the request, verify it against a DB table or UltimatePOS (UltimatePOS has coupon/discount features), adjust the sell.discount_amount or line prices accordingly, before calling erpFetch('/sell'). The code is structured to prepare a sell object (UltimatePOS expects nested JSON with lines and payments) – we can attach additional fields here if UltimatePOS API supports (like shipping_address which we already include if provided). After calling ERP, the code handles the response and cart clearing. If customizing how the order confirmation works (e.g. storing a copy of the order in another system), you’d hook in after the resp = await erpFetch call.

api/routes/account.js and accountProfile.js: These provide account-related data. For instance, account.js has the /invoices and PDF routes we discussed. If we wanted to show more fields in order history (like payment status or item breakdown), we’d adjust the SELECT query in /invoices (currently selecting id, invoice_no, final_total, date). Or if we wanted to support order cancellation, we’d add a new route here that perhaps calls UltimatePOS’s API to update a transaction’s status. The accountProfile.js handles profile and addresses. If editing profile details from the web is needed, we’d implement a PUT /api/account/profile in this file to update UltimatePOS (likely via PATCH /contact/{id} API).

Frontend pages (e.g. src/pages/Cart/CartPage.jsx): These are mostly UI logic, but knowing what they call is key. If the design or flow of the cart page needs changing, edit this file. For example, currently the cart page, on quantity change for a logged-in user, calls axios.patch('/cart/update', {id, qty}) then refetches cart. If you want to optimize that to avoid an extra GET, you could instead optimistic update the Redux state or modify the backend to return the updated cart in the PATCH response. Similarly, the Checkout page (src/pages/Checkout/Checkout.jsx) loads cart and locations on mount, then on “Place Order” click, it posts to /checkout/create and handles success or error. If adding features like entering shipping details or payment method on the checkout page, those would be added to the form and included in the payload (and the backend already accepts shipping_address, shipping_details, and payments in the payload for /checkout/create, though the front-end currently passes none and defaults to COD due). You would adjust Checkout.jsx to collect and send those fields.

React Contexts: To modify how global state is handled:

Auth: The AuthProvider is already robust (auto-refreshes on mount, uses events). If integrating a new auth method, ensure to still call setUser and dispatch events so the rest of the app updates.

Wishlist: If you wanted wishlist to persist for guests across sessions, you already have localStorage doing that. If you wanted to limit wishlist size or add categories, you’d modify the context accordingly.

Filters: The FiltersProvider (if present) might hold state for selected filters and provide methods to update them, making it easier for the Products page and Filter sidebar to coordinate. Editing filter logic (e.g. adding a price range filter) would involve: updating the FiltersProvider state shape, adjusting the API call (our /api/filters already supports ?q, categoryId, etc., but not price range – one could extend the SQL WHERE clause to handle that), and adding UI controls.

Axios instance and API helpers: The Axios instance in api/axios.js ensures every request includes credentials. If the backend URL or prefix changes, update VITE_API_URL in the .env and the proxy config in vite.config.js. Also, error handling: currently, many calls use validateStatus: () => true and manually check resp.status to handle errors gracefully in the UI (e.g., see AuthProvider.refresh() or CartPage.load()). This means axios won’t throw on HTTP errors, allowing us to show user-friendly messages. When building new API calls, follow this pattern and handle .status codes.

Utilities: getProductImage.js in the frontend is a small helper that constructs the /img/ URL for a given image file or URL. UltimatePOS stores product images file names, and our backend’s /img/:file route fetches from the remote storage (UltimatePOS server or S3) and serves formats. If the image storage location changes, update ORIGIN_PREFIX in the backend image.js (right now it points to UltimatePOS’s uploads URL). The Sharp transformations (resize, webp conversion) can also be tuned there.

Summary of How to Extend

Adding a new page/feature: Create a new React page component, add a Route in App.jsx. If it needs backend data, add an API route in Express (and corresponding DB table if needed). For example, to add “Reviews” on products: you’d create api/routes/reviews.js (with GET for reviews of a product and POST for new review), mount it in server.js (e.g. app.use('/api/reviews', reviewsRouter)), create a Review.jsx component for the frontend and fetch from /api/reviews?productId=123. You’d also possibly extend the product detail page to include <Reviews> section.

Understanding the data model: The system largely relies on UltimatePOS’s database. When in doubt, refer to the aaPanelDB.sql (the schema dump). For instance, the products table has fields like name, sku, image, flags like is_inactive or not_for_selling which our queries use to exclude certain products. The contacts table has address fields we use for billing/shipping. Our custom tables (all prefixed with app_) are few and straightforward (users, wishlist, cart, etc.). The SellingPriceGroup concept is critical: it allows different customer tiers with different prices. Our login sets pgid (price group id) in the JWT and uses it for price calculations. If you don’t want to use price groups (i.e. everyone sees the same price), you can simplify priceForVariation to always use default price. Conversely, if implementing tiered pricing, ensure each contact in UltimatePOS is assigned a customer group with a price group.

Testing and Debugging: You have a handy endpoint GET /api/_dbinfo which returns the database name and table count to verify DB connection. Also, GET /api/health just returns {ok:true} for a quick server reachability check. During development, use the browser devtools network panel to see that calls are returning expected data. The backend logs (console logs in Node) will show errors like failed ERP fetches or SQL issues. For instance, if UltimatePOS returns an error for a sell creation, our code logs console.error('[checkout/create] error', e) and returns a 502 error with connector_unavailable. These messages help pinpoint issues.

With this guide, a new developer should be able to navigate the codebase and understand how the ERP, database, backend, and frontend pieces interconnect. By following the patterns already in place (context for auth/wishlist, Redux for cart, Express routers for API logic, and keeping UltimatePOS integration either in DB queries or API calls), you can implement new features or troubleshoot existing ones systematically. Always test changes for both guest and authenticated flows, since our app often has dual code paths to accommodate login gating.

Unified Reference Document

(Combining the architecture and code-level details, this section serves as a comprehensive walkthrough of features, referencing relevant files and noting behaviors for different user roles.)

Feature: Authentication & User Accounts

Login/Logout Process: When a visitor registers or logs in (UI in Login.jsx and Register.jsx), the form submission calls AuthProvider.login(email,password). This in turn calls our backend POST /api/auth/login endpoint. The relevant code is in api/routes/auth.js – it finds the app_auth_users record for the given email (scoped to our business), verifies the password hash, and if OK, generates a JWT containing uid (user’s ID in app_auth_users), cid (UltimatePOS contact_id), and the user’s cgid (customer_group_id) and pgid (price_group_id). It sets this JWT as a cookie (res.cookie('token', ...) inside setAuthCookie) and returns { ok:true, cgid, pgid }. On the frontend, the AuthProvider’s login method sees a 200 and triggers refresh() to load user info. That calls GET /api/account/me (handled likely in api/routes/accountProfile.js or similar), which returns the contact info (or at least an identifier) if the cookie JWT is valid. Our AuthProvider sets user state and broadcasts an auth:login event. Components like Navbar listen for this and update accordingly (showing the user’s name, etc.). The logout process is the reverse: calling POST /api/auth/logout (in auth.js) clears the cookie, and the AuthProvider logout() then sets user=null and emits auth:logout. After logout, the app will treat the user as guest again (cart and wishlist contexts also respond by switching to guest mode, see below).

Account Registration: The code snippet didn’t explicitly show a /api/auth/register, but likely we would implement it similarly: create a contact in UltimatePOS (via API) and an app_auth_user record. Perhaps, given the phrase “use reset to bootstrap” in login, the intended flow is that user accounts are usually pre-created in UltimatePOS (e.g. by an admin importing customers) and a new user should use the “Forgot Password” (reset) flow as their first step to set a password. Indeed, the /auth/login returns 404 “User not found; use reset to bootstrap.” if the email isn’t in app_auth_users. And the /auth/request-reset route will find or create an app_auth_user for that email if a contact exists. This means to register a new customer, the flow is: they hit “Forgot password”, enter email, if that email matches an UltimatePOS contact, we create an auth user and email a reset link (in dev, we just return the token). Then they call /auth/reset with the token and new password to set up their account. After that, a JWT is issued and they’re logged in. So in summary: user accounts align one-to-one with UltimatePOS contacts, and the initial setup is done via password reset workflow instead of a typical “sign up” form. A developer could add a direct sign-up route that internally does the same: create contact in UltimatePOS and user in app_auth_users, but the current design chooses to rely on existing ERP data.

Roles and Permissions: As noted, the eCommerce frontend doesn’t expose admin functionality. All users logging in via this system are treated as “customers” (UltimatePOS contact with maybe a customer group). If an UltimatePOS employee/admin tried to log in, they might not even be present in app_auth_users unless manually added. We could extend the logic to allow certain emails to have admin capabilities on the frontend (e.g. to view an admin dashboard), but by default no such feature exists. The AuthProvider.user object likely contains at least id, email, and maybe we enrich it with the contact’s name or group when calling /account/me. For instance, the refresh() in AuthProvider looks for res.data.contact or res.data.user. That implies our backend’s /account/me might return { contact: { id, name, email, ... }. And then newUser = contact is stored. So user in context could have fields like name, email, contact_id, etc. We show these in the Profile page and Navbar greeting.

In Account Profile page, the frontend calls /api/account/profile and gets contact info. It then displays it in a read-only form. To edit, we’d create a PUT route (which would call UltimatePOS’s contact update API). The Addresses page calls /api/account/addresses and receives an array of two addresses (Billing and Shipping) with fields formatted for display. Since UltimatePOS doesn’t store multiple addresses per contact by default, we just show the one billing and one shipping from the contact record. If needed, a developer could allow editing these and call UltimatePOS’s API to save them.

Files and References:

Backend: routes/auth.js (login/reset/logout), middleware/auth.js (JWT parsing), routes/accountProfile.js (profile & address GET), routes/account.js (invoices list).

Frontend: AuthProvider in state/auth.jsx (handles global auth state), Login.jsx & ResetPassword.jsx in pages (UI forms that call Auth context), Account/Profile.jsx (displays profile using /account/profile), Account/Addresses.jsx (displays addresses from /account/addresses).

Guest vs Auth differences: Many components check if (user) to decide functionality:

Navbar: shows “Login” link when no user, or user’s name menu when logged in.

Price display: The product APIs set price null for guests, and the frontend likely checks product.minPrice – if that is null or if auth.isAuthenticated is false, it might show “Login to see price” or just no price. For example, ProductCard might conditionally render price: in its JSX (not fully shown above) it probably does {showPrice && <div className="card-price">…</div>} where showPrice = !!user && p.minPrice != null.

Add to Cart buttons: disabled or hidden for guests. QuickView’s Add button early-return for guests. Cart page, if a guest somehow has items, it allows adjusting them locally but on clicking “Checkout” the app will redirect to login (our Checkout route is protected by <RequireAuth> – so guests hitting /checkout get redirected to /login?next=/checkout).

Wishlist: guests can add/remove items and it’s stored locally, but if they never log in, those aren’t persisted server-side. That’s fine – it’s just in their browser. When they do log in, it merges up.

Feature: Product Catalog & Browsing

This encompasses the home page, product listing, search, and category filtering, as well as product detail display.

Home Page: The Home page (pages/Home/Home.jsx) fetches a combined payload from GET /api/home. The backend’s routes/home.js handles this by querying for hero banners, featured brands, and product rails (trending, fresh, best sellers) in parallel. Key points:

Banners: Fetched from app_home_banners for slots “hero” and “wall”. The backend returns an array of banner objects {id, href, img, alt}. The frontend’s HeroCarousel uses these to render slides with <SmartImage> and links. The “wall” banners might be smaller promos displayed below the hero.

Featured Brands: The backend SQL selects brands with the most sales in last 30 days (sold_30d) and those having products. It also joins app_brand_assets to get logo_file path. The result (id, name, image) is sent. The Home component maps these into logos (likely a grid or carousel of brand logos linking to a brand filter page).

Trending/New/Best products: The backend queries the products table:

Trending: top sellers in last 30 days (using transaction_sell_lines join).

Fresh: newest products (order by created_at).

Best Sellers: top sellers in 90 days.
Each returns a list of products (with id, name, sku, image, category names, but not price) and sets minPrice: null deliberately on home for speed/privacy. The Home page displays these in separate sections (probably using the ProductCard component with a prop showPriceStock={false} to hide price on home rails). Since price is null (and we pass showPriceStock=false), the UI might show “Login to view price” overlay or simply no price.

Location filtering on home: Notice the SQL for trending/best uses AND t.location_id = ... AND business_id = ... with a parameter. They pass BUSINESS_ID twice (for t.business_id and for filtering products) – but location is not dynamically filtered in this query (the code uses ? placeholders with BUSINESS_ID, but not location). That means currently trending/best aren’t per location; they aggregate global sales. If one wanted them per selected location, one would adjust those queries to use a locationId variable from the request (and the frontend would call /home?locationId=X). Our current implementation didn’t do that (the Home route’s authOptional and logic doesn’t check req.query) – possibly an area for future improvement.

Category & Product Listing Pages: The app likely has a route /products which shows either all products or products for a selected category/brand (e.g. via query params like ?category=5 or ?brand=3). In our code, we see brands[i].href = /products?brand={id} in featured brands. So clicking a brand on home navigates to /products?brand=ID. The Products page component reads URL params (using useLocation or useSearchParams) and then must fetch corresponding data. How does it fetch? Possibly:

It could call the same /api/filters endpoint to get counts and also list products? But filters only returns counts, not product list.

It might call UltimatePOS’s connector API directly for a product list. But more likely, we’d implement an API to search products. The absence of a dedicated route in our backend suggests maybe the front-end is using the UltimatePOS API for search (since UltimatePOS provides endpoints to list products or variations by filters). However, doing that directly from frontend would require an access token, which we are not obtaining. Instead, maybe we piggyback on the search suggestions or filters:

Perhaps the Products page uses the filters API to get all relevant products indirectly. But filters returns just counts, not actual product data.

Or the Products page might first load all products from the home rails (like trending/new) and then filter on client side – not scalable.

Possibly an oversight; in a full implementation, we would create an endpoint like /api/products that accepts ?categoryId=&brandId=&q= and returns a list of products. This could query the DB similarly to filters (select from products where business_id and matches filters, join variations to get a min price perhaps) or call UltimatePOS’s product API with search params.

Given no explicit code, let’s assume the Product listing page calls UltimatePOS’s variation API through our backend’s routes/search.js or a not-shown route. UltimatePOS’s documentation shows a GET /connector/api/variation?product_id=&location_id=&brand_id=&category_id=&name= etc. (the PDF snippet shows a request example with many query params). We might have planned to use that for the product list. Possibly the trySell or test routes were for experimenting with such calls.

That said, the Search Suggestions feature is clearly implemented: typing in search box likely calls GET /api/search/suggest?q=term, and the backend returns an array of suggestions (mix of type 'product', 'category', 'brand'). The frontend can show an autocomplete dropdown (“Apple iPhone · SKU123” etc., and clicking could navigate directly to product page or category page).

Product Detail Page (PDP): This is a crucial page. On navigation to /products/{id}, the React router loads ProductDetail.jsx which on mount calls axios.get('/products/{id}'). The backend (routes/products.js) handles it as described: calls UltimatePOS API to get full detail and returns a shaped JSON. The response includes:

id, name, sku, description

image (a main image URL or file name)

category and sub_category names,

minPrice (null for guests),

in_stock (boolean),

variants array, each with {id, label, price, in_stock, image, sku} for each variation.

The React page would use this data to render the product info. If the product has multiple variants, it may present a dropdown or buttons to select a variant (the data includes variant label and variant_sku). If only one variant, it might not require selection. The Add to Cart button on PDP:

If user not logged in: perhaps disabled with tooltip “Login to add to cart”. Or if clicked, it could redirect to login. The ProductDetail component might reuse the same logic as QuickView for add: calling /cart/add. Indeed, QuickView is like a mini-PDP, and we already ensure it only works if logged in. The PDP likely does similar: either it allows guest to add (which would call our API and get 401 since authRequired, causing a redirect), or better, it checks if(!user) { redirect to /login }. We might wrap the /products/:id route in <RequireAuth> in App.jsx, but we didn’t – because we want guests to see product details, just not prices. So PDP page itself might have an onAddToCart that does if(!user) navigate('/login?next=currentProduct') else axios.post('/cart/add').

Displaying Price: On PDP, if minPrice is null (guest), we could show a message like “Please log in to see prices”. Or we show nothing where price normally is. Possibly the UI shows “₹--” or similar obfuscation. When logged in, minPrice is provided (the lowest variant price for that product). If variants have different prices, the UI might show a range or update the price display when a variant is selected. Our data gives each variant’s price (for logged-in) or null (for guest). So the React state could initialize a selected variant and use its price for display.

Inventory: in_stock in product data is overall availability. If false, maybe disable the Add button. We also have each variant’s in_stock. The PDP could show an “Out of stock” message if a specific variant is chosen and has v.in_stock=false.

Filters on Product Listing: The /api/filters endpoint helps build the sidebar filters. When the Products page loads (with optional current filters from URL), it might do:

axios.get(`/filters?q=${searchText}&categoryId=${catId}&subCategoryId=${subCatId}`)


The backend returns { brands: [{id,name,count}], categories: [{id,name,count}], subcategories: [{id,name,count}] } that match the query. The page then renders checkboxes or lists for those filters, including the product counts. This guides the user on how many results to expect. When the user selects a filter (say a brand), the page navigates to ?brand=X (or updates state) and fetches a new product list and filters. The filters API uses the given query to constrain the counts (for example, if a category is selected, it will only count brands within that category’s products). This dynamic is similar to how many eCommerce sites show available refinements. The actual product list still needs to be fetched via another call. Perhaps we intended the product list to be fetched from UltimatePOS’s API directly using the same search criteria. Without that shown, a developer could implement a new route e.g. GET /api/products that returns an array of product entries (with id, name, image, maybe minPrice for logged user). That route could internally either:

Query the products table and join variation_group_prices or variations to get a price (like min or max price). Or,

Call erpFetch('/products') if UltimatePOS had a bulk fetch (not sure if it does beyond search by name).

Given UltimatePOS’s API is more tailored to single-resource operations, it might be simpler to query the DB. For example, to get a price for display, one could use our minPriceForProduct(productId, pgId) utility for each product, though doing that in a loop might be slow without caching. But because the site presumably doesn’t have extremely many products, it could be acceptable for tens of products on a page.

Brand and Category Pages: When user clicks a category in SubNavbar (e.g. “Electronics”), perhaps the app navigates to /products?category=10. The Products page reads that and might:

Show the category title (we can get category name from a global categories list or from the filters API result).

Automatically apply that category filter on fetch. The filters API logic uses categoryId to filter both brand counts and subcategories counts to those under that category. So it would return subcategories of Electronics and brands of products in Electronics. The product list API (if existed) would similarly use WHERE p.category_id=10 OR p.sub_category_id=10.

If a category has subcategories, the subcategory filter list is returned separately. The UI might show those as well (maybe nested under the category or separately). E.g. selecting a main category might populate a Sub-Category filter box. Our filters API returns both categories and subcategories counts – likely categories always list top-level categories (unless a main category is selected, not entirely clear). Actually, the code:

If categoryId is specified in query, it still computes categories count (not excluding others) – perhaps it would be better to omit that or indicate parent category. But it doesn’t filter them out, so categories might always return all top-level categories counts matching the other filters (like search term).

It definitely filters subcats by sub_category_id if provided, similar logic.

Search Page: If the user uses the search bar and presses Enter, maybe it navigates to /products?q=keyword. Then the Products page would use that query to call /api/filters?q=keyword and also to fetch product list (via ERP or direct). The search suggestions feature simply helps them get to a specific page faster (e.g. selecting a suggestion of type 'product' might navigate directly to that product’s page). If they instead go to a search results page, we’d list all matching products. UltimatePOS’s products table can be searched by name and SKU using LIKE, which our /api/search/suggest already does (with a limit). For full results, similar SQL could be used without limit (or with pagination). We could extend search.js with GET /api/search?q=... to return full product objects (id,name, image, maybe first variant’s price if auth). This wasn’t explicitly done in the snippet, but it’d be straightforward using the patterns we have.

Relevant Code Recap:

Backend: routes/search.js (search suggestions via SQL), routes/filters.js (counts for filtering), routes/products.js (product detail and related), lib/price.js (helpers for minPrice).

Frontend: pages/Home/Home.jsx (calls home API, manages sections), pages/Products/Products.jsx (manages filter UI and product grid), pages/ProductDetail/ProductDetail.jsx (displays one product, handles variant selection and Add to Cart), components/ProductCard.jsx (used in listings, shows basic info). Also components/FiltersSidebar.jsx if exists to display filters (not shown, but likely a component given the complexity).

Roles: Guests can browse all this, but they won’t see prices on ProductCard or PDP, and cannot add to cart. Logged-in users see prices everywhere and can add items. The code gating examples:

In ProductCard, variant_label and other info are shown to all, but if p.minPrice is null, we might show a “₹–” or a prompt. We could implement: if (!user) on clicking price area, redirect to login. But currently it just hides price.

The QuickView “Add to Cart” we saw returns if no user.

The Checkout page is behind RequireAuth, so guests cannot even attempt to checkout (they get redirected).

Performance considerations: The site uses caching and selective data pull to be efficient:

Banners and static content can be cached (the home API sets Cache-Control: max-age=30 etc. for CDN/browser).

The image transform route caches results in memory (sharp output) and sets long cache headers.

Redux state helps avoid refetching the cart on every page if it’s already loaded (though in our CartPage we always fetch on mount to sync).

The Account pages use caching for ledger (using a local CACHE in the component to store results by query), meaning if you switch pages or filters quickly, it might reuse already fetched data.

Feature: Shopping Cart & Wishlist

We’ve largely covered cart logic, but here we summarize with file references and highlight any edge cases:

Cart Adding (User): Triggered by clicking “Add to Cart” on PDP or QuickView. Code path:

Frontend: calls axios.post('/cart/add', { product_id, variation_id, qty }) with withCredentials:true. If using Redux for guest, it dispatches cartSlice.add() to update local state instead.

Backend: authRequired ensures user is logged in (else returns 401). It uses ensureCart(uid) to get the user’s cart ID (create one if new). Then either updates quantity if item exists or inserts a new row in app_cart_items. This query uses INSERT IGNORE or logic to avoid duplicate lines.

Returns {ok:true}. The front-end might optimistically update the UI. In our QuickView, after successful add, we close the modal. The Navbar’s cart count is updated via Redux: note, we did not explicitly dispatch anything on add success in QuickView code, but the cartSlice addToCart could be dispatched on the front-end when user clicks (for guest we do dispatch; for logged-in, perhaps we rely on re-fetch somewhere else, or we could also dispatch addToCart to immediately increment count). Actually, in CartPage.changeQty function, after a successful patch for user, they refetch the whole cart. For add, maybe we assumed adding is only done outside CartPage (e.g. PDP or QuickView), so to keep Navbar count in sync, one could either dispatch an update or trigger a /cart fetch. Possibly the Navbar listens to a custom event on add or the Cart context (but we haven’t seen that). This might be a minor gap: if a logged user adds item, our backend updated DB but front UI might not reflect until next page load or if we programmatically fetch. We might improve by dispatching setServer with the returned items list from /cart/add (if we modified it to return the updated cart or at least the new count). Or simply call GET /cart after adding. This can be optimized in future.

Cart Viewing/Editing:

The Cart page (CartPage.jsx) uses useAuth() to determine if it should load server cart. If user, it GETs /cart and does dispatch(setServer(items)). The cartSlice.setCart merges duplicates and computes totals. If guest, it just uses the Redux state as is.

The Cart page lists each item (likely using a component showing name, variant, price, quantity, subtotal). It allows quantity changes via an input or +/- buttons. The changeQty(line, nextQty) in CartPage handles that: if guest, it calculates the delta and dispatches addLocal (which our cartSlice has an alias action add mapped to the same reducer as addToCart). If user, it calls axios.patch('/cart/update', {id: line.id, qty: newQty}), then refetches cart data. Backend for /cart/update isn’t shown explicitly, but we can infer it’s similar to add: find the item by id and update its qty or remove if qty=0. In fact, our cartSlice setQty and removeFromCart are used only for guest (and maybe not even directly, the code just uses add with delta for simplicity). For server, the logic is in backend.

Removing item: in UI, click remove icon. If guest, dispatch removeLocal(line.id) (cartSlice remove alias) which filters it out. If user, call DELETE /cart/remove/{id} and then GET /cart to refresh. Backend router.delete('/cart/remove/:id') simply deletes the row from app_cart_items for that user’s cart.

Wishlist Adding/Removing:

On any product card or detail, clicking the heart toggles wishlist. Implemented in useWishlist context:

If user, it calls axios.post('/wishlist/{productId}') or axios.delete('/wishlist/{productId}'). Backend wishlist.js inserts or deletes from app_wishlists ignoring duplicates. We don’t need to refetch wishlist from server each time; we optimistically update the ids set in context and that updates UI immediately. If the server call fails (e.g. network issue), we might want to revert, but currently we don’t handle errors explicitly aside from logging.

If guest, the context directly updates a Set and saves to localStorage.

The Wishlist page (pages/Wishlist/WishlistPage.jsx) likely uses useWishlist() to get the set of IDs and then fetches product details for those IDs to display. We did see in Wishlist context’s refresh() for user: it calls /wishlist GET and sets ids from the returned list. It does this on mount or when user logs in. So the Wishlist page might rely on wishlist.ids and maybe have the actual product info? Our GET /api/wishlist joins products and returns minimal info (id, name, image). Possibly the context should also store the list of product objects, but it doesn’t – it only stores IDs. In the UI, maybe we use those IDs to filter the global product list or call a product API for each. But that’s not efficient. Alternatively, a simpler approach: since GET /wishlist already returns product name, image, the Wishlist page component might internally call /wishlist itself (not rely on context’s refresh) to get full data to display. The context is mainly for toggling state globally (like to show filled hearts on product cards for items in wishlist).

Persistent Guest Data:

Cart: We did not implement localStorage for cart. If a guest refreshes the page, their cart state is lost (since Redux store resets). We may want to add that: e.g. save cart.items to localStorage on unload, and on load, populate initial state. Our authSlice did localStorage for token but cartSlice did not for items. For a persistent cart, implement a Redux middleware or use the Redux state Rehydration pattern to load from localStorage. Currently, guest cart is ephemeral.

Wishlist: guest wishlist is persisted via localStorage (key guest_wishlist). So that’s handled.

Edge cases:

If an item’s price changes on the server between adding to cart and checkout (e.g. price group updated or discount applied), our implementation recomputes prices at checkout using priceForVariation and pgId so it will capture the new price. But the price shown in the cart page (stored in Redux state from when added) might be outdated. Currently, when logged in, every time you open Cart page we refetch items from server which recomputes prices. So logged-in cart prices are always fresh. For guests, prices in cart are whatever was known at add time (in our case, for guests, we set price to null since they couldn’t see it, or if we ever allowed adding with price unknown, we might store price 0 or something). But since guests can’t see price anyway until login, that’s fine. Once they log in, the merge uses server’s latest price.

Stock changes: similar logic, we rely on ultimatePOS data at checkout to ensure no overselling. The erpFetch('/sell') will likely error if stock insufficient (UltimatePOS API would respond with an error). Our checkout route catches any error from ERP and returns connector_unavailable or such. We could surface a nicer message to user if we parse e.body for a specific message. Currently, we just generic handle it.

Multi-device: If a user adds items on one device and then on another, since cart is server-side, both see the same items (assuming they log into same account). Our design supports that consistency because of server cart in DB.

Files Recap:

Backend: routes/cart.js, routes/wishlist.js.

Frontend: state/Wishlist.jsx, pages/Cart/CartPage.jsx, pages/Wishlist/WishlistPage.jsx (not shown, but would use wishlist context and likely map through ids to display products). Also Navbar possibly shows cart count (maybe it selects cart.count from Redux state to display badge).

Roles: Guest – cart stored in memory (lost on refresh), can add but not see prices or checkout; wishlist stored in localStorage. User – cart persistent in DB, can add/modify across sessions, can checkout; wishlist stored in DB, syncs across devices.

Feature: Checkout & Orders

Checkout Flow: (We described in Architecture, but let’s integrate steps with user perspective)

Logged-in user clicks “Checkout” in cart page. The app uses React Router to navigate to <RequireAuth><Checkout/></RequireAuth> – so if not authed, it would redirect to login (with next). For authed, it shows the Checkout page.

Checkout page mount: It triggers two calls in parallel: GET /api/checkout/bootstrap and GET /api/cart (the latter to ensure we have latest cart items).

The bootstrap call returns locations (and a default_location_id). We populate a location dropdown with these.

The cart call returns items (with prices) and our Redux setServer updates the cart state.

User reviews the order summary on the checkout page – we display each item, quantity, and price (from Redux cart state) and a total. We also display perhaps the user’s default billing/shipping address (we might call /account/addresses as well here, or the checkout page might incorporate an Address form or selection – not fully specified, but likely minimal for now).

The user chooses a location if applicable (like a store pickup location). The locId state is set.

User clicks “Place Order”. This triggers axios.post('/api/checkout/create', { location_id: locId, status:'final', payment_status:'due', products: cartItemsForPayload }). We saw in our code the frontend constructs a products array of { product_id, variation_id, quantity } from the Redux cart items.

Order creation: Backend receives this in checkout.js:

Auth middleware attaches req.user (with uid, cid, bid).

It calls resolveContactId(req, providedContactId) – in our code, they allowed optionally passing a contact_id in request (not needed since we have JWT). Ultimately it gets the numeric contact ID (ensures it’s valid).

Determines location: either use req.body.location_id or default if not provided.

Assembles the list of line items (rawLines):

If req.body.products was given (it was, by our frontend), use that directly.

Otherwise (like if frontend didn’t send products), it would load from loadServerCartItems(uid) to get items from DB (so we have a fallback).

Validates we have at least one line (else 400 error).

Retrieves the user’s price group via priceGroupIdForContact(contact_id, BIZ) – does a DB query join on customer_groups. Returns an integer or null.

For each line, calls priceForVariation(vid, pgId):

This checks if pgId given, then looks up variation_group_prices for that variation & price group. If found, uses that price_inc_tax. If not, it selects the variation’s base prices (sell_price_inc_tax or default_sell_price).

Returns a Number price (or null if something’s weird).

Builds a sell object with all required fields (business_id, location_id, type='sell', status='final', is_quotation=0, payment_status='due', contact_id, selling_price_group_id=pgId). It also attaches optional fields if provided (in our case we didn’t send shipping or discount, so those remain undefined).

Puts the products array (each having product_id, variation_id, quantity, unit_price if calculated) into sell.products. If any payment info was passed (like an online payment token), it could be in sell.payments, but we set none, meaning the invoice will be created as Unpaid (payment_status 'due').

Calls erpFetch('/sell', { method:'POST', query:{business_id:BIZ}, body: JSON.stringify({ sells: [sell] }) }). The UltimatePOS API expects a JSON with “sells” array (maybe to allow bulk insert, but we send one).

Awaits the response. If an error (exception or non-2xx status), it catches and responds with status (502 or the ERP’s status) and an error message connector_unavailable. If success, the response could be:

Some UltimatePOS versions return { data: [ { id:123, invoice_no:'INV0003', ... } ] }.

Our extractSell(resp) checks several shapes (array, object, etc.) to find id and invoice_no. It then returns those.

If no id or invoice_no found in resp (meaning sale creation failed or format unexpected), we send { error: 'sell_not_created' } and maybe include connector_body for debugging.

On success, we attempt to clear the user’s cart: clearUserCart(uid) runs a DELETE on app_cart_items for that cart. (Our clearUserCart returns how many rows cleared, but we don’t really use that info on frontend).

Respond with { ok:true, id: sellId, invoice_no: invoiceNo } and maybe some data: resp (the original connector response).

Frontend after placing order: The Checkout component’s placeOrder() awaits the response. If r.data.ok is true, we store maybe an ok state or navigate to confirmation. In code snippet we see setOk being used and then presumably triggering a redirect:

Possibly they navigate to /order-complete page (we saw a route for OrderComplete in App.jsx). They might pass the invoice_no via state or query param.

The OrderComplete.jsx page can show “Thank you! Your order has been placed. Order Number: INV0003.” It might also encourage printing or viewing orders in account.

Also, since we cleared the cart on server, and the user’s cart was globally stored, we should update the Redux cart (e.g. dispatch clear() to empty it). Possibly the Checkout component, after success, dispatches cartActions.clear() which our slice defines to empty items. This would update Navbar cart count to 0. If we navigate away without clearing Redux, the Navbar might still show old count until page refresh. Ideally, do dispatch(clear()) on success.

The user can then see their order in Account > Orders. Our Orders.jsx likely calls /account/invoices:

Backend account.js /invoices does a SQL SELECT on transactions for that contact, returning transaction_id, invoice_no, final_total, transaction_date. It also does a COUNT for pagination and sets X-Total-Count header.

Frontend receives this (in the ledger snippet, they parse resp.headers['x-total-count'] to set total). It then displays a list: perhaps as clickable rows with date, invoice_no, status (since status was filtered to 'final' we can assume all done).

If user clicks an invoice, maybe we allow them to download PDF or view details:

We implemented GET /api/account/orders/:invoiceNo/preview that streams PDF inline (with Content-Disposition: inline) and /api/account/orders/:invoiceNo/pdf for download (attachment). The frontend might simply open a new window to .../preview or .../pdf. For example, a “Download PDF” button could set window.location = '/api/account/orders/INV0003/pdf'.

If we wanted an Order Details page (HTML), we’d need an API to fetch full details (like lines and payments). We didn’t create a JSON endpoint for a single order (but could, by joining transactions, lines, payments). Currently, we only generate the PDF using DB queries in invoicePdf.js, but we don’t send that data to front-end in JSON anywhere.

Given the time, likely the intention was to provide PDF only, not a separate details page.

Payment integration: Right now, orders are placed with payment_status: due. That implies COD (cash on delivery) or pay-at-store. If we were to integrate online payments, we would:

Collect payment details in Checkout (e.g. card or use a payment gateway’s JS to get a token).

Send a payments array in the checkout payload. UltimatePOS expects something like { method: "card", amount: final_total, paid_on: current_datetime }. The PDF response in UltimatePOS doc shows how payments are returned.

Then set payment_status: "paid" in the sell payload. That would mark invoice as paid.

Additional logic to handle if gateway payment fails after sale creation, etc., would be needed (probably one would do payment first, then create sale as paid or vice versa).

Admin Actions: If an admin cancels an order in UltimatePOS backend, our system currently wouldn’t reflect that proactively (we’d have to fetch updated transactions list; if we do fetch each time accounts page is opened, we’d see it). We filter only status='final' (completed sales) in query, so canceled orders (which might be marked differently or removed) simply wouldn’t appear. That’s acceptable for a basic scenario.

Files Recap:

Backend: routes/checkout.js (bootstrap and create routes), routes/account.js (orders list, preview, pdf), lib/invoicePdf.js (for PDF generation).

Frontend: pages/Checkout/Checkout.jsx, pages/OrderComplete/OrderComplete.jsx (likely simply thanks message using location.state or query param to show invoice_no), pages/Account/tabs/Orders.jsx (lists orders, uses ledger caching as in snippet).

Roles: Only logged-in users access checkout. If a guest somehow tries /checkout, RequireAuth in App.jsx will redirect them to login. For logged-in, we already covered flows. Admin role not in front-end, but in ERP they can see all orders. One thing: the BUSINESS_ID in .env ensures the backend only operates within that business’s scope (so multi-tenant is isolated by that).