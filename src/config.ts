/**
 * FrameVerse API Gateway Configuration
 *
 * With the NGINX Ingress Controller acting as a single API Gateway on GKE,
 * the frontend only needs ONE backend base URL (VITE_API_URL).
 *
 * Microservice routing handled by NGINX Ingress:
 *  - /api/v1/auth/*     -> FrameVerse Auth Service
 *  - /api/v1/toonify/*  -> FrameVerse Backend Service (AI Video Pipeline)
 *  - /api/v1/*          -> FrameVerse Backend Service (vChat Rooms REST)
 *  - /ws/vchat/*        -> FrameVerse Backend Service (Real-time WebSockets)
 */

// 1. Single Unified Gateway Base URL (e.g. "http://34.47.229.61")
const rawGatewayUrl =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_GATEWAY_URL ||
  "http://localhost:8080";

export const API_BASE_URL = rawGatewayUrl.replace(/\/+$/, "");

// 2. Auth Service endpoints
export const AUTH_API_URL =
  import.meta.env.VITE_AUTH_API_URL || `${API_BASE_URL}/api/v1/auth`;

// 3. Core Backend REST endpoints
export const BACKEND_API_URL =
  import.meta.env.VITE_BACKEND_API_URL || `${API_BASE_URL}/api/v1`;

// 4. Toonify AI endpoints
export const TOONIFY_API_URL = `${BACKEND_API_URL}/toonify`;

// 5. vChat WebSocket Signaling endpoint
function deriveWebSocketUrl(httpUrl: string): string {
  if (typeof window !== "undefined" && (!httpUrl || httpUrl.startsWith("/"))) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}/ws/vchat`;
  }
  const wsProto = httpUrl.startsWith("https://") ? "wss://" : "ws://";
  const strippedHost = httpUrl.replace(/^https?:\/\//, "");
  return `${wsProto}${strippedHost}/ws/vchat`;
}

export const BACKEND_WS_URL =
  import.meta.env.VITE_BACKEND_WS_URL || deriveWebSocketUrl(API_BASE_URL);
