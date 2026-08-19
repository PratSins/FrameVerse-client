import { useEffect, useRef, useState } from "react";

const MAX_RECORDING_TIME = 30;

export function useVideoRecorder() {
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const timerRef = useRef<number | null>(null);

    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);

    const startRecording = async () => {
        try {
            setError(null);
            setRecordedBlob(null);
            setRecordingTime(0);

            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true,
            });

            streamRef.current = stream;

            const mimeTypes = [
                "video/webm;codecs=vp9,opus",
                "video/webm;codecs=vp8,opus",
                "video/webm",
            ];

            const supportedMimeType = mimeTypes.find((type) =>
                MediaRecorder.isTypeSupported(type)
            );

            const recorder = supportedMimeType
                ? new MediaRecorder(stream, { mimeType: supportedMimeType })
                : new MediaRecorder(stream);

            const chunks: Blob[] = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunks.push(event.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(chunks, {
                    type: recorder.mimeType || "video/webm",
                });

                setRecordedBlob(blob);

                stream.getTracks().forEach((track) => track.stop());

                if (timerRef.current !== null) {
                    window.clearInterval(timerRef.current);
                    timerRef.current = null;
                }
            };

            recorder.onerror = () => {
                setError("Something went wrong while recording.");
            };

            mediaRecorderRef.current = recorder;

            recorder.start();
            setIsRecording(true);

            timerRef.current = window.setInterval(() => {
                setRecordingTime((previous) => {
                    const next = previous + 1;

                    if (next >= MAX_RECORDING_TIME) {
                        stopRecording();
                    }

                    return next;
                });
            }, 1000);
        } catch (err) {
            console.error(err);
            setError("Unable to access your camera and microphone.");
        }
    };

    const stopRecording = () => {
        const recorder = mediaRecorderRef.current;

        if (recorder && recorder.state !== "inactive") {
            recorder.stop();
        }

        setIsRecording(false);
    };

    const resetRecording = () => {
        setRecordedBlob(null);
        setRecordingTime(0);
        setError(null);
    };

    useEffect(() => {
        return () => {
            if (timerRef.current !== null) {
                window.clearInterval(timerRef.current);
            }

            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    return {
        isRecording,
        recordingTime,
        recordedBlob,
        error,
        startRecording,
        stopRecording,
        resetRecording,
    };
}