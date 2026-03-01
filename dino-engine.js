/**
 * DinoEngine – Deterministic T-Rex runner game engine
 * Uses seeded PRNG for identical obstacle generation across clients
 */
class SeededRNG {
    constructor(seed) {
        this.seed = seed % 2147483647;
        if (this.seed <= 0) this.seed += 2147483646;
    }
    next() {
        this.seed = (this.seed * 16807) % 2147483647;
        return (this.seed - 1) / 2147483646;
    }
    range(min, max) {
        return min + Math.floor(this.next() * (max - min + 1));
    }
}

class DinoEngine {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;

        // Callbacks
        this.onScoreUpdate = options.onScoreUpdate || (() => {});
        this.onGameOver = options.onGameOver || (() => {});

        // Game state
        this.running = false;
        this.crashed = false;
        this.score = 0;
        this.speed = 6;
        this.maxSpeed = 14;
        this.acceleration = 0.001;
        this.frameCount = 0;

        // Ground
        this.groundY = this.height - 30;

        // Dino
        this.dino = {
            x: 50,
            y: this.groundY,
            w: 28,
            h: 36,
            vy: 0,
            jumping: false,
            gravity: 0.8,
            jumpForce: -14,
            animFrame: 0,
            animTimer: 0
        };

        // Obstacles
        this.obstacles = [];
        this.minGap = 300;
        this.nextObstacleAt = 200;

        // Clouds (decorative)
        this.clouds = [];

        // RNG
        this.rng = null;

        // Animation
        this.lastTime = 0;
        this.rafId = null;

