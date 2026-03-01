/**
 * App – Main controller for Dino Arena
 * Manages: screen transitions, Socket.io, game engines, pose controller
 */
(function () {
    'use strict';

    // ── State ──
    let socket = null;
    let pose = null;
    let roomCode = null;
    let playerId = null;
    let playerName = '';
    let opponentName = '';
    let cameraReady = false;
    let isGamePlaying = false;
    let myScore = 0;

    // ── DOM refs ──
    const $ = id => document.getElementById(id);

    let singlePose = null; // separate pose controller for single player
    let singlePlaying = false;

    const screens = {
        landing: $('screen-landing'),
        single: $('screen-single'),
        lobby: $('screen-lobby'),
        countdown: $('screen-countdown'),
        game: $('screen-game'),
        results: $('screen-results')
    };

    // Landing - mode selection
    const modeSelect = $('mode-select');
    const multiForm = $('multi-form');
    const btnModeSingle = $('btn-mode-single');
    const btnModeMulti = $('btn-mode-multi');
    const btnBackMode = $('btn-back-mode');

    // Landing - multiplayer form
    const playerNameInput = $('player-name');
    const btnCreate = $('btn-create');
    const btnJoin = $('btn-join');
    const joinCodeInput = $('join-code');
    const landingError = $('landing-error');

    // Single player
    const singleScore = $('single-score');
    const btnSingleBack = $('btn-single-back');
    const btnSingleStartCam = $('btn-single-start-cam');
    const btnSingleRecalibrate = $('btn-single-recalibrate');
    const singleCamStatus = $('single-cam-status');
    const singleCalProgress = $('single-cal-progress');
    const singleCalFill = $('single-cal-fill');
    const singleCalText = $('single-cal-text');
    const singleCamHint = $('single-cam-hint');

    // Lobby
    const lobbyCode = $('lobby-code');
    const btnCopy = $('btn-copy');
    const lpYouName = $('lp-you-name');
    const lpYouStatus = $('lp-you-status');
    const lpOppName = $('lp-opp-name');
    const lpOppStatus = $('lp-opp-status');
    const btnReady = $('btn-ready');
    const btnLeave = $('btn-leave');
    const lobbyInfo = $('lobby-info');

    // Lobby camera
    const btnStartCam = $('btn-start-cam');
    const btnRecalibrate = $('btn-recalibrate');
    const lobbyCamStatus = $('lobby-cam-status');
    const lobbyCamProgress = $('lobby-cam-progress');
    const calibrationFill = $('calibration-fill');
    const calibrationText = $('calibration-text');
    const lobbyCamHint = $('lobby-cam-hint');
    const lobbyWebcam = $('lobby-webcam');
    const lobbyPoseCanvas = $('lobby-pose-canvas');

    // Countdown
    const countdownNumber = $('countdown-number');

    // Game
    const arenaYouName = $('arena-you-name');
    const arenaYouScore = $('arena-you-score');
    const arenaYouBadge = $('arena-you-badge');
    const arenaOppName = $('arena-opp-name');
    const arenaOppScore = $('arena-opp-score');
    const arenaOppBadge = $('arena-opp-badge');
    const camStatus = $('cam-status');
    const sensVal = $('sens-val');
    const cdVal = $('cd-val');
    const sensitivitySlider = $('sensitivity');
    const cooldownSlider = $('cooldown');
    const btnToggleSettings = $('btn-toggle-settings');
    const settingsBody = $('settings-body');

    // Results
    const resultsIcon = $('results-icon');
    const resultsTitle = $('results-title');
    const rsYouName = $('rs-you-name');
    const rsYouScore = $('rs-you-score');
    const rsOppName = $('rs-opp-name');
    const rsOppScore = $('rs-opp-score');
    const btnRematch = $('btn-rematch');
    const btnNewRoom = $('btn-new-room');
    const confettiCanvas = $('confetti-canvas');

    // ── Screen Management ──
    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
    }

    function showLandingError(msg) {
        landingError.textContent = msg;
        landingError.style.display = 'block';
        setTimeout(() => { landingError.style.display = 'none'; }, 4000);
    }

    // ── Check URL for room code ──
    const urlParams = new URLSearchParams(window.location.search);
    const roomFromUrl = urlParams.get('room');
    if (roomFromUrl) {
        joinCodeInput.value = roomFromUrl;
    }

    // ── Socket.io ──
    function connectSocket() {
        socket = io();

        socket.on('connect', () => {
            console.log('Connected:', socket.id);
        });

        socket.on('disconnect', () => {
            console.log('Disconnected');
        });

        // Room events
        socket.on('room-created', (data) => {
            roomCode = data.roomCode;
            playerId = data.playerId;
            lobbyCode.textContent = roomCode;
            lpYouName.textContent = playerName;
            lpYouStatus.textContent = 'Joined';
            lpOppName.textContent = 'Waiting...';
            lpOppStatus.textContent = '--';
            btnReady.disabled = true;
            lobbyInfo.textContent = cameraReady
                ? 'Share the room code with your friend!'
                : '👆 Start your camera first, then share the room code!';
            showScreen('lobby');
        });

        socket.on('room-joined', (data) => {
            roomCode = data.roomCode;
            playerId = data.playerId;
            opponentName = data.opponent.name;
            lobbyCode.textContent = roomCode;
            lpYouName.textContent = playerName;
            lpYouStatus.textContent = 'Joined';
            lpOppName.textContent = opponentName;
            lpOppStatus.textContent = 'In room';
            btnReady.disabled = !cameraReady;
            lobbyInfo.textContent = cameraReady
                ? 'Opponent is here! Click Ready Up to start!'
                : '👆 Start your camera and calibrate first, then Ready up!';
            showScreen('lobby');
        });

        socket.on('join-error', (data) => {
            showLandingError(data.message);
        });

        socket.on('opponent-joined', (data) => {
            opponentName = data.opponent.name;
            lpOppName.textContent = opponentName;
            lpOppStatus.textContent = 'In room';
            btnReady.disabled = !cameraReady;
            if (cameraReady) {
                lobbyInfo.textContent = 'Opponent joined! Click Ready Up to play!';
            } else {
                lobbyInfo.textContent = '👆 Start your camera and calibrate — then you can Ready up!';
            }
        });

        socket.on('opponent-left', () => {
            opponentName = '';
            lpOppName.textContent = 'Left...';
            lpOppStatus.textContent = '--';
            lpOppStatus.classList.remove('ready');
            btnReady.disabled = true;
            lobbyInfo.textContent = 'Opponent disconnected. Waiting for a new player...';

            // If we were in game, go back to lobby
            if (screens.game.classList.contains('active') || screens.countdown.classList.contains('active')) {
                isGamePlaying = false;
                showScreen('lobby');
                transferCameraToLobby();
            }
        });

        socket.on('player-ready-ack', (data) => {
            if (data.playerId === playerId) {
                lpYouStatus.textContent = 'Ready!';
                lpYouStatus.classList.add('ready');
            } else {
                lpOppStatus.textContent = 'Ready!';
                lpOppStatus.classList.add('ready');
            }
            if (data.allReady) {
                lobbyInfo.textContent = 'Both ready! Starting...';
            }
        });

        // Countdown
        socket.on('game-countdown', (data) => {
            showScreen('countdown');
            let count = data.seconds;
            countdownNumber.textContent = count;
            const interval = setInterval(() => {
                count--;
                if (count > 0) {
                    countdownNumber.textContent = count;
                } else {
                    countdownNumber.textContent = 'GO!';
                    clearInterval(interval);
                }
            }, 1000);
        });

        // Game start
        socket.on('game-start', () => {
            startGame();
        });

        // Opponent events during game
        socket.on('opponent-jump', () => {
            sendKeyToIframe('dino-iframe-opp', 'keydown', 32);
            setTimeout(() => sendKeyToIframe('dino-iframe-opp', 'keyup', 32), 100);
        });

        socket.on('opponent-score', (data) => {
            arenaOppScore.textContent = data.score;
        });

        socket.on('opponent-died', (data) => {
            arenaOppScore.textContent = data.score;
            arenaOppBadge.textContent = 'Crashed';
            arenaOppBadge.classList.add('crashed');
        });

        // Game finished (both dead)
        socket.on('game-finished', (data) => {
            showResults(data);
        });
    }

    // ── Camera Init (called from Start Camera button) ──
    async function initCamera() {
        if (pose && pose.running) return; // already running

        btnStartCam.disabled = true;
        btnStartCam.textContent = 'Starting...';
        lobbyCamStatus.textContent = 'Requesting camera...';
        lobbyCamStatus.className = 'lobby-cam-overlay calibrating';
        lobbyCamHint.textContent = 'Requesting camera access...';

        pose = new PoseController({
            jumpThreshold: parseInt(sensitivitySlider.value),
            jumpCooldown: parseInt(cooldownSlider.value),
            onJump: () => {
                // During lobby: just show visual feedback
                if (!isGamePlaying) {
                    lobbyCamStatus.textContent = 'JUMP!';
                    lobbyCamStatus.className = 'lobby-cam-overlay jump';
                    setTimeout(() => {
                        lobbyCamStatus.textContent = 'Calibrated ✓';
                        lobbyCamStatus.className = 'lobby-cam-overlay active';
                    }, 300);
                    return;
                }
                // During game: send Space key into my T-Rex iframe
                sendKeyToIframe('dino-iframe-you', 'keydown', 32);
                setTimeout(() => sendKeyToIframe('dino-iframe-you', 'keyup', 32), 100);
                socket.emit('player-jump');
                camStatus.textContent = 'JUMP!';
                camStatus.style.color = 'var(--accent)';
                setTimeout(() => {
                    camStatus.textContent = 'Ready';
                    camStatus.style.color = '';
                }, 300);
            },
            onStatus: (msg) => {
                lobbyCamStatus.textContent = msg;
            },
            onCalibrated: () => {
                cameraReady = true;
                lobbyCamStatus.textContent = 'Calibrated ✓';
                lobbyCamStatus.className = 'lobby-cam-overlay active';
                lobbyCamProgress.style.display = 'none';
                btnRecalibrate.style.display = 'inline-flex';
                lobbyCamHint.textContent = 'Calibrated! Jump to test — your body is being tracked.';
                lobbyCamHint.classList.add('success');

                // Enable Ready if opponent is present
                if (opponentName) {
                    btnReady.disabled = false;
                    lobbyInfo.textContent = 'Camera ready! Click Ready Up to start!';
                } else {
                    lobbyInfo.textContent = 'Camera ready! Waiting for opponent to join...';
                }
            },
            onError: (msg) => {
                lobbyCamStatus.textContent = 'Error';
                lobbyCamStatus.className = 'lobby-cam-overlay';
                lobbyCamProgress.style.display = 'none';
                lobbyCamHint.textContent = msg;
                lobbyCamHint.classList.remove('success');
                btnRecalibrate.style.display = 'inline-flex';
                // Also show start button again if camera never started
                if (!pose || !pose.stream) {
                    btnStartCam.style.display = 'inline-flex';
                    btnStartCam.disabled = false;
                    btnStartCam.textContent = 'Retry Camera';
                }
            }
        });

        try {
            // Step 1: Start camera + load model (no calibration yet)
            await pose.startCamera(lobbyWebcam, lobbyPoseCanvas);
            btnStartCam.style.display = 'none';

            // Step 2: Show progress bar and start calibration
            lobbyCamProgress.style.display = 'flex';
            lobbyCamStatus.textContent = 'Calibrating...';
            lobbyCamStatus.className = 'lobby-cam-overlay calibrating';
            lobbyCamHint.textContent = 'Stand still — calibrating your baseline height...';
            calibrationFill.style.width = '0%';

            // Animate progress bar in sync with calibration (2 seconds)
            let elapsed = 0;
            const calInterval = setInterval(() => {
                elapsed += 100;
                const pct = Math.min((elapsed / 2000) * 100, 100);
                calibrationFill.style.width = pct + '%';
                calibrationText.textContent = Math.round(pct) + '%';
                if (elapsed >= 2200) clearInterval(calInterval);
            }, 100);

            // Step 3: Run calibration (takes ~2 seconds)
            await pose.calibrate();

        } catch (e) {
            lobbyCamHint.textContent = 'Camera failed: ' + e.message;
            btnStartCam.style.display = 'inline-flex';
            btnStartCam.disabled = false;
            btnStartCam.textContent = 'Retry Camera';
        }
    }

    // ── Transfer webcam stream from lobby to game screen ──
    function transferCameraToGame() {
        const gameVideo = $('webcam');
        const gamePoseCanvas = $('pose-canvas');

        if (pose && pose.stream) {
            gameVideo.srcObject = pose.stream;
            gamePoseCanvas.width = lobbyPoseCanvas.width;
            gamePoseCanvas.height = lobbyPoseCanvas.height;
            // Swap pose controller to use game screen elements
            pose.video = gameVideo;
            pose.canvas = gamePoseCanvas;
            pose.ctx = gamePoseCanvas.getContext('2d');
            camStatus.textContent = 'Ready';
        }
    }

    // ── Send keyboard event into an iframe ──
    function sendKeyToIframe(iframeId, type, keyCode) {
        const iframe = $(iframeId);
        if (!iframe) return;
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        if (!iframeDoc) return;
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

    // ── Reload an iframe (for rematch) ──
    function reloadIframe(iframeId) {
        const iframe = $(iframeId);
        if (iframe) {
            iframe.src = iframe.src;
        }
    }

    // ── Start Game ──
    function startGame() {
        showScreen('game');
        transferCameraToGame();
        isGamePlaying = true;
        myScore = 0;

        arenaYouName.textContent = playerName;
        arenaOppName.textContent = opponentName;
        arenaYouScore.textContent = '0';
        arenaOppScore.textContent = '0';
        arenaYouBadge.textContent = 'Playing';
        arenaYouBadge.classList.remove('crashed');
        arenaOppBadge.textContent = 'Playing';
        arenaOppBadge.classList.remove('crashed');

        // Reload iframes to reset the games
        reloadIframe('dino-iframe-you');
        reloadIframe('dino-iframe-opp');

        // Wait for iframes to load, then start both games with Space key
        setTimeout(() => {
            sendKeyToIframe('dino-iframe-you', 'keydown', 32);
            sendKeyToIframe('dino-iframe-opp', 'keydown', 32);
            setTimeout(() => {
                sendKeyToIframe('dino-iframe-you', 'keyup', 32);
                sendKeyToIframe('dino-iframe-opp', 'keyup', 32);
            }, 100);
        }, 800);
    }

    // ── Show Results ──
    function showResults(data) {
        isGamePlaying = false;

        const me = data.players.find(p => p.id === playerId);
        const opp = data.players.find(p => p.id !== playerId);

        rsYouName.textContent = me ? me.name : playerName;
        rsYouScore.textContent = me ? me.score : 0;
        rsOppName.textContent = opp ? opp.name : opponentName;
        rsOppScore.textContent = opp ? opp.score : 0;

        if (data.tie) {
            resultsIcon.textContent = '🤝';
            resultsTitle.textContent = "It's a Tie!";
            resultsTitle.className = 'tie-title';
        } else if (data.winnerId === playerId) {
            resultsIcon.textContent = '🏆';
            resultsTitle.textContent = 'You Win!';
            resultsTitle.className = '';
            launchConfetti();
        } else {
            resultsIcon.textContent = '😢';
            resultsTitle.textContent = data.winnerName + ' Wins!';
            resultsTitle.className = 'lose-title';
        }

        showScreen('results');
    }

    // ── Confetti ──
    function launchConfetti() {
        const canvas = confettiCanvas;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        const ctx = canvas.getContext('2d');
        const particles = [];
        const colors = ['#7c5cfc', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#f472b6'];

        for (let i = 0; i < 150; i++) {
            particles.push({
                x: Math.random() * canvas.width,
                y: -20 - Math.random() * 200,
                w: 4 + Math.random() * 6,
                h: 8 + Math.random() * 8,
                vx: (Math.random() - 0.5) * 4,
                vy: 2 + Math.random() * 4,
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 10,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }

        let frames = 0;
        function animConfetti() {
            frames++;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            for (const p of particles) {
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.05;
                p.rotation += p.rotSpeed;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                ctx.restore();
            }
            if (frames < 200) {
                requestAnimationFrame(animConfetti);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }
        animConfetti();
    }

    // ── Reset for Rematch ──
    function resetForRematch() {
        lpYouStatus.textContent = 'Joined';
        lpYouStatus.classList.remove('ready');
        lpOppStatus.textContent = 'In room';
        lpOppStatus.classList.remove('ready');
        btnReady.disabled = !cameraReady;
        btnReady.textContent = 'Ready Up';
        lobbyInfo.textContent = 'Click Ready for a rematch!';
        showScreen('lobby');
        transferCameraToLobby();
    }

    function resetFull() {
        if (socket) {
            socket.disconnect();
            socket.connect();
        }
        roomCode = null;
        playerId = null;
        opponentName = '';
        cameraReady = !!pose && pose.isCalibrated;
        // Reset landing to mode selection
        modeSelect.style.display = 'block';
        multiForm.style.display = 'none';
        showScreen('landing');
    }

    // ── Transfer camera back to lobby (for rematch) ──
    function transferCameraToLobby() {
        if (pose && pose.stream) {
            lobbyWebcam.srcObject = pose.stream;
            pose.video = lobbyWebcam;
            pose.canvas = lobbyPoseCanvas;
            pose.ctx = lobbyPoseCanvas.getContext('2d');
            lobbyCamStatus.textContent = 'Calibrated ✓';
            lobbyCamStatus.className = 'lobby-cam-overlay active';
        }
    }

    // ══════════════ SINGLE PLAYER LOGIC ══════════════

    // ── Single Player: Start Camera ──
    async function initSingleCamera() {
        if (singlePose && singlePose.running) return;

        const videoEl = $('single-webcam');
        const canvasEl = $('single-pose-canvas');

        btnSingleStartCam.disabled = true;
        btnSingleStartCam.textContent = 'Starting...';
        singleCamStatus.textContent = 'Requesting camera...';
        singleCamHint.textContent = 'Requesting camera access...';

        singlePose = new PoseController({
            jumpThreshold: parseInt(sensitivitySlider.value),
            jumpCooldown: parseInt(cooldownSlider.value),
            onJump: () => {
                // Send Space key into single player iframe
                sendKeyToIframe('dino-iframe-single', 'keydown', 32);
                setTimeout(() => sendKeyToIframe('dino-iframe-single', 'keyup', 32), 100);
                singleCamStatus.textContent = 'JUMP!';
                singleCamStatus.style.color = 'var(--accent)';
                setTimeout(() => {
                    singleCamStatus.textContent = 'Ready';
                    singleCamStatus.style.color = '';
                }, 300);
            },
            onStatus: (msg) => {
                singleCamStatus.textContent = msg;
            },
            onCalibrated: () => {
                singleCamStatus.textContent = 'Calibrated ✓';
                singleCalProgress.style.display = 'none';
                btnSingleRecalibrate.style.display = 'inline-flex';
                singleCamHint.textContent = 'Calibrated! Jump to play the Dino game!';
                singleCamHint.classList.add('success');
                singlePlaying = true;

                // Auto-start the game
                reloadIframe('dino-iframe-single');
                setTimeout(() => {
                    sendKeyToIframe('dino-iframe-single', 'keydown', 32);
                    setTimeout(() => sendKeyToIframe('dino-iframe-single', 'keyup', 32), 100);
                }, 800);
            },
            onError: (msg) => {
                singleCamStatus.textContent = 'Error';
                singleCamHint.textContent = msg;
                singleCalProgress.style.display = 'none';
                btnSingleRecalibrate.style.display = 'inline-flex';
                if (!singlePose || !singlePose.stream) {
                    btnSingleStartCam.style.display = 'inline-flex';
                    btnSingleStartCam.disabled = false;
                    btnSingleStartCam.textContent = 'Retry Camera';
                }
            }
        });

        try {
            await singlePose.startCamera(videoEl, canvasEl);
            btnSingleStartCam.style.display = 'none';

            singleCalProgress.style.display = 'flex';
            singleCamStatus.textContent = 'Calibrating...';
            singleCamHint.textContent = 'Stand still — calibrating...';
            singleCalFill.style.width = '0%';

            let elapsed = 0;
            const calInterval = setInterval(() => {
                elapsed += 100;
                const pct = Math.min((elapsed / 2000) * 100, 100);
                singleCalFill.style.width = pct + '%';
                singleCalText.textContent = Math.round(pct) + '%';
                if (elapsed >= 2200) clearInterval(calInterval);
            }, 100);

            await singlePose.calibrate();
        } catch (e) {
            singleCamHint.textContent = 'Camera failed: ' + e.message;
            btnSingleStartCam.style.display = 'inline-flex';
            btnSingleStartCam.disabled = false;
            btnSingleStartCam.textContent = 'Retry Camera';
        }
    }

    // ── Single Player: postMessage listener for score ──
    window.addEventListener('message', (event) => {
        const data = event.data;
        if (!data || !data.type) return;

        // Single player iframe
        const singleIframe = $('dino-iframe-single');
        if (singleIframe && event.source === singleIframe.contentWindow) {
            if (data.type === 'score-update') {
                singleScore.textContent = data.score;
            }
            if (data.type === 'game-over') {
                singleScore.textContent = data.score;
                singleCamHint.textContent = 'Game Over! Score: ' + data.score + ' — Jump to restart!';
                singleCamHint.classList.remove('success');
            }
            return;
        }

        // Multiplayer iframe (your game)
        const youIframe = $('dino-iframe-you');
        const isMyGame = event.source === (youIframe && youIframe.contentWindow);

        if (isMyGame && data.type === 'score-update') {
            myScore = data.score;
            arenaYouScore.textContent = data.score;
            if (isGamePlaying) {
                socket.emit('score-update', { score: data.score });
            }
        }

        if (isMyGame && data.type === 'game-over') {
            myScore = data.score;
            arenaYouScore.textContent = data.score;
            arenaYouBadge.textContent = 'Crashed';
            arenaYouBadge.classList.add('crashed');
            if (isGamePlaying) {
                socket.emit('player-died', { score: data.score });
            }
        }
    });

    // ══════════════ EVENT LISTENERS ══════════════

    // ── Mode Selection ──
    btnModeSingle.addEventListener('click', () => {
        showScreen('single');
    });

    btnModeMulti.addEventListener('click', () => {
        modeSelect.style.display = 'none';
        multiForm.style.display = 'flex';
    });

    btnBackMode.addEventListener('click', () => {
        multiForm.style.display = 'none';
        modeSelect.style.display = 'block';
    });

    // ── Single Player buttons ──
    btnSingleStartCam.addEventListener('click', () => {
        initSingleCamera();
    });

    btnSingleRecalibrate.addEventListener('click', async () => {
        if (!singlePose || !singlePose.running) return;
        singleCamStatus.textContent = 'Recalibrating...';
        singleCamHint.textContent = 'Stand still — recalibrating...';
        singleCamHint.classList.remove('success');
        singleCalProgress.style.display = 'flex';
        singleCalFill.style.width = '0%';

        let elapsed = 0;
        const calInterval = setInterval(() => {
            elapsed += 100;
            const pct = Math.min((elapsed / 2000) * 100, 100);
            singleCalFill.style.width = pct + '%';
            singleCalText.textContent = Math.round(pct) + '%';
            if (elapsed >= 2200) clearInterval(calInterval);
        }, 100);

        await singlePose.calibrate();
    });

    btnSingleBack.addEventListener('click', () => {
        singlePlaying = false;
        if (singlePose) { singlePose.stop(); singlePose = null; }
        showScreen('landing');
        // Reset single player UI
        btnSingleStartCam.style.display = 'inline-flex';
        btnSingleStartCam.disabled = false;
        btnSingleStartCam.textContent = 'Start Camera';
        btnSingleRecalibrate.style.display = 'none';
        singleCalProgress.style.display = 'none';
        singleCamHint.textContent = 'Start camera, calibrate, then jump to play!';
        singleCamHint.classList.remove('success');
        singleScore.textContent = '0';
    });

    // ── Multiplayer Lobby buttons ──
    btnStartCam.addEventListener('click', () => {
        initCamera();
    });

    btnRecalibrate.addEventListener('click', async () => {
        if (!pose || !pose.running) return;
        cameraReady = false;
        btnReady.disabled = true;
        lobbyCamStatus.textContent = 'Recalibrating...';
        lobbyCamStatus.className = 'lobby-cam-overlay calibrating';
        lobbyCamHint.textContent = 'Stand still — recalibrating...';
        lobbyCamHint.classList.remove('success');
        lobbyCamProgress.style.display = 'flex';
        calibrationFill.style.width = '0%';

        let elapsed = 0;
        const calInterval = setInterval(() => {
            elapsed += 100;
            const pct = Math.min((elapsed / 2000) * 100, 100);
            calibrationFill.style.width = pct + '%';
            calibrationText.textContent = Math.round(pct) + '%';
            if (elapsed >= 2200) clearInterval(calInterval);
        }, 100);

        await pose.calibrate();
    });

    btnCreate.addEventListener('click', () => {
        playerName = playerNameInput.value.trim() || 'Player';
        socket.emit('create-room', { name: playerName });
    });

    btnJoin.addEventListener('click', () => {
        const code = joinCodeInput.value.trim().toUpperCase();
        if (!code) return showLandingError('Enter a room code');
        playerName = playerNameInput.value.trim() || 'Player';
        socket.emit('join-room', { roomCode: code, name: playerName });
    });

    // Enter key on join code input
    joinCodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnJoin.click();
    });

    btnCopy.addEventListener('click', () => {
        const url = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
        navigator.clipboard.writeText(url).then(() => {
            btnCopy.textContent = '✅ Copied!';
            setTimeout(() => { btnCopy.textContent = '📋 Copy Link'; }, 2000);
        });
    });

    btnReady.addEventListener('click', () => {
        socket.emit('player-ready');
        btnReady.disabled = true;
        btnReady.textContent = 'Waiting...';
    });

    btnLeave.addEventListener('click', () => {
        resetFull();
    });

    btnRematch.addEventListener('click', () => {
        resetForRematch();
    });

    btnNewRoom.addEventListener('click', () => {
        resetFull();
    });

    // Settings toggle
    btnToggleSettings.addEventListener('click', () => {
        const body = settingsBody;
        body.style.display = body.style.display === 'none' ? 'flex' : 'none';
    });

    sensitivitySlider.addEventListener('input', () => {
        sensVal.textContent = sensitivitySlider.value;
        if (pose) pose.updateSettings(parseInt(sensitivitySlider.value));
    });

    cooldownSlider.addEventListener('input', () => {
        cdVal.textContent = cooldownSlider.value;
        if (pose) pose.updateSettings(undefined, parseInt(cooldownSlider.value));
    });

    // ── Init ──
    connectSocket();
    showScreen('landing');

})();
