import React from "react";
import { useAuth } from "../context/AuthContext";

export type ActiveTab = "toonify" | "vchat";

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, onTabChange }) => {
  const { user, isAuthenticated, openAuthModal, logout } = useAuth();

  return (
    <header className="navbar-container">
      <div className="navbar-left">
        <div className="navbar-logo" onClick={() => onTabChange("toonify")}>
          <span className="logo-icon">🔮</span>
          <span className="logo-text">FrameVerse</span>
        </div>

        <nav className="navbar-tabs">
          <button
            className={`tab-btn ${activeTab === "toonify" ? "active" : ""}`}
            onClick={() => onTabChange("toonify")}
          >
            ✨ Toonify Studio
          </button>
          <button
            className={`tab-btn ${activeTab === "vchat" ? "active" : ""}`}
            onClick={() => onTabChange("vchat")}
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
