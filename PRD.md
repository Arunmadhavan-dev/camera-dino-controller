# Product Requirements Document (PRD)
# Camera Dino Controller

> **Single source of truth** for this application. All architecture, features, and technical decisions are documented here.

---

## 1. Product Overview

**Name:** Camera Dino Controller  
**Version:** 1.0  
**Type:** Browser-based web application (static, no backend)  
**Purpose:** Let users control the Chrome T-Rex Runner game by physically jumping in front of their webcam, using real-time AI pose detection.

### 1.1 Problem Statement

The Chrome Dino game (T-Rex Runner) is played with keyboard input (Space/ArrowUp to jump, ArrowDown to duck). This project removes the keyboard and lets users play the game using their body — specifically, by detecting physical jumps via webcam pose estimation.

### 1.2 Target Users

- Developers exploring TensorFlow.js / pose detection
- Content creators building in public / streaming
- Anyone who wants a fun, interactive way to play Chrome Dino
- Educational use: demonstrating real-time ML in the browser

---

## 2. Architecture

### 2.1 High-Level Flow

```
┌──────────────┐     ┌─────────────────┐     ┌────────────────────┐
│   Webcam     │────▶│  TensorFlow.js  │────▶│  Jump Detection    │
│   (getUserMedia)   │  MoveNet model  │     │  Algorithm         │
└──────────────┘     └─────────────────┘     └────────┬───────────┘
                                                       │
                                                       │ Space keydown/keyup
                                                       ▼
                                              ┌────────────────────┐
                                              │  T-Rex Runner      │
                                              │  (same-origin      │
                                              │   iframe)          │
                                              └────────────────────┘
```

### 2.2 Component Diagram

```
index.html (Main Page)
├── Camera Feed Panel (left)
│   ├── <video> — webcam stream (mirrored)
│   ├── <canvas> — pose keypoint overlay
│   └── Start Camera / Recalibrate buttons
│
├── Game Panel (right)
│   ├── <iframe> → trex/index.html (same-origin)
│   ├── Start Game button
│   └── Hint text
│
├── Bottom Row
│   ├── Status Panel — state, confidence, FPS
│   ├── Settings Panel — sensitivity, cooldown sliders
│   └── Debug Panel — Y-position graph, baseline/current/velocity readouts
│
└── Footer — usage instructions

script.js (DinoController class)
├── Camera initialization (getUserMedia)
├── Model loading (MoveNet Lightning)
├── Calibration routine
├── Pose detection loop (requestAnimationFrame)
├── Jump detection algorithm
├── Keyboard event dispatch into iframe
├── UI updates (status, FPS, debug graph)
└── Settings management

trex/ (Embedded Game)
├── index.html — minimal shell
├── index.js — real Chromium T-Rex Runner source
├── index.css — original game styles
└── assets/ — sprite sheets (1x, 2x)
```

### 2.3 Key Design Decisions

| Decision | Rationale |
|---|---|
| **Vanilla JS, no framework** | Minimal dependencies, easy to understand, fast to load |
| **Real Chromium T-Rex Runner, not a clone** | Authentic game experience; user specifically requested this |
| **Same-origin iframe embedding** | Allows `contentDocument.dispatchEvent()` for cross-frame keyboard events |
| **MoveNet Lightning (not Thunder)** | Optimized for real-time performance; runs at 20+ FPS on most hardware |
| **Nose keypoint for jump detection** | Most reliably visible keypoint when standing; works even with partial body visibility |
| **CDN-loaded TensorFlow.js** | No build step needed; works as a plain static site |
| **No audio in embedded game** | Audio template (`<template id="audio-resources">`) omitted to keep trex/index.html lightweight; `loadSounds()` wrapped in try-catch to gracefully degrade |

---

## 3. Features

### 3.1 Core Features (v1.0 — Implemented)

