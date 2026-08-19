import { useEffect, useRef, useState } from "react";
import CameraView from "./components/CameraView";

const MAX_RECORDING_SECONDS = 30;

function App() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [recordedVideo, setRecordedVideo] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);

  // --------------------------------------------------
  // Open camera
  // --------------------------------------------------

  const openCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      setStream(mediaStream);
      setCameraOpen(true);
    } catch (error) {
      console.error("Camera error:", error);
      alert(
        "Could not access your camera. Please allow camera access and try again."
      );
    }
  };

  // --------------------------------------------------
  // Start recording after 3-second countdown
  // --------------------------------------------------

  const startRecording = () => {
    if (!stream) return;

    setCountdown(3);

    let count = 3;

    const countdownTimer = window.setInterval(() => {
      count--;

      if (count === 0) {
        window.clearInterval(countdownTimer);
        setCountdown(null);
        beginRecording();
      } else {
        setCountdown(count);
      }
    }, 1000);
  };

  // --------------------------------------------------
  // Actually start MediaRecorder
  // --------------------------------------------------

  const beginRecording = () => {
    if (!stream) return;

    chunksRef.current = [];

    let mimeType = "";

    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
      mimeType = "video/webm;codecs=vp9,opus";
    } else if (MediaRecorder.isTypeSupported("video/webm")) {
      mimeType = "video/webm";
    }

    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType } : undefined
    );

    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "video/webm",
      });

      const videoUrl = URL.createObjectURL(blob);

      setRecordedVideo(videoUrl);
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
  // Record another video
  // --------------------------------------------------

  const recordAnother = () => {
    // Stop camera tracks
    stream?.getTracks().forEach((track) => track.stop());

    // Revoke old video URL
    if (recordedVideo) {
      URL.revokeObjectURL(recordedVideo);
    }

    // Reset everything
    setRecordedVideo(null);
    setStream(null);
    setCameraOpen(false);
    setIsRecording(false);
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

      if (recordedVideo) {
        URL.revokeObjectURL(recordedVideo);
      }
    };
  }, [stream, recordedVideo]);

  return (
    <main className="app">
      <header className="hero">
        <h1>FrameVerse</h1>
        <p>Turn your videos into something extraordinary.</p>
      </header>

      <section className="video-card">
        {!recordedVideo ? (
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
                    hidden
                  />
                </label>
              </>
            )}
          </>
        ) : (
          <div className="recorded-video-section">
            <h2>Your video</h2>

            <video
              className="recorded-video"
              src={recordedVideo}
              controls
              playsInline
            />

            <div className="video-actions">
              <button
                className="secondary-button"
                onClick={recordAnother}
              >
                Record Another
              </button>

              <button
                className="primary-button"
                onClick={() => {
                  console.log("Convert video:", recordedVideo);
                }}
              >
                Convert Video
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

export default App;