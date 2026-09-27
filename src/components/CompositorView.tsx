import React, { useEffect, useRef, useState, useCallback } from "react";
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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Initializing hand tracker & media...");

  const animFrameIdRef = useRef<number | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const isExportingRef = useRef(false);

  // Helper: reliably obtain finite duration even from recorded WebM blobs
  const resolveFiniteDuration = async (video: HTMLVideoElement): Promise<number> => {
    if (isFinite(video.duration) && video.duration > 0) {
      return video.duration;
    }

    return new Promise<number>((resolve) => {
      const onTimeUpdate = () => {
        video.removeEventListener("timeupdate", onTimeUpdate);
        const d = video.duration;
        video.currentTime = 0;
        resolve(isFinite(d) && d > 0 ? d : 0);
      };

      video.addEventListener("timeupdate", onTimeUpdate);
      try {
        video.currentTime = 1e101; // Chrome WebM duration calculation trick
      } catch {
        // ignore
      }

      setTimeout(() => {
        video.removeEventListener("timeupdate", onTimeUpdate);
        resolve(isFinite(video.duration) && video.duration > 0 ? video.duration : 0);
      }, 600);
    });
  };

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
        const sty = styRef.current;

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

            // Calculate finite duration
            let detectedDuration = 0;
            if (sty && isFinite(sty.duration) && sty.duration > 0) {
              detectedDuration = sty.duration;
            } else {
              detectedDuration = await resolveFiniteDuration(orig);
              if (detectedDuration <= 0 && sty) {
                detectedDuration = await resolveFiniteDuration(sty);
              }
            }

            if (active && detectedDuration > 0) {
              setDuration(detectedDuration);
            }

            // Draw initial poster frame
            const ctx = canvasRef.current.getContext("2d");
            if (ctx) {
              orig.currentTime = 0.01;
              orig.onseeked = () => {
                if (canvasRef.current) {
                  ctx.drawImage(orig, 0, 0, canvasRef.current.width, canvasRef.current.height);
                }
                orig.onseeked = null;
              };
            }
          }
        }

        setIsReady(true);
        setStatusMessage("Ready! Press Play or Replay to watch the Finger Frame effect.");
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
    setCurrentTime(orig.currentTime);

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
    if (Math.abs(sty.currentTime - orig.currentTime) > 0.1) {
      sty.currentTime = orig.currentTime;
    }

    // Render stylized video inside quad mask if active
    if (tracker.corners && tracker.presence > 0.01) {
      drawWindow(ctx, tracker.corners, tracker.presence, sty, canvas.width, canvas.height);
      drawOutline(ctx, tracker.corners, tracker.presence, orig.currentTime);
    }

    // Check if playback should continue
    const effectiveDuration = isFinite(duration) && duration > 0 ? duration : orig.duration;
    const isAtEnd = orig.ended || (isFinite(effectiveDuration) && effectiveDuration > 0 && orig.currentTime >= effectiveDuration - 0.05);

    if (!orig.paused && !isAtEnd) {
      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    } else {
      orig.pause();
      sty.pause();
      setIsPlaying(false);
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    }
  }, [duration]);

  const playFrom = async (time: number) => {
    const orig = origRef.current;
    const sty = styRef.current;
    if (!orig || !sty || !isReady) return;

    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    orig.currentTime = time;
    sty.currentTime = time;
    if (time === 0) {
      trackerRef.current?.reset();
    }

    try {
      await Promise.all([orig.play(), sty.play()]);
      setIsPlaying(true);
      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    } catch (err) {
      console.warn("Play error:", err);
    }
  };

  const handlePlayPause = async () => {
    const orig = origRef.current;
    const sty = styRef.current;
    if (!orig || !sty || !isReady) return;

    if (isPlaying) {
      orig.pause();
      sty.pause();
      setIsPlaying(false);
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }
    } else {
      const effectiveDuration = isFinite(duration) && duration > 0 ? duration : orig.duration;
      const targetTime =
        orig.ended || (isFinite(effectiveDuration) && orig.currentTime >= effectiveDuration - 0.1)
          ? 0
          : orig.currentTime;
      playFrom(targetTime);
    }
  };

  const handleReplay = () => {
    playFrom(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    const orig = origRef.current;
    const sty = styRef.current;
    if (!orig || !sty) return;

    orig.currentTime = newTime;
    sty.currentTime = newTime;
    setCurrentTime(newTime);

    // Render single frame at seeked point
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(orig, 0, 0, canvas.width, canvas.height);
        if (trackerRef.current?.corners && trackerRef.current.presence > 0.01) {
          drawWindow(ctx, trackerRef.current.corners, trackerRef.current.presence, sty, canvas.width, canvas.height);
          drawOutline(ctx, trackerRef.current.corners, trackerRef.current.presence, newTime);
        }
      }
    }
  };

  // Robust, Reliable Export with Guaranteed Completion & Auto-Stop
  const handleExport = async () => {
    const canvas = canvasRef.current;
    const orig = origRef.current;
    const sty = styRef.current;

    if (!canvas || !orig || !sty || isExporting) return;

    setIsExporting(true);
    isExportingRef.current = true;
    setStatusMessage("Recording composite video for download... please wait.");

    // Pause any current playback
    orig.pause();
    sty.pause();
    setIsPlaying(false);
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    orig.currentTime = 0;
    sty.currentTime = 0;
    setCurrentTime(0);
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
      videoBitsPerSecond: 8_000_000,
    });

    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    let completed = false;
    const finishExport = () => {
      if (completed) return;
      completed = true;

      // 1. Instantly STOP and PAUSE all playback so video never plays automatically!
      orig.pause();
      sty.pause();
      orig.currentTime = 0;
      sty.currentTime = 0;
      setCurrentTime(0);
      setIsPlaying(false);

      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }

      // 2. Stop media recorder
      if (recorder.state !== "inactive") {
        recorder.stop();
      }

      // 3. Reset canvas to initial frame
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(orig, 0, 0, canvas.width, canvas.height);
      }
    };

    recorder.onstop = () => {
      const ext = isMp4 ? "mp4" : "webm";
      const blob = new Blob(chunks, { type: isMp4 ? "video/mp4" : "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `frameverse-finger-frame-${styleName.toLowerCase()}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setIsExporting(false);
      isExportingRef.current = false;
      setStatusMessage("Export complete! Video downloaded. Click Play to watch.");
    };

    recorder.start();

    // Determine target duration for ending export
    const targetDuration =
      isFinite(duration) && duration > 0
        ? duration
        : isFinite(sty.duration) && sty.duration > 0
        ? sty.duration
        : isFinite(orig.duration) && orig.duration > 0
        ? orig.duration
        : 10;

    // Watch for end of playback to stop recording & stop video
    orig.onended = finishExport;
    const checkInterval = setInterval(() => {
      if (!isExportingRef.current) {
        clearInterval(checkInterval);
        return;
      }
      if (orig.ended || orig.currentTime >= targetDuration - 0.1) {
        clearInterval(checkInterval);
        finishExport();
      }
    }, 100);

    try {
      await Promise.all([orig.play(), sty.play()]);
      animFrameIdRef.current = requestAnimationFrame(renderFrame);
    } catch (e) {
      console.error("Export play error:", e);
      finishExport();
    }
  };

  return (
    <div className="compositor-section">
      <div className="compositor-header">
        <h2>Finger Frame AI Result</h2>
        <span className="style-badge">{styleName.toUpperCase()} STYLE</span>
      </div>

      <p className="compositor-status">{statusMessage}</p>

      {/* Hidden synchronized source videos with crossOrigin support */}
      <video
        ref={origRef}
        src={originalVideoUrl}
        playsInline
        muted
        crossOrigin="anonymous"
        preload="auto"
        style={{ display: "none" }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (isFinite(v.duration) && v.duration > 0 && duration <= 0) {
            setDuration(v.duration);
          }
        }}
      />
      <video
        ref={styRef}
        src={stylizedVideoUrl}
        playsInline
        muted
        crossOrigin="anonymous"
        preload="auto"
        style={{ display: "none" }}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (isFinite(v.duration) && v.duration > 0) {
            setDuration(v.duration);
          }
        }}
      />

      <div className="compositor-canvas-container">
        <canvas ref={canvasRef} className="compositor-canvas" />
      </div>

      {/* Playback Timeline & Scrubber - Always display clean finite duration */}
      <div className="timeline-container">
        <span className="time-display">{currentTime.toFixed(1)}s</span>
        <input
          type="range"
          className="timeline-slider"
          min={0}
          max={isFinite(duration) && duration > 0 ? duration : 10}
          step={0.05}
          value={Math.min(currentTime, isFinite(duration) && duration > 0 ? duration : 10)}
          onChange={handleSeek}
          disabled={isExporting}
        />
        <span className="time-display">
          {isFinite(duration) && duration > 0 ? `${duration.toFixed(1)}s` : "--"}
        </span>
      </div>

      {/* Controls */}
      <div className="compositor-controls">
        <button
          className="secondary-button"
          onClick={onReset}
          disabled={isExporting}
        >
          Record / Upload Another
        </button>

        <button
          className="secondary-button"
          onClick={handleReplay}
          disabled={!isReady || isExporting}
        >
          🔄 Replay
        </button>

        <button
          className="primary-button"
          onClick={handlePlayPause}
          disabled={!isReady || isExporting}
        >
          {isPlaying ? "⏸️ Pause" : "▶️ Play"}
        </button>

        <button
          className="export-button"
          onClick={handleExport}
          disabled={!isReady || isExporting}
        >
          {isExporting ? "⏳ Exporting..." : "⬇️ Export Video"}
        </button>
      </div>
    </div>
  );
}
