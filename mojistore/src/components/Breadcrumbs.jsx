/*src/components/BreadCrumbs.jsx*/
import { Link, useLocation } from "react-router-dom";
import { useMemo } from "react";

/**
 * Use it per page: <Breadcrumbs items={[["Home","/"],["Category","/products"],["Sub-category"]]} />
 * If you omit items, it falls back to a simple auto trail from the URL.
 */
export default function Breadcrumbs({ items }) {
  const { pathname } = useLocation();

  const autoItems = useMemo(() => {
    const segs = pathname.split("/").filter(Boolean);
    const acc = [];
    return segs.map((seg, i) => {
      acc.push(seg);
      return [pretty(seg), "/" + acc.join("/")];
    });
  }, [pathname]);

  const list = Array.isArray(items) && items.length ? items : autoItems;

  // render nothing if it would only be "Home" (e.g. on /)
  if (!list.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="mx-auto max-w-7xl px-3 sm:px-6 mt-3 mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-zinc-400">
        <li><Link to="/" className="hover:text-zinc-200">Home</Link></li>
        {list.map(([label, href], idx) => {
          const isLast = idx === list.length - 1;
          return (
            <li key={`${label}-${idx}`} className="flex items-center gap-1">
              <span aria-hidden="true" className="opacity-50">/</span>
              {isLast || !href ? (
                <span className="text-zinc-200">{label}</span>
              ) : (
                <Link to={href} className="hover:text-zinc-200">{label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function pretty(seg) {
  const s = decodeURIComponent(seg).toLowerCase();
  if (s === "products") return "Products";
  if (s === "cart") return "Cart";
  if (s === "checkout") return "Checkout";
  if (s === "wishlist") return "Wishlist";
  if (s === "account") return "Account";
  if (s === "login") return "Login";
  if (s === "register") return "Create account";
  if (s === "reset") return "Reset password";
  return decodeURIComponent(seg).slice(0, 48);
}
