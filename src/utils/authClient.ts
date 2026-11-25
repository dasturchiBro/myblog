// Hold Bearer token strictly in JS memory rather than localStorage/sessionStorage.
// Cross-reload persistence uses the server's HttpOnly SameSite=None Partitioned session cookie.
let inMemoryAuthToken: string | null = null;

function purgeLegacyWebStorage(): void {
  try {
    window.sessionStorage.removeItem('gf_session_token');
    window.localStorage.removeItem('gf_session_token');
  } catch {
    // ignore storage errors
  }
}

purgeLegacyWebStorage();

export function getAuthToken(): string | null {
  return inMemoryAuthToken;
}

export function setAuthToken(token: string | null | undefined): void {
  inMemoryAuthToken = token ? String(token) : null;
  purgeLegacyWebStorage();
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

export async function adminFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has('X-Requested-With')) {
    headers.set('X-Requested-With', 'GrowingForest');
  }
  const token = getAuthToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, {
    credentials: 'include',
    ...init,
    headers,
  });
}
