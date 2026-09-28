import React from "react";
import { useNavigate } from "react-router-dom";

export const Footer: React.FC = () => {
  const navigate = useNavigate();

  return (
    <footer className="footer-bar">
      <div className="footer-content">
        <div className="footer-brand">
          <div className="footer-logo" onClick={() => navigate("/")}>
            <span className="logo-icon">🔮</span>
            <span className="logo-text">FrameVerse</span>
          </div>
          <p className="footer-tagline">
            Next-gen gesture-driven AI animation & real-time collaborative video.
          </p>
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
