export type SignalingMessageType =
  | "join"
  | "peer-joined"
  | "offer"
  | "answer"
  | "ice-candidate"
  | "leave"
  | "peer-left"
  | "room-info"
  | "error";

export interface SignalingMessage {
  type: SignalingMessageType;
  room_id?: string;
  sender_id?: string;
  sender_name?: string;
  target_id?: string;
  payload?: unknown;
}

export interface PeerInfo {
  id: string;
  name: string;
}

export interface RoomInfoPayload {
  peers: PeerInfo[];
  you: PeerInfo;
}

export interface RoomResponse {
  room_id: string;
  name: string;
  created_by: string;
  max_participants: number;
  participant_count: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateRoomResponse {
  room_id: string;
  name: string;
  max_participants: number;
}
