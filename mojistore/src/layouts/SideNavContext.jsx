import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const Ctx = createContext(null);

export function SideNavProvider({ children }) {
  // Default CLOSED on first load
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen(v => !v), []);
  const closeSideNav = useCallback(() => setOpen(false), []);
  const openSideNav  = useCallback(() => setOpen(true), []);

  // Close when clicking/tapping outside or pressing ESC (only when open)
  useEffect(() => {
    if (!open) return;

    const onPointer = (e) => {
      const t = e.target;
      // Don't close if the click is on the toggle button or any element marked as ignore
      if (t.closest?.('[data-sidenav-ignore]')) return;
      // Don't close if clicking inside the panel
      const panel = document.querySelector('[data-sidenav-panel]');
      if (panel && panel.contains(t)) return;
      closeSideNav();
    };

    const onEsc = (e) => {
      if (e.key === 'Escape') closeSideNav();
    };

    document.addEventListener('mousedown', onPointer, true);
    document.addEventListener('touchstart', onPointer, { capture: true, passive: true });
    document.addEventListener('keydown', onEsc, true);

    return () => {
      document.removeEventListener('mousedown', onPointer, true);
      document.removeEventListener('touchstart', onPointer, true);
      document.removeEventListener('keydown', onEsc, true);
    };
  }, [open, closeSideNav]);

  const value = useMemo(() => ({ open, setOpen, closeSideNav, openSideNav, toggle }), [open, closeSideNav, openSideNav, toggle]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSideNav() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSideNav must be used within SideNavProvider');
  return ctx;
}
