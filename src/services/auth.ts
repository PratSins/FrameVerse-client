import type { AuthResponse, LoginRequest, User } from "../types/auth";
import { AUTH_API_URL } from "../config";
const STORAGE_KEY_AUTH = "frameverse_auth_session";

export interface StoredSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

/**
 * Safely decodes base64url JWT payload with correct padding
 */
function parseJwtPayload(token: string): { exp?: number; [key: string]: unknown } | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4 !== 0) {
      b64 += "=";
    }
    const jsonStr = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonStr);
  } catch {
    try {
      let b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4 !== 0) {
        b64 += "=";
      }
      return JSON.parse(atob(b64));
    } catch {
      return null;
    }
  }
}

export function isTokenExpired(token: string, bufferSeconds: number = 30): boolean {
  if (!token) return true;
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return true;
  return Date.now() / 1000 >= payload.exp - bufferSeconds;
}

export function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_AUTH);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSession(session: StoredSession): void {
  try {
    localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(session));
  } catch (err) {
    console.error("Failed to save auth session to localStorage:", err);
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY_AUTH);
  } catch (err) {
    console.error("Failed to clear auth session from localStorage:", err);
  }
}

let activeRefreshPromise: Promise<AuthResponse> | null = null;

export async function refreshSession(explicitRefreshToken?: string): Promise<AuthResponse> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  // Always read the latest active refresh token from storage to avoid stale closures
  const tokenToUse = explicitRefreshToken || getStoredSession()?.refreshToken;
  if (!tokenToUse) {
    clearSession();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("frameverse:auth-expired"));
    }
    throw new Error("No refresh token available");
  }

  activeRefreshPromise = (async () => {
    try {
      const response = await fetch(`${AUTH_API_URL}/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: tokenToUse }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        throw new Error(`Session expired (${response.status}): ${errText}`);
      }

      const data: AuthResponse = await response.json();
      const updatedSession: StoredSession = {
        user: data.user,
        accessToken: data.tokens.access_token,
        refreshToken: data.tokens.refresh_token,
      };
      saveSession(updatedSession);

      // Notify any active React context across components or tabs
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("frameverse:auth-refreshed", { detail: updatedSession })
        );
      }

      return data;
    } catch (err) {
      console.warn("[Auth] Token refresh failed:", err);
      clearSession();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("frameverse:auth-expired"));
      }
      throw err;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

/**
 * Returns a guaranteed valid access token.
 * If current token has expired or is within 60s of expiring,
 * it automatically uses the refresh token in the background.
 */
export async function getFreshAccessToken(): Promise<string | null> {
  const current = getStoredSession();
  if (!current) return null;

  // If token is still fresh with at least 60 seconds buffer, return it
  if (current.accessToken && !isTokenExpired(current.accessToken, 60)) {
    return current.accessToken;
  }

  // If expired or about to expire, automatically refresh
  if (current.refreshToken) {
    try {
      const refreshed = await refreshSession(current.refreshToken);
      return refreshed.tokens.access_token;
    } catch (err) {
      console.warn("[Auth] Background token refresh failed:", err);
      return null;
    }
  }

  return null;
}

/**
 * Enterprise resilient HTTP fetch wrapper with automatic 401 retry:
 * 1. Attaches fresh Bearer token automatically.
 * 2. If the server returns 401 Unauthorized, automatically triggers a silent refresh and retries the request once.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // 1. Resolve fresh token
  let token = await getFreshAccessToken();
  if (!token) {
    const session = getStoredSession();
    token = session?.accessToken || null;
  }

  const headers = new Headers(options.headers || {});
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  // 2. Initial HTTP request
  let response = await fetch(url, { ...options, headers });

  // 3. Auto-recover on 401 Unauthorized
  if (response.status === 401) {
    const session = getStoredSession();
    if (session?.refreshToken) {
      try {
        console.warn("[Auth] 401 Unauthorized detected. Attempting silent token refresh & retry...");
        const refreshed = await refreshSession(session.refreshToken);
        const newToken = refreshed.tokens.access_token;

        const retryHeaders = new Headers(options.headers || {});
        retryHeaders.set("Authorization", `Bearer ${newToken}`);

        // Retry once with the newly refreshed token
        response = await fetch(url, { ...options, headers: retryHeaders });
      } catch (err) {
        console.warn("[Auth] Automatic 401 retry failed:", err);
      }
    }
  }

  return response;
}

/**
 * Validates the session on application load:
 * 1. If stored access token is still valid (not expired), returns it immediately.
 * 2. If access token is expired, attempts a single refresh using refreshToken.
 * 3. Only clears session if refresh token is rejected or absent.
 */
export async function validateOrRefreshSession(): Promise<{
  session: StoredSession | null;
  wasExpired: boolean;
}> {
  const current = getStoredSession();
  if (!current) {
    return { session: null, wasExpired: false };
  }

  try {
    // 1. If access token is still unexpired, verify usability with /me endpoint
    if (current.accessToken && !isTokenExpired(current.accessToken, 15)) {
      try {
        const freshUser = await getCurrentUser(current.accessToken);
        const validatedSession: StoredSession = {
          ...current,
          user: freshUser,
        };
        saveSession(validatedSession);
        return { session: validatedSession, wasExpired: false };
      } catch (meErr) {
        console.warn("[Auth] Access token rejected by server, attempting refresh token...", meErr);
      }
    }

    // 2. If access token is expired or rejected, attempt refresh via refresh token
    if (current.refreshToken) {
      const refreshed = await refreshSession(current.refreshToken);
      const updatedSession: StoredSession = {
        user: refreshed.user,
        accessToken: refreshed.tokens.access_token,
        refreshToken: refreshed.tokens.refresh_token,
      };
      return { session: updatedSession, wasExpired: false };
    }

    // 3. If neither access token nor refresh token is usable
    clearSession();
    return { session: null, wasExpired: true };
  } catch (err) {
    console.warn("[Auth] On-load session validation/refresh failed:", err);
    clearSession();
    return { session: null, wasExpired: true };
  }
}

export async function loginUser(credentials: LoginRequest): Promise<AuthResponse> {
  const response = await fetch(`${AUTH_API_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    let errorMessage = "Failed to login";
    try {
      const errJson = await response.json();
      errorMessage = errJson.error || errJson.message || errorMessage;
    } catch {
      const errText = await response.text();
      if (errText) errorMessage = errText;
    }
    throw new Error(errorMessage);
  }

  const data: AuthResponse = await response.json();
  saveSession({
    user: data.user,
    accessToken: data.tokens.access_token,
    refreshToken: data.tokens.refresh_token,
  });

  return data;
}

export async function logoutUser(refreshToken?: string): Promise<void> {
  if (refreshToken) {
    try {
      await fetch(`${AUTH_API_URL}/logout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
    } catch (err) {
      console.warn("Logout request failed on server:", err);
    }
  }
  clearSession();
}

export async function getCurrentUser(accessToken?: string): Promise<User> {
  const response = await fetchWithAuth(`${AUTH_API_URL}/me`, {
    method: "GET",
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user profile");
  }

  return response.json();
}
