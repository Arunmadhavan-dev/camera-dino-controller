```javascript
/**
 * PoseController – Webcam + MoveNet pose detection + jump detection
 *
 * Jump behavior:
 * - Detects a jump from body movement.
 * - Fires SPACE keydown.
 * - Holds SPACE for ~180ms.
 * - Fires SPACE keyup.
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

        // How long SPACE stays pressed
        // 180ms is a good starting point.
        this.jumpKeyHoldTime = options.jumpKeyHoldTime || 180;

        // Track whether SPACE is currently held
        this.jumpKeyDown = false;
        this.jumpKeyUpTimer = null;

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
                video: {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                },
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
                    modelType:
                        poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,

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

        // Clear previous movement history
        this.yHistory = [];

        this.onStatus('Stand still for calibration...');

        return new Promise((resolve) => {

            const duration = 2000;
            const interval = 100;

            let elapsed = 0;

            const timer = setInterval(async () => {

                elapsed += interval;

                try {

                    const poses =
                        await this.detector.estimatePoses(this.video);

                    if (poses.length > 0) {

                        const nose =
                            poses[0].keypoints.find(
                                k => k.name === 'nose'
                            );

                        if (nose && nose.score > 0.5) {
                            this.calibrationSamples.push(nose.y);
                        }
                    }

                } catch (e) {
                    // Skip bad frame
                }

                if (elapsed >= duration) {

                    clearInterval(timer);

                    this.isCalibrating = false;

                    if (this.calibrationSamples.length >= 3) {

                        // Trimmed mean
                        const sorted =
                            [...this.calibrationSamples]
                                .sort((a, b) => a - b);

                        const trim =
                            Math.max(
                                1,
                                Math.floor(sorted.length * 0.1)
                            );

                        const trimmed =
                            sorted.slice(
                                trim,
                                sorted.length - trim
                            );

                        this.baselineY =
                            trimmed.reduce(
                                (a, b) => a + b,
                                0
                            ) / trimmed.length;

                        this.isCalibrated = true;

                        this.onStatus('Ready');

                        this.onCalibrated();

                    } else {

                        this.onStatus(
                            'Calibration failed (' +
                            this.calibrationSamples.length +
                            ' samples) - try again'
                        );

                        this.onError(
                            'Calibration failed - make sure your face is visible. Click Recalibrate.'
                        );
                    }

                    resolve();
                }

            }, interval);
        });
    }

    async detectLoop() {

        if (!this.running) return;

        try {

            const poses =
                await this.detector.estimatePoses(this.video);

            if (poses.length > 0) {

                this.drawPose(poses[0]);

                if (this.isCalibrated) {
                    this.analyzePose(poses[0]);
                }
            }

        } catch (e) {
            // Skip bad frame
        }

        this.rafId =
            requestAnimationFrame(
                () => this.detectLoop()
            );
    }

    analyzePose(pose) {

        const nose =
            pose.keypoints.find(
                k => k.name === 'nose'
            );

        if (!nose || nose.score < 0.5) {
            return;
        }

        const now = Date.now();

        this.yHistory.push({
            y: nose.y,
            t: now
        });

        if (this.yHistory.length > this.maxHistory) {
            this.yHistory.shift();
        }

        if (this.yHistory.length < 2) {
            return;
        }

        const curr =
            this.yHistory[
                this.yHistory.length - 1
            ];

        const prev =
            this.yHistory[
                this.yHistory.length - 2
            ];

        const dt =
            (curr.t - prev.t) || 1;

        // Positive = moving down
        // Negative = moving up
        const velocity =
            ((curr.y - prev.y) / dt) * 1000;

        // How far above calibration position
        // the nose currently is.
        const yDiff =
            this.baselineY - curr.y;

        /*
         * JUMP DETECTION
         *
         * Conditions:
         *
         * 1. Player is sufficiently above baseline.
         * 2. Player is moving upward.
         * 3. Previous jump cooldown has expired.
         */

        if (
            yDiff > this.jumpThreshold &&
            velocity < -this.minVelocity &&
            (now - this.lastJumpTime) > this.jumpCooldown
        ) {

            this.lastJumpTime = now;

            // Start the jump with a held SPACE key
            this.startJumpKey();

            // Keep existing callback functionality
            this.onJump();
        }
    }

    /**
     * Press SPACE and keep it held.
     */
    startJumpKey() {

        // Don't trigger another keydown
        // while SPACE is already being held.
        if (this.jumpKeyDown) {
            return;
        }

        this.jumpKeyDown = true;

        /*
         * KEYDOWN
         *
         * This tells the game:
         * "The player has started pressing jump."
         */
        window.dispatchEvent(
            new KeyboardEvent('keydown', {
                key: ' ',
                code: 'Space',
                keyCode: 32,
                which: 32,
                bubbles: true
            })
        );

        /*
         * Release the key later.
         *
         * 180ms means:
         *
         * KEYDOWN
         *    ↓
         *    ↓ 180ms
         *    ↓
         * KEYUP
         */
        this.jumpKeyUpTimer =
            setTimeout(() => {

                this.endJumpKey();

            }, this.jumpKeyHoldTime);
    }

    /**
     * Release SPACE after the hold duration.
     */
    endJumpKey() {

        if (!this.jumpKeyDown) {
            return;
        }

        this.jumpKeyDown = false;

        /*
         * KEYUP
         *
         * The game now knows that
         * the jump button has been released.
         */
        window.dispatchEvent(
            new KeyboardEvent('keyup', {
                key: ' ',
                code: 'Space',
                keyCode: 32,
                which: 32,
                bubbles: true
            })
        );

        this.jumpKeyUpTimer = null;
    }

    drawPose(pose) {

        const ctx = this.ctx;

        ctx.clearRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );

        // Draw keypoints
        for (const kp of pose.keypoints) {

            if (kp.score < 0.3) {
                continue;
            }

            ctx.beginPath();

            ctx.arc(
                kp.x,
                kp.y,
                kp.name === 'nose' ? 6 : 4,
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                kp.name === 'nose'
                    ? '#7c5cfc'
                    : 'rgba(52,211,153,0.8)';

            ctx.fill();
        }

        // Skeleton connections
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

        ctx.strokeStyle =
            'rgba(52,211,153,0.4)';

        ctx.lineWidth = 2;

        for (const [a, b] of connections) {

            const ka = kpMap[a];
            const kb = kpMap[b];

            if (
                ka &&
                kb &&
                ka.score > 0.3 &&
                kb.score > 0.3
            ) {

                ctx.beginPath();

                ctx.moveTo(
                    ka.x,
                    ka.y
                );

                ctx.lineTo(
                    kb.x,
                    kb.y
                );

                ctx.stroke();
            }
        }
    }

   
