import type { AuthResponse, LoginRequest, User } from "../types/auth";
import { AUTH_API_URL } from "../config";
const STORAGE_KEY_AUTH = "frameverse_auth_session";

export interface StoredSession {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export function isTokenExpired(token: string, bufferSeconds: number = 30): boolean {
  if (!token) return true;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonStr = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonStr);
    if (!payload.exp) return true;
    return Date.now() / 1000 >= payload.exp - bufferSeconds;
  } catch {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (!payload.exp) return true;
      return Date.now() / 1000 >= payload.exp - bufferSeconds;
    } catch {
      return true;
    }
  }
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

export async function refreshSession(refreshToken: string): Promise<AuthResponse> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const response = await fetch(`${AUTH_API_URL}/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        throw new Error("Session expired or refresh token invalid");
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
      clearSession();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("frameverse:auth-expired"));
      }
      return null;
    }
  }

  return null;
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

  // If the access token is still fresh, reuse it without unnecessary network calls
  if (current.accessToken && !isTokenExpired(current.accessToken)) {
    return { session: current, wasExpired: false };
  }

  // If expired, check if we have a refresh token
  if (!current.refreshToken) {
    clearSession();
    return { session: null, wasExpired: true };
  }

  try {
    const refreshed = await refreshSession(current.refreshToken);
    const updatedSession: StoredSession = {
      user: refreshed.user,
      accessToken: refreshed.tokens.access_token,
      refreshToken: refreshed.tokens.refresh_token,
    };
    return { session: updatedSession, wasExpired: false };
  } catch (err) {
    console.warn("[Auth] On-load session refresh failed:", err);
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

export async function getCurrentUser(accessToken: string): Promise<User> {
  const response = await fetch(`${AUTH_API_URL}/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch user profile");
  }

  return response.json();
}
