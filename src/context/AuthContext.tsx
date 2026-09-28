import React, { createContext, useContext, useEffect, useState } from "react";
import type { User, LoginRequest } from "../types/auth";
import {
  getStoredSession,
  loginUser,
  logoutUser,
  validateOrRefreshSession,
  refreshSession,
  isTokenExpired,
  type StoredSession,
} from "../services/auth";

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  authNotice: string | null;
  openAuthModal: (notice?: string | React.MouseEvent) => void;
  closeAuthModal: () => void;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<StoredSession | null>(() => getStoredSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  // 1. Validate session on initial application load
  useEffect(() => {
    let active = true;

    async function checkSessionOnLoad() {
      const { session: validSession, wasExpired } = await validateOrRefreshSession();

      if (!active) return;

      if (validSession) {
        setSession(validSession);
        setAuthNotice(null);
      } else {
        setSession(null);
        if (wasExpired) {
          setAuthNotice("Your session has expired. Please sign in again.");
          setIsAuthModalOpen(true);
        }
      }
    }

    checkSessionOnLoad();

    return () => {
      active = false;
    };
  }, []);

  // 2. Synchronize with background refresh events across components and tabs
  useEffect(() => {
    const handleAuthRefreshed = (e: Event) => {
      const customEvent = e as CustomEvent<StoredSession>;
      if (customEvent.detail) {
        setSession(customEvent.detail);
        setAuthNotice(null);
      }
    };

    const handleAuthExpired = () => {
      setSession(null);
      setAuthNotice("Your session has expired. Please sign in again.");
      setIsAuthModalOpen(true);
    };

    window.addEventListener("frameverse:auth-refreshed", handleAuthRefreshed);
    window.addEventListener("frameverse:auth-expired", handleAuthExpired);

    return () => {
      window.removeEventListener("frameverse:auth-refreshed", handleAuthRefreshed);
      window.removeEventListener("frameverse:auth-expired", handleAuthExpired);
    };
  }, []);

  // 3. Proactive Background Refresher: Keeps token alive 2 minutes before it expires!
  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (!session?.refreshToken || !session?.accessToken) return;

      // Check if access token will expire within the next 2 minutes (120s)
      if (isTokenExpired(session.accessToken, 120)) {
        try {
          await refreshSession(session.refreshToken);
        } catch (err) {
          console.warn("[Auth] Proactive interval refresh failed:", err);
        }
      }
    }, 30000); // Check every 30 seconds

    return () => {
      window.clearInterval(interval);
    };
  }, [session?.refreshToken, session?.accessToken]);

  const login = async (credentials: LoginRequest) => {
    const data = await loginUser(credentials);
    const newSession: StoredSession = {
      user: data.user,
      accessToken: data.tokens.access_token,
      refreshToken: data.tokens.refresh_token,
    };
    setSession(newSession);
    setAuthNotice(null);
    setIsAuthModalOpen(false);
  };

  const logout = async () => {
    const refreshToken = session?.refreshToken;
    await logoutUser(refreshToken);
    setSession(null);
    setAuthNotice(null);
  };

  const openAuthModal = (notice?: string | React.MouseEvent) => {
    if (typeof notice === "string") {
      setAuthNotice(notice);
    } else {
      setAuthNotice(null);
    }
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
    setAuthNotice(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        accessToken: session?.accessToken || null,
        isAuthenticated: !!session?.user,
        isAuthModalOpen,
        authNotice,
        openAuthModal,
        closeAuthModal,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
