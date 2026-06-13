// api.ts — fetch wrapper that attaches the access token and retries once on 401
import { getAccessToken } from './AuthContext';

const API_URL = import.meta.env.VITE_API_URL;
const UNAUTHENTICATED_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

type RefreshFn = () => Promise<void>;
type LogoutFn = () => Promise<void>;

let refreshFn: RefreshFn | null = null;
let logoutFn: LogoutFn | null = null;

export function configureApi(refresh: RefreshFn, logout: LogoutFn) {
  refreshFn = refresh;
  logoutFn = logout;
}

/** Fetch wrapper: adds Authorization header, retries once after a token refresh on 401. */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const isAuthEndpoint = UNAUTHENTICATED_PATHS.some(p => path.startsWith(p));

  const headers = new Headers(options.headers);
  if (!isAuthEndpoint) {
    const token = getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  let res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && !isAuthEndpoint && refreshFn) {
    try {
      await refreshFn();
    } catch {
      await logoutFn?.();
      return res;
    }

    const retryHeaders = new Headers(options.headers);
    const token = getAccessToken();
    if (token) retryHeaders.set('Authorization', `Bearer ${token}`);

    res = await fetch(`${API_URL}${path}`, { ...options, headers: retryHeaders });
    if (res.status === 401) {
      await logoutFn?.();
    }
  }

  return res;
}
