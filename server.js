/* =============================================
   BINGO REAL MULTIJUGADOR — Servidor Backend (Salas Aisladas)
   ============================================= */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Servir archivos estáticos del juego (HTML, CSS, JS)
app.use(express.static(path.join(__dirname)));

// --- Estado Centralizado por Salas ---
const rooms = {}; // roomId (4 dígitos) -> roomState

// --- Constantes de Bingo ---
const COLUMNS = ['B', 'I', 'N', 'G', 'O'];
const RANGES = {
    B: [1, 15],
    I: [16, 30],
    N: [31, 45],
    G: [46, 60],
    O: [61, 75],
};

// --- Funciones de Utilidad del Bingo ---
function generateShuffledPool() {
    const nums = [];
    for (let i = 1; i <= 75; i++) nums.push(i);
    for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    return nums;
}

function pickShuffledNumbers(min, max, count) {
    const pool = [];
    for (let i = min; i <= max; i++) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
}

function generateCardMatrix() {
    const matrix = Array(5).fill(null).map(() => Array(5).fill(0));
    for (let col = 0; col < 5; col++) {
        const letter = COLUMNS[col];
        const [min, max] = RANGES[letter];
        const colNumbers = pickShuffledNumbers(min, max, 5);
        for (let row = 0; row < 5; row++) {
            matrix[row][col] = colNumbers[row];
        }
    }
    matrix[2][2] = 0; // Espacio libre central
    return matrix;
}

function getLetterForNumber(num) {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    return 'O';
}

// --- Generador de Códigos de Sala Únicos (4 Dígitos Numéricos) ---
function generateUniqueRoomId() {
    const chars = '0123456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms[code]);
    return code;
}

// --- Creación de Sala ---
function createRoomState(roomId) {
    rooms[roomId] = {
        id: roomId,
        status: 'lobby',       // 'lobby', 'playing', 'ended'
        players: {},           // socket.id -> { id, name, coins, cards: [], color, isHost }
        calledNumbers: [],     // Bolillas cantadas
        allNumbers: generateShuffledPool(), // Pool mezclado
        drawIndex: 0,          // Índice actual en allNumbers
        winMode: 'line',       // 'line', 'two-lines', 'full'
        pot: 0,                // Pozo
        cardPrice: 10,
        countdown: 120,        // Temporizador de 2 minutos
        timerInterval: null
    };
    return rooms[roomId];
}

// --- Control del Temporizador por Sala ---
function startLobbyTimer(room) {
    if (!room) return;
    if (room.timerInterval) {
        clearInterval(room.timerInterval);
    }
    room.status = 'lobby';
    room.countdown = 120; // 2 minutos
    room.calledNumbers = [];
    room.drawIndex = 0;
    room.allNumbers = generateShuffledPool();

    // Limpiar marcados de cartones de jugadores
    Object.values(room.players).forEach(p => {
        p.cards.forEach(c => {
            c.marked = Array(5).fill(null).map(() => Array(5).fill(false));
            c.marked[2][2] = true;
        });
    });

    io.to(room.id).emit('timer_update', { countdown: room.countdown, status: room.status });
    broadcastState(room);

    room.timerInterval = setInterval(() => {
        if (room.countdown > 0) {
            room.countdown--;
            io.to(room.id).emit('timer_update', { countdown: room.countdown, status: room.status });
        } else {
            clearInterval(room.timerInterval);
            room.timerInterval = null;
            startGamePlay(room);
        }
    }, 1000);
}

function startGamePlay(room) {
    if (!room) return;
    room.status = 'playing';
    io.to(room.id).emit('game_started', { pot: room.pot, winMode: room.winMode });
    broadcastState(room);
}

function broadcastState(room) {
    if (!room) return;
    io.to(room.id).emit('room_state', {
        roomId: room.id,
        status: room.status,
        players: Object.values(room.players),
        pot: room.pot,
        winMode: room.winMode,
        calledNumbers: room.calledNumbers,
        countdown: room.countdown
    });
}

