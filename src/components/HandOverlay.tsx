import { useEffect, useRef } from "react";
import type { HandTrackingResult } from "../types/hand";

interface HandOverlayProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    results: HandTrackingResult | null;
}

export function HandOverlay({
    videoRef,
    results,
}: HandOverlayProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;

        if (!canvas || !video) {
            return;
        }

        const context = canvas.getContext("2d");

        if (!context) {
            return;
        }

        const width = video.clientWidth;
        const height = video.clientHeight;

        canvas.width = width;
        canvas.height = height;

        context.clearRect(0, 0, width, height);

        if (!results?.landmarks) {
            return;
        }

        for (const landmarks of results.landmarks) {
            for (const landmark of landmarks) {
                const x = landmark.x * width;
                const y = landmark.y * height;

                context.beginPath();
                context.arc(x, y, 5, 0, Math.PI * 2);

                context.fillStyle = "#00ff88";
                context.fill();
            }
        }
    }, [results, videoRef]);

    return (
        <canvas
            ref={canvasRef}
            className="hand-overlay"
        />
    );
}