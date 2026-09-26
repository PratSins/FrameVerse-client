import type { AuthResponse, LoginRequest, User } from "../types/auth";

const AUTH_API_URL = import.meta.env.VITE_AUTH_API_URL || "http://localhost:8081/api/v1/auth";
const STORAGE_KEY_AUTH = "frameverse_auth_session";

export interface StoredSession {
  user: User;
  accessToken: string;
  refreshToken: string;
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
