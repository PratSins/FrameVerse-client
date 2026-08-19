import type { ChangeEvent } from "react";

type VideoUploaderProps = {
    onVideoSelected: (file: File) => void;
};

const MAX_FILE_SIZE_MB = 100;

export default function VideoUploader({
    onVideoSelected,
}: VideoUploaderProps) {
    function handleChange(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];

        if (!file) {
            return;
        }

        if (!file.type.startsWith("video/")) {
            alert("Please select a video file.");
            return;
        }

        const maxSize = MAX_FILE_SIZE_MB * 1024 * 1024;

        if (file.size > maxSize) {
            alert(`Video must be smaller than ${MAX_FILE_SIZE_MB} MB.`);
            return;
        }

        onVideoSelected(file);

        event.target.value = "";
    }

    return (
        <div className="upload-section">
            <label className="upload-button">
                Upload Video
                <input
                    type="file"
                    accept="video/*"
                    onChange={handleChange}
                    hidden
                />
            </label>

            <p>Maximum video length: 30 seconds</p>
        </div>
    );
}