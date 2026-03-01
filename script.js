/**
 * Camera Dino Controller
 * 
 * This application uses TensorFlow.js MoveNet pose detection to detect jumps
 * and simulates Space key presses for the Chrome Dino game.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Run this app with a local static server (Live Server in VS Code works well)
 * 2. Open chrome://dino in a new tab
 * 3. Click "Start Camera" and allow webcam access
 * 4. Stand still for 2 seconds to calibrate
 * 5. Jump physically - the dino will jump automatically!
 * 
 * TROUBLESHOOTING:
 * - If jumps aren't detected: increase sensitivity slider
 * - If false triggers: decrease sensitivity slider
 * - Ensure good lighting and clear camera view
 * - Stand at least 5-8 feet from camera for best results
 */

class DinoController {
    constructor() {
        // DOM Elements
        this.video = document.getElementById('webcam');
        this.poseCanvas = document.getElementById('pose-canvas');
        this.debugCanvas = document.getElementById('debug-canvas');
        this.startBtn = document.getElementById('start-btn');
        this.calibrateBtn = document.getElementById('calibrate-btn');
        
        // Status elements
        this.statusEl = document.getElementById('status');
        this.confidenceEl = document.getElementById('confidence');
        this.fpsEl = document.getElementById('fps');
        
        // Debug elements
        this.baselineYEl = document.getElementById('baseline-y');
        this.currentYEl = document.getElementById('current-y');
        this.velocityEl = document.getElementById('velocity');
        
        // Settings
        this.sensitivitySlider = document.getElementById('sensitivity');
        this.sensitivityValue = document.getElementById('sensitivity-value');
        this.cooldownSlider = document.getElementById('cooldown');
        this.cooldownValue = document.getElementById('cooldown-value');
        
        // Canvas contexts
        this.poseCtx = this.poseCanvas.getContext('2d');
        this.debugCtx = this.debugCanvas.getContext('2d');
        
        // State variables
        this.isRunning = false;
        this.isCalibrating = false;
        this.detector = null;
        this.baselineY = null;
        this.lastY = null;
        this.lastJumpTime = 0;
        this.calibrationData = [];
        this.yHistory = [];
        this.maxHistoryLength = 50;
        
        // Performance tracking
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fps = 0;
        
        // Settings values
        this.jumpThreshold = 25; // pixels
        this.jumpCooldown = 500; // milliseconds
        this.minVelocity = 2; // pixels per frame
        
        this.initializeEventListeners();
    }
    
    initializeEventListeners() {
        // Button events
        this.startBtn.addEventListener('click', () => this.start());
        this.calibrateBtn.addEventListener('click', () => this.calibrate());
        
        // Start Game button — sends Space into the iframe to kick off the T-Rex game
        document.getElementById('start-game-btn').addEventListener('click', () => {
            this.sendKeyToGame('keydown', 32);
            setTimeout(() => this.sendKeyToGame('keyup', 32), 100);
        });
        
        // Settings events
        this.sensitivitySlider.addEventListener('input', (e) => {
            this.jumpThreshold = parseInt(e.target.value);
            this.sensitivityValue.textContent = `${this.jumpThreshold}px`;
        });
        
        this.cooldownSlider.addEventListener('input', (e) => {
            this.jumpCooldown = parseInt(e.target.value);
            this.cooldownValue.textContent = `${this.jumpCooldown}ms`;
        });
    }
    