// --- Limpieza de Salas Vacías o sin Anfitrión ---
function removeRoomIfEmpty(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    const activePlayers = Object.values(room.players);
    const hasHost = activePlayers.some(p => p.isHost);

    if (activePlayers.length === 0 || !hasHost) {
        console.log(`[Sala ${roomId}] Eliminando por inactividad o falta de anfitrión.`);
        if (room.timerInterval) {
            clearInterval(room.timerInterval);
        }
        delete rooms[roomId];
    }
}

// --- Conexiones de Sockets en Tiempo Real (Salas) ---
io.on('connection', (socket) => {
    console.log(`Socket conectado: ${socket.id}`);

    // CREAR SALA (Anfitrión)
    socket.on('create_room', ({ name, color }) => {
        const roomId = generateUniqueRoomId();
        const room = createRoomState(roomId);

        // Registrar anfitrión
        const hostObj = {
            id: 'host_' + socket.id.substr(0, 5),
            name: name || 'Anfitrión',
            coins: 0,
            cards: [],
            color: color || '#ef4444',
            isHost: true
        };
        room.players[socket.id] = hostObj;
        
        // Asociar socket a la sala
        socket.join(roomId);
        socket.roomId = roomId;
        socket.isHost = true;

        console.log(`[Sala ${roomId}] Creada exitosamente por Anfitrión: ${hostObj.name}`);

        // Responder con la inicialización
        socket.emit('init_state', {
            roomId: roomId,
            status: room.status,
            pot: room.pot,
            winMode: room.winMode,
            calledNumbers: room.calledNumbers,
            countdown: room.countdown
        });

        broadcastState(room);
    });

    // UNIRSE A SALA EXISTENTE (Jugador)
    socket.on('join_room', ({ roomId, name, color }) => {
        const cleanRoomId = String(roomId).trim();
        const room = rooms[cleanRoomId];

        if (!room) {
            socket.emit('error_msg', `La sala con código "${cleanRoomId}" no existe. Revisa el código e intenta de nuevo.`);
            return;
        }

        if (room.status !== 'lobby') {
            socket.emit('error_msg', 'La partida en esta sala ya está en progreso o finalizada.');
            return;
        }

        // Registrar jugador normal
        const playerObj = {
            id: 'p_' + socket.id.substr(0, 5),
            name: name || `Jugador ${Object.keys(room.players).length + 1}`,
            coins: 100, // Saldo inicial
            cards: [],
            color: color || '#8b5cf6',
            isHost: false
        };
        room.players[socket.id] = playerObj;

        // Asociar socket a la sala
        socket.join(cleanRoomId);
        socket.roomId = cleanRoomId;
        socket.isHost = false;

        console.log(`[Sala ${cleanRoomId}] Jugador unió: ${playerObj.name}`);

        // Responder con la inicialización
        socket.emit('init_state', {
            roomId: cleanRoomId,
            status: room.status,
            pot: room.pot,
            winMode: room.winMode,
            calledNumbers: room.calledNumbers,
            countdown: room.countdown
        });

        broadcastState(room);

        // Iniciar temporizador si entra el primer jugador real en el lobby
        const activePlayers = Object.values(room.players).filter(p => !p.isHost);
        if (activePlayers.length === 1 && room.status === 'lobby' && !room.timerInterval) {
            startLobbyTimer(room);
        }
    });

    // COMPRA DE CARTÓN
    socket.on('buy_card', () => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player || player.isHost) return;

        if (room.status !== 'lobby') {
            socket.emit('error_msg', 'No puedes comprar cartones una vez que el juego ha comenzado.');
            return;
        }

        if (player.coins < room.cardPrice) {
            socket.emit('error_msg', 'Saldo insuficiente para comprar un cartón.');
            return;
        }

        if (player.cards.length >= 4) {
            socket.emit('error_msg', 'Límite alcanzado: Máximo 4 cartones por jugador.');
            return;
        }

        // Cobrar e incrementar pozo
        player.coins -= room.cardPrice;
        room.pot += room.cardPrice;

        const newCard = {
            id: 'c_' + Math.random().toString(36).substr(2, 9),
            matrix: generateCardMatrix(),
            marked: Array(5).fill(null).map(() => Array(5).fill(false))
        };
        newCard.marked[2][2] = true; // Centro libre marcado

        player.cards.push(newCard);
        broadcastState(room);
        socket.emit('buy_success');
    });

    // DEVOLUCIÓN DE CARTÓN (Reembolso)
    socket.on('return_card', ({ cardId }) => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player || player.isHost) return;

        if (room.status !== 'lobby') {
            socket.emit('error_msg', 'No puedes devolver cartones una vez que el juego ha comenzado.');
            return;
        }

        const cardIdx = player.cards.findIndex(c => c.id === cardId);
        if (cardIdx === -1) return;

        // Eliminar cartón y reembolsar
        player.cards.splice(cardIdx, 1);
        player.coins += room.cardPrice;
        room.pot = Math.max(0, room.pot - room.cardPrice);

        broadcastState(room);
        socket.emit('return_success');
    });

    // CAMBIAR PATRÓN DE VICTORIA (Solo Anfitrión)
    socket.on('set_win_mode', ({ mode }) => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player || !player.isHost) return;

        room.winMode = mode;
        broadcastState(room);
    });

    // SACAR BOLILLA (Solo Anfitrión)
    socket.on('draw_ball', () => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player || !player.isHost) return;
        if (room.status !== 'playing') return;

        if (room.drawIndex >= room.allNumbers.length) {
            io.to(room.id).emit('error_msg', '¡Se acabaron todas las bolillas del bolillero!');
            return;
        }

        const num = room.allNumbers[room.drawIndex];
        room.drawIndex++;
        room.calledNumbers.push(num);

        const letter = getLetterForNumber(num);

        io.to(room.id).emit('ball_drawn', { letter, number: num, calledNumbers: room.calledNumbers });
        broadcastState(room);
    });

    // MARCAR CELDA (por el Jugador en su pantalla)
    socket.on('mark_cell', ({ cardId, row, col }) => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player || player.isHost) return;

        const card = player.cards.find(c => c.id === cardId);
        if (!card) return;

        const num = card.matrix[row][col];
        // Validar si el número fue cantado
        if (num !== 0 && !room.calledNumbers.includes(num)) {
            socket.emit('error_msg', 'No puedes marcar un número que no ha sido cantado.');
            return;
        }

        card.marked[row][col] = true;
        broadcastState(room);
    });

    // RECLAMAR BINGO (¡BINGO!)
    socket.on('claim_bingo', () => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player || player.isHost || room.status !== 'playing') return;

        // Validar cartones del jugador
        let winningCard = null;
        let winningCells = [];

        player.cards.forEach((c, idx) => {
            let won = false;
            let cells = [];

            if (room.winMode === 'line') {
                const res = checkLines(c.marked, 1);
                won = res.won;
                cells = res.cells;
            } else if (room.winMode === 'two-lines') {
                const res = checkLines(c.marked, 2);
                won = res.won;
                cells = res.cells;
            } else if (room.winMode === 'full') {
                const res = checkFullCard(c.marked);
                won = res.won;
                cells = res.cells;
            }

            if (won) {
                winningCard = { card: c, index: idx + 1 };
                winningCells = cells;
            }
        });

        if (winningCard) {
            // El jugador es ganador oficial
            room.status = 'ended';
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
                room.timerInterval = null;
            }

            // Entregar el pozo
            const prize = room.pot;
            player.coins += prize;
            room.pot = 0;

            io.to(room.id).emit('game_over', {
                winnerName: player.name,
                winnerId: player.id,
                cardIndex: winningCard.index,
                cardId: winningCard.card.id,
                prize: prize,
                winningCells: winningCells
            });
            broadcastState(room);
        } else {
            socket.emit('error_msg', '¡Tu cartón aún no califica para Bingo! Revisa bien tus celdas.');
        }
    });

    // REINICIAR JUEGO (Solo Anfitrión)
    socket.on('restart_game', () => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player || !player.isHost) return;

        startLobbyTimer(room);
    });

    // INICIAR PARTIDA ANTICIPADAMENTE (Solo Anfitrión)
    socket.on('start_game_early', () => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player || !player.isHost) return;

        if (room.status === 'lobby') {
            console.log(`[Sala ${room.id}] Anfitrión inició la partida antes de tiempo.`);
            if (room.timerInterval) {
                clearInterval(room.timerInterval);
                room.timerInterval = null;
            }
            startGamePlay(room);
        }
    });

    // RECARGAR MONEDAS (Solo Anfitrión)
    socket.on('recharge_coins', ({ targetPlayerId, amount }) => {
        const room = rooms[socket.roomId];
        if (!room) return;

        const player = room.players[socket.id];
        if (!player || !player.isHost) return;

        const targetPlayer = Object.values(room.players).find(p => p.id === targetPlayerId);
        if (targetPlayer) {
            targetPlayer.coins += amount;
            broadcastState(room);
            io.to(room.id).emit('notification', `${targetPlayer.name} recibió una recarga de 🪙 ${amount} monedas.`);
        }
    });

    // DESCONEXIÓN
    socket.on('disconnect', () => {
        console.log(`Socket desconectado: ${socket.id}`);
        const roomId = socket.roomId;
        if (roomId && rooms[roomId]) {
            const room = rooms[roomId];
            const p = room.players[socket.id];
            
            if (p) {
                // Reembolsar pozo por sus cartones si sale en lobby
                if (room.status === 'lobby' && !p.isHost) {
                    const refund = p.cards.length * room.cardPrice;
                    room.pot = Math.max(0, room.pot - refund);
                }
                
                delete room.players[socket.id];

                // Si no quedan jugadores y el temporizador corre, pararlo
                const activePlayers = Object.values(room.players).filter(pl => !pl.isHost);
                if (activePlayers.length === 0 && room.timerInterval) {
                    clearInterval(room.timerInterval);
                    room.timerInterval = null;
                    room.status = 'lobby';
                    room.countdown = 120;
                }

                broadcastState(room);
                removeRoomIfEmpty(roomId);
            }
        }
    });
});

