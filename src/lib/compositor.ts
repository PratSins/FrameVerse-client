import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

export interface Point {
  x: number;
  y: number;
}

export type Quad = [Point, Point, Point, Point];

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;

const MAX_LOST_FRAMES = 25;
const JUMP_CONFIRM_FRAMES = 2;
const JUMP_FRACTION = 0.3;
const ALPHA_MIN = 0.35;
const ALPHA_MAX = 0.85;
const ALPHA_SCALE = 0.05;
const PRESENCE_IN = 0.12;
const PRESENCE_OUT = 0.05;
const SPREAD_ACQUIRE = 0.75;
const SPREAD_KEEP = 0.2;
const AREA_ACQUIRE = 0.005;
const AREA_KEEP = 0.0005;

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpPt(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

function angleSorted(pts: Point[]): Point[] {
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
  return [...pts].sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
}

export class FrameTracker {
  private w: number;
  private h: number;
  public corners: Quad | null = null;
  public presence: number = 0;
  public frameActive: boolean = false;
  private lostFrames: number = 0;
  private jumpFrames: number = 0;

  constructor(width: number, height: number) {
    this.w = width;
    this.h = height;
  }

  public setDimensions(width: number, height: number) {
    this.w = width;
    this.h = height;
  }

  public reset() {
    this.corners = null;
    this.presence = 0;
    this.frameActive = false;
    this.lostFrames = 0;
    this.jumpFrames = 0;
  }

  private computeQuad(hands: NormalizedLandmark[][]): Quad | null {
    if (hands.length !== 2) return null;

    const info: Array<{ index: Point; thumb: Point; wx: number }> = [];

    for (const lm of hands) {
      const px = (i: number): Point => ({ x: lm[i].x * this.w, y: lm[i].y * this.h });
      const index = px(INDEX_TIP);
      const thumb = px(THUMB_TIP);
      const scale = dist(px(WRIST), px(MIDDLE_MCP)) + 1;
      const needed = this.frameActive ? SPREAD_KEEP : SPREAD_ACQUIRE;

      if (dist(thumb, index) < scale * needed) {
        return null;
      }
      info.push({ index, thumb, wx: px(WRIST).x });
    }

    info.sort((a, b) => a.wx - b.wx);
    const [a, b] = info;
    const pts: Quad = [a.index, b.index, b.thumb, a.thumb];
    const minArea = this.frameActive ? AREA_KEEP : AREA_ACQUIRE;

    if (polygonArea(angleSorted(pts)) < this.w * this.h * minArea) {
      return null;
    }

    return pts;
  }

  public update(hands: NormalizedLandmark[][]): Quad | null {
    const target = hands.length > 0 ? this.computeQuad(hands) : null;

    if (target) {
      if (this.corners === null) {
        this.lostFrames = 0;
        this.frameActive = true;
        this.jumpFrames = 0;
        this.corners = target;
        this.presence = Math.min(1.0, this.presence + PRESENCE_IN);
      } else {
        const moved = this.corners.reduce((sum, c, i) => sum + dist(target[i], c), 0) / 4;

        if (moved > this.w * JUMP_FRACTION && this.jumpFrames + 1 < JUMP_CONFIRM_FRAMES) {
          this.jumpFrames += 1;
          this.lostFrames += 1;
          if (this.lostFrames > MAX_LOST_FRAMES) {
            this.presence = Math.max(0.0, this.presence - PRESENCE_OUT);
          }
        } else {
          this.lostFrames = 0;
          this.frameActive = true;
          this.jumpFrames = 0;
          const alpha = Math.min(ALPHA_MAX, Math.max(ALPHA_MIN, moved / (this.w * ALPHA_SCALE)));
          this.corners = this.corners.map((c, i) => lerpPt(c, target[i], alpha)) as Quad;
          this.presence = Math.min(1.0, this.presence + PRESENCE_IN);
        }
      }
    } else if (this.corners !== null && this.lostFrames < MAX_LOST_FRAMES) {
      this.lostFrames += 1;
      this.presence = Math.min(1.0, this.presence + PRESENCE_IN);
    } else {
      this.presence = Math.max(0.0, this.presence - PRESENCE_OUT);
      if (this.presence === 0) {
        this.corners = null;
        this.frameActive = false;
        this.jumpFrames = 0;
      }
    }

    return this.presence > 0.01 ? this.corners : null;
  }
}

export function quadPath(ctx: CanvasRenderingContext2D, q: Quad) {
  ctx.beginPath();
  ctx.moveTo(q[0].x, q[0].y);
  ctx.lineTo(q[1].x, q[1].y);
  ctx.lineTo(q[2].x, q[2].y);
  ctx.lineTo(q[3].x, q[3].y);
  ctx.closePath();
}

export function drawWindow(
  ctx: CanvasRenderingContext2D,
  q: Quad,
  presence: number,
  stylizedVideo: HTMLVideoElement,
  width: number,
  height: number
) {
  ctx.save();
  quadPath(ctx, q);
  ctx.clip();
  ctx.globalAlpha = presence;
  ctx.drawImage(stylizedVideo, 0, 0, width, height);
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawOutline(
  ctx: CanvasRenderingContext2D,
  q: Quad,
  presence: number,
  t: number
) {
  ctx.save();
  ctx.globalAlpha = presence;
  quadPath(ctx, q);
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 40;
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.shadowBlur = 0;

  // Pulsing corner dots with expanding halo
  q.forEach((p, i) => {
    const r = 7 + Math.sin(t * 3 + i * 1.5) * 1.5;
    const halo = (t * 0.8 + i * 0.25) % 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + halo * 14, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.5 * (1 - halo) * presence})`;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.restore();
}

let landmarkerInstance: HandLandmarker | null = null;

export async function initLandmarker(): Promise<HandLandmarker> {
  if (landmarkerInstance) return landmarkerInstance;

  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  landmarkerInstance = await HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.3,
    minHandPresenceConfidence: 0.3,
    minTrackingConfidence: 0.3,
  });

  return landmarkerInstance;
}
