/* =============================================
   BINGO REAL MULTIJUGADOR — Servidor Backend
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

// --- Estado Central del Juego ---
const gameState = {
    status: 'lobby',       // 'lobby', 'playing', 'ended'
    players: {},           // socket.id -> { id, name, coins, cards: [], color, isHost }
    calledNumbers: [],     // Bolillas que han salido
    allNumbers: [],        // Pool de 1-75 mezclado
    drawIndex: 0,          // Índice actual en allNumbers
    winMode: 'line',       // 'line', 'two-lines', 'full'
    pot: 0,                // Pozo acumulado
    cardPrice: 10,
    countdown: 120,        // Temporizador de 2 minutos (120 segundos)
    timerInterval: null
};

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

// --- Control del Temporizador del Lobby ---
function startLobbyTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
    }
    gameState.status = 'lobby';
    gameState.countdown = 120; // 2 minutos
    gameState.calledNumbers = [];
    gameState.drawIndex = 0;
    gameState.allNumbers = generateShuffledPool();

    // Limpiar marcados de cartones de jugadores para la nueva ronda
    Object.values(gameState.players).forEach(p => {
        p.cards.forEach(c => {
            c.marked = Array(5).fill(null).map(() => Array(5).fill(false));
            c.marked[2][2] = true; // El centro libre permanece libre
        });
    });

    io.emit('timer_update', { countdown: gameState.countdown, status: gameState.status });
    broadcastState();

    gameState.timerInterval = setInterval(() => {
        if (gameState.countdown > 0) {
            gameState.countdown--;
            io.emit('timer_update', { countdown: gameState.countdown, status: gameState.status });
        } else {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
            startGamePlay();
        }
    }, 1000);
}

function startGamePlay() {
    gameState.status = 'playing';
    io.emit('game_started', { pot: gameState.pot, winMode: gameState.winMode });
    broadcastState();
}

function broadcastState() {
    io.emit('room_state', {
        status: gameState.status,
        players: Object.values(gameState.players),
        pot: gameState.pot,
        winMode: gameState.winMode,
        calledNumbers: gameState.calledNumbers,
        countdown: gameState.countdown
    });
}

// --- Conexiones de Sockets en Tiempo Real ---
io.on('connection', (socket) => {
    console.log(`Jugador conectado: ${socket.id}`);

    // Enviar estado actual del juego al conectarse
    socket.emit('init_state', {
        status: gameState.status,
        pot: gameState.pot,
        winMode: gameState.winMode,
        calledNumbers: gameState.calledNumbers,
        countdown: gameState.countdown
    });

    // Registrar Jugador o Anfitrión
    socket.on('join_room', ({ name, color, isHost }) => {
        if (isHost) {
            gameState.players[socket.id] = {
                id: 'host_' + socket.id.substr(0, 5),
                name: name || 'Anfitrión',
                coins: 0,
                cards: [],
                color: '#ef4444',
                isHost: true
            };
            console.log(`Anfitrión registrado: ${name}`);
        } else {
            // Un jugador normal
            gameState.players[socket.id] = {
                id: 'p_' + socket.id.substr(0, 5),
                name: name || `Jugador ${Object.keys(gameState.players).length + 1}`,
                coins: 100, // Saldo inicial
                cards: [],
                color: color || '#8b5cf6',
                isHost: false
            };
            console.log(`Jugador registrado: ${name} con saldo 100`);

            // Iniciar temporizador automáticamente si entra el primer jugador y estamos en lobby
            const activePlayers = Object.values(gameState.players).filter(p => !p.isHost);
            if (activePlayers.length === 1 && gameState.status === 'lobby' && !gameState.timerInterval) {
                startLobbyTimer();
            }
        }
        broadcastState();
    });

    // Compra de Cartón
    socket.on('buy_card', () => {
        const player = gameState.players[socket.id];
        if (!player || player.isHost) return;

        if (gameState.status !== 'lobby') {
            socket.emit('error_msg', 'No puedes comprar cartones una vez que el juego ha comenzado.');
            return;
        }

        if (player.coins < gameState.cardPrice) {
            socket.emit('error_msg', 'Saldo insuficiente para comprar un cartón.');
            return;
        }

        if (player.cards.length >= 4) {
            socket.emit('error_msg', 'Límite alcanzado: Máximo 4 cartones por jugador.');
            return;
        }

        // Cobrar e incrementar pozo
        player.coins -= gameState.cardPrice;
        gameState.pot += gameState.cardPrice;

        const newCard = {
            id: 'c_' + Math.random().toString(36).substr(2, 9),
            matrix: generateCardMatrix(),
            marked: Array(5).fill(null).map(() => Array(5).fill(false))
        };
        newCard.marked[2][2] = true; // Centro libre marcado

        player.cards.push(newCard);
        broadcastState();
        socket.emit('buy_success');
    });

    // Devolución de Cartón (Reembolso)
    socket.on('return_card', ({ cardId }) => {
        const player = gameState.players[socket.id];
        if (!player || player.isHost) return;

        if (gameState.status !== 'lobby') {
            socket.emit('error_msg', 'No puedes devolver cartones una vez que el juego ha comenzado.');
            return;
        }

        const cardIdx = player.cards.findIndex(c => c.id === cardId);
        if (cardIdx === -1) return;

        // Eliminar cartón y reembolsar
        player.cards.splice(cardIdx, 1);
        player.coins += gameState.cardPrice;
        gameState.pot = Math.max(0, gameState.pot - gameState.cardPrice);

        broadcastState();
        socket.emit('return_success');
    });

    // Cambiar Patrón de Victoria (Línea, Dos Líneas, Cartón Lleno)
    socket.on('set_win_mode', ({ mode }) => {
        const player = gameState.players[socket.id];
        if (!player || !player.isHost) return; // Solo el Anfitrión puede cambiar el modo de victoria

        gameState.winMode = mode;
        broadcastState();
    });

    // Sacar Bolilla (Tirada)
    socket.on('draw_ball', () => {
        const player = gameState.players[socket.id];
        if (!player || !player.isHost) return; // Solo el Anfitrión saca bolillas
        if (gameState.status !== 'playing') return;

        if (gameState.drawIndex >= gameState.allNumbers.length) {
            io.emit('error_msg', '¡Se acabaron todas las bolillas del bolillero!');
            return;
        }

        const num = gameState.allNumbers[gameState.drawIndex];
        gameState.drawIndex++;
        gameState.calledNumbers.push(num);

        const letter = getLetterForNumber(num);

        io.emit('ball_drawn', { letter, number: num, calledNumbers: gameState.calledNumbers });
        broadcastState();
    });

    // Marcar Celda (por el Jugador en su pantalla)
    socket.on('mark_cell', ({ cardId, row, col }) => {
        const player = gameState.players[socket.id];
        if (!player || player.isHost) return;

        const card = player.cards.find(c => c.id === cardId);
        if (!card) return;

        const num = card.matrix[row][col];
        // Validar si el número fue cantado
        if (num !== 0 && !gameState.calledNumbers.includes(num)) {
            socket.emit('error_msg', 'No puedes marcar un número que no ha sido cantado.');
            return;
        }

        card.marked[row][col] = true;
        broadcastState();
    });

    // Reclamar Bingo (¡BINGO!)
    socket.on('claim_bingo', () => {
        const player = gameState.players[socket.id];
        if (!player || player.isHost || gameState.status !== 'playing') return;

        // Validar cartones del jugador
        let winningCard = null;
        let winningCells = [];

        player.cards.forEach((c, idx) => {
            let won = false;
            let cells = [];

            if (gameState.winMode === 'line') {
                const res = checkLines(c.marked, 1);
                won = res.won;
                cells = res.cells;
            } else if (gameState.winMode === 'two-lines') {
                const res = checkLines(c.marked, 2);
                won = res.won;
                cells = res.cells;
            } else if (gameState.winMode === 'full') {
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
            gameState.status = 'ended';
            if (gameState.timerInterval) {
                clearInterval(gameState.timerInterval);
                gameState.timerInterval = null;
            }

            // Entregar el pozo
            const prize = gameState.pot;
            player.coins += prize;
            gameState.pot = 0;

            io.emit('game_over', {
                winnerName: player.name,
                winnerId: player.id,
                cardIndex: winningCard.index,
                cardId: winningCard.card.id,
                prize: prize,
                winningCells: winningCells
            });
            broadcastState();
        } else {
            // Falsa alarma, penalizar o avisar
            socket.emit('error_msg', '¡Tu cartón aún no califica para Bingo! Revisa bien tus celdas.');
        }
    });

    // Reiniciar Juego (Lobby Nuevo)
    socket.on('restart_game', () => {
        const player = gameState.players[socket.id];
        if (!player || !player.isHost) return; // Solo el Anfitrión puede reiniciar

        startLobbyTimer();
    });

    // Iniciar Partida Inmediatamente (por el Anfitrión)
    socket.on('start_game_early', () => {
        const player = gameState.players[socket.id];
        if (!player || !player.isHost) return; // Solo el Anfitrión puede iniciar
        
        if (gameState.status === 'lobby') {
            console.log("Anfitrión ha iniciado la partida antes de tiempo.");
            if (gameState.timerInterval) {
                clearInterval(gameState.timerInterval);
                gameState.timerInterval = null;
            }
            startGamePlay();
        }
    });

    // Recargar Monedas (Banca/Administrador)
    socket.on('recharge_coins', ({ targetPlayerId, amount }) => {
        const player = gameState.players[socket.id];
        if (!player || !player.isHost) return; // Solo el anfitrión/banca recarga

        const targetPlayer = Object.values(gameState.players).find(p => p.id === targetPlayerId);
        if (targetPlayer) {
            targetPlayer.coins += amount;
            broadcastState();
            io.emit('notification', `${targetPlayer.name} recibió una recarga de 🪙 ${amount} monedas.`);
        }
    });

    // Desconexión
    socket.on('disconnect', () => {
        console.log(`Jugador desconectado: ${socket.id}`);
        const p = gameState.players[socket.id];
        if (p) {
            // Reembolsar pozo por sus cartones si sale durante el lobby
            if (gameState.status === 'lobby' && !p.isHost) {
                const refund = p.cards.length * gameState.cardPrice;
                gameState.pot = Math.max(0, gameState.pot - refund);
            }
            delete gameState.players[socket.id];

            // Si no quedan jugadores reales y el temporizador corre, pararlo
            const activePlayers = Object.values(gameState.players).filter(pl => !pl.isHost);
            if (activePlayers.length === 0 && gameState.timerInterval) {
                clearInterval(gameState.timerInterval);
                gameState.timerInterval = null;
                gameState.status = 'lobby';
                gameState.countdown = 120;
            }

            broadcastState();
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
    console.log(`🔥 BINGO MULTIJUGADOR REAL INICIADO 🔥`);
    console.log(`💻 Localmente:   http://localhost:${PORT}`);
    console.log(`📱 En tu red Wi-Fi desde tu móvil:`);
    console.log(`   Paso 1: Busca tu IP de PC (ej. en cmd ejecuta: ipconfig)`);
    console.log(`   Paso 2: En tu celular entra a: http://<TU_IP_DE_PC>:${PORT}`);
    console.log(`===================================================`);
});
