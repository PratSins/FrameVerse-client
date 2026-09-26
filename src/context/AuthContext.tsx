import React, { createContext, useContext, useState } from "react";
import type { User, LoginRequest } from "../types/auth";
import {
  getStoredSession,
  loginUser,
  logoutUser,
  type StoredSession,
} from "../services/auth";

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<StoredSession | null>(() => getStoredSession());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const login = async (credentials: LoginRequest) => {
    const data = await loginUser(credentials);
    setSession({
      user: data.user,
      accessToken: data.tokens.access_token,
      refreshToken: data.tokens.refresh_token,
    });
    setIsAuthModalOpen(false);
  };

  const logout = async () => {
    const refreshToken = session?.refreshToken;
    await logoutUser(refreshToken);
    setSession(null);
  };

  const openAuthModal = () => setIsAuthModalOpen(true);
  const closeAuthModal = () => setIsAuthModalOpen(false);

  return (
    <AuthContext.Provider
      value={{
        user: session?.user || null,
        accessToken: session?.accessToken || null,
        isAuthenticated: !!session?.user,
        isAuthModalOpen,
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