    async start() {
        try {
            this.updateStatus('Initializing camera...', 'calibrating');
            
            // Get webcam stream
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                }
            });
            
            this.video.srcObject = stream;
            
            // Wait for video to be ready
            await new Promise((resolve) => {
                this.video.onloadedmetadata = () => {
                    this.video.play();
                    resolve();
                };
            });
            
            // Setup canvas dimensions
            this.poseCanvas.width = this.video.videoWidth;
            this.poseCanvas.height = this.video.videoHeight;
            
            // Load pose detection model
            this.updateStatus('Loading pose detection model...', 'calibrating');
            await this.loadPoseDetector();
            
            // Start calibration
            await this.calibrate();
            
            // Start detection loop
            this.isRunning = true;
            this.startBtn.disabled = true;
            this.calibrateBtn.disabled = false;
            this.updateStatus('Ready - Jump to control!', 'ready');
            
            this.detectPose();
            
        } catch (error) {
            console.error('Error starting:', error);
            this.updateStatus('Error: ' + error.message, 'error');
        }
    }
    
    async loadPoseDetector() {
        const detectorConfig = {
            modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
            enableSmoothing: true,
            minPoseScore: 0.3
        };
        
        this.detector = await poseDetection.createDetector(
            poseDetection.SupportedModels.MoveNet,
            detectorConfig
        );
    }
    
    async calibrate() {
        this.isCalibrating = true;
        this.calibrationData = [];
        this.baselineY = null;
        
        this.updateStatus('Calibrating - Stand still for 2 seconds...', 'calibrating');
        
        const calibrationDuration = 2000; // 2 seconds
        const calibrationStartTime = performance.now();
        const calibrationInterval = 100; // Sample every 100ms
        
        while (performance.now() - calibrationStartTime < calibrationDuration) {
            if (!this.isRunning) break;
            
            const poses = await this.detector.estimatePoses(this.video);
            
            if (poses.length > 0) {
                const pose = poses[0];
                const nose = pose.keypoints.find(kp => kp.name === 'nose');
                
                if (nose && nose.score > 0.5) {
                    this.calibrationData.push(nose.y);
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, calibrationInterval));
        }
        
        // Calculate baseline from calibration data
        if (this.calibrationData.length > 0) {
            // Remove outliers and calculate average
            const sortedData = [...this.calibrationData].sort((a, b) => a - b);
            const trimAmount = Math.floor(sortedData.length * 0.1); // Remove top/bottom 10%
            const trimmedData = sortedData.slice(trimAmount, sortedData.length - trimAmount);
            
            this.baselineY = trimmedData.reduce((sum, y) => sum + y, 0) / trimmedData.length;
            this.lastY = this.baselineY;
            
            this.updateStatus('Calibration complete - Ready!', 'ready');
            this.baselineYEl.textContent = Math.round(this.baselineY);
        } else {
            this.updateStatus('Calibration failed - No pose detected', 'error');
        }
        
        this.isCalibrating = false;
    }
    
    async detectPose() {
        if (!this.isRunning) return;
        
        try {
            const startTime = performance.now();
            
            // Detect poses
            const poses = await this.detector.estimatePoses(this.video);
            
            // Clear canvases
            this.poseCtx.clearRect(0, 0, this.poseCanvas.width, this.poseCanvas.height);
            
            if (poses.length > 0) {
                const pose = poses[0];
                this.drawPose(pose);
                this.analyzePose(pose);
                this.updateConfidence(pose.score);
            } else {
                this.updateConfidence(0);
            }
            
            // Update FPS
            this.updateFPS(startTime);
            
            // Continue detection loop
            requestAnimationFrame(() => this.detectPose());
            
        } catch (error) {
            console.error('Detection error:', error);
            requestAnimationFrame(() => this.detectPose());
        }
    }
    
    drawPose(pose) {
        const keypoints = pose.keypoints;
        
        // Draw keypoints
        keypoints.forEach(keypoint => {
            if (keypoint.score > 0.3) {
                const x = keypoint.x;
                const y = keypoint.y;
                
                // Draw keypoint
                this.poseCtx.beginPath();
                this.poseCtx.arc(x, y, 5, 0, 2 * Math.PI);
                this.poseCtx.fillStyle = '#00ff00';
                this.poseCtx.fill();
                
                // Highlight nose
                if (keypoint.name === 'nose') {
                    this.poseCtx.beginPath();
                    this.poseCtx.arc(x, y, 8, 0, 2 * Math.PI);
                    this.poseCtx.strokeStyle = '#ff0000';
                    this.poseCtx.lineWidth = 2;
                    this.poseCtx.stroke();
                }
            }
        });
        
        // Draw skeleton (simplified - just major connections)
        const connections = [
            ['nose', 'left_eye'],
            ['nose', 'right_eye'],
            ['left_shoulder', 'right_shoulder'],
            ['left_shoulder', 'left_elbow'],
            ['left_elbow', 'left_wrist'],
            ['right_shoulder', 'right_elbow'],
            ['right_elbow', 'right_wrist'],
            ['left_hip', 'right_hip'],
            ['left_shoulder', 'left_hip'],
            ['right_shoulder', 'right_hip']
        ];
        
        connections.forEach(([start, end]) => {
            const startKp = keypoints.find(kp => kp.name === start);
            const endKp = keypoints.find(kp => kp.name === end);
            
            if (startKp && endKp && startKp.score > 0.3 && endKp.score > 0.3) {
                this.poseCtx.beginPath();
                this.poseCtx.moveTo(startKp.x, startKp.y);
                this.poseCtx.lineTo(endKp.x, endKp.y);
                this.poseCtx.strokeStyle = '#00ff00';
                this.poseCtx.lineWidth = 2;
                this.poseCtx.stroke();
            }
        });
    }
    
    analyzePose(pose) {
        if (this.isCalibrating || !this.baselineY) return;
        
        const nose = pose.keypoints.find(kp => kp.name === 'nose');
        
        if (nose && nose.score > 0.5) {
            const currentY = nose.y;
            const currentTime = performance.now();
            
            // Update Y position history
            this.yHistory.push({
                y: currentY,
                time: currentTime
            });
            
            // Keep history at max length
            if (this.yHistory.length > this.maxHistoryLength) {
                this.yHistory.shift();
            }
            
            // Calculate velocity
            let velocity = 0;
            if (this.yHistory.length >= 2) {
                const recent = this.yHistory.slice(-2);
                const deltaY = recent[1].y - recent[0].y;
                const deltaTime = recent[1].time - recent[0].time;
                velocity = (deltaY / deltaTime) * 1000; // pixels per second
            }
            
            // Update debug info
            this.currentYEl.textContent = Math.round(currentY);
            this.velocityEl.textContent = velocity.toFixed(2);
            
            // Draw debug graph
            this.drawDebugGraph();
            
            // Check for jump
            const yDifference = this.baselineY - currentY;
            const timeSinceLastJump = currentTime - this.lastJumpTime;
            
            if (yDifference > this.jumpThreshold && 
                velocity < -this.minVelocity && 
                timeSinceLastJump > this.jumpCooldown) {
                
                this.triggerJump();
                this.lastJumpTime = currentTime;
            }
            
            this.lastY = currentY;
        }
    }
    
    drawDebugGraph() {
        const ctx = this.debugCtx;
        const width = this.debugCanvas.width;
        const height = this.debugCanvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        if (this.yHistory.length < 2) return;
        
        // Draw baseline
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        const baselineY = height - ((this.baselineY - Math.min(...this.yHistory.map(h => h.y))) / 
                           (Math.max(...this.yHistory.map(h => h.y)) - Math.min(...this.yHistory.map(h => h.y))) * height);
        ctx.moveTo(0, baselineY);
        ctx.lineTo(width, baselineY);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Draw Y position history
        ctx.strokeStyle = '#0066cc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const minY = Math.min(...this.yHistory.map(h => h.y));
        const maxY = Math.max(...this.yHistory.map(h => h.y));
        const range = maxY - minY || 1;
        
        this.yHistory.forEach((point, index) => {
            const x = (index / (this.maxHistoryLength - 1)) * width;
            const y = height - ((point.y - minY) / range * height);
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw jump threshold lines
        const thresholdY = height - ((this.baselineY - this.jumpThreshold - minY) / range * height);
        ctx.strokeStyle = '#ffa500';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(width, thresholdY);
        ctx.stroke();
        ctx.setLineDash([]);
    }
    
    sendKeyToGame(type, keyCode) {
        const iframe = document.getElementById('dino-iframe');
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const evt = new KeyboardEvent(type, {
            key: keyCode === 32 ? ' ' : 'ArrowDown',
            code: keyCode === 32 ? 'Space' : 'ArrowDown',
            keyCode: keyCode,
            which: keyCode,
            bubbles: true,
            cancelable: true
        });
        iframeDoc.dispatchEvent(evt);
    }
    
    triggerJump() {
        this.sendKeyToGame('keydown', 32);
        setTimeout(() => this.sendKeyToGame('keyup', 32), 100);
        
        // Visual feedback
        this.updateStatus('Jump detected!', 'jumping');
        setTimeout(() => {
            this.updateStatus('Ready - Jump to control!', 'ready');
        }, 500);
        
        console.log('Jump triggered!');
    }
    
    updateStatus(text, type = '') {
        this.statusEl.textContent = text;
        this.statusEl.className = 'status-item';
        if (type) {
            this.statusEl.classList.add(type);
        }
    }
    
    updateConfidence(score) {
        this.confidenceEl.textContent = `Confidence: ${(score * 100).toFixed(1)}%`;
    }
    
    updateFPS(startTime) {
        this.frameCount++;
        const currentTime = performance.now();
        const elapsed = currentTime - this.lastFrameTime;
        
        if (elapsed >= 1000) {
            this.fps = Math.round((this.frameCount * 1000) / elapsed);
            this.fpsEl.textContent = `FPS: ${this.fps}`;
            this.frameCount = 0;
            this.lastFrameTime = currentTime;
        }
    }
}

// Initialize the controller when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.dinoController = new DinoController();
});
