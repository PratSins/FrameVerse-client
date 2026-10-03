import type { CreateRoomResponse, RoomResponse } from "../types/vchat";
import { BACKEND_API_URL, BACKEND_WS_URL } from "../config";
import { fetchWithAuth, getStoredSession } from "./auth";

export async function createVChatRoom(
  name: string,
  maxParticipants: number = 4,
  accessToken?: string | null
): Promise<CreateRoomResponse> {
  const customHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (accessToken) {
    customHeaders["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetchWithAuth(`${BACKEND_API_URL}/vchat/rooms`, {
    method: "POST",
    headers: customHeaders,
    body: JSON.stringify({
      name: name || "FrameVerse Room",
      max_participants: maxParticipants,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("You must be logged in to create or host a room. Please sign in first.");
    }
    const errText = await response.text();
    throw new Error(`Failed to create room: ${errText || response.statusText}`);
  }

  return response.json();
}

export async function getVChatRoom(
  roomId: string,
  accessToken?: string | null
): Promise<RoomResponse> {
  const customHeaders: Record<string, string> = {};
  if (accessToken) {
    customHeaders["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetchWithAuth(`${BACKEND_API_URL}/vchat/rooms/${roomId}`, {
    method: "GET",
    headers: customHeaders,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("You must be logged in to join a room. Please sign in first.");
    }
    if (response.status === 404) {
      throw new Error("Room not found or has ended.");
    }
    const errText = await response.text();
    throw new Error(`Failed to get room: ${errText || response.statusText}`);
  }

  return response.json();
}

export function getWebSocketSignalingUrl(roomId: string, accessToken?: string | null): string {
  const token = accessToken || getStoredSession()?.accessToken;
  const baseUrl = `${BACKEND_WS_URL}/rooms/${roomId}`;
  if (token) {
    return `${baseUrl}?token=${encodeURIComponent(token)}`;
  }
  return baseUrl;
}
