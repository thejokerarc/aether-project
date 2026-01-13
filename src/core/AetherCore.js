/**
 * AETHER CORE - Particle Engine
 * Refactored from particles.html with 150,000 particles
 * Visual states: BOOT, AUTH_FACE, IDLE, ACTION
 */

import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class AetherCore {
    constructor(container, options = {}) {
        this.container = container;
        this.particleCount = 150000;
        this.currentState = 'BOOT';
        this.handPos = { x: 0, y: 0, z: 0 };
        this.activeGesture = 'NONE';
        this.voiceAmplitude = 0.0;
        this.audioContext = null;
        this.analyser = null;
        this.audioData = null;
        
        // Visual state parameters
        this.stateParams = {
            BOOT: { lerpSpeed: 0.02, scale: 1.0 },
            AUTH_FACE: { lerpSpeed: 0.15, scale: 1.0 },
            IDLE: { lerpSpeed: 0.08, scale: 1.0 },
            ACTION: { lerpSpeed: 0.2, scale: 1.0 }
        };

        // Initialize Three.js
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 30;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x000000, 0);
        this.container.appendChild(this.renderer.domElement);

        // Initialize particle system
        this.initParticles();
        
        // Initialize HUD rings
        this.initHUDRings();
        
        // Initialize audio
        this.initAudio();
        
        // Listen for auth event
        window.addEventListener('global_auth_event', (e) => {
            this.triggerAuthExplosion();
        });

        // Bridge sync - poll bridge.json for state updates
        this.bridgeSyncInterval = setInterval(() => this.syncWithBridge(), 100);

        // Animation loop
        this.clock = new THREE.Clock();
        this.animate();

        // Handle resize
        window.addEventListener('resize', () => this.handleResize());
    }

    async syncWithBridge() {
        try {
            const response = await fetch('/bridge.json');
            const bridge = await response.json();
            
            // Update state from bridge
            if (bridge.status) {
                const stateMap = {
                    'INITIALIZING': 'BOOT',
                    'AUTH_PENDING': 'AUTH_FACE',
                    'ONLINE': 'IDLE',
                    'LISTENING': 'ACTION'
                };
                const newState = stateMap[bridge.status] || 'BOOT';
                if (newState !== this.currentState) {
                    this.setState(newState);
                }
            }

            // Update hand position
            if (bridge.hand_pos) {
                this.updateHandPosition(bridge.hand_pos);
            }

            // Update gesture
            if (bridge.active_gesture) {
                this.activeGesture = bridge.active_gesture;
            }

            // Update voice amplitude
            if (bridge.voice_amplitude !== undefined) {
                this.updateVoiceAmplitude(bridge.voice_amplitude);
            }
        } catch (e) {
            // Bridge file not available yet, continue
        }
    }

    initParticles() {
        this.geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const colors = new Float32Array(this.particleCount * 3);
        this.targetPositions = new Float32Array(this.particleCount * 3);
        this.velocities = new Float32Array(this.particleCount * 3);

        // Initialize random positions (BOOT state - scattered static)
        for (let i = 0; i < this.particleCount * 3; i++) {
            positions[i] = (Math.random() - 0.5) * 200; // Wider spread for BOOT
            colors[i] = Math.random() * 0.5 + 0.5; // Random brightness
            this.velocities[i] = 0;
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // Create glow texture (neon cyan style)
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, '#00ffff'); // Neon cyan center
        grad.addColorStop(0.3, 'rgba(0, 255, 255, 0.8)');
        grad.addColorStop(0.6, 'rgba(0, 200, 255, 0.4)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 64, 64);
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;

        this.material = new THREE.PointsMaterial({
            size: 0.3,
            map: texture,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true,
            opacity: 0.9
        });

        this.particleSystem = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.particleSystem);
    }

    initHUDRings() {
        // Create circular HUD rings that orbit hand landmarks
        this.hudRings = [];
        const ringGeometry = new THREE.RingGeometry(2, 2.5, 64);
        
        // Neon cyan material with gradient
        const ringMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });

        // Create 3 rings at different angles
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(ringGeometry, ringMaterial.clone());
            ring.rotation.x = Math.PI / 2;
            ring.position.set(0, 0, -20); // Start off-screen
            this.scene.add(ring);
            this.hudRings.push({
                mesh: ring,
                angle: (i / 3) * Math.PI * 2,
                speed: 0.02 + i * 0.01
            });
        }
    }

    initAudio() {
        // Initialize Web Audio API for voice sync
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.audioData = new Uint8Array(this.analyser.frequencyBinCount);
        } catch (e) {
            console.warn('Web Audio API not available:', e);
        }
    }

    setState(newState) {
        if (this.currentState !== newState) {
            this.currentState = newState;
            this.updateTargetsForState();
        }
    }

    updateTargetsForState() {
        const posAttribute = this.geometry.attributes.position;
        const colorAttribute = this.geometry.attributes.color;

        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;
            let target = { x: 0, y: 0, z: 0 };
            let color = { r: 0, g: 1, b: 1 }; // Default neon cyan

            switch (this.currentState) {
                case 'BOOT':
                    // Scattered static - random positions
                    target = {
                        x: (Math.random() - 0.5) * 200,
                        y: (Math.random() - 0.5) * 200,
                        z: (Math.random() - 0.5) * 200
                    };
                    color = { r: Math.random(), g: Math.random(), b: Math.random() };
                    break;

                case 'AUTH_FACE':
                    // Converge into 3D face mask
                    // Create a face-like structure (ellipsoid with features)
                    const faceAngle = (i / this.particleCount) * Math.PI * 2;
                    const faceRadius = 8 + Math.sin(faceAngle * 3) * 2;
                    target = {
                        x: Math.cos(faceAngle) * faceRadius * 0.8,
                        y: Math.sin(faceAngle) * faceRadius * 1.2,
                        z: (Math.random() - 0.5) * 3
                    };
                    // Add eye-like indentations
                    if (i % 1000 < 100) {
                        target.x *= 0.7;
                        target.y *= 0.7;
                    }
                    color = { r: 0, g: 0.8, b: 1 };
                    break;

                case 'IDLE':
                    // Jarvis Core - pulsing sphere
                    const phi = Math.acos(-1 + (2 * i) / this.particleCount);
                    const theta = Math.sqrt(this.particleCount * Math.PI) * phi;
                    const r = 10;
                    target = {
                        x: r * Math.cos(theta) * Math.sin(phi),
                        y: r * Math.sin(theta) * Math.sin(phi),
                        z: r * Math.cos(phi)
                    };
                    // Vibrate based on audio
                    const vibrate = this.voiceAmplitude * 2;
                    target.x += (Math.random() - 0.5) * vibrate;
                    target.y += (Math.random() - 0.5) * vibrate;
                    target.z += (Math.random() - 0.5) * vibrate;
                    color = { r: 0, g: 1, b: 1 };
                    break;

                case 'ACTION':
                    // Stream from core to hand
                    const progress = i / this.particleCount;
                    const corePos = {
                        x: 0,
                        y: 0,
                        z: 0
                    };
                    target = {
                        x: THREE.MathUtils.lerp(corePos.x, this.handPos.x * 30, progress),
                        y: THREE.MathUtils.lerp(corePos.y, this.handPos.y * 30, progress),
                        z: THREE.MathUtils.lerp(corePos.z, this.handPos.z * 30, progress)
                    };
                    // Add stream turbulence
                    const streamNoise = Math.sin(progress * Math.PI * 10 + this.clock.getElapsedTime() * 2) * 0.5;
                    target.x += streamNoise;
                    target.y += streamNoise * 0.5;
                    color = { r: 0, g: 1, b: 1 };
                    break;
            }

            this.targetPositions[i3] = target.x;
            this.targetPositions[i3 + 1] = target.y;
            this.targetPositions[i3 + 2] = target.z;

            // Update colors
            colorAttribute.array[i3] = color.r;
            colorAttribute.array[i3 + 1] = color.g;
            colorAttribute.array[i3 + 2] = color.b;
        }

        colorAttribute.needsUpdate = true;
    }

    updateHandPosition(handPos) {
        this.handPos = handPos;
        // Update HUD rings to orbit hand position
        const worldHandPos = {
            x: handPos.x * 30,
            y: handPos.y * 30,
            z: handPos.z * 30
        };

        this.hudRings.forEach((ring, i) => {
            ring.angle += ring.speed;
            const radius = 5;
            ring.mesh.position.x = worldHandPos.x + Math.cos(ring.angle) * radius;
            ring.mesh.position.y = worldHandPos.y + Math.sin(ring.angle) * radius;
            ring.mesh.position.z = worldHandPos.z;
            ring.mesh.lookAt(worldHandPos.x, worldHandPos.y, worldHandPos.z);
        });
    }

    updateVoiceAmplitude(amplitude) {
        this.voiceAmplitude = amplitude;
    }

    triggerAuthExplosion() {
        // Explosion effect when auth succeeds
        const posAttribute = this.geometry.attributes.position;
        const explosionForce = 50;

        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;
            // Add explosion velocity
            const direction = new THREE.Vector3(
                posAttribute.array[i3],
                posAttribute.array[i3 + 1],
                posAttribute.array[i3 + 2]
            ).normalize();

            this.velocities[i3] = direction.x * explosionForce;
            this.velocities[i3 + 1] = direction.y * explosionForce;
            this.velocities[i3 + 2] = direction.z * explosionForce;
        }

        // Transition to IDLE after explosion
        setTimeout(() => {
            this.setState('IDLE');
        }, 1000);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const time = this.clock.getElapsedTime();
        const params = this.stateParams[this.currentState];
        const posAttribute = this.geometry.attributes.position;
        const colorAttribute = this.geometry.attributes.color;

        // Update audio analysis if available
        if (this.analyser && this.audioContext.state === 'running') {
            this.analyser.getByteFrequencyData(this.audioData);
            const avgAmplitude = this.audioData.reduce((a, b) => a + b, 0) / this.audioData.length;
            this.voiceAmplitude = avgAmplitude / 255;
        }

        // Animate particles
        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;

            // Get target position
            let tx = this.targetPositions[i3];
            let ty = this.targetPositions[i3 + 1];
            let tz = this.targetPositions[i3 + 2];

            // Apply state-specific transformations
            if (this.currentState === 'IDLE') {
                // Pulsing effect
                const pulse = Math.sin(time * 2) * 0.2 + 1;
                tx *= pulse;
                ty *= pulse;
                tz *= pulse;

                // Vibration from audio
                const vibrate = this.voiceAmplitude * 2;
                tx += (Math.random() - 0.5) * vibrate;
                ty += (Math.random() - 0.5) * vibrate;
                tz += (Math.random() - 0.5) * vibrate;
            }

            // Apply velocities (for explosion)
            if (this.velocities[i3] !== 0 || this.velocities[i3 + 1] !== 0 || this.velocities[i3 + 2] !== 0) {
                posAttribute.array[i3] += this.velocities[i3] * 0.016;
                posAttribute.array[i3 + 1] += this.velocities[i3 + 1] * 0.016;
                posAttribute.array[i3 + 2] += this.velocities[i3 + 2] * 0.016;

                // Dampen velocities
                this.velocities[i3] *= 0.95;
                this.velocities[i3 + 1] *= 0.95;
                this.velocities[i3 + 2] *= 0.95;
            }

            // Lerp towards target
            posAttribute.array[i3] += (tx - posAttribute.array[i3]) * params.lerpSpeed;
            posAttribute.array[i3 + 1] += (ty - posAttribute.array[i3 + 1]) * params.lerpSpeed;
            posAttribute.array[i3 + 2] += (tz - posAttribute.array[i3 + 2]) * params.lerpSpeed;

            // Update colors based on audio (for IDLE state)
            if (this.currentState === 'IDLE' && this.voiceAmplitude > 0) {
                const brightness = 0.5 + this.voiceAmplitude * 0.5;
                colorAttribute.array[i3] = 0;
                colorAttribute.array[i3 + 1] = brightness;
                colorAttribute.array[i3 + 2] = brightness;
            }
        }

        // Rotate particle system (gentle rotation)
        this.particleSystem.rotation.y += 0.005;
        this.particleSystem.rotation.z = Math.sin(time * 0.2) * 0.05;

        posAttribute.needsUpdate = true;
        colorAttribute.needsUpdate = true;

        this.renderer.render(this.scene, this.camera);
    }

    handleResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Public method to connect audio source
    connectAudioSource(audioSource) {
        if (this.audioContext && this.analyser) {
            try {
                const source = this.audioContext.createMediaStreamSource(audioSource);
                source.connect(this.analyser);
            } catch (e) {
                console.warn('Could not connect audio source:', e);
            }
        }
    }

    // Cleanup
    dispose() {
        if (this.bridgeSyncInterval) {
            clearInterval(this.bridgeSyncInterval);
        }
        this.renderer.dispose();
        this.geometry.dispose();
        this.material.dispose();
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}
