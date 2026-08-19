import { useEffect, useRef } from "react";

type CameraViewProps = {
    stream: MediaStream | null;
    isCameraOpen: boolean;
    isRecording: boolean;
    countdown: number | null;
    elapsedSeconds: number;
    onOpenCamera: () => void;
    onStartRecording: () => void;
    onStopRecording: () => void;
};

export default function CameraView({
    stream,
    isCameraOpen,
    isRecording,
    countdown,
    elapsedSeconds,
    onOpenCamera,
    onStartRecording,
    onStopRecording,
}: CameraViewProps) {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!videoRef.current) return;

        videoRef.current.srcObject = stream;

        if (stream) {
            videoRef.current.play().catch(() => { });
        }
    }, [stream]);

    return (
        <div className="camera-section">
            <div
                className={`camera-pane ${isCameraOpen ? "camera-open" : ""}`}
                onClick={!isCameraOpen ? onOpenCamera : undefined}
            >
                {isCameraOpen && stream ? (
                    <>
                        <video
                            ref={videoRef}
                            className="camera-video"
                            autoPlay
                            muted
                            playsInline
                        />

                        {countdown !== null && (
                            <div className="countdown-overlay">
                                {countdown}
                            </div>
                        )}

                        {isRecording && (
                            <div className="recording-indicator">
                                <span className="recording-dot" />
                                REC {elapsedSeconds}s / 30s
                            </div>
                        )}
                    </>
                ) : (
                    <div className="camera-placeholder">
                        <span>Click to open camera</span>
                    </div>
                )}
            </div>

            {/* Controls are deliberately BELOW the camera pane */}
            <div className="camera-controls">
                {!isCameraOpen && (
                    <button
                        className="primary-button"
                        onClick={onOpenCamera}
                    >
                        Open Camera
                    </button>
                )}

                {isCameraOpen && !isRecording && countdown === null && (
                    <button
                        className="primary-button"
                        onClick={onStartRecording}
                    >
                        Start Recording
                    </button>
                )}

                {isRecording && countdown === null && (
                    <button
                        className="danger-button"
                        onClick={onStopRecording}
                    >
                        Stop Recording
                    </button>
                )}
            </div>
        </div>
    );
}