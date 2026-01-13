
/**
 * ZENO CORE - Literal Port of particles2.html
 */
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

export class ZenoCore {
    constructor(container) {
        this.container = container;
        this.particleCount = 12000;
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.particleCount * 3);
        this.colors = new Float32Array(this.particleCount * 3);
        this.targetPositions = new Float32Array(this.particleCount * 3);

        this.handExpansion = 1.0;
        this.handRotationY = 0;
        this.gestureDebounce = 0;
        this.currentShapeIndex = 0;
        this.shapes = ['Sphere', 'Heart', 'Saturn', 'Flower', 'Torus'];

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 30;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.container.appendChild(this.renderer.domElement);

        this.init();
        this.clock = new THREE.Clock();
        this.animate();

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    init() {
        for (let i = 0; i < this.particleCount * 3; i++) {
            this.positions[i] = (Math.random() - 0.5) * 100;
            this.colors[i] = 1;
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        grad.addColorStop(0, 'white');
        grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad; ctx.fillRect(0, 0, 32, 32);
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;

        this.material = new THREE.PointsMaterial({
            size: 0.5,
            map: texture,
            vertexColors: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            transparent: true
        });

        this.particleSystem = new THREE.Points(this.geometry, this.material);
        this.scene.add(this.particleSystem);
        this.updateTargets(this.shapes[0]);
    }

    // --- EXACT MATH FROM particles2.html ---
    getPointOnSphere(i) {
        const phi = Math.acos(-1 + (2 * i) / this.particleCount);
        const theta = Math.sqrt(this.particleCount * Math.PI) * phi;
        const r = 10;
        return { x: r * Math.cos(theta) * Math.sin(phi), y: r * Math.sin(theta) * Math.sin(phi), z: r * Math.cos(phi) };
    }

    getPointOnHeart(i) {
        const t = (i / this.particleCount) * Math.PI * 2;
        const xx = 16 * Math.pow(Math.sin(t), 3);
        const yy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        const z = (Math.random() - 0.5) * 5;
        return { x: xx * 0.8, y: yy * 0.8, z: z };
    }

    getPointOnSaturn(i) {
        const isRing = i > this.particleCount * 0.7;
        if (isRing) {
            const angle = Math.random() * Math.PI * 2;
            const distance = 14 + Math.random() * 8;
            return { x: Math.cos(angle) * distance, y: (Math.random() - 0.5) * 1, z: Math.sin(angle) * distance };
        } else {
            return this.getPointOnSphere(i);
        }
    }

    getPointOnFlower(i) {
        const k = 4;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        const rBase = 12 * Math.cos(k * theta);
        return { x: rBase * Math.sin(phi) * Math.cos(theta), y: rBase * Math.cos(phi), z: rBase * Math.sin(phi) * Math.sin(theta) };
    }

    getPointOnTorus(i) {
        const u = Math.random() * Math.PI * 2;
        const v = Math.random() * Math.PI * 2;
        const R = 10; const r = 4;
        return { x: (R + r * Math.cos(v)) * Math.cos(u), y: (R + r * Math.cos(v)) * Math.sin(u), z: r * Math.sin(v) };
    }

    updateTargets(shapeName) {
        for (let i = 0; i < this.particleCount; i++) {
            let p;
            if (shapeName === 'Sphere') p = this.getPointOnSphere(i);
            else if (shapeName === 'Heart') p = this.getPointOnHeart(i);
            else if (shapeName === 'Saturn') p = this.getPointOnSaturn(i);
            else if (shapeName === 'Flower') p = this.getPointOnFlower(i);
            else if (shapeName === 'Torus') p = this.getPointOnTorus(i);

            const i3 = i * 3;
            this.targetPositions[i3] = p.x;
            this.targetPositions[i3 + 1] = p.y;
            this.targetPositions[i3 + 2] = p.z;
        }
    }

    nextShape() {
        this.currentShapeIndex = (this.currentShapeIndex + 1) % this.shapes.length;
        this.updateTargets(this.shapes[this.currentShapeIndex]);
        this.material.color.setHex(0xffffff);
    }

    updateHandData(data) {
        if (data.idle) {
            this.handExpansion = THREE.MathUtils.lerp(this.handExpansion, 1.0, 0.05);
            this.handRotationY = THREE.MathUtils.lerp(this.handRotationY, 0.2, 0.05);
            return;
        }

        if (data.pinchDistance !== undefined) {
            this.handExpansion = THREE.MathUtils.mapLinear(data.pinchDistance, 0.05, 0.4, 0.5, 3.0);
            if (this.handExpansion < 0.1) this.handExpansion = 0.1;
            if (this.handExpansion > 4.0) this.handExpansion = 4.0;
        }

        if (data.handX !== undefined) {
            this.handRotationY = (data.handX - 0.5) * 4;
        }

        if (data.handY !== undefined) {
            this.material.color.setHSL(data.handY, 1.0, 0.5);
        }

        if (data.isFist) {
            this.handExpansion = 0.1;
        }

        if (data.isVictory) {
            if (Date.now() - this.gestureDebounce > 1500) {
                this.nextShape();
                this.gestureDebounce = Date.now();
            }
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const time = this.clock.getElapsedTime();

        this.particleSystem.rotation.y += 0.01 + (this.handRotationY * 0.05);
        this.particleSystem.rotation.z = Math.sin(time * 0.2) * 0.1;

        const posAttribute = this.geometry.attributes.position;
        for (let i = 0; i < this.particleCount; i++) {
            const i3 = i * 3;
            let tx = this.targetPositions[i3] * this.handExpansion;
            let ty = this.targetPositions[i3 + 1] * this.handExpansion;
            let tz = this.targetPositions[i3 + 2] * this.handExpansion;

            tx += Math.sin(time * 2 + i) * 0.1 * this.handExpansion;
            ty += Math.cos(time * 1.5 + i) * 0.1 * this.handExpansion;

            posAttribute.array[i3] += (tx - posAttribute.array[i3]) * 0.08;
            posAttribute.array[i3 + 1] += (ty - posAttribute.array[i3 + 1]) * 0.08;
            posAttribute.array[i3 + 2] += (tz - posAttribute.array[i3 + 2]) * 0.08;
        }

        posAttribute.needsUpdate = true;
        this.renderer.render(this.scene, this.camera);
    }
}
