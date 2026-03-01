const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ── Serve static files from project root ──
app.use(express.static(path.join(__dirname, '..')));

// ── Room Storage ──
const rooms = new Map();

function genCode() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += c[Math.floor(Math.random() * c.length)];
    return s;
}

function genSeed() {
    return Math.floor(Math.random() * 2147483647);
}

function cleanup(code) {
    const r = rooms.get(code);
    if (r && r.players.length === 0) { rooms.delete(code); }
}

// ── Socket.io ──
io.on('connection', (socket) => {
    let roomCode = null;
    let playerName = 'Player';

    // ── Create Room ──
    socket.on('create-room', (data) => {
        const code = genCode();
        playerName = (data.name || 'Player 1').substring(0, 15);

        rooms.set(code, {
            players: [{ id: socket.id, name: playerName, score: 0, alive: true, ready: false }],
            state: 'waiting',
            seed: 0,
            startTime: 0
        });

        socket.join(code);
        roomCode = code;
        socket.emit('room-created', { roomCode: code, playerId: socket.id, playerIndex: 0 });
    });

    // ── Join Room ──
    socket.on('join-room', (data) => {
        const code = (data.roomCode || '').toUpperCase().trim();
        playerName = (data.name || 'Player 2').substring(0, 15);
        const room = rooms.get(code);

        if (!room) return socket.emit('join-error', { message: 'Room not found' });
        if (room.players.length >= 2) return socket.emit('join-error', { message: 'Room is full' });
        if (room.state !== 'waiting') return socket.emit('join-error', { message: 'Game in progress' });

        room.players.push({ id: socket.id, name: playerName, score: 0, alive: true, ready: false });
        socket.join(code);
        roomCode = code;

        socket.emit('room-joined', {
            roomCode: code,
            playerId: socket.id,
            playerIndex: 1,
            opponent: { name: room.players[0].name }
        });
        socket.to(code).emit('opponent-joined', { opponent: { name: playerName } });
    });

    // ── Player Ready ──
    socket.on('player-ready', () => {
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        const p = room.players.find(x => x.id === socket.id);
        if (p) p.ready = true;

        // Notify room about ready state
        io.to(roomCode).emit('player-ready-ack', {
            playerId: socket.id,
            allReady: room.players.length === 2 && room.players.every(x => x.ready)
        });

        // Both ready → countdown → start
        if (room.players.length === 2 && room.players.every(x => x.ready)) {
            room.state = 'countdown';
            const seed = genSeed();
            room.seed = seed;

            io.to(roomCode).emit('game-countdown', { seconds: 3 });

            setTimeout(() => {
                room.state = 'playing';
                room.startTime = Date.now();
                room.players.forEach(x => { x.score = 0; x.alive = true; });
                io.to(roomCode).emit('game-start', { seed, startTime: room.startTime });
            }, 3500);
        }
    });

    // ── Jump Event ──
    socket.on('player-jump', () => {
        if (!roomCode) return;
        socket.to(roomCode).emit('opponent-jump');
    });

    // ── Score Update (throttled by client) ──
    socket.on('score-update', (data) => {
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room || room.state !== 'playing') return;
        const p = room.players.find(x => x.id === socket.id);
        if (p) p.score = data.score;
        socket.to(roomCode).emit('opponent-score', { score: data.score });
    });

    // ── Player Died ──
    socket.on('player-died', (data) => {
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room || room.state !== 'playing') return;

        const p = room.players.find(x => x.id === socket.id);
        if (p) { p.alive = false; p.score = data.score; }
        socket.to(roomCode).emit('opponent-died', { score: data.score });

        // Both dead → game over
        if (room.players.every(x => !x.alive)) {
            room.state = 'finished';
            const [p1, p2] = room.players;
            let winnerId = null, winnerName = null, tie = false;
            if (p1.score > p2.score) { winnerId = p1.id; winnerName = p1.name; }
            else if (p2.score > p1.score) { winnerId = p2.id; winnerName = p2.name; }
            else { tie = true; }

            io.to(roomCode).emit('game-finished', {
                players: room.players.map(x => ({ id: x.id, name: x.name, score: x.score })),
                winnerId, winnerName, tie
            });
            // Reset for rematch
            room.players.forEach(x => { x.ready = false; x.alive = true; x.score = 0; });
            room.state = 'waiting';
        }
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
        if (!roomCode) return;
        const room = rooms.get(roomCode);
        if (!room) return;
        room.players = room.players.filter(x => x.id !== socket.id);
        socket.to(roomCode).emit('opponent-left');
        room.state = 'waiting';
        room.players.forEach(x => { x.ready = false; });
        cleanup(roomCode);
    });
});

// ── Health ──
app.get('/api/health', (req, res) => res.json({ status: 'ok', rooms: rooms.size }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dino Arena server → http://localhost:${PORT}`));
