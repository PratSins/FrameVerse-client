import {
    FilesetResolver,
    HandLandmarker,
} from "@mediapipe/tasks-vision";

const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";

const MODEL_PATH = "/models/hand_landmarker.task";

let handLandmarker: HandLandmarker | null = null;

export async function createHandLandmarker(): Promise<HandLandmarker> {
    if (handLandmarker) {
        return handLandmarker;
    }

    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: MODEL_PATH,
        },

        runningMode: "VIDEO",

        numHands: 2,

        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
    });

    return handLandmarker;
}