| # | Feature | Status | Description |
|---|---|---|---|
| F1 | Webcam capture | ✅ Done | 640×480, front-facing, mirrored display |
| F2 | Real-time pose detection | ✅ Done | MoveNet Lightning, ~20+ FPS, 17 keypoints |
| F3 | Pose visualization | ✅ Done | Green keypoints + skeleton overlay on canvas; red ring on nose |
| F4 | Baseline calibration | ✅ Done | 2-second standing calibration, trimmed mean (drop top/bottom 10%) |
| F5 | Jump detection | ✅ Done | Y-position threshold + upward velocity + cooldown |
| F6 | Embedded T-Rex Runner | ✅ Done | Real Chromium game in same-origin iframe |
| F7 | Keyboard dispatch to game | ✅ Done | `sendKeyToGame()` dispatches keydown/keyup into iframe document |
| F8 | Start Game button | ✅ Done | Sends initial Space key to start the T-Rex runner |
| F9 | Adjustable sensitivity | ✅ Done | Slider: 10–50 px threshold (default 25) |
| F10 | Adjustable cooldown | ✅ Done | Slider: 300–1000 ms (default 500) |
| F11 | Debug graph | ✅ Done | Real-time Y-position history with baseline + threshold lines |
| F12 | Status indicators | ✅ Done | Calibrating / Ready / Jump detected states with color coding |
| F13 | FPS counter | ✅ Done | Updated every second |
| F14 | Confidence display | ✅ Done | Pose detection confidence percentage |
| F15 | Side-by-side layout | ✅ Done | Camera (2fr) left, Game (3fr) right |
| F16 | Responsive design | ✅ Done | Stacks vertically below 900px |

### 3.2 Future Features (Planned)

| # | Feature | Priority | Description |
|---|---|---|---|
| F17 | Squat / duck detection | High | Detect downward crouch → dispatch ArrowDown for ducking |
| F18 | Score overlay | Medium | Show T-Rex score on the camera feed panel |
| F19 | Hand gesture controls | Medium | Wave to start/stop game |
| F20 | Two-player mode | Low | Split-screen with two cameras |
| F21 | Voice commands | Low | "Jump!" voice activation via Web Speech API |
| F22 | Mobile camera support | Low | Phone camera via rear-facing mode |
| F23 | Game audio restoration | Low | Re-add base64 audio `<template>` to trex/index.html |

---

## 4. Technical Specification

### 4.1 Dependencies (all CDN-loaded)

| Package | Version | CDN URL |
|---|---|---|
| TensorFlow.js | 4.11.0 | `https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.11.0/dist/tf.min.js` |
| Pose Detection | 2.1.3 | `https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection@2.1.3/dist/pose-detection.min.js` |

No `package.json`, no build step. All dependencies loaded via `<script>` tags.

### 4.2 File Inventory

| File | Lines | Purpose |
|---|---|---|
| `index.html` | ~93 | Page structure, layout, script/CSS loading |
| `style.css` | ~370 | Grid layout, responsive design, status animations |
| `script.js` | ~458 | `DinoController` class — all application logic |
| `dino-game.js` | ~384 | Legacy custom T-Rex clone (not loaded, can be deleted) |
| `trex/index.html` | ~28 | Minimal wrapper for the real T-Rex game |
| `trex/index.js` | ~2759 | Real Chromium T-Rex Runner source (modified: `loadSounds` wrapped in try-catch) |
| `trex/index.css` | ~166 | Original Chromium game CSS |
| `trex/assets/…` | 2 files | Sprite sheets (100% and 200% DPI) |

### 4.3 DinoController Class API

