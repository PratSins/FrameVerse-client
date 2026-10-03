import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useWebRTC } from "../../hooks/useWebRTC";

interface MeetVideoTileProps {
  stream?: MediaStream | null;
  name: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

const MeetVideoTile: React.FC<MeetVideoTileProps> = ({
  stream,
  name,
  isLocal,
  isMuted,
  isVideoOff,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !stream) return;

    videoEl.srcObject = stream;

    const playVideo = () => {
      if (!isVideoOff) {
        videoEl.play().catch(() => {});
      }
    };

    playVideo();

    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach((track) => {
      track.onunmute = playVideo;
    });

    videoEl.onloadedmetadata = playVideo;
    videoEl.onstalled = playVideo;
    videoEl.onpause = () => {
      if (!isVideoOff) playVideo();
    };

    return () => {
      videoTracks.forEach((track) => {
        track.onunmute = null;
      });
      if (videoEl) {
        videoEl.onloadedmetadata = null;
        videoEl.onstalled = null;
        videoEl.onpause = null;
      }
    };
  }, [stream, isVideoOff]);

  const initial = (name || "U").charAt(0).toUpperCase();

  return (
    <div className={`meet-video-tile ${isLocal ? "meet-local-tile" : ""}`}>
      {/* Fallback Meet Avatar when Camera is Off or stream not loaded */}
      {isVideoOff || !stream ? (
        <div className="meet-avatar-wrapper">
          <div className="meet-avatar-circle">{initial}</div>
          <span className="meet-avatar-name">{name}</span>
        </div>
      ) : null}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className="meet-video-element"
        style={{
          display: isVideoOff || !stream ? "none" : "block",
          transform: isLocal ? "scaleX(-1)" : "none", // Mirror local video like Google Meet
        }}
      />

      {/* Top Right Pin / Mute Badge */}
      <div className="meet-tile-top-actions">
        {isMuted && (
          <div className="meet-badge-muted" title="Microphone Muted">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
            </svg>
          </div>
        )}
      </div>

      {/* Bottom Left Meet Name Tag */}
      <div className="meet-tile-footer">
        <div className="meet-name-pill">
          <span className="meet-audio-dot" style={{ background: isMuted ? "#ea4335" : "#34a853" }} />
          <span className="meet-name-text">{name} {isLocal ? "(You)" : ""}</span>
        </div>
      </div>
    </div>
  );
};

