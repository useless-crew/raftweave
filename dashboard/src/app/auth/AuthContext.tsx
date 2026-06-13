// AuthContext.tsx — authentication state, session restore, and token refresh scheduling
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { getTokenExpiry, isTokenExpired } from './jwt';
import { configureApi, apiFetch } from './api';

const API_URL = import.meta.env.VITE_API_URL;
const REFRESH_TOKEN_KEY = 'rw_rt';
const RETURN_URL_KEY = 'rw_return_url';

export type OAuthProvider = 'github' | 'google';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: User;
}

interface ErrorBody {
  error: string;
  code: string;
  message: string;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ErrorBody;
    return new ApiError(res.status, body.code ?? 'UNKNOWN', body.message ?? 'An unexpected error occurred');
  } catch {
    return new ApiError(res.status, 'UNKNOWN', 'An unexpected error occurred');
  }
}

// Access token lives in memory only — never localStorage/sessionStorage (XSS defense).
let accessToken: string | null = null;
export function getAccessToken(): string | null {
  return accessToken;
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

interface AuthContextValue {
  currentUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
  oauthInProgress: OAuthProvider | null;
  initiateOAuthFlow: (provider: OAuthProvider) => Promise<void>;
  handleOAuthCallback: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [oauthInProgress, setOauthInProgress] = useState<OAuthProvider | null>(null);

  const clearSession = useCallback(() => {
    accessToken = null;
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    setCurrentUser(null);
  }, []);

  const scheduleRefresh = useCallback((token: string, doRefresh: () => Promise<void>) => {
    if (refreshTimer) clearTimeout(refreshTimer);
    const expiresAt = getTokenExpiry(token);
    if (expiresAt === null) return;
    const delay = Math.max(expiresAt - Date.now() - 2 * 60 * 1000, 0);
    refreshTimer = setTimeout(() => {
      doRefresh().catch(() => {});
    }, delay);
  }, []);

  const refreshToken = useCallback(async () => {
    const stored = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!stored) {
      clearSession();
      throw new ApiError(401, 'UNAUTHORIZED', 'No refresh token available');
    }

    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: stored }),
    });

    if (!res.ok) {
      clearSession();
      throw await parseErrorResponse(res);
    }

    const data = (await res.json()) as AuthResponse;
    accessToken = data.access_token;
    localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
    setCurrentUser(data.user);
    scheduleRefresh(data.access_token, refreshToken);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearSession, scheduleRefresh]);

  const setSession = useCallback(
    (data: AuthResponse) => {
      accessToken = data.access_token;
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      setCurrentUser(data.user);
      scheduleRefresh(data.access_token, refreshToken);
    },
    [refreshToken, scheduleRefresh]
  );

  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName }),
      });
      if (!res.ok) throw await parseErrorResponse(res);
      const data = (await res.json()) as AuthResponse;
      setSession(data);
    },
    [setSession]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw await parseErrorResponse(res);
      const data = (await res.json()) as AuthResponse;
      setSession(data);
    },
    [setSession]
  );

  const logout = useCallback(async () => {
    const stored = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (accessToken && stored) {
      try {
        await fetch(`${API_URL}/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ refresh_token: stored }),
        });
      } catch {
        // best-effort — clear local session regardless
      }
    }
    clearSession();
  }, [clearSession]);

  const initiateOAuthFlow = useCallback(async (provider: OAuthProvider) => {
    setOauthInProgress(provider);
    try {
      const returnUrl = window.location.pathname + window.location.search;
      sessionStorage.setItem(RETURN_URL_KEY, returnUrl && returnUrl !== '/' ? returnUrl : '/app');

      const res = await fetch(`${API_URL}/auth/${provider}/authorize`);
      if (!res.ok) throw await parseErrorResponse(res);

      const data = (await res.json()) as { authorization_url: string };
      window.location.href = data.authorization_url;
    } catch (err) {
      setOauthInProgress(null);
      throw err;
    }
  }, []);

  const handleOAuthCallback = useCallback(async (): Promise<boolean> => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const newAccessToken = params.get('access_token');
    const newRefreshToken = params.get('refresh_token');
    const expiresIn = params.get('expires_in');

    if (!newAccessToken || !newRefreshToken || !expiresIn) {
      return false;
    }

    window.history.replaceState(null, '', window.location.pathname);

    accessToken = newAccessToken;
    localStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
    scheduleRefresh(newAccessToken, refreshToken);

    try {
      const res = await apiFetch('/auth/me');
      if (!res.ok) throw await parseErrorResponse(res);
      const user = (await res.json()) as User;
      setCurrentUser(user);
    } catch {
      clearSession();
      return false;
    }

    return true;
  }, [clearSession, refreshToken, scheduleRefresh]);

  // Restore session on initial load from the stored refresh token.
  useEffect(() => {
    const stored = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!stored) {
      setIsLoading(false);
      return;
    }
    refreshToken()
      .catch(() => {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      })
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh on window focus if the access token has expired.
  useEffect(() => {
    function onFocus() {
      if (accessToken && isTokenExpired(accessToken)) {
        refreshToken().catch(() => {});
      }
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshToken]);

  // Wire the api.ts fetch wrapper to this context's refresh/logout.
  useEffect(() => {
    configureApi(refreshToken, logout);
  }, [refreshToken, logout]);

  const value: AuthContextValue = {
    currentUser,
    isAuthenticated: currentUser !== null,
    isLoading,
    register,
    login,
    logout,
    refreshToken,
    oauthInProgress,
    initiateOAuthFlow,
    handleOAuthCallback,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
