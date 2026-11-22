import { useCallback, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../utils/api';

export function useAuth() {
  const [email, setEmail] = useState(null);
  const [checking, setChecking] = useState(Boolean(getToken()));

  // Restore the session on page load, if the stored token is still valid.
  useEffect(() => {
    if (!getToken()) return;
    api
      .me()
      .then((r) => setEmail(r.email))
      .catch(() => setToken(null))
      .finally(() => setChecking(false));
  }, []);

  const login = useCallback(async (mail, password) => {
    const r = await api.login(mail, password);
    setToken(r.token);
    setEmail(r.email);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setEmail(null);
  }, []);

  return { email, checking, login, logout };
}
