import type { CreateRoomResponse, RoomResponse } from "../types/vchat";

const BACKEND_API_URL = import.meta.env.VITE_BACKEND_API_URL || "http://localhost:8080/api/v1";
const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8080/ws/vchat";

export async function createVChatRoom(
  name: string,
  maxParticipants: number = 4,
  accessToken?: string | null
): Promise<CreateRoomResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BACKEND_API_URL}/vchat/rooms`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: name || "FrameVerse Room",
      max_participants: maxParticipants,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create room: ${errText || response.statusText}`);
  }

  return response.json();
}

export async function getVChatRoom(
  roomId: string,
  accessToken?: string | null
): Promise<RoomResponse> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BACKEND_API_URL}/vchat/rooms/${roomId}`, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Room not found or has ended.");
    }
    const errText = await response.text();
    throw new Error(`Failed to get room: ${errText || response.statusText}`);
  }

  return response.json();
}

export function getWebSocketSignalingUrl(roomId: string, accessToken?: string | null): string {
  const baseUrl = `${BACKEND_WS_URL}/rooms/${roomId}`;
  if (accessToken) {
    return `${baseUrl}?token=${encodeURIComponent(accessToken)}`;
  }
  return baseUrl;
}
