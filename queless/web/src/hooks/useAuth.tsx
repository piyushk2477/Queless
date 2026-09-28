import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { refreshSocketSession } from '../lib/socket';

const AuthContext = createContext(null);

/**
 * Session auth on the client side.
 * The session itself is an httpOnly cookie the browser handles for us; the app
 * just asks the server "who am I?" (GET /api/auth/me) and keeps the answer.
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, memberships: [], loading: true });

  const apply = useCallback((me) => setState({ user: me.user, memberships: me.memberships ?? [], loading: false }), []);

  const refresh = useCallback(async () => {
    try {
      apply(await api('/auth/me'));
    } catch {
      setState((s) => ({ ...s, loading: false }));
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      ...state,
      refresh,
      login: async (email, password) => {
        apply(await api('/auth/login', { method: 'POST', body: { email, password } }));
        refreshSocketSession();
      },
      register: async (fullName, email, password) => {
        apply(await api('/auth/register', { method: 'POST', body: { fullName, email, password } }));
        refreshSocketSession();
      },
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        setState({ user: null, memberships: [], loading: false });
        refreshSocketSession();
      },
    }),
    [state, refresh, apply],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside <AuthProvider>');
  return ctx;
}
