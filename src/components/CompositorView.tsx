import { useEffect, useRef, useState, useCallback } from "react";
import { FrameTracker, drawOutline, drawWindow, initLandmarker } from "../lib/compositor";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

interface CompositorViewProps {
  originalVideoUrl: string;
  stylizedVideoUrl: string;
  styleName: string;
  onReset: () => void;
}

export default function CompositorView({
  originalVideoUrl,
  stylizedVideoUrl,
  styleName,
  onReset,
}: CompositorViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const origRef = useRef<HTMLVideoElement | null>(null);
  const styRef = useRef<HTMLVideoElement | null>(null);

  const trackerRef = useRef<FrameTracker | null>(null);
  const landmarkerRef = useRef<HandLandmarker | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Initializing hand tracker & media...");
  const [exportProgress, setExportProgress] = useState("");

  const animFrameIdRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);

  // Initialize MediaPipe & Video metadata
  useEffect(() => {
    let active = true;

    async function setup() {
      try {
        setStatusMessage("Loading MediaPipe hand tracker...");
        const landmarker = await initLandmarker();
        if (!active) return;
        landmarkerRef.current = landmarker;

        setStatusMessage("Preparing video canvas...");
        const orig = origRef.current;
        if (orig) {
          await new Promise<void>((resolve) => {
            if (orig.readyState >= 1) {
              resolve();
            } else {
              orig.onloadedmetadata = () => resolve();
            }
          });

          if (canvasRef.current && orig) {
            canvasRef.current.width = orig.videoWidth || 640;
            canvasRef.current.height = orig.videoHeight || 360;
            trackerRef.current = new FrameTracker(
              canvasRef.current.width,
              canvasRef.current.height
            );

            // Draw poster frame
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
              orig.currentTime = 0.01;
              orig.onseeked = () => {
                ctx.drawImage(orig, 0, 0, canvasRef.current!.width, canvasRef.current!.height);
                orig.onseeked = null;
              };
            }
          }
        }

        setIsReady(true);
        setStatusMessage("Ready! Click Play to see your AI Finger Frame window.");
      } catch (err) {
        console.error("Compositor init error:", err);
        setStatusMessage("Failed to initialize hand tracker. Please refresh.");
      }
    }

    setup();

    return () => {
      active = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [originalVideoUrl, stylizedVideoUrl]);

  // Main Render Loop
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const orig = origRef.current;
    const sty = styRef.current;
    const tracker = trackerRef.current;
    const landmarker = landmarkerRef.current;

    if (!canvas || !orig || !sty || !tracker) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw base original video frame
    ctx.drawImage(orig, 0, 0, canvas.width, canvas.height);

    // Track hands if video time advanced
    if (landmarker && orig.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = orig.currentTime;
      try {
        const res = landmarker.detectForVideo(orig, performance.now());
        tracker.update(res.landmarks || []);
      } catch (e) {
        console.warn("Hand tracking frame error:", e);
      }
    }

    // Keep stylized video strictly in step
    if (Math.abs(sty.currentTime - orig.currentTime) > 0.15) {
      sty.currentTime = orig.currentTime;
    }

    // Render stylized video inside quad mask if active
    if (tracker.corners && tracker.presence > 0.01) {
      drawWindow(ctx, tracker.corners, tracker.presence, sty, canvas.width, canvas.height);
      drawOutline(ctx, tracker.corners, tracker.presence, orig.currentTime);
    }

    if (!orig.paused && !orig.ended) {
      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    } else if (orig.ended) {
      setIsPlaying(false);
    }
  }, []);

  const handlePlayPause = async () => {
    const orig = origRef.current;
    const sty = styRef.current;
    if (!orig || !sty || !isReady) return;

    if (isPlaying) {
      orig.pause();
      sty.pause();
      setIsPlaying(false);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    } else {
      if (orig.ended || orig.currentTime >= orig.duration - 0.1) {
        orig.currentTime = 0;
        sty.currentTime = 0;
        trackerRef.current?.reset();
      }

      await Promise.all([orig.play(), sty.play()]);
      setIsPlaying(true);
      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    }
  };

  const handleExport = async () => {
    const canvas = canvasRef.current;
    const orig = origRef.current;
    const sty = styRef.current;

    if (!canvas || !orig || !sty || isExporting) return;

    setIsExporting(true);
    setExportProgress("Recording composite video...");
    setStatusMessage("Exporting — rendering composite video...");

    // Pause current playback & reset
    orig.pause();
    sty.pause();
    setIsPlaying(false);
    orig.currentTime = 0;
    sty.currentTime = 0;
    trackerRef.current?.reset();

    const stream = canvas.captureStream(30);

    const mime = [
      "video/mp4;codecs=avc1.42E01E",
      "video/mp4",
      "video/webm;codecs=vp9",
      "video/webm",
    ].find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

    const isMp4 = mime.startsWith("video/mp4");
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 12_000_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const ext = isMp4 ? "mp4" : "webm";
      const blob = new Blob(chunks, { type: isMp4 ? "video/mp4" : "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `frameverse-finger-frame-${styleName.toLowerCase()}.${ext}`;
      a.click();

      setIsExporting(false);
      setExportProgress("");
      setStatusMessage("Export complete! Video downloaded.");
    };

    recorder.start();

    orig.onended = () => {
      orig.onended = null;
      recorder.stop();
    };

    await Promise.all([orig.play(), sty.play()]);
    setIsPlaying(true);
    animFrameIdRef.current = requestAnimationFrame(renderFrame);
  };

  return (
    <div className="compositor-section">
      <div className="compositor-header">
        <h2>Finger Frame AI Result</h2>
        <span className="style-badge">{styleName.toUpperCase()} STYLE</span>
      </div>

      <p className="compositor-status">{statusMessage} {exportProgress}</p>

      {/* Hidden synchronized source videos */}
      <video
        ref={origRef}
        src={originalVideoUrl}
        playsInline
        muted
        preload="auto"
        style={{ display: "none" }}
      />
      <video
        ref={styRef}
        src={stylizedVideoUrl}
        playsInline
        muted
        preload="auto"
        style={{ display: "none" }}
      />

      <div className="compositor-canvas-container">
        <canvas ref={canvasRef} className="compositor-canvas" />
      </div>

      <div className="compositor-controls">
        <button
          className="secondary-button"
          onClick={onReset}
          disabled={isExporting}
        >
          Record / Upload Another
        </button>

        <button
          className="primary-button"
          onClick={handlePlayPause}
          disabled={!isReady || isExporting}
        >
          {isPlaying ? "Pause" : "Play Effect"}
        </button>

        <button
          className="export-button"
          onClick={handleExport}
          disabled={!isReady || isExporting}
        >
          {isExporting ? "Exporting..." : "Export Video"}
        </button>
      </div>
    </div>
  );
}
