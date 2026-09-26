import React, { useState } from "react";
import { VChatLobby } from "./VChatLobby";
import { VChatRoom } from "./VChatRoom";

export const VChatView: React.FC = () => {
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);

  const handleJoinRoom = (roomId: string) => {
    setActiveRoomId(roomId);
  };

  const handleLeaveRoom = () => {
    setActiveRoomId(null);
  };

  return (
    <section className="vchat-view-wrapper">
      {activeRoomId ? (
        <VChatRoom roomId={activeRoomId} onLeave={handleLeaveRoom} />
      ) : (
        <VChatLobby onJoinRoom={handleJoinRoom} />
      )}
    </section>
  );
};
