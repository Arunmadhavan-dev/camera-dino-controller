/**
 * PoseController – Webcam + MoveNet pose detection + jump detection
 */
class PoseController {
    constructor(options = {}) {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.detector = null;
        this.stream = null;

        // Calibration
        this.isCalibrating = false;
        this.isCalibrated = false;
        this.calibrationSamples = [];
        this.baselineY = 0;

        // Jump detection
        this.yHistory = [];
        this.maxHistory = 50;
        this.jumpThreshold = options.jumpThreshold || 25;
        this.jumpCooldown = options.jumpCooldown || 500;
        this.minVelocity = 2;
        this.lastJumpTime = 0;

        // Callbacks
        this.onJump = options.onJump || (() => {});
        this.onStatus = options.onStatus || (() => {});
        this.onCalibrated = options.onCalibrated || (() => {});
        this.onError = options.onError || (() => {});

        // State
        this.running = false;
        this.rafId = null;
    }

    async startCamera(videoEl, canvasEl) {
        this.video = videoEl;
        this.canvas = canvasEl;
        this.ctx = canvasEl.getContext('2d');

        this.onStatus('Requesting camera...');

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false
            });
            this.video.srcObject = this.stream;
            await new Promise(resolve => {
                this.video.onloadedmetadata = () => {
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;
                    resolve();
                };
            });
        } catch (err) {
            this.onError('Camera access denied: ' + err.message);
            throw err;
        }

        this.onStatus('Loading pose model...');

        try {
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                {
                    modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
                    enableSmoothing: true,
                    minPoseScore: 0.3
                }
            );
        } catch (err) {
            this.onError('Failed to load model: ' + err.message);
            throw err;
        }

        this.running = true;
        this.onStatus('Model loaded');
        this.detectLoop();
    }

    async calibrate() {
        this.isCalibrating = true;
        this.isCalibrated = false;
        this.calibrationSamples = [];
        this.onStatus('Stand still for calibration...');

        return new Promise((resolve) => {
            const duration = 2000;
            const interval = 100;
            let elapsed = 0;

            const timer = setInterval(async () => {
                elapsed += interval;
                try {
                    const poses = await this.detector.estimatePoses(this.video);
                    if (poses.length > 0) {
                        const nose = poses[0].keypoints.find(k => k.name === 'nose');
                        if (nose && nose.score > 0.5) {
                            this.calibrationSamples.push(nose.y);
                        }
                    }
                } catch (e) { /* skip frame */ }

                if (elapsed >= duration) {
                    clearInterval(timer);
                    this.isCalibrating = false;

                    if (this.calibrationSamples.length >= 3) {
                        // Trimmed mean
                        const sorted = [...this.calibrationSamples].sort((a, b) => a - b);
                        const trim = Math.max(1, Math.floor(sorted.length * 0.1));
                        const trimmed = sorted.slice(trim, sorted.length - trim);
                        this.baselineY = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
                        this.isCalibrated = true;
                        this.onStatus('Ready');
                        this.onCalibrated();
                    } else {
                        this.onStatus('Calibration failed (' + this.calibrationSamples.length + ' samples) - try again');
                        this.onError('Calibration failed - make sure your face is visible. Click Recalibrate.');
                    }
                    resolve();
                }
            }, interval);
        });
    }

    async detectLoop() {
        if (!this.running) return;

        try {
            const poses = await this.detector.estimatePoses(this.video);
            if (poses.length > 0) {
                this.drawPose(poses[0]);
                if (this.isCalibrated) {
                    this.analyzePose(poses[0]);
                }
            }
        } catch (e) { /* skip */ }

        this.rafId = requestAnimationFrame(() => this.detectLoop());
    }

    analyzePose(pose) {
        const nose = pose.keypoints.find(k => k.name === 'nose');
        if (!nose || nose.score < 0.5) return;

        const now = Date.now();
        this.yHistory.push({ y: nose.y, t: now });
        if (this.yHistory.length > this.maxHistory) this.yHistory.shift();
        if (this.yHistory.length < 2) return;

        const curr = this.yHistory[this.yHistory.length - 1];
        const prev = this.yHistory[this.yHistory.length - 2];
        const dt = (curr.t - prev.t) || 1;
        const velocity = ((curr.y - prev.y) / dt) * 1000;

        const yDiff = this.baselineY - curr.y;

        if (yDiff > this.jumpThreshold &&
            velocity < -this.minVelocity &&
            (now - this.lastJumpTime) > this.jumpCooldown) {
            this.lastJumpTime = now;
            this.onJump();
        }
    }

    drawPose(pose) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw keypoints
        for (const kp of pose.keypoints) {
            if (kp.score < 0.3) continue;
            ctx.beginPath();
            ctx.arc(kp.x, kp.y, kp.name === 'nose' ? 6 : 4, 0, Math.PI * 2);
            ctx.fillStyle = kp.name === 'nose' ? '#7c5cfc' : 'rgba(52,211,153,0.8)';
            ctx.fill();
        }

        // Draw skeleton
        const connections = [
            ['left_shoulder', 'right_shoulder'],
            ['left_shoulder', 'left_elbow'],
            ['left_elbow', 'left_wrist'],
            ['right_shoulder', 'right_elbow'],
            ['right_elbow', 'right_wrist'],
            ['left_shoulder', 'left_hip'],
            ['right_shoulder', 'right_hip'],
            ['left_hip', 'right_hip'],
            ['left_hip', 'left_knee'],
            ['left_knee', 'left_ankle'],
            ['right_hip', 'right_knee'],
            ['right_knee', 'right_ankle']
        ];

        const kpMap = {};
        for (const kp of pose.keypoints) {
            kpMap[kp.name] = kp;
        }

        ctx.strokeStyle = 'rgba(52,211,153,0.4)';
        ctx.lineWidth = 2;
        for (const [a, b] of connections) {
            const ka = kpMap[a], kb = kpMap[b];
            if (ka && kb && ka.score > 0.3 && kb.score > 0.3) {
                ctx.beginPath();
                ctx.moveTo(ka.x, ka.y);
                ctx.lineTo(kb.x, kb.y);
                ctx.stroke();
            }
        }
    }

    stop() {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
    }

    updateSettings(jumpThreshold, jumpCooldown) {
        if (jumpThreshold !== undefined) this.jumpThreshold = jumpThreshold;
        if (jumpCooldown !== undefined) this.jumpCooldown = jumpCooldown;
    }
}
