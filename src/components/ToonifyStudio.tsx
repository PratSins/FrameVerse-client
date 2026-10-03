import { useState, useRef, useEffect } from "react";
import CameraView from "./CameraView";
import CompositorView from "./CompositorView";
import { useAuth } from "../context/AuthContext";
import {
  createUploadUrl,
  uploadVideoToGCS,
  startProcessing,
  pollJobUntilComplete,
} from "../services/api";

const MAX_RECORDING_SECONDS = 30;

const STYLES = [
  { id: "anime", label: "✨ Anime Style" },
  { id: "cyberpunk", label: "🌆 Cyberpunk 2077" },
  { id: "claymation", label: "🗿 Claymation / Stop-Motion" },
  { id: "watercolor", label: "🎨 Watercolor Painting" },
  { id: "pixelart", label: "👾 8-Bit Pixel Art" },
  { id: "comicbook", label: "💥 Vintage Comic Book" },
];

export default function ToonifyStudio() {
  const { accessToken, openAuthModal } = useAuth();

  // Camera & Recording state
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Video state
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | File | null>(null);
  const [selectedStyle, setSelectedStyle] = useState("anime");

  // Conversion state
  const [isConverting, setIsConverting] = useState(false);
  const [conversionStep, setConversionStep] = useState<string>("Initializing...");
  const [conversionError, setConversionError] = useState<string | null>(null);

  // Completed result state
  const [stylizedVideoUrl, setStylizedVideoUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);

  // --------------------------------------------------
  // Camera Controls
  // --------------------------------------------------
  const openCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      setStream(mediaStream);
      setCameraOpen(true);
    } catch (err) {
      console.error("Camera access denied:", err);
      alert("Unable to access camera. Please check permissions.");
    }
  };

  const closeCamera = () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setCameraOpen(false);
    setIsRecording(false);
    setCountdown(null);
    setElapsedSeconds(0);
  };

  // --------------------------------------------------
  // Recording Flow
  // --------------------------------------------------
  const beginActualRecording = () => {
    if (!stream) return;

    chunksRef.current = [];
    setRecordedVideoUrl(null);
    setRecordedVideoBlob(null);

    const recorder = new MediaRecorder(stream, {
      mimeType: "video/webm;codecs=vp8,opus",
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      setRecordedVideoBlob(blob);
      setRecordedVideoUrl(url);
      closeCamera();
    };

    recorder.start(1000);
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    setElapsedSeconds(0);

    recordingTimerRef.current = window.setInterval(() => {
      setElapsedSeconds((prev) => {
        if (prev + 1 >= MAX_RECORDING_SECONDS) {
          stopRecording();
          return MAX_RECORDING_SECONDS;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const startRecording = () => {
    if (!stream || isRecording || countdown !== null) return;

    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    // 3-second countdown BEFORE recording begins
    let count = 3;
    setCountdown(count);

    countdownTimerRef.current = window.setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        if (countdownTimerRef.current !== null) {
          window.clearInterval(countdownTimerRef.current);
          countdownTimerRef.current = null;
        }
        setCountdown(null);
        beginActualRecording();
      }
    }, 1000);
  };

  const stopRecording = () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);

    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecording(false);
  };

  // --------------------------------------------------
  // File Upload Fallback
  // --------------------------------------------------
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setRecordedVideoBlob(file);
    setRecordedVideoUrl(url);
    setCameraOpen(false);
  };

  // --------------------------------------------------
  // AI Conversion Pipeline
  // --------------------------------------------------
  const handleConvertVideo = async () => {
    if (!recordedVideoBlob) return;

    setIsConverting(true);
    setConversionError(null);
    setConversionStep("Requesting secure upload authorization...");

    try {
      const contentType = recordedVideoBlob.type || "video/mp4";

      // 1. Request signed URL from backend
      setConversionStep("Getting direct Cloud Storage upload authorization...");
      const uploadData = await createUploadUrl(contentType, selectedStyle, accessToken);

      // 2. Upload video directly to Google Cloud Storage
      setConversionStep("Uploading video to Google Cloud Storage...");
      await uploadVideoToGCS(uploadData.upload_url, recordedVideoBlob, contentType);

      // 3. Trigger processing pipeline on backend
      setConversionStep("Triggering Gemini Omni Flash video pipeline...");
      await startProcessing(uploadData.job_id, accessToken);

      // 4. Poll until job is completed
      setConversionStep("AI model is initializing video processing...");
      const completedJob = await pollJobUntilComplete(
        uploadData.job_id,
        accessToken,
        (job) => {
          if (job.status === "processing") {
            setConversionStep("AI model is currently generating stylized video frames...");
          }
        }
      );

      if (completedJob.download_url) {
        setStylizedVideoUrl(completedJob.download_url);
      } else {
        throw new Error("Conversion succeeded but no download URL was returned.");
      }
    } catch (err: unknown) {
      console.error("Conversion failed:", err);
      const message = err instanceof Error ? err.message : "Unknown error occurred";
      setConversionError(message);
      if (message.toLowerCase().includes("logged in") || message.toLowerCase().includes("sign in")) {
        openAuthModal("Your session expired. Please sign in to toonify your videos.");
      }
    } finally {
      setIsConverting(false);
      setConversionStep("");
    }
  };

  const handleReset = () => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    stream?.getTracks().forEach((track) => track.stop());

    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
    }

    setRecordedVideoUrl(null);
    setRecordedVideoBlob(null);
    setStylizedVideoUrl(null);
    setStream(null);
    setCameraOpen(false);
    setIsRecording(false);
    setIsConverting(false);
    setConversionStep("");
    setConversionError(null);
    setCountdown(null);
    setElapsedSeconds(0);

    mediaRecorderRef.current = null;
    chunksRef.current = [];
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current !== null) {
        window.clearInterval(countdownTimerRef.current);
      }
      if (recordingTimerRef.current !== null) {
        window.clearInterval(recordingTimerRef.current);
      }
      stream?.getTracks().forEach((track) => track.stop());
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
    };
  }, [stream, recordedVideoUrl]);

  return (
    <>
      <header className="hero">
        <h1>FrameVerse Studio</h1>
        <p>Turn your videos into something extraordinary with Finger Frame AI.</p>
      </header>

      <section className="video-card">
        {/* Case 1: Result ready with Compositor View */}
        {stylizedVideoUrl && recordedVideoUrl ? (
          <CompositorView
            originalVideoUrl={recordedVideoUrl}
            stylizedVideoUrl={stylizedVideoUrl}
            styleName={selectedStyle}
            onReset={handleReset}
          />
        ) : !recordedVideoUrl ? (
          /* Case 2: Camera Recording or File Upload */
          <>
            <CameraView
              stream={stream}
              isCameraOpen={cameraOpen}
              isRecording={isRecording}
              countdown={countdown}
              elapsedSeconds={elapsedSeconds}
              onOpenCamera={openCamera}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
            />

            {!cameraOpen && (
              <>
                <div className="or-divider">
                  <span>OR</span>
                </div>

                <label className="upload-button">
                  Upload Video
                  <input
                    type="file"
                    accept="video/*"
                    onChange={handleFileUpload}
                    hidden
                  />
                </label>
              </>
            )}
          </>
        ) : (
          /* Case 3: Video Recorded, Ready for Style Selection & Conversion */
          <div className="preview-container">
            <video
              className="recorded-preview"
              src={recordedVideoUrl}
              controls
              playsInline
            />

            {/* Style Selector */}
            <div className="style-selection-box">
              <label htmlFor="style-select">Choose AI Style:</label>
              <select
                id="style-select"
                className="style-dropdown"
                value={selectedStyle}
                disabled={isConverting}
                onChange={(e) => setSelectedStyle(e.target.value)}
              >
                {STYLES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Progress indicator during conversion */}
            {isConverting && (
              <div className="conversion-progress-box">
                <div className="progress-spinner" />
                <p className="progress-text">{conversionStep}</p>
                <span className="progress-subtext">This uses Gemini Omni Flash video-to-video editing.</span>
              </div>
            )}

            {conversionError && (
              <div className="conversion-error-box" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                <p style={{ margin: 0 }}>⚠️ {conversionError}</p>
                {(conversionError.toLowerCase().includes("logged in") || conversionError.toLowerCase().includes("sign in")) && (
                  <button
                    className="secondary-button"
                    onClick={() => openAuthModal("Please sign in to toonify your videos.")}
                    style={{ padding: "6px 14px", fontSize: "13px", background: "#ea4335", color: "#fff", borderColor: "#ea4335" }}
                  >
                    Sign In
                  </button>
                )}
              </div>
            )}

            <div className="video-actions">
              <button
                className="secondary-button"
                onClick={handleReset}
                disabled={isConverting}
              >
                Record / Upload Another
              </button>

              <button
                className="primary-button"
                onClick={handleConvertVideo}
                disabled={isConverting}
              >
                {isConverting ? "Processing..." : "Convert Video"}
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
