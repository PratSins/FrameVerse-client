import type { AuthResponse, LoginRequest, User } from "../types/auth";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || "http://localhost:8081/api/v1/auth";
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
    const payload = JSON.parse(atob(parts[1]));
    if (!payload.exp) return true;
    return Date.now() / 1000 >= payload.exp - bufferSeconds;
  } catch {
    return true;
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

export async function refreshSession(refreshToken: string): Promise<AuthResponse> {
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
  saveSession({
    user: data.user,
    accessToken: data.tokens.access_token,
    refreshToken: data.tokens.refresh_token,
  });

  return data;
}

/**
 * Validates the refresh token against the Auth backend on every page load.
 * Performs an active API call to POST /api/v1/auth/refresh to verify that
 * the refresh token has not expired (>7 days) or been revoked in PostgreSQL.
 */
export async function validateOrRefreshSession(): Promise<{
  session: StoredSession | null;
  wasExpired: boolean;
}> {
  const current = getStoredSession();
  if (!current) {
    return { session: null, wasExpired: false };
  }

  if (!current.refreshToken) {
    clearSession();
    return { session: null, wasExpired: true };
  }

  try {
    // Actively verify and rotate session with Auth service on every page load
    const refreshed = await refreshSession(current.refreshToken);
    const updatedSession: StoredSession = {
      user: refreshed.user,
      accessToken: refreshed.tokens.access_token,
      refreshToken: refreshed.tokens.refresh_token,
    };
    return { session: updatedSession, wasExpired: false };
  } catch (err) {
    console.warn("[Auth] On-load session validation failed:", err);
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
