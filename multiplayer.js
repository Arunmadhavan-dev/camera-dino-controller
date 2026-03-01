/**
 * Multiplayer Manager
 * Handles Socket.io connection, room management, and score syncing
 */
class MultiplayerManager {
    constructor() {
        this.socket = null;
        this.roomCode = null;
        this.playerId = null;
        this.playerIndex = null;
        this.myScore = 0;
        this.opponentScore = 0;
        this.inRoom = false;
        this.isPlaying = false;

        // DOM elements — Lobby
        this.lobbyEl = document.getElementById('mp-lobby');
        this.roomEl = document.getElementById('mp-room');
        this.playerNameInput = document.getElementById('player-name');
        this.roomCodeInput = document.getElementById('room-code-input');
        this.createRoomBtn = document.getElementById('create-room-btn');
        this.joinRoomBtn = document.getElementById('join-room-btn');
        this.errorEl = document.getElementById('mp-error');

        // DOM elements — Room
        this.roomCodeDisplay = document.getElementById('mp-room-code');
        this.copyLinkBtn = document.getElementById('mp-copy-link');
        this.youNameEl = document.getElementById('mp-you-name');
        this.youScoreEl = document.getElementById('mp-you-score');
        this.youStatusEl = document.getElementById('mp-you-status');
        this.oppNameEl = document.getElementById('mp-opp-name');
        this.oppScoreEl = document.getElementById('mp-opp-score');
        this.oppStatusEl = document.getElementById('mp-opp-status');
        this.readyBtn = document.getElementById('mp-ready-btn');
        this.leaveBtn = document.getElementById('mp-leave-btn');
        this.countdownEl = document.getElementById('mp-countdown');
        this.resultEl = document.getElementById('mp-result');

        // DOM elements — Score bar
        this.myScoreEl = document.getElementById('my-score');
        this.oppScoreBarEl = document.getElementById('opp-score-bar');
        this.oppLiveScoreEl = document.getElementById('opp-live-score');

        this.initEventListeners();
        this.connectSocket();
        this.listenForGameMessages();

        // Check URL for room code (invite link)
        const params = new URLSearchParams(window.location.search);
        const roomFromUrl = params.get('room');
        if (roomFromUrl) {
            this.roomCodeInput.value = roomFromUrl;
        }
    }

    connectSocket() {
        this.socket = io();

        this.socket.on('connect', () => {
            console.log('Connected to multiplayer server');
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showError('Disconnected from server');
        });

        // ── Room Events ──
        this.socket.on('room-created', (data) => {
            this.roomCode = data.roomCode;
            this.playerId = data.playerId;
            this.playerIndex = data.playerIndex;
            this.inRoom = true;
            this.showRoom();
            this.roomCodeDisplay.textContent = data.roomCode;
            this.youNameEl.textContent = this.playerNameInput.value || 'You';
            this.youStatusEl.textContent = 'Waiting for opponent';
            this.oppNameEl.textContent = 'Waiting for opponent...';
            this.oppStatusEl.textContent = '--';
            this.readyBtn.disabled = true;
            this.hideError();
        });

        this.socket.on('room-joined', (data) => {
            this.roomCode = data.roomCode;
            this.playerId = data.playerId;
            this.playerIndex = data.playerIndex;
            this.inRoom = true;
            this.showRoom();
            this.roomCodeDisplay.textContent = data.roomCode;
            this.youNameEl.textContent = this.playerNameInput.value || 'You';
            this.youStatusEl.textContent = 'In room';
            this.oppNameEl.textContent = data.opponent.name;
            this.oppStatusEl.textContent = 'In room';
            this.readyBtn.disabled = false;
            this.hideError();
        });

        this.socket.on('join-error', (data) => {
            this.showError(data.message);
        });

        this.socket.on('opponent-joined', (data) => {
            this.oppNameEl.textContent = data.opponent.name;
            this.oppStatusEl.textContent = 'In room';
            this.readyBtn.disabled = false;
        });

        this.socket.on('opponent-left', () => {
            this.oppNameEl.textContent = 'Opponent left';
            this.oppStatusEl.textContent = '--';
            this.oppScoreEl.textContent = '0';
            this.readyBtn.disabled = true;
            this.isPlaying = false;
            this.resultEl.style.display = 'none';
            this.countdownEl.style.display = 'none';
            this.oppScoreBarEl.style.display = 'none';
        });

        // ── Game Events ──
        this.socket.on('game-countdown', (data) => {
            this.resultEl.style.display = 'none';
            this.countdownEl.style.display = 'block';
            this.youStatusEl.textContent = 'Get ready!';
            this.oppStatusEl.textContent = 'Get ready!';
            let count = data.seconds;
            this.countdownEl.textContent = count;
            const interval = setInterval(() => {
                count--;
                if (count > 0) {
                    this.countdownEl.textContent = count;
                } else {
                    this.countdownEl.textContent = 'GO!';
                    clearInterval(interval);
                    setTimeout(() => {
                        this.countdownEl.style.display = 'none';
                    }, 500);
                }
            }, 1000);
        });

        this.socket.on('game-start', () => {
            this.isPlaying = true;
            this.myScore = 0;
            this.opponentScore = 0;
            this.youScoreEl.textContent = '0';
            this.oppScoreEl.textContent = '0';
            this.myScoreEl.textContent = '0';
            this.oppLiveScoreEl.textContent = '0';
            this.oppScoreBarEl.style.display = 'inline';
            this.youStatusEl.textContent = 'Playing';
            this.oppStatusEl.textContent = 'Playing';
            this.readyBtn.disabled = true;

            // Auto-start the T-Rex game
            if (window.dinoController) {
                window.dinoController.sendKeyToGame('keydown', 32);
                setTimeout(() => window.dinoController.sendKeyToGame('keyup', 32), 100);
            }
        });

        this.socket.on('opponent-score', (data) => {
            this.opponentScore = data.score;
            this.oppScoreEl.textContent = data.score;
            this.oppLiveScoreEl.textContent = data.score;
        });

        this.socket.on('opponent-died', (data) => {
            this.oppStatusEl.textContent = 'Crashed!';
            this.oppScoreEl.textContent = data.score;
            this.oppLiveScoreEl.textContent = data.score;
        });

        this.socket.on('game-over', (data) => {
            this.isPlaying = false;
            this.readyBtn.disabled = false;
            this.readyBtn.textContent = 'Rematch';

            const myData = data.players.find(p => p.id === this.playerId);
            const oppData = data.players.find(p => p.id !== this.playerId);

            this.youScoreEl.textContent = myData ? myData.score : this.myScore;
            this.oppScoreEl.textContent = oppData ? oppData.score : this.opponentScore;

            this.resultEl.style.display = 'block';
            if (data.tie) {
                this.resultEl.textContent = "It's a TIE!";
                this.resultEl.className = 'mp-result tie';
            } else if (data.winnerId === this.playerId) {
                this.resultEl.textContent = '🏆 YOU WIN!';
                this.resultEl.className = 'mp-result win';
            } else {
                this.resultEl.textContent = `${data.winnerName} wins!`;
                this.resultEl.className = 'mp-result lose';
            }

            this.youStatusEl.textContent = 'Finished';
            this.oppStatusEl.textContent = 'Finished';
        });
    }

