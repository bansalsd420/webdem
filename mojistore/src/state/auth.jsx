import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/axios.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const prevUserRef = useRef(null); // track previous user to detect changes

  // 🧠 Load current session user from backend
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/account/me', {
        withCredentials: true,
        validateStatus: () => true
      });

      let newUser = null;
      if (res.status === 200 && res.data) {
        // Accept any of:
        // 1) { contact: {...} }
        // 2) { user: {...} }
        // 3) plain object: { id, email, contact_id, ... }
        const payload = res.data;
        const plainLooksLikeUser =
          payload && typeof payload === 'object' &&
          (payload.id != null || payload.email != null || payload.contact_id != null);

        const contact =
          payload?.contact ||
          payload?.user ||
          (plainLooksLikeUser ? payload : null);

        if (contact && Object.keys(contact).length > 0) {
          newUser = contact;
          setUser(contact);
        } else {
          setUser(null);
        }
      } else {
        setUser(null);
      }

      // 🔔 If we previously had no user and now we do, emit auth:login
      if (!prevUserRef.current && newUser) {
        window.dispatchEvent(new CustomEvent('auth:login'));
      }

      // 🔔 If we had a user but now don't, emit auth:logout
      if (prevUserRef.current && !newUser) {
        window.dispatchEvent(new CustomEvent('auth:logout'));
      }
      
      prevUserRef.current = newUser;
    } catch (err) {
      // Treat 401 as anonymous; avoid noisy console logs for expected anonymous sessions
      if (err?.response?.status !== 401) {
        console.warn('auth refresh failed:', err);
        setError(err);
      } else {
        setError(null);
      }
      setUser(null);
      prevUserRef.current = null;
    } finally {
      setLoading(false);
    }
  }, []);

  // 🔄 Call refresh on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 🔁 Listen to global login/logout events to re-sync
  useEffect(() => {
    const onLogin = () => refresh();
    const onLogout = () => {
      setUser(null);
      prevUserRef.current = null;
    };

    window.addEventListener('auth:login', onLogin);
    window.addEventListener('auth:logout', onLogout);

    return () => {
      window.removeEventListener('auth:login', onLogin);
      window.removeEventListener('auth:logout', onLogout);
    };
  }, [refresh]);

  // 📤 Login method
  const login = async (email, password) => {
    try {
      const res = await api.post(
        '/auth/login',
        { email, password },
        { withCredentials: true, validateStatus: () => true }
      );
      if (res.status === 200) {
        await refresh();
        window.dispatchEvent(new CustomEvent('auth:login'));
        return { ok: true };
      }
      return { ok: false, error: res.data?.error || 'Login failed' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  // 📤 Logout method
  const logout = async () => {
    try {
      await api.post('/auth/logout', {}, { withCredentials: true });
    } catch {
      // ignore network errors on logout
    } finally {
      setUser(null);
      prevUserRef.current = null;
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
  };

  return (
    <AuthCtx.Provider
      value={{
        user,
        setUser,
        loading,
        error,
        refresh,
        login,
        logout,
        isAuthenticated: !!user
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