        // Score reporting throttle
        this.lastScoreReport = 0;
    }

    start(seed) {
        this.rng = new SeededRNG(seed);
        this.running = true;
        this.crashed = false;
        this.score = 0;
        this.speed = 6;
        this.frameCount = 0;
        this.obstacles = [];
        this.clouds = [];
        this.nextObstacleAt = 200;
        this.dino.y = this.groundY;
        this.dino.vy = 0;
        this.dino.jumping = false;
        this.dino.animFrame = 0;
        this.lastTime = performance.now();
        this.lastScoreReport = 0;

        // Pre-generate some clouds
        for (let i = 0; i < 3; i++) {
            this.clouds.push({
                x: this.rng.range(100, this.width),
                y: this.rng.range(20, 60),
                w: this.rng.range(40, 80),
                speed: 0.5 + this.rng.next() * 0.5
            });
        }

        if (this.rafId) cancelAnimationFrame(this.rafId);
        this.loop();
    }

    stop() {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    jump() {
        if (!this.running || this.crashed) return;
        if (!this.dino.jumping) {
            this.dino.jumping = true;
            this.dino.vy = this.dino.jumpForce;
        }
    }

    loop() {
        if (!this.running) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 16.67, 2); // normalize to ~60fps, cap at 2x
        this.lastTime = now;

        this.update(dt);
        this.draw();

        this.rafId = requestAnimationFrame(() => this.loop());
    }

    update(dt) {
        if (this.crashed) return;
        this.frameCount++;

        // Speed
        if (this.speed < this.maxSpeed) {
            this.speed += this.acceleration * dt;
        }

        // Score
        this.score = Math.floor(this.frameCount * 0.15);

        // Report score every ~10 frames
        if (this.frameCount - this.lastScoreReport >= 10) {
            this.lastScoreReport = this.frameCount;
            this.onScoreUpdate(this.score);
        }

        // Dino physics
        if (this.dino.jumping) {
            this.dino.vy += this.dino.gravity * dt;
            this.dino.y += this.dino.vy * dt;
            if (this.dino.y >= this.groundY) {
                this.dino.y = this.groundY;
                this.dino.vy = 0;
                this.dino.jumping = false;
            }
        }

        // Dino animation
        this.dino.animTimer += dt;
        if (this.dino.animTimer > 6) {
            this.dino.animTimer = 0;
            this.dino.animFrame = this.dino.animFrame === 0 ? 1 : 0;
        }

        // Obstacles
        this.nextObstacleAt -= this.speed * dt;
        if (this.nextObstacleAt <= 0) {
            const type = this.rng.next() > 0.3 ? 'cactus' : 'tall-cactus';
            const h = type === 'cactus' ? this.rng.range(24, 36) : this.rng.range(38, 50);
            const w = type === 'cactus' ? this.rng.range(14, 22) : this.rng.range(10, 16);
            this.obstacles.push({
                x: this.width + 10,
                y: this.groundY,
                w: w,
                h: h,
                type: type
            });
            this.nextObstacleAt = this.minGap + this.rng.range(0, 200);
        }

        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            this.obstacles[i].x -= this.speed * dt;
            if (this.obstacles[i].x + this.obstacles[i].w < 0) {
                this.obstacles.splice(i, 1);
                continue;
            }
            // Collision
            if (this.checkCollision(this.dino, this.obstacles[i])) {
                this.crashed = true;
                this.running = false;
                this.onGameOver(this.score);
                return;
            }
        }

        // Clouds
        for (let i = this.clouds.length - 1; i >= 0; i--) {
            this.clouds[i].x -= this.clouds[i].speed * dt;
            if (this.clouds[i].x + this.clouds[i].w < 0) {
                this.clouds[i].x = this.width + this.rng.range(20, 100);
                this.clouds[i].y = this.rng.range(20, 60);
            }
        }
    }

    checkCollision(dino, obs) {
        const pad = 6; // forgiving hitbox
        const dx = dino.x;
        const dy = dino.y - dino.h;
        const dw = dino.w;
        const dh = dino.h;
        const ox = obs.x;
        const oy = obs.y - obs.h;
        const ow = obs.w;
        const oh = obs.h;

        return (dx + pad < ox + ow - pad &&
                dx + dw - pad > ox + pad &&
                dy + pad < oy + oh &&
                dy + dh > oy + pad);
    }

    draw() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Clear
        ctx.fillStyle = '#f7f7f7';
        ctx.fillRect(0, 0, w, h);

        // Clouds
        ctx.fillStyle = '#ddd';
        for (const c of this.clouds) {
            ctx.beginPath();
            ctx.ellipse(c.x + c.w / 2, c.y, c.w / 2, 8, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        // Ground line
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, this.groundY + 1);
        ctx.lineTo(w, this.groundY + 1);
        ctx.stroke();

        // Ground texture
        ctx.fillStyle = '#ccc';
        const offset = (this.frameCount * 3) % 20;
        for (let x = -offset; x < w; x += 20) {
            ctx.fillRect(x, this.groundY + 4, 8, 1);
            ctx.fillRect(x + 12, this.groundY + 8, 5, 1);
        }

        // Dino
        this.drawDino(ctx);

        // Obstacles
        for (const obs of this.obstacles) {
            this.drawObstacle(ctx, obs);
        }

        // Score
        ctx.fillStyle = '#555';
        ctx.font = '700 14px "Courier New", monospace';
        ctx.textAlign = 'right';
        ctx.fillText(String(this.score).padStart(5, '0'), w - 12, 22);

        // Game over overlay
        if (this.crashed) {
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#333';
            ctx.font = '700 18px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('GAME OVER', w / 2, h / 2 - 10);
            ctx.font = '500 13px Inter, sans-serif';
            ctx.fillText('Score: ' + this.score, w / 2, h / 2 + 12);
        }
    }

    drawDino(ctx) {
        const d = this.dino;
        const x = d.x;
        const y = d.y;

        ctx.fillStyle = '#555';

        // Body
        ctx.fillRect(x + 4, y - 30, 20, 22);

        // Head
        ctx.fillRect(x + 12, y - 36, 16, 14);

        // Eye
        ctx.fillStyle = '#f7f7f7';
        ctx.fillRect(x + 22, y - 34, 3, 3);
        ctx.fillStyle = '#555';

        // Legs (animated)
        if (this.dino.jumping) {
            // Both legs down when jumping
            ctx.fillRect(x + 6, y - 8, 5, 8);
            ctx.fillRect(x + 15, y - 8, 5, 8);
        } else if (d.animFrame === 0) {
            ctx.fillRect(x + 6, y - 8, 5, 8);
            ctx.fillRect(x + 15, y - 5, 5, 5);
        } else {
            ctx.fillRect(x + 6, y - 5, 5, 5);
            ctx.fillRect(x + 15, y - 8, 5, 8);
        }

        // Tail
        ctx.fillRect(x, y - 26, 6, 4);

        // Arms
        ctx.fillRect(x + 18, y - 20, 3, 8);
    }

    drawObstacle(ctx, obs) {
        ctx.fillStyle = '#555';
        const x = obs.x;
        const y = obs.y;

        if (obs.type === 'cactus') {
            // Main body
            ctx.fillRect(x + 2, y - obs.h, obs.w - 4, obs.h);
            // Left arm
            ctx.fillRect(x - 2, y - obs.h * 0.6, 4, obs.h * 0.3);
            ctx.fillRect(x - 2, y - obs.h * 0.6, 6, 3);
            // Right arm
            ctx.fillRect(x + obs.w - 2, y - obs.h * 0.4, 4, obs.h * 0.2);
            ctx.fillRect(x + obs.w - 4, y - obs.h * 0.4, 6, 3);
        } else {
            // Tall cactus
            ctx.fillRect(x + 1, y - obs.h, obs.w - 2, obs.h);
            ctx.fillRect(x - 3, y - obs.h * 0.7, 4, obs.h * 0.35);
            ctx.fillRect(x - 3, y - obs.h * 0.7, 7, 3);
        }
    }

    destroy() {
        this.stop();
        this.ctx.clearRect(0, 0, this.width, this.height);
    }
}