```
class DinoController
├── constructor()
│   ├── DOM element references
│   ├── State variables (isRunning, baselineY, yHistory, etc.)
│   ├── Settings defaults (jumpThreshold=25, jumpCooldown=500, minVelocity=2)
│   └── calls initializeEventListeners()
│
├── initializeEventListeners()
│   ├── Start Camera button → start()
│   ├── Recalibrate button → calibrate()
│   ├── Start Game button → sendKeyToGame(Space)
│   ├── Sensitivity slider → updates jumpThreshold
│   └── Cooldown slider → updates jumpCooldown
│
├── async start()
│   ├── getUserMedia (640×480, front-facing)
│   ├── Setup canvas dimensions
│   ├── loadPoseDetector()
│   ├── calibrate()
│   └── detectPose() loop
│
├── async loadPoseDetector()
│   └── MoveNet SINGLEPOSE_LIGHTNING, enableSmoothing=true, minPoseScore=0.3
│
├── async calibrate()
│   ├── 2000ms duration, sample every 100ms
│   ├── Collect nose Y-positions with score > 0.5
│   ├── Trimmed mean: sort, drop top/bottom 10%
│   └── Sets baselineY
│
├── async detectPose()
│   ├── estimatePoses(video)
│   ├── drawPose() — keypoints + skeleton
│   ├── analyzePose() — jump detection
│   ├── updateFPS()
│   └── requestAnimationFrame(detectPose)
│
├── analyzePose(pose)
│   ├── Track nose Y in yHistory (max 50 entries)
│   ├── Calculate velocity (deltaY/deltaTime * 1000)
│   ├── drawDebugGraph()
│   └── Trigger jump if: yDiff > threshold AND velocity < -minVelocity AND cooldown elapsed
│
├── sendKeyToGame(type, keyCode)
│   └── Dispatches KeyboardEvent into iframe.contentDocument
│
├── triggerJump()
│   ├── sendKeyToGame('keydown', 32) → 100ms → sendKeyToGame('keyup', 32)
│   └── Visual feedback (status update)
│
├── drawPose(pose) — keypoints (green circles) + skeleton (green lines) + nose highlight (red ring)
├── drawDebugGraph() — Y-position history, baseline line, threshold line
├── updateStatus(text, type)
├── updateConfidence(score)
└── updateFPS(startTime)
```

### 4.4 Jump Detection Parameters

| Parameter | Variable | Default | Range | Unit |
|---|---|---|---|---|
| Jump threshold | `jumpThreshold` | 25 | 10–50 | pixels (Y-axis decrease from baseline) |
| Jump cooldown | `jumpCooldown` | 500 | 300–1000 | milliseconds |
| Minimum velocity | `minVelocity` | 2 | fixed | pixels per frame (upward) |
| Confidence threshold | — | 0.5 | fixed | minimum keypoint score to use nose position |
| History length | `maxHistoryLength` | 50 | fixed | frames stored in Y-position rolling buffer |
| Calibration duration | — | 2000 | fixed | milliseconds |
| Calibration sample rate | — | 100 | fixed | milliseconds between samples |
| Trim percentage | — | 10% | fixed | top/bottom % removed from calibration data |

### 4.5 Keyboard Event Dispatch

Events are dispatched into the iframe's `document` (same-origin):

```javascript
// In script.js → sendKeyToGame()
const iframe = document.getElementById('dino-iframe');
const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
const evt = new KeyboardEvent(type, {
    key: ' ',
    code: 'Space',
    keyCode: 32,
    which: 32,
    bubbles: true,
    cancelable: true
});
iframeDoc.dispatchEvent(evt);
```

The T-Rex Runner game listens on its own `document` via `addEventListener('keydown', this)` using the `handleEvent` pattern, which receives these dispatched events.

### 4.6 T-Rex Runner Modifications

The original Chromium source (`trex/index.js`) has one modification:

- **`loadSounds()` method** — wrapped in try-catch with a null check on the `<template>` element, so the game starts without crashing when audio resources are not embedded.

No other changes to the game source.

---

## 5. UI Specification

### 5.1 Layout Grid

```
┌────────────────────────────────────────────────────────────┐
│                    Header (centered)                        │
│           🦖 Camera Dino Controller                        │
├────────────────────────┬───────────────────────────────────┤
│   Camera Feed (2fr)    │    T-Rex Runner (3fr)             │
│   ┌────────────────┐   │    ┌─────────────────────────┐    │
│   │  video + canvas │   │    │  iframe (trex/index.html)│   │
│   └────────────────┘   │    └─────────────────────────┘    │
│   [Start] [Recalibrate]│    [Start Game]                   │
├────────────┬───────────┴──────────┬────────────────────────┤
│  Status    │  Settings            │  Debug Info            │
│  (1fr)     │  (1fr)               │  (1fr)                 │
├────────────┴──────────────────────┴────────────────────────┤
│                    Footer — Instructions                    │
└────────────────────────────────────────────────────────────┘
```

