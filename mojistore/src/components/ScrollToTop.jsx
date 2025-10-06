// Top comment: mojistore/src/components/ScrollToTop.jsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    // Scroll only on route change, not on hash-only moves
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname, search]);

  return null;
}
