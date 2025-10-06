//src/state/Wishlist.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import axios from '../api/axios';
import { useAuth } from './auth.jsx';
const Ctx = createContext({ ids: new Set(), refresh: async () => { }, remove: async () => { }, add: async () => { } });

export function WishlistProvider({ children }) {
  const [ids, setIds] = useState(new Set());
  const { user } = useAuth();
  const STORAGE_KEY = 'guest_wishlist';

  const loadGuest = () => {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return new Set(arr.map(Number).filter(Boolean));
    } catch { return new Set(); }
  };
  const saveGuest = (set) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(set)));
  };
  const refresh = async () => {
    if (user) {
      try {
        const { data } = await axios.get('/wishlist', { withCredentials: true });
        const set = new Set((data || []).map(x => x.product_id || x.id));
        setIds(set);
      } catch {
        setIds(new Set());
      }
    } else {
      setIds(loadGuest());
    }
  };

  const remove = async (productId) => {
    if (user) {
      await axios.delete(`/wishlist/${productId}`, { withCredentials: true });
      setIds(prev => { const c = new Set(prev); c.delete(productId); return c; });
    } else {
      setIds(prev => {
        const c = new Set(prev); c.delete(productId); saveGuest(c); return c;
      });
    }
  };

  const add = async (productId) => {
    if (user) {
      await axios.post(`/wishlist/${productId}`, {}, { withCredentials: true });
      setIds(prev => { const c = new Set(prev); c.add(productId); return c; });
    } else {
      setIds(prev => {
        const c = new Set(prev); c.add(productId); saveGuest(c); return c;
      });
    }
  };

  // On first mount and whenever auth status changes:
  useEffect(() => {
    (async () => {
      if (user) {
        // Merge guest wishlist → server, once
        const guest = loadGuest();
        if (guest.size) {
          await Promise.allSettled(Array.from(guest).map(id => axios.post(`/wishlist/${id}`)));
          localStorage.removeItem(STORAGE_KEY);
        }
      }
      await refresh();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return <Ctx.Provider value={{ ids, refresh, remove, add }}>{children}</Ctx.Provider>;
}

export function useWishlist() { return useContext(Ctx); }
