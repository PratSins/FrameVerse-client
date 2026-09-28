import React from "react";
import { useNavigate } from "react-router-dom";
import type { ActiveTab } from "./Navbar";
import { useAuth } from "../context/AuthContext";

interface HomeViewProps {
  onNavigate?: (tab: ActiveTab) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const navigate = useNavigate();
  const { user, isAuthenticated, openAuthModal } = useAuth();

  const handleNav = (tab: ActiveTab, path: string) => {
    if (onNavigate) {
      onNavigate(tab);
    }
    navigate(path);
  };

  return (
    <div className="home-container">
      {/* Hero Section */}
      <section className="home-hero">
        <div className="hero-pill-badge">
          <span className="badge-pulse" />
          <span className="badge-text">Next-Gen AI Video & WebRTC Universe</span>
        </div>

        <h1 className="home-title">
          Step into the <span className="gradient-text">FrameVerse</span>
        </h1>

        <p className="home-subtitle">
          Turn your camera gestures into cinematic cartoon animations powered by
          Google Vertex AI & Gemini Omni Flash, or connect in ultra low-latency
          real-time WebRTC collaborative video rooms.
        </p>

        <div className="home-cta-group">
          <button
            className="primary-button hero-cta-btn"
            onClick={() => handleNav("toonify", "/toonify")}
          >
            ✨ Launch Toonify Studio
          </button>
          <button
            className="secondary-button hero-cta-btn"
            onClick={() => handleNav("vchat", "/vchat")}
          >
            📹 Enter vChat Rooms
          </button>
          {!isAuthenticated ? (
            <button
              className="ghost-button hero-cta-btn"
              onClick={openAuthModal}
            >
              🔑 Sign In
            </button>
          ) : null}
        </div>

        {isAuthenticated && user && (
          <div className="auth-welcome-banner">
            <span>
              👋 Welcome back, <strong>{user.full_name || user.email}</strong>!
              You are signed in on the{" "}
              <span className="tier-highlight">{user.tier.toUpperCase()}</span> tier with{" "}
              <strong>{user.credits}</strong> credits.
            </span>
          </div>
        )}
      </section>

      {/* Feature Highlights Grid */}
      <section className="features-grid">
        <div className="feature-card" onClick={() => handleNav("toonify", "/toonify")}>
          <div className="feature-icon-wrapper toonify-glow">
            <span className="feature-icon">✨</span>
          </div>
          <h3>AI Toonify Studio</h3>
          <p>
            Capture video clips effortlessly using natural finger-frame gestures or
            upload existing media. Convert your footage into anime, 3D animated,
            or Pixar styles via Gemini Omni Flash.
          </p>
          <div className="card-action-link">Open Studio →</div>
        </div>

        <div className="feature-card" onClick={() => handleNav("vchat", "/vchat")}>
          <div className="feature-icon-wrapper vchat-glow">
            <span className="feature-icon">📹</span>
          </div>
          <h3>Real-Time vChat Rooms</h3>
          <p>
            Create private mesh video rooms powered by WebSockets signaling and
            WebSockets hubs in Go. Stream crystal-clear audio and video with
            instant room codes and mute/camera controls.
          </p>
          <div className="card-action-link">Explore Rooms →</div>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper cloud-glow">
            <span className="feature-icon">⚡</span>
          </div>
          <h3>Cloud-Native Architecture</h3>
          <p>
            Orchestrated with microservices on Google Kubernetes Engine (GKE),
            Cloud SQL PostgreSQL, MongoDB clusters, and Cloud Storage signed
            direct uploads for zero-bottleneck performance.
          </p>
          <div className="card-tag">GKE + Cloud SQL + GCS</div>
        </div>
      </section>

      {/* Quick Step-by-Step Guide */}
      <section className="how-it-works-section">
        <div className="section-header">
          <span className="section-eyebrow">QUICK START GUIDE</span>
          <h2>How to Experience FrameVerse</h2>
          <p>Sign in with an account to get full access to all features</p>
        </div>

        <div className="steps-container">
          <div className="step-card">
            <div className="step-number">01</div>
            <div className="step-content">
              <h4>Sign In to Your Account</h4>
              <p>
                Authentication is required to convert AI videos and host rooms. Click <strong>Sign In</strong> at
                the top right to unlock full access.
              </p>
            </div>
          </div>

          <div className="step-card">
            <div className="step-number">02</div>
            <div className="step-content">
              <h4>Record or Upload in Toonify</h4>
              <p>
                Head to <strong>Toonify Studio</strong>. Form a rectangle with both hands
                in front of your webcam to trigger automatic capture, or upload an MP4 clip.
                Choose your AI style and convert!
              </p>
            </div>
          </div>

          <div className="step-card">
            <div className="step-number">03</div>
            <div className="step-content">
              <h4>Start or Join a Live vChat</h4>
              <p>
                Head to <strong>vChat Rooms</strong>, create a room, copy the Room ID,
                and join with a peer (or an incognito window) to experience real-time
                low-latency WebRTC video calling.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
