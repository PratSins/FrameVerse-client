import { useEffect, useRef, useState, useCallback } from "react";
import type { SignalingMessage, PeerInfo, RoomInfoPayload } from "../types/vchat";
import { getWebSocketSignalingUrl } from "../services/vchat";

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

export interface RemotePeer {
  id: string;
  name: string;
  stream?: MediaStream;
}

export interface UseWebRTCReturn {
  localStream: MediaStream | null;
  remotePeers: RemotePeer[];
  selfUser: PeerInfo | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  toggleAudio: () => void;
  toggleVideo: () => void;
  leaveRoom: () => void;
}

export function useWebRTC(roomId: string, accessToken?: string | null): UseWebRTCReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remotePeers, setRemotePeers] = useState<RemotePeer[]>([]);
  const [selfUser, setSelfUser] = useState<PeerInfo | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const peerNamesRef = useRef<Map<string, string>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Helper to send messages over WebSocket
  const sendMessage = useCallback((msg: SignalingMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Update React remote peers list
  const updateRemotePeersState = useCallback(() => {
    const list: RemotePeer[] = [];
    peerNamesRef.current.forEach((name, id) => {
      const pc = peerConnectionsRef.current.get(id);
      let stream: MediaStream | undefined;
      if (pc) {
        const receivers = pc.getReceivers();
        const tracks = receivers.map((r) => r.track).filter(Boolean);
        if (tracks.length > 0) {
          stream = new MediaStream(tracks);
        }
      }
      list.push({ id, name, stream });
    });
    setRemotePeers(list);
  }, []);

  // Create an RTCPeerConnection for a given peer
  const createPeerConnection = useCallback(
    (peerId: string, peerName: string): RTCPeerConnection => {
      if (peerConnectionsRef.current.has(peerId)) {
        return peerConnectionsRef.current.get(peerId)!;
      }

      const pc = new RTCPeerConnection(RTC_CONFIG);
      peerConnectionsRef.current.set(peerId, pc);
      peerNamesRef.current.set(peerId, peerName);

      // Add local stream tracks to PC
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // ICE Candidate Trickle
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendMessage({
            type: "ice-candidate",
            target_id: peerId,
            payload: event.candidate.toJSON(),
          });
        }
      };

      // Handle incoming remote media tracks
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        setRemotePeers((prev) => {
          const existing = prev.find((p) => p.id === peerId);
          if (existing) {
            return prev.map((p) =>
              p.id === peerId ? { ...p, stream: remoteStream || new MediaStream([event.track]) } : p
            );
          }
          return [...prev, { id: peerId, name: peerName, stream: remoteStream || new MediaStream([event.track]) }];
        });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
          // peer disconnected
        }
      };

      return pc;
    },
    [sendMessage]
  );

  // Clean up a specific peer
  const closePeer = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }
    peerNamesRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    setRemotePeers((prev) => prev.filter((p) => p.id !== peerId));
  }, []);

  // Initialize Call & WebSocket
  useEffect(() => {
    let isCancelled = false;
    const currentPCs = peerConnectionsRef.current;
    const currentNames = peerNamesRef.current;
    const currentPending = pendingCandidatesRef.current;

    async function initCall() {
      setIsConnecting(true);
      setError(null);

      try {
        // Step 1: Acquire Local Media Stream
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: true,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Step 2: Connect WebSocket Signaling
        const wsUrl = getWebSocketSignalingUrl(roomId, accessToken);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCancelled) return;
          setIsConnected(true);
          setIsConnecting(false);
        };

        ws.onerror = (e) => {
          console.error("[vChat] WebSocket error:", e);
          if (!isCancelled) {
            setError("WebSocket connection failed. Make sure the backend server is running.");
            setIsConnecting(false);
          }
        };

        ws.onclose = () => {
          if (!isCancelled) {
            setIsConnected(false);
            setIsConnecting(false);
          }
        };

        ws.onmessage = async (event) => {
          try {
            // Handle multiple newline-separated JSON frames if batched
            const raw = event.data as string;
            const lines = raw.split("\n").filter((line) => line.trim().length > 0);

            for (const line of lines) {
              const msg: SignalingMessage = JSON.parse(line);

              switch (msg.type) {
                case "room-info": {
                  const payload = msg.payload as RoomInfoPayload;
                  if (payload.you) {
                    setSelfUser(payload.you);
                  }

                  // Initiate offers to all existing peers in the room
                  if (payload.peers && Array.isArray(payload.peers)) {
                    for (const peer of payload.peers) {
                      const pc = createPeerConnection(peer.id, peer.name);
                      const offer = await pc.createOffer();
                      await pc.setLocalDescription(offer);

                      sendMessage({
                        type: "offer",
                        target_id: peer.id,
                        payload: offer,
                      });
                    }
                  }
                  break;
                }

                case "peer-joined": {
                  if (msg.sender_id && msg.sender_name) {
                    peerNamesRef.current.set(msg.sender_id, msg.sender_name);
                    updateRemotePeersState();
                  }
                  break;
                }

                case "offer": {
                  if (!msg.sender_id || !msg.payload) break;
                  const senderName = msg.sender_name || peerNamesRef.current.get(msg.sender_id) || "Peer";
                  const pc = createPeerConnection(msg.sender_id, senderName);

                  await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));

                  // Drain pending ICE candidates
                  const queued = pendingCandidatesRef.current.get(msg.sender_id) || [];
                  for (const candidate of queued) {
                    await pc.addIceCandidate(new RTCIceCandidate(candidate));
                  }
                  pendingCandidatesRef.current.delete(msg.sender_id);

                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);

                  sendMessage({
                    type: "answer",
                    target_id: msg.sender_id,
                    payload: answer,
                  });
                  break;
                }

                case "answer": {
                  if (!msg.sender_id || !msg.payload) break;
                  const pc = peerConnectionsRef.current.get(msg.sender_id);
                  if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(msg.payload as RTCSessionDescriptionInit));

                    // Drain pending ICE candidates
                    const queued = pendingCandidatesRef.current.get(msg.sender_id) || [];
                    for (const candidate of queued) {
                      await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                    pendingCandidatesRef.current.delete(msg.sender_id);
                  }
                  break;
                }

                case "ice-candidate": {
                  if (!msg.sender_id || !msg.payload) break;
                  const pc = peerConnectionsRef.current.get(msg.sender_id);
                  if (pc && pc.remoteDescription && pc.remoteDescription.type) {
                    await pc.addIceCandidate(new RTCIceCandidate(msg.payload as RTCIceCandidateInit));
                  } else {
                    // Queue candidate until remote description is set
                    const existing = pendingCandidatesRef.current.get(msg.sender_id) || [];
                    existing.push(msg.payload as RTCIceCandidateInit);
                    pendingCandidatesRef.current.set(msg.sender_id, existing);
                  }
                  break;
                }

                case "peer-left": {
                  if (msg.sender_id) {
                    closePeer(msg.sender_id);
                  }
                  break;
                }

                case "error": {
                  setError(typeof msg.payload === "string" ? msg.payload : "Signaling error occurred.");
                  break;
                }
              }
            }
          } catch (err) {
            console.error("[vChat] Error parsing signaling message:", err);
          }
        };
      } catch (err: unknown) {
        console.error("[vChat] Initialization error:", err);
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : "Failed to access camera and microphone.";
          setError(msg);
          setIsConnecting(false);
        }
      }
    }

    initCall();

    return () => {
      isCancelled = true;

      // Stop local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }

      // Close all peer connections
      currentPCs.forEach((pc) => pc.close());
      currentPCs.clear();
      currentNames.clear();
      currentPending.clear();

      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId, accessToken, createPeerConnection, closePeer, sendMessage, updateRemotePeersState]);

  // Audio Toggle
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !audioTracks[0].enabled;
        audioTracks.forEach((track) => (track.enabled = nextState));
        setIsAudioMuted(!nextState);
      }
    }
  }, []);

  // Video Toggle
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !videoTracks[0].enabled;
        videoTracks.forEach((track) => (track.enabled = nextState));
        setIsVideoMuted(!nextState);
      }
    }
  }, []);

  // Leave Room
  const leaveRoom = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      sendMessage({ type: "leave" });
      wsRef.current.close();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    setLocalStream(null);
    setRemotePeers([]);
    setIsConnected(false);
  }, [sendMessage]);

  return {
    localStream,
    remotePeers,
    selfUser,
    isConnected,
    isConnecting,
    error,
    isAudioMuted,
    isVideoMuted,
    toggleAudio,
    toggleVideo,
    leaveRoom,
  };
}
