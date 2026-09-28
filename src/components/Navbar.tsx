import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export type ActiveTab = "home" | "toonify" | "vchat";

interface NavbarProps {
  activeTab?: ActiveTab;
  onTabChange?: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated, openAuthModal, logout } = useAuth();

  const isHome = activeTab ? activeTab === "home" : location.pathname === "/";
  const isToonify = activeTab ? activeTab === "toonify" : location.pathname.startsWith("/toonify");
  const isVChat = activeTab ? activeTab === "vchat" : location.pathname.startsWith("/vchat");

  const handleNav = (tab: ActiveTab, path: string) => {
    if (onTabChange) {
      onTabChange(tab);
    }
    navigate(path);
  };

  return (
    <header className="navbar-container">
      <div className="navbar-left">
        <div className="navbar-logo" onClick={() => handleNav("home", "/")}>
          <span className="logo-icon">🔮</span>
          <span className="logo-text">FrameVerse</span>
        </div>

        <nav className="navbar-tabs">
          <button
            className={`tab-btn ${isHome ? "active" : ""}`}
            onClick={() => handleNav("home", "/")}
          >
            🏠 Home
          </button>
          <button
            className={`tab-btn ${isToonify ? "active" : ""}`}
            onClick={() => handleNav("toonify", "/toonify")}
          >
            ✨ Toonify Studio
          </button>
          <button
            className={`tab-btn ${isVChat ? "active" : ""}`}
            onClick={() => handleNav("vchat", "/vchat")}
          >
            📹 vChat Rooms
          </button>
        </nav>
      </div>

      <div className="navbar-right">
        {isAuthenticated && user ? (
          <div className="user-profile-menu">
            <div className="user-info-pill">
              <span className="user-avatar-badge">
                {(user.full_name || user.email).charAt(0).toUpperCase()}
              </span>
              <span className="user-email-text">{user.email}</span>
              <span className="user-tier-tag">{user.tier.toUpperCase()}</span>
            </div>
            <button className="signout-btn" onClick={logout} title="Sign Out">
              Sign Out
            </button>
          </div>
        ) : (
          <button className="primary-button login-trigger-btn" onClick={openAuthModal}>
            Sign In
          </button>
        )}
      </div>
    </header>
  );
};
