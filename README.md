# 🦖 Camera Dino Controller

Control the Chrome T-Rex Runner game by physically jumping in front of your webcam. Uses real-time pose detection to translate your body movements into game inputs — no keyboard needed.

![Tech Stack](https://img.shields.io/badge/Vanilla-HTML%2FCSS%2FJS-orange)
![AI](https://img.shields.io/badge/TensorFlow.js-MoveNet-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## How It Works

1. Your **webcam** captures a live video feed (mirrored, displayed on the left)
2. **TensorFlow.js MoveNet Lightning** detects body keypoints in real-time (~20+ FPS)
3. The app tracks your **nose Y-position**, establishes a baseline, and calculates upward velocity
4. When a physical jump is detected, a **Space keypress is dispatched** into the embedded T-Rex game iframe
5. The **real Chrome Dino game** (extracted from Chromium source) runs inside a same-origin iframe on the right

## Quick Start

**Requires a local static server** (webcam + iframe need HTTP, not `file://`).

### Option A — Python (simplest)
```bash
cd path/to/windsurf-project
python -m http.server 8000
# Open http://localhost:8000
```

### Option B — VS Code Live Server
1. Install the **Live Server** extension
2. Right-click `index.html` → "Open with Live Server"

### Option C — Node.js
```bash
npx http-server -p 8000
# Open http://localhost:8000
```

## How to Play

1. Click **"Start Camera"** and allow webcam access
2. Stand still for **2 seconds** while baseline height calibrates
3. Click **"Start Game"** to begin the T-Rex runner
4. **Jump physically** — the dino jumps with you!
5. Tweak **Sensitivity** and **Cooldown** sliders if detection is off

## Layout

The UI is a **side-by-side** design optimized for streaming / building in public:

| Left Panel | Right Panel |
|---|---|
| Camera feed with pose overlay | Chrome T-Rex Runner (real game) |
| Start Camera / Recalibrate buttons | Start Game button |

Below: **Status** · **Settings** · **Debug Info** in a 3-column row.

## Project Structure

```
windsurf-project/
├── index.html              # Main page — layout, iframe, scripts
├── style.css               # All styling — grid layout, responsive
├── script.js               # DinoController class — camera, pose detection, jump logic
├── dino-game.js            # (Legacy) Custom clone — no longer used
├── README.md               # This file
├── PRD.md                  # Product Requirements Document
└── trex/                   # Real Chrome T-Rex Runner (Chromium source)
    ├── index.html          # Minimal wrapper that loads the game
    ├── index.js            # Full Chromium T-Rex Runner JS (~2750 lines)
    ├── index.css           # Original game CSS
    └── assets/
        ├── default_100_percent/
        │   └── 100-offline-sprite.png
        └── default_200_percent/
            └── 200-offline-sprite.png
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Pose Detection | TensorFlow.js 4.11 + @tensorflow-models/pose-detection 2.1.3 |
| Model | MoveNet SinglePose Lightning |
| Game | Chromium T-Rex Runner (same-origin iframe) |
| Backend | None — 100% client-side |

## Jump Detection Algorithm

```
1. CALIBRATE  — Average nose Y-position over 2 seconds (trimmed mean, drop top/bottom 10%)
2. TRACK      — Each frame: record nose Y + timestamp → rolling history (50 frames)
3. VELOCITY   — deltaY / deltaTime between last 2 frames (pixels/second)
4. TRIGGER    — Jump fires when ALL conditions met:
                 • (baselineY - currentY) > jumpThreshold  (default: 25px)
                 • velocity < -minVelocity                  (default: 2 px/frame, upward)
                 • timeSinceLastJump > cooldown              (default: 500ms)
5. DISPATCH   — keydown(Space) → iframe document → 100ms delay → keyup(Space)
```

## Settings

| Control | Range | Default | Effect |
|---|---|---|---|
| Jump Sensitivity | 10–50 px | 25 px | How far you must rise above baseline to trigger a jump |
| Jump Cooldown | 300–1000 ms | 500 ms | Minimum time between consecutive jumps |

## Troubleshooting

**Jumps not detected:**
- Increase Sensitivity slider
- Ensure good, even lighting
- Stand 5–8 feet from camera
- Wear clothes that contrast with background

**False triggers:**
- Decrease Sensitivity slider
- Increase Cooldown slider
- Keep camera stable; avoid rapid head movements

**Camera not working:**
- Check browser permissions (Settings → Privacy → Camera)
- Close other apps using the camera
- Refresh and re-grant permissions

**Game doesn't start:**
- Click **"Start Game"** button (dispatches Space into iframe)
- If still stuck, click inside the game iframe, then press Space manually

**Low FPS:**
- Close other tabs / heavy apps
- Chrome 90+ recommended for best TensorFlow.js WebGL performance

## Browser Compatibility

| Browser | Status |
|---|---|
| Chrome 90+ | Recommended (best WebGL perf) |
| Edge | Supported |
| Firefox | Supported (slightly lower perf) |
| Safari | Partial (WebGL support varies) |

## Privacy

- All processing is **local** — no data leaves your browser
- No analytics, no tracking, no server calls
- Camera stream is only used for pose detection
- Fully open-source and inspectable

## Future Enhancements

- Squat detection → ArrowDown for ducking
- Hand gesture controls (wave to start/stop)
- Two-player split-screen mode
- Voice commands ("Jump!")
- Mobile camera support
- Score overlay on camera feed

## License

MIT

---

**Jump. Play. Have fun. 🦖**
