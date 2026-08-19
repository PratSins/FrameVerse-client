import { useCallback, useEffect, useRef, useState } from "react";
import type { HandLandmarker } from "@mediapipe/tasks-vision";

import { createHandLandmarker } from "../lib/mediapipe";
import type { HandTrackingResult } from "../types/hand";

interface UseHandTrackingResult {
    results: HandTrackingResult | null;
    isLoading: boolean;
    error: string | null;
}

export function useHandTracking(
    videoRef: React.RefObject<HTMLVideoElement | null>,
): UseHandTrackingResult {
    const [results, setResults] = useState<HandTrackingResult | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const landmarkerRef = useRef<HandLandmarker | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const lastVideoTimeRef = useRef(-1);

    const detectHands = useCallback(() => {
        const video = videoRef.current;
        const landmarker = landmarkerRef.current;

        if (!video || !landmarker) {
            animationFrameRef.current =
                requestAnimationFrame(detectHands);
            return;
        }

        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            animationFrameRef.current =
                requestAnimationFrame(detectHands);
            return;
        }

        if (video.currentTime !== lastVideoTimeRef.current) {
            const result = landmarker.detectForVideo(
                video,
                performance.now(),
            );

            lastVideoTimeRef.current = video.currentTime;

            setResults(result);
        }

        animationFrameRef.current =
            requestAnimationFrame(detectHands);
    }, [videoRef]);

    useEffect(() => {
        let cancelled = false;

        async function initialize() {
            try {
                setIsLoading(true);
                setError(null);

                const landmarker = await createHandLandmarker();

                if (cancelled) {
                    return;
                }

                landmarkerRef.current = landmarker;
                setIsLoading(false);

                animationFrameRef.current =
                    requestAnimationFrame(detectHands);
            } catch (err) {
                console.error(err);

                if (!cancelled) {
                    setError("Failed to initialize hand tracking.");
                    setIsLoading(false);
                }
            }
        }

        initialize();

        return () => {
            cancelled = true;

            if (animationFrameRef.current !== null) {
                cancelAnimationFrame(animationFrameRef.current);
            }
        };
    }, [detectHands]);

    return {
        results,
        isLoading,
        error,
    };
}