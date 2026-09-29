import { useEffect, useRef, useState, useCallback } from "react";
import type { SignalingMessage, PeerInfo, RoomInfoPayload } from "../types/vchat";
import { getWebSocketSignalingUrl } from "../services/vchat";

// High-reliability redundant STUN servers across different providers & ports
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
    { urls: "stun:openrelay.metered.ca:80" },
  ],
  iceCandidatePoolSize: 10,
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
  toggleVideo: () => void | Promise<void>;
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
  const iceRestartTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Helper to send messages over WebSocket
  const sendMessage = useCallback((msg: SignalingMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Optimize video sender parameters to prevent bufferbloat and frozen frames
  const optimizeVideoSenders = useCallback((pc: RTCPeerConnection) => {
    pc.getSenders().forEach((sender) => {
      if (sender.track?.kind === "video") {
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          // Cap video bitrate at 1.2 Mbps and maintain framerate over real-world Wi-Fi
          params.encodings[0].maxBitrate = 1200000;
          params.degradationPreference = "maintain-framerate";
          sender.setParameters(params).catch(() => {});
        } catch {
          // Ignore if sender parameters not supported
        }
      }
    });
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

  // Perform ICE Restart when connection state stalls or drops
  const restartIceForPeer = useCallback(
    async (peerId: string) => {
      const pc = peerConnectionsRef.current.get(peerId);
      if (!pc || pc.signalingState !== "stable") return;

      try {
        console.log(`[vChat] Initiating ICE restart for peer ${peerId}`);
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        optimizeVideoSenders(pc);

        sendMessage({
          type: "offer",
          target_id: peerId,
          payload: offer,
        });
      } catch (err) {
        console.warn(`[vChat] ICE restart failed for ${peerId}:`, err);
      }
    },
    [sendMessage, optimizeVideoSenders]
  );

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
        const incomingStream = remoteStream || new MediaStream([event.track]);

        setRemotePeers((prev) => {
          const existing = prev.find((p) => p.id === peerId);
          if (existing) {
            // Re-instantiate MediaStream with all tracks to guarantee React state reactivity
            const allTracks = incomingStream.getTracks();
            const freshStream = new MediaStream(allTracks);
            return prev.map((p) => (p.id === peerId ? { ...p, stream: freshStream } : p));
          }
          return [...prev, { id: peerId, name: peerName, stream: incomingStream }];
        });
      };

      // Auto-recover on ICE connection state changes (Wi-Fi dropouts / NAT stalls)
      pc.oniceconnectionstatechange = () => {
        console.log(`[vChat] ICE State for ${peerName} (${peerId}): ${pc.iceConnectionState}`);

        // Clear any existing retry timer
        const existingTimer = iceRestartTimeoutsRef.current.get(peerId);
        if (existingTimer) {
          clearTimeout(existingTimer);
          iceRestartTimeoutsRef.current.delete(peerId);
        }

        if (pc.iceConnectionState === "disconnected") {
          // If disconnected for more than 2.5 seconds, auto-trigger ICE restart
          const timer = setTimeout(() => {
            if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
              restartIceForPeer(peerId);
            }
          }, 2500);
          iceRestartTimeoutsRef.current.set(peerId, timer);
        } else if (pc.iceConnectionState === "failed") {
          restartIceForPeer(peerId);
        }
      };

      return pc;
    },
    [sendMessage, restartIceForPeer]
  );

  // Clean up a specific peer
  const closePeer = useCallback((peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId);
    if (pc) {
      pc.close();
      peerConnectionsRef.current.delete(peerId);
    }
    const timer = iceRestartTimeoutsRef.current.get(peerId);
    if (timer) {
      clearTimeout(timer);
      iceRestartTimeoutsRef.current.delete(peerId);
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
    const currentTimeouts = iceRestartTimeoutsRef.current;

    async function initCall() {
      setIsConnecting(true);
      setError(null);

      try {
        // Step 1: Acquire Local Media Stream with balanced constraints
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
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
                      optimizeVideoSenders(pc);

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

                  // Drain pending ICE candidates safely with try/catch
                  const queued = pendingCandidatesRef.current.get(msg.sender_id) || [];
                  for (const candidate of queued) {
                    try {
                      await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    } catch (e) {
                      console.warn("[vChat] Error adding queued ICE candidate:", e);
                    }
                  }
                  pendingCandidatesRef.current.delete(msg.sender_id);

                  const answer = await pc.createAnswer();
                  await pc.setLocalDescription(answer);
                  optimizeVideoSenders(pc);

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

                    // Drain pending ICE candidates safely with try/catch
                    const queued = pendingCandidatesRef.current.get(msg.sender_id) || [];
                    for (const candidate of queued) {
                      try {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                      } catch (e) {
                        console.warn("[vChat] Error adding queued ICE candidate:", e);
                      }
                    }
                    pendingCandidatesRef.current.delete(msg.sender_id);
                  }
                  break;
                }

                case "ice-candidate": {
                  if (!msg.sender_id || !msg.payload) break;
                  const pc = peerConnectionsRef.current.get(msg.sender_id);
                  if (pc && pc.remoteDescription && pc.remoteDescription.type) {
                    try {
                      await pc.addIceCandidate(new RTCIceCandidate(msg.payload as RTCIceCandidateInit));
                    } catch (e) {
                      console.warn("[vChat] Error adding live ICE candidate:", e);
                    }
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
      currentTimeouts.forEach((t) => clearTimeout(t));
      currentTimeouts.clear();

      // Close WebSocket
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId, accessToken, createPeerConnection, closePeer, sendMessage, updateRemotePeersState, optimizeVideoSenders]);

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

  // Video Toggle with hardware camera power off (turns off Mac green LED)
  const toggleVideo = useCallback(async () => {
    if (!localStreamRef.current) return;

    if (!isVideoMuted) {
      // 1. Turn camera OFF: stop hardware track so green LED turns OFF
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach((track) => {
        track.stop();
        localStreamRef.current?.removeTrack(track);
      });

      // Stop sending video on all active peer connections
      peerConnectionsRef.current.forEach((pc) => {
        pc.getSenders().forEach((sender) => {
          if (sender.track?.kind === "video") {
            sender.replaceTrack(null).catch(() => {});
          }
        });
      });

      setIsVideoMuted(true);
      if (localStreamRef.current) {
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
    } else {
      // 2. Turn camera ON: request fresh hardware stream
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          },
        });
        const newTrack = camStream.getVideoTracks()[0];
        if (!newTrack) return;

        localStreamRef.current.addTrack(newTrack);

        // Update senders on all active peer connections
        peerConnectionsRef.current.forEach((pc) => {
          const videoSender = pc.getSenders().find(
            (s) => s.track === null || s.track?.kind === "video"
          );
          if (videoSender) {
            videoSender.replaceTrack(newTrack).catch(() => {});
          } else if (localStreamRef.current) {
            pc.addTrack(newTrack, localStreamRef.current);
          }
          optimizeVideoSenders(pc);
        });

        setIsVideoMuted(false);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      } catch (err) {
        console.error("Failed to re-enable camera:", err);
      }
    }
  }, [isVideoMuted, optimizeVideoSenders]);

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
    iceRestartTimeoutsRef.current.forEach((t) => clearTimeout(t));
    iceRestartTimeoutsRef.current.clear();
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
