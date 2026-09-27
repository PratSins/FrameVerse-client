import React, { createContext, useContext, useEffect, useState } from "react";
import type { User, LoginRequest } from "../types/auth";
import {
  getStoredSession,
  loginUser,
  logoutUser,
  validateOrRefreshSession,
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

  // Validate session every time the application loads
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

  const login = async (credentials: LoginRequest) => {
    const data = await loginUser(credentials);
    setSession({
      user: data.user,
      accessToken: data.tokens.access_token,
      refreshToken: data.tokens.refresh_token,
    });
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