export const VChatRoomPage: React.FC = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { accessToken } = useAuth();

  const [copied, setCopied] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const [currentTime, setCurrentTime] = useState("");

  const effectiveRoomId = roomId || "";

  // Real-time clock for bottom left Meet status
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const {
    localStream,
    remotePeers,
    selfUser,
    isConnecting,
    error,
    isAudioMuted,
    isVideoMuted,
    toggleAudio,
    toggleVideo,
    leaveRoom,
  } = useWebRTC(effectiveRoomId, accessToken);

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(effectiveRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleEndCall = () => {
    leaveRoom();
    navigate("/vchat");
  };

  const totalParticipants = 1 + remotePeers.length;

  return (
    <div className="meet-room-page">
      {/* Top Floating Meet Header */}
      <header className="meet-top-bar">
        <div className="meet-top-left">
          <div className="meet-brand-badge">
            <span className="meet-orb">🔮</span>
            <span className="meet-title">FrameVerse Meet</span>
          </div>
          <span className="meet-code-chip">{effectiveRoomId.slice(0, 8)}...</span>
        </div>

        <div className="meet-top-right">
          <button
            className={`meet-chip-btn ${copied ? "meet-chip-copied" : ""}`}
            onClick={handleCopyRoomId}
            title="Copy Room ID"
          >
            {copied ? "✓ Copied ID!" : "📋 Copy Room ID"}
          </button>
        </div>
      </header>

      {/* Main Video Call Stage */}
      <main className="meet-stage">
        {isConnecting && (
          <div className="meet-connecting-overlay">
            <div className="meet-spinner" />
            <p className="meet-connecting-title">Joining video call...</p>
            <span className="meet-connecting-subtitle">Negotiating secure peer-to-peer connection</span>
          </div>
        )}

        {error && (
          <div className="meet-error-banner">
            <span>⚠️ {error}</span>
          </div>
        )}

        {/* Dynamic Video Grid */}
        <div className={`meet-grid count-${Math.min(totalParticipants, 6)}`}>
          {/* Local Participant Tile */}
          <MeetVideoTile
            stream={localStream}
            name={selfUser?.name || "You"}
            isLocal={true}
            isMuted={isAudioMuted}
            isVideoOff={isVideoMuted}
          />

          {/* Remote Peers Tiles */}
          {remotePeers.map((peer) => (
            <MeetVideoTile
              key={peer.id}
              stream={peer.stream}
              name={peer.name}
              isLocal={false}
            />
          ))}
        </div>
      </main>

      {/* Side Panel: Meeting Details / People Drawer */}
      {showInfo && (
        <aside className="meet-drawer">
          <div className="meet-drawer-header">
            <h4>Meeting details</h4>
            <button className="meet-drawer-close" onClick={() => setShowInfo(false)}>✕</button>
          </div>
          <div className="meet-drawer-body">
            <p className="meet-drawer-label">Room ID</p>
            <div className="meet-link-box">
              <span className="meet-link-text">{effectiveRoomId}</span>
              <button className="meet-copy-action-btn" onClick={handleCopyRoomId}>
                {copied ? "Copied" : "Copy ID"}
              </button>
            </div>
            <p className="meet-drawer-subtext">Share this Room ID with peers to join this call from the lobby.</p>
          </div>
        </aside>
      )}

      {showPeople && (
        <aside className="meet-drawer">
          <div className="meet-drawer-header">
            <h4>People ({totalParticipants})</h4>
            <button className="meet-drawer-close" onClick={() => setShowPeople(false)}>✕</button>
          </div>
          <div className="meet-drawer-body">
            <div className="meet-people-list">
              <div className="meet-person-item">
                <div className="meet-person-avatar">{(selfUser?.name || "Y").charAt(0).toUpperCase()}</div>
                <div className="meet-person-info">
                  <span className="meet-person-name">{selfUser?.name || "You"} (You)</span>
                  <span className="meet-person-role">Host</span>
                </div>
                <span className="meet-person-status">{isAudioMuted ? "🔇" : "🎙️"}</span>
              </div>

              {remotePeers.map((p) => (
                <div key={p.id} className="meet-person-item">
                  <div className="meet-person-avatar">{p.name.charAt(0).toUpperCase()}</div>
                  <div className="meet-person-info">
                    <span className="meet-person-name">{p.name}</span>
                    <span className="meet-person-role">Participant</span>
                  </div>
                  <span className="meet-person-status">🎙️</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* Bottom Iconic Google Meet Control Bar */}
      <footer className="meet-bottom-bar">
        {/* Left Section: Time & Meeting Code */}
        <div className="meet-bar-left">
          <span className="meet-bar-time">{currentTime}</span>
          <span className="meet-bar-divider">|</span>
          <span className="meet-bar-code">{effectiveRoomId.slice(0, 12)}</span>
        </div>

        {/* Center Section: Core Google Meet Circular Controls */}
        <div className="meet-bar-center">
          {/* Microphone Toggle */}
          <button
            className={`meet-control-btn ${isAudioMuted ? "meet-btn-muted" : "meet-btn-active"}`}
            onClick={toggleAudio}
            title={isAudioMuted ? "Turn on microphone (⌘+D)" : "Turn off microphone (⌘+D)"}
          >
            {isAudioMuted ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            )}
          </button>

          {/* Camera Toggle */}
          <button
            className={`meet-control-btn ${isVideoMuted ? "meet-btn-muted" : "meet-btn-active"}`}
            onClick={toggleVideo}
            title={isVideoMuted ? "Turn on camera (⌘+E)" : "Turn off camera (⌘+E)"}
          >
            {isVideoMuted ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2zM5 16V8h1.27l8 8H5z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
              </svg>
            )}
          </button>

          {/* Leave / End Call */}
          <button
            className="meet-end-call-btn"
            onClick={handleEndCall}
            title="Leave call"
          >
            <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
              <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
            </svg>
          </button>
        </div>

        {/* Right Section: Details & Participants */}
        <div className="meet-bar-right">
          <button
            className={`meet-icon-btn ${showInfo ? "meet-icon-btn-active" : ""}`}
            onClick={() => {
              setShowInfo(!showInfo);
              setShowPeople(false);
            }}
            title="Meeting details"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M11 17h2v-6h-2v6zm1-15C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM11 9h2V7h-2v2z" />
            </svg>
          </button>

          <button
            className={`meet-icon-btn ${showPeople ? "meet-icon-btn-active" : ""}`}
            onClick={() => {
              setShowPeople(!showPeople);
              setShowInfo(false);
            }}
            title="Show everyone"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
            <span className="meet-people-count">{totalParticipants}</span>
          </button>
        </div>
      </footer>
    </div>
  );
};
