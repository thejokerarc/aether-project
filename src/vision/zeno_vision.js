
/**
 * ZENO VISION - Restored with Hands.js (particles2.html logic)
 */
const videoEl = document.getElementById('camera-feed');
const statusTextEl = document.getElementById('status-text');
const bootTextEl = document.getElementById('boot-text');

let hands;
let faceDetector; // We will use a simpler fallback or keep the tasks-vision for face
let authState = 'INITIALIZING';
let startTime = Date.now();
const VOICE_TIMEOUT = 10000;
const PASSWORD_TIMEOUT = 20000;

let passwordBuffer = "";
window.addEventListener('keydown', (e) => {
    if (authState === 'ONLINE') return;
    passwordBuffer += e.key.toLowerCase();
    if (passwordBuffer.endsWith('jarvis')) handleAuthSuccess('OVERRIDE');
    if (passwordBuffer.length > 20) passwordBuffer = passwordBuffer.substring(1);
});

async function initVision() {
    updateStatus("[BOOTING VISION ENGINE...]");

    // 1. Setup Hands (EXACTLY like particles2.html)
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    hands.onResults(onResults);

    // 2. Start Camera
    const camera = new Camera(videoEl, {
        onFrame: async () => {
            await hands.send({ image: videoEl });
        },
        width: 640,
        height: 480
    });

    camera.start().then(() => {
        updateStatus("[SENSORS ACTIVE]");
        authState = 'FACE_WAIT';
    }).catch(err => {
        console.error("Camera failed:", err);
        updateStatus("[HARDWARE ERROR]");
    });
}

function onResults(results) {
    const elapsed = Date.now() - startTime;

    // 1. Auth Transitions
    if (authState !== 'ONLINE') {
        if (authState === 'FACE_WAIT' && elapsed > VOICE_TIMEOUT) {
            authState = 'VOICE_WAIT';
            updateStatus("[VOICE SYNC ACTIVE]");
            initVoiceRecognition();
        }
        if (authState === 'VOICE_WAIT' && elapsed > PASSWORD_TIMEOUT) {
            authState = 'PASSWORD_WAIT';
            updateStatus("[MANUAL OVERRIDE READY]");
        }
    }

    // 2. Gesture Processing (EXACTLY from particles2.html)
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Auth Shortcut: If palm is very close to camera, consider it a face for now (or simple detector)
        if (authState === 'FACE_WAIT' && landmarks[0].z < -0.1) {
            handleAuthSuccess('BIOMETRIC');
        }

        // Calculation (Verbatim from particles2.html)
        const thumbTip = landmarks[4];
        const indexTip = landmarks[8];
        const distance = Math.sqrt(Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2));

        const handX = landmarks[9].x;
        const handY = landmarks[9].y;

        const indexUp = landmarks[8].y < landmarks[6].y;
        const middleUp = landmarks[12].y < landmarks[10].y;
        const ringDown = landmarks[16].y > landmarks[14].y;
        const pinkyDown = landmarks[20].y > landmarks[18].y;

        const isFist = !indexUp && !middleUp && ringDown && pinkyDown;
        const isVictory = indexUp && middleUp && ringDown && pinkyDown;

        // Dispatch to Global
        window.dispatchEvent(new CustomEvent('zeno-gesture', {
            detail: {
                handX, handY, pinchDistance: distance, isFist, isVictory
            }
        }));
    } else {
        // Idle state
        window.dispatchEvent(new CustomEvent('zeno-gesture', { detail: { idle: true } }));
    }
}

function handleAuthSuccess(method) {
    if (authState === 'ONLINE') return;
    authState = 'ONLINE';
    updateStatus("[ONLINE]");
    if (bootTextEl) bootTextEl.textContent = "CONNECTED";
    window.dispatchEvent(new CustomEvent('zeno-auth-success', { detail: { method } }));
}

function initVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.onresult = (e) => {
        const text = e.results[0][0].transcript.toLowerCase();
        if (text.includes("zeno") || text.includes("hello")) handleAuthSuccess('VOICE');
    };
    recognition.start();
}

function updateStatus(text) {
    if (statusTextEl) statusTextEl.textContent = text;
}

initVision();
