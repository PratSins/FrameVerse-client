import type { VideoSource } from "../types/video";

type VideoPreviewProps = {
    video: VideoSource;
    onReset: () => void;
    onConvert: () => void;
};

export default function VideoPreview({
    video,
    onReset,
    onConvert,
}: VideoPreviewProps) {
    return (
        <section className="preview-section">
            <h2>Your video</h2>

            <video
                className="preview-video"
                src={video.url}
                controls
                playsInline
                preload="metadata"
            />

            <div className="preview-actions">
                <button
                    className="secondary-button"
                    onClick={onReset}
                    type="button"
                >
                    Record Another
                </button>

                <button
                    className="primary-button"
                    onClick={onConvert}
                    type="button"
                >
                    Convert Video
                </button>
            </div>
        </section>
    );
}