    initEventListeners() {
        this.createRoomBtn.addEventListener('click', () => {
            const name = this.playerNameInput.value.trim() || 'Player';
            this.socket.emit('create-room', { name });
        });

        this.joinRoomBtn.addEventListener('click', () => {
            const code = this.roomCodeInput.value.trim().toUpperCase();
            const name = this.playerNameInput.value.trim() || 'Player';
            if (!code) {
                this.showError('Enter a room code');
                return;
            }
            this.socket.emit('join-room', { roomCode: code, name });
        });

        this.readyBtn.addEventListener('click', () => {
            this.socket.emit('player-ready');
            this.youStatusEl.textContent = 'Ready!';
            this.readyBtn.disabled = true;
            this.readyBtn.textContent = 'Ready';
        });

        this.leaveBtn.addEventListener('click', () => {
            this.socket.disconnect();
            this.socket.connect();
            this.inRoom = false;
            this.isPlaying = false;
            this.roomCode = null;
            this.showLobby();
            this.oppScoreBarEl.style.display = 'none';
            this.readyBtn.textContent = 'Ready';
        });

        this.copyLinkBtn.addEventListener('click', () => {
            const url = `${window.location.origin}${window.location.pathname}?room=${this.roomCode}`;
            navigator.clipboard.writeText(url).then(() => {
                this.copyLinkBtn.textContent = '✅ Copied!';
                setTimeout(() => {
                    this.copyLinkBtn.textContent = '📋 Copy Link';
                }, 2000);
            });
        });
    }

    listenForGameMessages() {
        window.addEventListener('message', (event) => {
            const data = event.data;
            if (!data || !data.type) return;

            if (data.type === 'score-update') {
                this.myScore = data.score;
                this.myScoreEl.textContent = data.score;
                this.youScoreEl.textContent = data.score;

                if (this.inRoom && this.isPlaying) {
                    this.socket.emit('score-update', { score: data.score });
                }
            }

            if (data.type === 'game-over') {
                this.myScore = data.score;
                this.myScoreEl.textContent = data.score;
                this.youScoreEl.textContent = data.score;

                if (this.inRoom && this.isPlaying) {
                    this.socket.emit('player-died', { score: data.score });
                    this.youStatusEl.textContent = 'Crashed!';
                }
            }
        });
    }

    showRoom() {
        this.lobbyEl.style.display = 'none';
        this.roomEl.style.display = 'block';
        this.resultEl.style.display = 'none';
        this.countdownEl.style.display = 'none';
    }

    showLobby() {
        this.lobbyEl.style.display = 'block';
        this.roomEl.style.display = 'none';
    }

    showError(msg) {
        this.errorEl.textContent = msg;
        this.errorEl.style.display = 'block';
        setTimeout(() => this.hideError(), 4000);
    }

    hideError() {
        this.errorEl.style.display = 'none';
    }
}

// Initialize multiplayer when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.multiplayer = new MultiplayerManager();
});
