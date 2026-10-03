import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { createVChatRoom, getVChatRoom } from "../../services/vchat";

interface VChatLobbyProps {
  onJoinRoom?: (roomId: string) => void;
}

export const VChatLobby: React.FC<VChatLobbyProps> = ({ onJoinRoom }) => {
  const navigate = useNavigate();
  const { accessToken, user, openAuthModal, isAuthenticated } = useAuth();

  const [roomName, setRoomName] = useState("");
  const [maxParticipants, setMaxParticipants] = useState(4);
  const [joinRoomId, setJoinRoomId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsCreating(true);

    try {
      const name = roomName.trim() || `${user?.full_name || "FrameVerse"}'s Room`;
      const res = await createVChatRoom(name, maxParticipants, accessToken);
      if (onJoinRoom) {
        onJoinRoom(res.room_id);
      } else {
        navigate(`/vchat/room/${res.room_id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create room.";
      setError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();

    const id = joinRoomId.trim();
    if (!id) {
      setError("Please enter a valid Room ID.");
      return;
    }

    setError(null);
    setIsJoining(true);

    try {
      // Validate room existence with backend
      await getVChatRoom(id, accessToken);
      if (onJoinRoom) {
        onJoinRoom(id);
      } else {
        navigate(`/vchat/room/${id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not find room with this ID.";
      setError(msg);
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="vchat-lobby-container">
      <div className="vchat-lobby-hero">
        <div className="vchat-badge">⚡ Real-Time P2P WebRTC</div>
        <h2>vChat Rooms</h2>
        <p>Instant peer-to-peer encrypted video chat. Host a room or join one with a Room ID.</p>
      </div>

      {!isAuthenticated && (
        <div className="vchat-auth-prompt">
          <span>💡 You are in Guest Mode. </span>
          <button className="auth-link-btn" onClick={() => openAuthModal()}>
            Sign in
          </button>
          <span> to host or join live video rooms.</span>
        </div>
      )}

      {error && (
        <div className="conversion-error-box vchat-error">
          <p>⚠️ {error}</p>
        </div>
      )}

      <div className="vchat-lobby-grid">
        {/* Card 1: Create a Room */}
        <div className="vchat-card">
          <div className="vchat-card-icon">🚀</div>
          <h3>Create New Room</h3>
          <p>Start a new private video call and share the room code with peers.</p>

          <form onSubmit={handleCreateRoom} className="vchat-form">
            <div className="form-group">
              <label htmlFor="create-room-name">Room Name</label>
              <input
                id="create-room-name"
                type="text"
                placeholder="e.g. Design Sync / Frame Room"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                disabled={isCreating}
              />
            </div>

            <div className="form-group">
              <label htmlFor="create-max-participants">Max Participants</label>
              <select
                id="create-max-participants"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
                disabled={isCreating}
                className="style-dropdown"
              >
                <option value={2}>2 People (1-on-1)</option>
                <option value={4}>4 People (Small Group)</option>
                <option value={8}>8 People (Team Sync)</option>
              </select>
            </div>

            <button
              type="submit"
              className="primary-button vchat-submit-btn"
              disabled={isCreating}
            >
              {isCreating ? "Creating Room..." : "Create & Enter Room"}
            </button>
          </form>
        </div>

        {/* Card 2: Join a Room */}
        <div className="vchat-card">
          <div className="vchat-card-icon">🔗</div>
          <h3>Join Existing Room</h3>
          <p>Have a Room ID? Enter it below to join the live video session.</p>

          <form onSubmit={handleJoinRoom} className="vchat-form">
            <div className="form-group">
              <label htmlFor="join-room-id">Room ID</label>
              <input
                id="join-room-id"
                type="text"
                placeholder="Paste room UUID here..."
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                disabled={isJoining}
                required
              />
            </div>

            <button
              type="submit"
              className="secondary-button vchat-submit-btn"
              disabled={isJoining}
            >
              {isJoining ? "Connecting..." : "Join Room"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