### 5.2 Responsive Breakpoint

- **> 900px** — Side-by-side grid, 3-column bottom row
- **≤ 900px** — All panels stack vertically, buttons go full-width

### 5.3 Color System

| Element | Color | Hex |
|---|---|---|
| Primary / headings | Purple-blue | `#667eea` |
| Background gradient | Purple gradient | `#667eea → #764ba2` |
| Start Camera button | Green | `#28a745` |
| Recalibrate button | Yellow | `#ffc107` |
| Start Game button | Purple-blue | `#667eea` |
| Status: calibrating | Yellow border + bg | `#ffc107` / `#fff3cd` |
| Status: ready | Green border + bg | `#28a745` / `#d4edda` |
| Status: jumping | Red border + bg | `#dc3545` / `#f8d7da` |
| Pose keypoints | Green | `#00ff00` |
| Nose highlight | Red ring | `#ff0000` |
| Debug: baseline | Red dashed | `#ff0000` |
| Debug: Y-position | Blue | `#0066cc` |
| Debug: threshold | Orange dashed | `#ffa500` |

### 5.4 Status States

| State | Text | CSS Class | Visual |
|---|---|---|---|
| Initial | "Initializing..." | (none) | Purple left border |
| Camera loading | "Initializing camera..." | `calibrating` | Yellow left border, yellow bg |
| Model loading | "Loading pose detection model..." | `calibrating` | Yellow left border, yellow bg |
| Calibrating | "Calibrating - Stand still for 2 seconds..." | `calibrating` | Yellow left border, yellow bg |
| Ready | "Ready - Jump to control!" | `ready` | Green left border, green bg |
| Jump detected | "Jump detected!" | `jumping` | Red left border, red bg, pulse animation |
| Error | "Error: [message]" | `error` | (default styling) |

---

## 6. Hosting & Deployment

### 6.1 Requirements

- Any static HTTP server (Python, Node, Nginx, Live Server, etc.)
- Must be served over HTTP/HTTPS (not `file://`) for:
  - `navigator.mediaDevices.getUserMedia` (camera access)
  - Same-origin iframe keyboard dispatch
- No build step required

### 6.2 Deployment Options

| Option | Command | Notes |
|---|---|---|
| Python | `python -m http.server 8000` | Simplest, pre-installed on most systems |
| VS Code Live Server | Right-click → Open with Live Server | Auto-reload on save |
| Node http-server | `npx http-server -p 8000` | One-liner, no global install |
| Netlify / Vercel / GitHub Pages | Deploy static folder | For public sharing |

---

## 7. Known Limitations

1. **No game audio** — Audio template not embedded; game runs silently
2. **No duck/crouch detection** — Only jump is implemented
3. **Single pose only** — MoveNet Lightning tracks one person
4. **Synthetic keyboard events** — `dispatchEvent()` may behave differently than real keypresses in edge cases
5. **Legacy file** — `dino-game.js` (custom clone) still exists in project root but is not loaded
6. **No offline support** — TensorFlow.js loaded from CDN; requires internet on first load

---

## 8. Changelog

| Date | Change |
|---|---|
| 2026-02-28 | Initial build: camera + pose detection + keyboard simulation |
| 2026-02-28 | Added custom T-Rex clone (`dino-game.js`) |
| 2026-02-28 | Replaced clone with real Chromium T-Rex Runner in `trex/` iframe |
| 2026-02-28 | Fixed `loadSounds()` crash (missing audio template) |
| 2026-02-28 | Added Start Game button |
| 2026-02-28 | Redesigned layout: camera + game side-by-side (2fr:3fr) |
| 2026-02-28 | Bottom row: 3-column grid (status, settings, debug) |
| 2026-03-01 | Updated README.md + created PRD.md |
