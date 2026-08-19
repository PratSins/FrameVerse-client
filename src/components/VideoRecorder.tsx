import { useEffect, useRef } from "react";
import { useVideoRecorder } from "../hooks/useVideoRecorder";

type VideoRecorderProps = {
    onRecordingComplete: (blob: Blob) => void;
};

export default function VideoRecorder({
    onRecordingComplete,
}: VideoRecorderProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    const {
        isRecording,
        recordingTime,
        recordedBlob,
        error,
        startRecording,
        stopRecording,
        resetRecording,
    } = useVideoRecorder();

    useEffect(() => {
        if (!videoRef.current || !recordedBlob) {
            return;
        }

        const url = URL.createObjectURL(recordedBlob);
        videoRef.current.src = url;

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [recordedBlob]);

    useEffect(() => {
        if (recordedBlob) {
            onRecordingComplete(recordedBlob);
        }
    }, [recordedBlob, onRecordingComplete]);

    return (
        <div className="recorder">
            <div className="video-container">
                {recordedBlob ? (
                    <video
                        ref={videoRef}
                        className="video-preview"
                        controls
                        playsInline
                    />
                ) : (
                    <div className="camera-placeholder">
                        <span>Camera preview</span>
                    </div>
                )}

                {isRecording && (
                    <div className="recording-indicator">
                        <span className="recording-dot" />
                        REC {recordingTime}s / 30s
                    </div>
                )}
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="recorder-actions">
                {!isRecording && !recordedBlob && (
                    <button className="primary-button" onClick={startRecording}>
                        Start Recording
                    </button>
                )}

                {isRecording && (
                    <button className="danger-button" onClick={stopRecording}>
                        Stop Recording
                    </button>
                )}

                {recordedBlob && !isRecording && (
                    <button className="secondary-button" onClick={resetRecording}>
                        Record Again
                    </button>
                )}
            </div>
        </div>
    );
}