// --- Lógica del Validador de Bingo ---
function checkLines(markedMatrix, requiredCount) {
    let completed = [];

    // Validar Filas
    for (let r = 0; r < 5; r++) {
        if (markedMatrix[r].every(v => v)) {
            completed.push(markedMatrix[r].map((_, col) => [r, col]));
        }
    }

    // Validar Columnas
    for (let c = 0; c < 5; c++) {
        let complete = true;
        const cells = [];
        for (let r = 0; r < 5; r++) {
            if (!markedMatrix[r][c]) { complete = false; break; }
            cells.push([r, c]);
        }
        if (complete) completed.push(cells);
    }

    // Diagonal 1
    let d1 = true;
    const d1Cells = [];
    for (let i = 0; i < 5; i++) {
        if (!markedMatrix[i][i]) d1 = false;
        d1Cells.push([i, i]);
    }
    if (d1) completed.push(d1Cells);

    // Diagonal 2
    let d2 = true;
    const d2Cells = [];
    for (let i = 0; i < 5; i++) {
        if (!markedMatrix[i][4 - i]) d2 = false;
        d2Cells.push([i, 4 - i]);
    }
    if (d2) completed.push(d2Cells);

    if (completed.length >= requiredCount) {
        return { won: true, cells: completed.slice(0, requiredCount).flat() };
    }
    return { won: false, cells: [] };
}

function checkFullCard(markedMatrix) {
    const cells = [];
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            if (!markedMatrix[r][c]) return { won: false, cells: [] };
            cells.push([r, c]);
        }
    }
    return { won: true, cells };
}

// Iniciar el Servidor HTTP
server.listen(PORT, '0.0.0.0', () => {
    console.log(`===================================================`);
    console.log(`🔥 BINGO MULTIJUGADOR REAL - CON SALAS INICIADO 🔥`);
    console.log(`💻 Localmente:   http://localhost:${PORT}`);
    console.log(`===================================================`);
});
