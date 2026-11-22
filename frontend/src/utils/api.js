const TOKEN_KEY = 'diplome_token';

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {};
  const init = { method, headers };
  if (auth) headers.Authorization = `Bearer ${getToken()}`;
  if (body instanceof FormData) init.body = body;
  else if (body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new ApiError('Serveur injoignable. Vérifiez que l’API est démarrée.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Erreur ${res.status}`, res.status);
  return data;
}

export const api = {
  verify: (hash) => request(`/verify/${hash}`),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/auth/me', { auth: true }),
  list: () => request('/diplomas', { auth: true }),
  issue: (formData) => request('/diplomas', { method: 'POST', body: formData, auth: true }),
  revoke: (hash) => request(`/diplomas/${hash}/revoke`, { method: 'POST', auth: true }),
};
