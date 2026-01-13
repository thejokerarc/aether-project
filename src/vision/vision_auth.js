
// Project Aether: Vision Auth Module (Antigravity)
import { FilesetResolver, FaceDetector, GestureRecognizer } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/+esm";

const STATE_FILE_PATH = '../../bridge.json'; // Relative path for conceptual fetching, in real app we might fetch from server or use local variable if simulated

// DOM Elements
const bootTextEl = document.getElementById('boot-text');
const videoEl = document.getElementById('camera-feed');
const promptEl = document.getElementById('prompt-message');

// State
let visionResult = null;
let lastVideoTime = -1;
let faceDetector = null;
let gestureRecognizer = null;
let isBooting = true;
let authTimeout = null;
let authState = 'INITIALIZING'; // INITIALIZING | AUTH_PENDING | ONLINE | LISTENING

async function typeText(text, element, speed = 50) {
    element.textContent = '';
    for (let i = 0; i < text.length; i++) {
        element.textContent += text.charAt(i);
        await new Promise(r => setTimeout(r, speed));
    }
}

async function updateBridge(data) {
    // In a real file-system based sync (which typical web apps can't do directly), 
    // we would POST to a server. For this prototype, we'll simulate it by logging 
    // and potentially using a server endpoint if Dyad sets it up.
    // For now, we will just keep local state and rely on events.
    // However, the prompt asks to "write to status.md and bridge.json".
    // Since this is client-side JS, we strictly cannot write to disk directly without a server.
    // We will assume the existence of a server endpoint '/api/bridge' that Dyad might set up, 
    // OR just use console logs and CustomEvents for the "Team" to see.
    // Given the constraints, I will fire a CustomEvent that a potential local server helper could pick up,
    // or just leave it as an internal state update for now until the Server is ready.
    console.log('[BRIDGE UPDATE]', data);

    // Dispatch event for other modules
    window.dispatchEvent(new CustomEvent('bridge-update', { detail: data }));
}

async function initializeVision() {
    console.log('Loading MediaPipe models...');
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    faceDetector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`,
            delegate: "GPU"
        },
        runningMode: "VIDEO"
    });

    gestureRecognizer = await GestureRecognizer.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
            delegate: "GPU"
        },
        runningMode: "VIDEO"
    });
    console.log('Models loaded.');
}

async function setupCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 1280, height: 720 }
        });
        videoEl.srcObject = stream;
        return new Promise((resolve) => {
            videoEl.onloadedmetadata = () => {
                videoEl.play();
                resolve();
            };
        });
    } catch (e) {
        console.error("Camera access denied or failed:", e);
        bootTextEl.textContent += "\n[ERROR: CAMERA INITIALIZATION FAILED]";
    }
}

function startAuthTimer() {
    console.log("Starting Auth Timer...");
    setTimeout(() => {
        if (authState !== 'ONLINE') { // If not yet authenticated
            console.log("Auth Timeout. Enforcing Fist Fallback.");
            promptEl.style.display = 'block';
            updateBridge({ auth_type: 'PENDING_FIST_OVERRIDE' });
        }
    }, 5000);
}

function handleAuthSuccess(method) {
    if (authState === 'ONLINE') return;

    authState = 'ONLINE';
    promptEl.style.display = 'none';
    bootTextEl.style.display = 'none'; // Clear boot text

    // Emit Shockwave Event
    const event = new CustomEvent('global_auth_event', { detail: { method } });
    window.dispatchEvent(event);
    console.log(`AUTH SUCCESS via ${method}. Emitting shockwave...`);

    updateBridge({
        status: 'ONLINE',
        auth_type: method
    });
}

async function renderLoop() {
    if (!faceDetector || !gestureRecognizer) {
        requestAnimationFrame(renderLoop);
        return;
    }

    if (videoEl.currentTime !== lastVideoTime) {
        lastVideoTime = videoEl.currentTime;

        // 1. Face Detection (Primary)
        if (authState !== 'ONLINE') {
            const faceResult = faceDetector.detectForVideo(videoEl, performance.now());
            if (faceResult.detections.length > 0) {
                // Check if we are NOT in the fallback mode (unless face recovers it? No, prompt implies fist needed if timeout)
                // Actually, usually FaceID is continuous. Let's say if we find a face, we auth.
                // Unless we strictly enforce "If no face in 5s, ONLY fist works".
                // Let's allow Face to recover if it appears? 
                // The prompt says: "If no face is found in 5 seconds, prompt...".
                // It doesn't explicitly say FaceID is disabled. But "Show fist for override" implies Fist is the expected way now.
                // For better UX, I'll allow both but prioritize Fist if prompt is up.

                // If prompt is NOT up yet, FaceID is valid.
                if (promptEl.style.display === 'none') {
                    handleAuthSuccess('FACE');
                }
            }
        }

        // 2. Gesture Recognition (Hand Tracking + Fist Fallback)
        const gestureResult = gestureRecognizer.recognizeForVideo(videoEl, performance.now());

        let handData = { x: 0, y: 0, z: 0 };
        let activeGesture = 'NONE';

        if (gestureResult.landmarks.length > 0) {
            const landmarks = gestureResult.landmarks[0]; // First hand
            // Simple center point approximation (approx wrist or mid-palm)
            handData = {
                x: landmarks[0].x,
                y: landmarks[0].y,
                z: landmarks[0].z
            };

            // Check gestures
            if (gestureResult.gestures.length > 0) {
                const topGesture = gestureResult.gestures[0][0]; // { categoryName, score }
                if (topGesture.categoryName === 'Closed_Fist') {
                    activeGesture = 'FIST';
                    // If we are waiting for override
                    if (promptEl.style.display !== 'none') {
                        handleAuthSuccess('FIST');
                    }
                } else if (topGesture.categoryName === 'Open_Palm') {
                    activeGesture = 'PALM';
                } else {
                    activeGesture = topGesture.categoryName;
                }
            }
        }

        // Continually update bridge with hand data if online
        if (authState === 'ONLINE') {
            updateBridge({
                status: 'ONLINE',
                hand_pos: handData,
                active_gesture: activeGesture
            });
        }
    }

    requestAnimationFrame(renderLoop);
}

async function run() {
    // 1. Boot Sequence
    await typeText('[AETHER_OS_V1.0: INITIALIZING]', bootTextEl, 50);

    // 2. Load Models & Camera (simultaneous to save time, or sequential to look cool? Let's do sequential for "loading" feel or minimal delay)
    await initializeVision();
    await setupCamera();

    // 3. Start Auth Timer
    startAuthTimer();

    // 4. Start Loop
    renderLoop();
}

// Start
run();
