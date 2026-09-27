import React from "react";
import type { ActiveTab } from "./Navbar";

interface FooterProps {
  onNavigate: (tab: ActiveTab) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="footer-bar">
      <div className="footer-content">
        <div className="footer-brand">
          <div className="footer-logo" onClick={() => onNavigate("home")}>
            <span className="logo-icon">🔮</span>
            <span className="logo-text">FrameVerse</span>
          </div>
          <p className="footer-tagline">
            Next-gen gesture-driven AI animation & real-time collaborative video.
          </p>
        </div>

        <div className="footer-links">
          <button className="footer-nav-link" onClick={() => onNavigate("home")}>
            Home
          </button>
          <span className="footer-separator">•</span>
          <button className="footer-nav-link" onClick={() => onNavigate("toonify")}>
            Toonify Studio
          </button>
          <span className="footer-separator">•</span>
          <button className="footer-nav-link" onClick={() => onNavigate("vchat")}>
            vChat Rooms
          </button>
        </div>

        <div className="footer-creator">
          <span className="creator-label">Crafted by</span>
          <a
            href="https://pratsins.github.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="portfolio-pill"
            title="View PratSins Portfolio"
          >
            <span className="portfolio-avatar">👨‍💻</span>
            <span className="portfolio-name">PratSins</span>
            <span className="portfolio-arrow">↗</span>
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <span className="footer-copyright">
          © {new Date().getFullYear()} FrameVerse. Built with Go, GKE, Vertex AI, WebRTC & React.
        </span>
        <a
          href="https://pratsins.github.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="portfolio-text-link"
        >
          https://pratsins.github.io/
        </a>
      </div>
    </footer>
  );
};
