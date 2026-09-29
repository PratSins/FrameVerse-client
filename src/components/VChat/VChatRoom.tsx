import React, { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useWebRTC } from "../../hooks/useWebRTC";

interface VChatRoomProps {
  roomId: string;
  onLeave: () => void;
}

const VideoTile: React.FC<{
  stream?: MediaStream | null;
  name: string;
  isLocal?: boolean;
  isMuted?: boolean;
  isVideoOff?: boolean;
}> = ({ stream, name, isLocal, isMuted, isVideoOff }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !stream) return;

    // Attach stream to video element
    videoEl.srcObject = stream;

    const playVideo = () => {
      if (!isVideoOff) {
        videoEl.play().catch(() => {});
      }
    };

    playVideo();

    // Recover from Wi-Fi jitters, track muting, or background pauses
    const videoTracks = stream.getVideoTracks();
    videoTracks.forEach((track) => {
      track.onunmute = playVideo;
    });

    videoEl.onloadedmetadata = playVideo;
    videoEl.onstalled = playVideo;
    videoEl.onpause = () => {
      if (!isVideoOff) {
        playVideo();
      }
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

  return (
    <div className={`video-tile ${isLocal ? "local-tile" : ""}`}>
      {isVideoOff || !stream ? (
        <div className="video-tile-placeholder">
          <div className="avatar-circle">{name.charAt(0).toUpperCase()}</div>
          <span>{name} {isVideoOff ? "(Camera Off)" : ""}</span>
        </div>
      ) : null}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Always mute local to avoid audio feedback loop
        className="peer-video-element"
        style={{ display: isVideoOff || !stream ? "none" : "block" }}
      />

      <div className="video-tile-footer">
        <span className="peer-name">
          {name} {isLocal ? "(You)" : ""}
        </span>
        {isMuted && <span className="mute-badge">🔇 Muted</span>}
      </div>
    </div>
  );
};

export const VChatRoom: React.FC<VChatRoomProps> = ({ roomId, onLeave }) => {
  const { accessToken } = useAuth();
  const [copied, setCopied] = useState(false);

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
  } = useWebRTC(roomId, accessToken);

  const handleCopyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExit = () => {
    leaveRoom();
    onLeave();
  };

  const totalParticipants = 1 + remotePeers.length;

  return (
    <div className="vchat-room-container">
      {/* Room Header */}
      <header className="vchat-room-header">
        <div className="room-info-left">
          <div className="room-status-indicator" />
          <div>
            <h3>Room: {roomId.slice(0, 8)}...</h3>
            <span className="room-participant-badge">
              👥 {totalParticipants} {totalParticipants === 1 ? "participant" : "participants"} online
            </span>
          </div>
        </div>

        <div className="room-actions-right">
          <button
            className="secondary-button copy-id-btn"
            onClick={handleCopyRoomId}
            title="Copy Room ID to share with friends"
          >
            {copied ? "✓ Copied ID!" : "📋 Copy Room ID"}
          </button>
          <button className="danger-button leave-room-btn" onClick={handleExit}>
            🚪 Leave Room
          </button>
        </div>
      </header>

      {/* Loading / Error States */}
      {isConnecting && (
        <div className="conversion-progress-box vchat-connecting-box">
          <div className="progress-spinner" />
          <p className="progress-text">Connecting to WebRTC Signaling Hub...</p>
          <span className="progress-subtext">Negotiating secure peer-to-peer connection</span>
        </div>
      )}

      {error && (
        <div className="conversion-error-box vchat-error">
          <p>⚠️ {error}</p>
        </div>
      )}

      {/* Video Grid */}
      <div className={`video-grid count-${Math.min(totalParticipants, 4)}`}>
        {/* Local Participant Tile */}
        <VideoTile
          stream={localStream}
          name={selfUser?.name || "You"}
          isLocal={true}
          isMuted={isAudioMuted}
          isVideoOff={isVideoMuted}
        />

        {/* Remote Peers Tiles */}
        {remotePeers.map((peer) => (
          <VideoTile
            key={peer.id}
            stream={peer.stream}
            name={peer.name}
            isLocal={false}
          />
        ))}
      </div>

      {/* In-Call Floating Controls */}
      <div className="vchat-controls-bar">
        <button
          className={`control-circle-btn ${isAudioMuted ? "btn-muted" : "btn-active"}`}
          onClick={toggleAudio}
          title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
        >
          {isAudioMuted ? "🔇" : "🎙️"}
          <span className="btn-label">{isAudioMuted ? "Unmute" : "Mute"}</span>
        </button>

        <button
          className={`control-circle-btn ${isVideoMuted ? "btn-muted" : "btn-active"}`}
          onClick={toggleVideo}
          title={isVideoMuted ? "Turn Video On" : "Turn Video Off"}
        >
          {isVideoMuted ? "🚫" : "📷"}
          <span className="btn-label">{isVideoMuted ? "Start Cam" : "Stop Cam"}</span>
        </button>

        <button
          className="control-circle-btn btn-danger"
          onClick={handleExit}
          title="Disconnect & Leave"
        >
          📞
          <span className="btn-label">End Call</span>
        </button>
      </div>
    </div>
  );
};
