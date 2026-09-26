import { useEffect, useRef, useState } from "react";
import CameraView from "./components/CameraView";
import CompositorView from "./components/CompositorView";
import { Navbar, type ActiveTab } from "./components/Navbar";
import { LoginModal } from "./components/LoginModal";
import { VChatView } from "./components/VChat/VChatView";
import { AuthProvider, useAuth } from "./context/AuthContext";
import {
  createUploadUrl,
  uploadVideoToGCS,
  startProcessing,
  pollJobUntilComplete,
} from "./services/api";

const MAX_RECORDING_SECONDS = 30;

const STYLES = [
  { id: "anime", label: "✨ Anime Style" },
  { id: "3d", label: "🎬 3D Animated Character" },
  { id: "pixar", label: "🌟 Pixar Style" },
];

function FrameVerseApp() {
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState<ActiveTab>("toonify");

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
  const [conversionStep, setConversionStep] = useState<string>("");
  const [conversionError, setConversionError] = useState<string | null>(null);

  // Completed result state
  const [stylizedVideoUrl, setStylizedVideoUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // --------------------------------------------------
  // Open camera
  // --------------------------------------------------
  const openCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      setStream(mediaStream);
      setCameraOpen(true);
    } catch (error) {
      console.error("Camera error:", error);
      alert("Could not access your camera. Please allow camera access and try again.");
    }
  };

  // --------------------------------------------------
  // Start countdown -> start recording
  // --------------------------------------------------
  const startRecording = () => {
    setCountdown(3);
    let count = 3;

    const timer = window.setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else {
        window.clearInterval(timer);
        setCountdown(null);
        beginMediaRecorder();
      }
    }, 1000);
  };

  const beginMediaRecorder = () => {
    if (!stream) return;

    chunksRef.current = [];
    const mimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ];

    let chosenMime = "video/webm";
    for (const m of mimeTypes) {
      if (MediaRecorder.isTypeSupported(m)) {
        chosenMime = m;
        break;
      }
    }

    const recorder = new MediaRecorder(stream, { mimeType: chosenMime });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: chosenMime });
      const url = URL.createObjectURL(blob);
      setRecordedVideoUrl(url);
      setRecordedVideoBlob(blob);
      setIsRecording(false);
      setElapsedSeconds(0);
    };

    recorder.start();
    setIsRecording(true);
    setElapsedSeconds(0);

    let seconds = 0;
    recordingTimerRef.current = window.setInterval(() => {
      seconds++;
      setElapsedSeconds(seconds);
      if (seconds >= MAX_RECORDING_SECONDS) {
        stopRecording();
      }
    }, 1000);
  };

  // --------------------------------------------------
  // Stop recording
  // --------------------------------------------------
  const stopRecording = () => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setIsRecording(false);
  };

  // --------------------------------------------------
  // Handle File Upload from disk
  // --------------------------------------------------
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("Please select a valid video file.");
      return;
    }

    const url = URL.createObjectURL(file);
    setRecordedVideoUrl(url);
    setRecordedVideoBlob(file);
    e.target.value = "";
  };

  // --------------------------------------------------
  // Convert Video through Backend Vertex AI API
  // --------------------------------------------------
  const handleConvertVideo = async () => {
    if (!recordedVideoBlob) return;

    setIsConverting(true);
    setConversionError(null);

    try {
      // Step 1: Get signed GCS upload URL
      setConversionStep("Step 1/4: Requesting secure upload URL...");
      const contentType = recordedVideoBlob.type || "video/mp4";
      const uploadData = await createUploadUrl(contentType, selectedStyle, accessToken);

      // Step 2: Upload video to GCS
      setConversionStep("Step 2/4: Uploading video to Cloud Storage...");
      await uploadVideoToGCS(uploadData.upload_url, recordedVideoBlob, contentType);

      // Step 3: Trigger Vertex AI Processing
      setConversionStep("Step 3/4: Submitting video to Gemini Omni Flash...");
      await startProcessing(uploadData.job_id, accessToken);

      // Step 4: Poll until job is completed
      setConversionStep("Step 4/4: AI restyling video (preserving pose, motion & framing)...");
      const finishedJob = await pollJobUntilComplete(uploadData.job_id, (job) => {
        if (job.status === "processing") {
          setConversionStep("Step 4/4: Gemini Omni Flash is rendering video frames...");
        }
      });

      if (finishedJob.download_url) {
        setStylizedVideoUrl(finishedJob.download_url);
        setIsConverting(false);
      } else {
        throw new Error("Job completed but download URL was not provided.");
      }
    } catch (err: any) {
      console.error("Conversion error:", err);
      setConversionError(err.message || "Failed to convert video. Please try again.");
      setIsConverting(false);
    }
  };

  // --------------------------------------------------
  // Reset / Record Another
  // --------------------------------------------------
  const handleReset = () => {
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

  // --------------------------------------------------
  // Cleanup
  // --------------------------------------------------
  useEffect(() => {
    return () => {
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
    <div className="app-layout">
      {/* Top Navigation Bar */}
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Main Content Area */}
      <main className="app">
        {activeTab === "toonify" ? (
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
                /* Case 3: Video Preview & Style Selection */
                <div className="recorded-video-section">
                  <h2>Your video</h2>

                  <video
                    className="recorded-video"
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
                    <div className="conversion-error-box">
                      <p>⚠️ {conversionError}</p>
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
        ) : (
          /* vChat Live Rooms Tab */
          <VChatView />
        )}
      </main>

      {/* Auth Login Modal */}
      <LoginModal />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <FrameVerseApp />
    </AuthProvider>
  );
}

export default App;
