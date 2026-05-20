/* =============================================
   BINGO REAL MULTIJUGADOR — Lógica de Juego
   ============================================= */

// --- Estado Global ---
let socket = null;
const state = {
    gameMode: 'shared',    // 'shared' (Pantalla Compartida), 'host' (Solo Bolillero), 'player' (Solo Cartón)
    players: [],           // [{ id, name, coins, cards: [{ id, matrix, marked }], color }]
    calledNumbers: [],     // Números que han salido
    allNumbers: [],        // Pool de 1-75 mezclado
    drawIndex: 0,          // Índice actual en allNumbers
    winMode: 'line',       // 'line', 'two-lines', 'full'
    autoPlay: false,       // Bolillero automático
    autoInterval: null,
    gameOver: false,
    soundEnabled: true,
    voiceEnabled: true,
    autoDaub: false,       // Marcado automático para jugadores
    pot: 0,                // Pozo acumulado en la ronda
    cardPrice: 10,         // Costo por cartón
    selectedColor: '#8b5cf6', // Color seleccionado en el modal
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

// =============================================
// MOTOR DE AUDIO (Web Audio API & Speech Synthesis)
// =============================================
let audioCtx = null;

function getAudioCtx() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playBallDrawSound() {
    if (!state.soundEnabled) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Tono de tómbola girando
    for (let i = 0; i < 5; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320 + i * 90, now + i * 0.04);
        gain.gain.setValueAtTime(0.06, now + i * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.07);
        osc.start(now + i * 0.04);
        osc.stop(now + i * 0.04 + 0.09);
    }
    // Sonido Pop al final
    setTimeout(() => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.18);
    }, 200);
}

function playCellMarkSound() {
    if (!state.soundEnabled) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Stamp/tache agradable
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(550, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.04);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now);
    osc.stop(now + 0.12);
}

function playCoinSound() {
    if (!state.soundEnabled) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Tintineo de moneda (caja registradora)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(987.77, now); // B5
    gain1.gain.setValueAtTime(0.08, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.start(now);
    osc1.stop(now + 0.2);

    setTimeout(() => {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1318.51, ctx.currentTime); // E6
        gain2.gain.setValueAtTime(0.1, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc2.start(ctx.currentTime);
        osc2.stop(ctx.currentTime + 0.4);
    }, 80);
}

function playErrorSound() {
    if (!state.soundEnabled) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.start(now);
    osc.stop(now + 0.25);
}

function playWinSound() {
    if (!state.soundEnabled) return;
    const ctx = getAudioCtx();
    const now = ctx.currentTime;
    // Fanfarria triunfal ascendente
    const arpeggio = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    arpeggio.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.12, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 0.45);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.5);
    });
}

// --- Voces (Sintetizador en Español Latino) ---
let spanishVoice = null;

function findSpanishVoice() {
    if (typeof speechSynthesis === 'undefined') return;
    const voices = speechSynthesis.getVoices();
    const latamLocales = ['es-MX', 'es-419', 'es-CO', 'es-AR', 'es-CL', 'es-PE', 'es-US', 'es-VE'];
    for (const locale of latamLocales) {
        const voice = voices.find(v => v.lang.toLowerCase() === locale.toLowerCase());
        if (voice) { spanishVoice = voice; return; }
    }
    const anySpanish = voices.find(v => v.lang.toLowerCase().startsWith('es'));
    if (anySpanish) { spanishVoice = anySpanish; return; }
    spanishVoice = voices[0] || null;
}

if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = findSpanishVoice;
    findSpanishVoice();
}

function speakNumber(letter, number) {
    if (!state.voiceEnabled) return;
    if (typeof speechSynthesis === 'undefined') return;

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance();
    const letterNames = { 'B': 'beh', 'I': 'I', 'N': 'Ene', 'G': 'Ge', 'O': 'O' };

    utterance.text = `${letterNames[letter]}... ${number}`;
    if (spanishVoice) {
        utterance.voice = spanishVoice;
        utterance.lang = spanishVoice.lang;
    } else {
        utterance.lang = 'es-MX';
    }
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    setTimeout(() => { speechSynthesis.speak(utterance); }, 350);
}

function speakWinner(name) {
    if (!state.voiceEnabled) return;
    if (typeof speechSynthesis === 'undefined') return;

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance();
    utterance.text = `¡BINGO! ¡Felicidades a ${name} por ganar esta ronda!`;
    if (spanishVoice) {
        utterance.voice = spanishVoice;
        utterance.lang = spanishVoice.lang;
    } else {
        utterance.lang = 'es-MX';
    }
    utterance.rate = 0.88;
    utterance.pitch = 1.1;

    setTimeout(() => { speechSynthesis.speak(utterance); }, 800);
}

// =============================================
// GESTIÓN DEL LOBBY Y MODOS DE JUEGO
// =============================================
function selectGameMode(mode) {
    state.gameMode = mode;
    
    if (mode === 'shared') {
        // Modo local tradicional, inicia de una vez
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('game-interface').classList.remove('hidden');
        
        const container = document.getElementById('game-container');
        container.className = 'layout-three-columns';
        document.getElementById('mode-indicator').textContent = '📺 Pantalla Compartida';
        
        state.players = [
            { id: generateId(), name: 'Jugador 1', coins: 100, cards: [], color: '#8b5cf6' },
            { id: generateId(), name: 'Jugador 2', coins: 100, cards: [], color: '#3b82f6' }
        ];
        startNewRound();
    } else {
        // Modos en red, mostrar pantalla de configuración
        document.getElementById('lobby-modes-main').classList.add('hidden');
        const setupBox = document.getElementById('connection-setup');
        setupBox.classList.remove('hidden');
        
        const urlInput = document.getElementById('server-url-input');
        if (window.location.origin && !window.location.origin.startsWith('file')) {
            urlInput.value = window.location.origin;
        } else {
            urlInput.value = '';
            urlInput.placeholder = 'Ej. http://192.168.1.15:3000';
        }
        
        if (mode === 'host') {
            document.getElementById('setup-title').textContent = '📢 Configurar Anfitrión';
            document.getElementById('setup-name-group').classList.add('hidden');
            document.getElementById('setup-color-picker').classList.add('hidden');
            document.getElementById('setup-connect-btn-text').textContent = '¡Iniciar Sala en Vivo! 📢';
        } else {
            document.getElementById('setup-title').textContent = '🎟️ Configurar Jugador';
            document.getElementById('setup-name-group').classList.remove('hidden');
            document.getElementById('setup-color-picker').classList.remove('hidden');
            document.getElementById('setup-connect-btn-text').textContent = '¡Unirse al Bingo en Vivo! 🎟️';
        }
    }
}

function cancelSetup() {
    document.getElementById('connection-setup').classList.add('hidden');
    document.getElementById('lobby-modes-main').classList.remove('hidden');
}

function backToLobby() {
    clearAutoPlay();
    if (typeof speechSynthesis !== 'undefined') {
        speechSynthesis.cancel();
    }
    document.getElementById('game-interface').classList.add('hidden');
    document.getElementById('lobby-screen').classList.remove('hidden');
}

function generateId() {
    return 'p_' + Math.random().toString(36).substr(2, 9);
}

// =============================================
// COMPRA Y GESTIÓN DE CARTONES / JUGADORES
// =============================================
function buyCard(playerId) {
    if (state.gameOver) return;
    
    // Si estamos conectados al servidor multijugador, delegamos al backend
    if (socket && socket.connected) {
        socket.emit('buy_card');
        return;
    }

    const player = state.players.find(p => p.id === playerId);
    if (!player) return;

    if (player.coins < state.cardPrice) {
        playErrorSound();
        alert(`¡${player.name} no tiene suficientes monedas! (Costo: ${state.cardPrice} monedas)`);
        return;
    }

    if (player.cards.length >= 4) {
        playErrorSound();
        alert('Límite alcanzado: Máximo 4 cartones por jugador.');
        return;
    }

    // Cobrar e incrementar pozo
    player.coins -= state.cardPrice;
    state.pot += state.cardPrice;
    playCoinSound();

    // Crear el nuevo cartón
    const newCardObj = {
        id: 'c_' + Math.random().toString(36).substr(2, 9),
        matrix: generateCardMatrix(),
        marked: Array(5).fill(null).map(() => Array(5).fill(false))
    };
    // Espacio libre central
    newCardObj.matrix[2][2] = 0;
    newCardObj.marked[2][2] = true;

    player.cards.push(newCardObj);

    // Si ya hay bolillas cantadas en juego, podemos marcar los números correspondientes automáticamente si se compra a mitad
    catchUpCardWithCalledNumbers(newCardObj);

    renderAll();
}

function returnCard(cardId) {
    if (socket && socket.connected) {
        socket.emit('return_card', { cardId });
    }
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
    return matrix;
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

function catchUpCardWithCalledNumbers(cardObj) {
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const num = cardObj.matrix[row][col];
            if (num !== 0 && state.calledNumbers.includes(num)) {
                if (state.autoDaub) {
                    cardObj.marked[row][col] = true;
                }
            }
        }
    }
}

// =============================================
// MODAL DE REGISTRO DE JUGADORES
// =============================================
function openAddPlayerModal() {
    if (state.gameOver) return;
    document.getElementById('new-player-name-input').value = '';
    document.getElementById('add-player-modal').classList.remove('hidden');
}

function closeAddPlayerModal() {
    document.getElementById('add-player-modal').classList.add('hidden');
}

function selectPlayerColor(el, color) {
    document.querySelectorAll('.color-opt').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    state.selectedColor = color;
}

function submitAddPlayer() {
    const nameInput = document.getElementById('new-player-name-input');
    const name = nameInput.value.trim();
    if (!name) {
        alert('Por favor, ingresa un nombre válido.');
        return;
    }

    // Agregar jugador nuevo
    const newPlayer = {
        id: generateId(),
        name: name,
        coins: 100,
        cards: [],
        color: state.selectedColor
    };

    state.players.push(newPlayer);
    closeAddPlayerModal();
    renderAll();
}

function removePlayer(playerId) {
    if (state.gameOver) return;
    // Reembolsar pozo por sus cartones al salir
    const player = state.players.find(p => p.id === playerId);
    if (player) {
        const refund = player.cards.length * state.cardPrice;
        state.pot = Math.max(0, state.pot - refund);
    }
    state.players = state.players.filter(p => p.id !== playerId);
    renderAll();
}

function rechargePlayerCoins(playerId) {
    if (state.gameOver) return;
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;

    const amountStr = prompt(`[MODO BANCA] ¿Cuántas monedas deseas recargar a ${player.name}?`, "100");
    if (amountStr === null) return; // cancelado

    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
        playErrorSound();
        alert("Por favor, ingresa una cantidad numérica válida y mayor a 0.");
        return;
    }

    if (socket && socket.connected) {
        socket.emit('recharge_coins', { targetPlayerId: playerId, amount });
    } else {
        player.coins += amount;
        playCoinSound();
        renderAll();
    }
}

// =============================================
// RENDERIZADO GENERAL Y DINÁMICO
// =============================================
function renderAll() {
    renderPlayersList();
    renderCardsGrid();
    renderCalledNumbers();
    updateCalledCount();
    document.getElementById('pot-amount').textContent = state.pot;
}

function renderPlayersList() {
    const container = document.getElementById('players-list-container');
    if (!container) return;
    container.innerHTML = '';

    if (state.players.length === 0) {
        container.innerHTML = '<p class="legend-text text-center">No hay jugadores registrados.</p>';
        return;
    }

    state.players.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-item';
        
        // Determinar si botón comprar está activo
        let canBuy = false;
        let isMe = false;
        let showBuyBtn = true;
        
        if (socket && socket.connected) {
            const myPlayerId = 'p_' + socket.id.substr(0, 5);
            isMe = (p.id === myPlayerId);
            
            if (state.gameMode === 'player') {
                showBuyBtn = isMe;
                canBuy = isMe && p.coins >= state.cardPrice && p.cards.length < 4 && state.status === 'lobby';
            } else {
                // Si es host, no mostramos botones de compra individuales (el host no compra)
                showBuyBtn = false;
            }
        } else {
            // Modo local/offline
            canBuy = p.coins >= state.cardPrice && p.cards.length < 4 && !state.gameOver;
        }
        
        const buyBtnText = p.cards.length >= 4 ? 'Límite' : `Comprar (-${state.cardPrice})`;

        // Botón de eliminar (ocultar si es en red, o si es el único en modo offline)
        let deleteButtonHtml = '';
        if (socket && socket.connected) {
            deleteButtonHtml = ''; // En red no se eliminan manualmente
        } else {
            const isOnlyPlayer = state.gameMode === 'player' && state.players.length === 1;
            deleteButtonHtml = isOnlyPlayer ? '' : `
                <button class="audio-btn" style="border-color: rgba(239, 68, 68, 0.2); color: var(--accent-red); padding: 5px 8px; border-radius: 4px;" onclick="removePlayer('${p.id}')" title="Eliminar jugador">
                    ✕
                </button>
            `;
        }

        // Botón de recarga (Banca)
        let showRecharge = false;
        if (socket && socket.connected) {
            showRecharge = (state.gameMode === 'host');
        } else {
            showRecharge = true; // Modo local
        }

        const rechargeBtnHtml = showRecharge ? `
            <button class="audio-btn" style="border-color: rgba(245, 158, 11, 0.2); color: var(--accent-amber); padding: 5px 8px; border-radius: 4px; font-weight:700;" onclick="rechargePlayerCoins('${p.id}')" title="Recargar saldo (Modo Banca)">
                +🪙
            </button>
        ` : '';

        const buyBtnHtml = showBuyBtn ? `
            <button class="btn-buy-card" ${canBuy ? '' : 'disabled'} onclick="buyCard('${p.id}')">
                ${buyBtnText}
            </button>
        ` : '';

        item.innerHTML = `
            <div class="player-info-block">
                <div class="player-color-tag" style="background-color: ${p.color};"></div>
                <div class="player-meta-details">
                    <span class="player-display-name">${p.name} ${isMe ? '<span style="font-size:0.75rem; opacity:0.7;">(Tú)</span>' : ''}</span>
                    <div class="player-status-row">
                        <span class="coins-badge">🪙 ${p.coins}</span>
                        <span class="cards-badge">🎟️ ${p.cards.length}/4</span>
                    </div>
                </div>
            </div>
            <div class="player-actions-block" style="gap: 6px; display: flex; align-items: center;">
                ${rechargeBtnHtml}
                ${buyBtnHtml}
                ${deleteButtonHtml}
            </div>
        `;
        container.appendChild(item);
    });
}

function renderCardsGrid() {
    const grid = document.getElementById('cards-container-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Reunir todos los cartones activos con su respectivo dueño
    const allActiveCards = [];
    state.players.forEach(p => {
        // En multijugador individual, solo renderizar mis propios cartones
        if (socket && socket.connected && state.gameMode === 'player') {
            const myPlayerId = 'p_' + socket.id.substr(0, 5);
            if (p.id !== myPlayerId) return;
        }
        p.cards.forEach((c, idx) => {
            allActiveCards.push({
                player: p,
                card: c,
                index: idx + 1
            });
        });
    });

    if (allActiveCards.length === 0) {
        grid.className = 'cards-layout-grid';
        grid.innerHTML = `
            <div class="no-cards-placeholder glass-panel">
                <span class="placeholder-icon">🎟️</span>
                <p>No hay cartones en juego.</p>
                <p class="placeholder-subtext">Compra cartones desde el panel de jugadores para empezar la ronda.</p>
            </div>
        `;
        return;
    }

    // Configurar clase de diseño responsiva según número de cartones en pantalla
    grid.className = 'cards-layout-grid';
    const totalCount = allActiveCards.length;
    if (totalCount === 1) grid.classList.add('grid-1');
    else if (totalCount === 2) grid.classList.add('grid-2');
    else if (totalCount === 3) grid.classList.add('grid-3');
    else grid.classList.add('grid-4');

    // Renderizar cada cartón
    allActiveCards.forEach(item => {
        const p = item.player;
        const c = item.card;
        
        const cardWrapper = document.createElement('div');
        cardWrapper.className = 'card-wrapper';
        
        // Cabecera del cartón con color e identificador del jugador
        const refundBtn = (state.gameMode === 'player' && state.status === 'lobby' && socket && socket.connected) ? `
            <button class="btn-refund-card" onclick="returnCard('${c.id}')" title="Devolver cartón y recuperar monedas">Devolver ↩️</button>
        ` : '';

        const banner = document.createElement('div');
        banner.className = 'card-owner-banner';
        banner.style.borderLeftColor = p.color;
        banner.innerHTML = `
            <span class="owner-name" style="color: ${p.color};">${p.name} <span style="font-weight:400; opacity:0.8;">#${item.index}</span></span>
            <div style="display: flex; align-items: center; gap: 8px;">
                ${refundBtn}
                <span class="owner-card-id">${c.id.substr(2, 5).toUpperCase()}</span>
            </div>
        `;
        cardWrapper.appendChild(banner);

        // Panel del cartón físico
        const panel = document.createElement('div');
        panel.className = 'glass-panel card-panel';
        
        const cardGrid = document.createElement('div');
        cardGrid.className = 'card-grid';
        
        // Fila de encabezado BINGO
        const headerRow = document.createElement('div');
        headerRow.className = 'card-header-row';
        COLUMNS.forEach((l, colIdx) => {
            const hCell = document.createElement('div');
            hCell.className = `card-header-cell header-${l.toLowerCase()}`;
            hCell.textContent = l;
            headerRow.appendChild(hCell);
        });
        cardGrid.appendChild(headerRow);

        // Cuerpo del cartón
        const bodyGrid = document.createElement('div');
        bodyGrid.className = 'card-body';

        for (let row = 0; row < 5; row++) {
            for (let col = 0; col < 5; col++) {
                const cell = document.createElement('div');
                cell.className = 'card-cell';
                cell.id = `cell-${c.id}-${row}-${col}`;

                if (row === 2 && col === 2) {
                    cell.classList.add('free-cell', 'marked');
                    cell.textContent = 'LIBRE';
                } else {
                    const num = c.matrix[row][col];
                    cell.textContent = num;

                    if (c.marked[row][col]) {
                        cell.classList.add('marked');
                    } else if (state.calledNumbers.includes(num)) {
                        cell.classList.add('called');
                    }

                    // Tocar número para marcar manualmente
                    cell.addEventListener('click', () => handleCellMark(p.id, c.id, row, col));
                }

                bodyGrid.appendChild(cell);
            }
        }
        cardGrid.appendChild(bodyGrid);
        panel.appendChild(cardGrid);
        cardWrapper.appendChild(panel);
        grid.appendChild(cardWrapper);
    });
}

function handleCellMark(playerId, cardId, row, col) {
    if (state.gameOver) return;
    const player = state.players.find(p => p.id === playerId);
    if (!player) return;
    const card = player.cards.find(c => c.id === cardId);
    if (!card) return;

    if (card.marked[row][col]) return;

    const num = card.matrix[row][col];

    // Solo permitir marcar si el número ya fue cantado en el bolillero
    if (!state.calledNumbers.includes(num)) {
        const cell = document.getElementById(`cell-${cardId}-${row}-${col}`);
        if (cell) {
            cell.style.animation = 'none';
            cell.offsetHeight; // forzar reflow
            cell.style.animation = 'shake 0.4s ease-out';
            setTimeout(() => { cell.style.animation = ''; }, 400);
        }
        playErrorSound();
        return;
    }

    // Tachar número
    card.marked[row][col] = true;
    playCellMarkSound();

    const cell = document.getElementById(`cell-${cardId}-${row}-${col}`);
    if (cell) {
        cell.classList.add('marked', 'mark-animate');
        cell.classList.remove('called');
    }

    if (socket && socket.connected) {
        // Enviar marcado al servidor
        socket.emit('mark_cell', { cardId, row, col });
    } else {
        // Si es juego offline, verificar victoria inmediatamente
        checkWin();
    }
}

function toggleAutoDaub(checked) {
    state.autoDaub = checked;
    
    // Si se activa autoDaub a mitad de la partida, daubear todos los cartones al instante
    if (checked) {
        state.players.forEach(p => {
            p.cards.forEach(c => {
                for (let r = 0; r < 5; r++) {
                    for (let col = 0; col < 5; col++) {
                        const num = c.matrix[r][col];
                        if (num !== 0 && state.calledNumbers.includes(num) && !c.marked[r][col]) {
                            c.marked[r][col] = true;
                            const cell = document.getElementById(`cell-${c.id}-${r}-${col}`);
                            if (cell) {
                                cell.classList.add('marked', 'mark-animate');
                                cell.classList.remove('called');
                            }
                        }
                    }
                }
            });
        });
        checkWin();
    }
}

// =============================================
// SISTEMA DEL BOLILLERO (DRAW NUMBERS)
// =============================================
function drawNumber() {
    if (state.gameOver) return;
    
    // Si estamos en multijugador, delegamos la tirada al servidor
    if (socket && socket.connected) {
        if (state.gameMode === 'host') {
            socket.emit('draw_ball');
        }
        return;
    }
    
    // Validar si hay cartones activos comprados antes de poder tirar bolilla (salvo en modo host)
    if (state.gameMode !== 'host') {
        const totalCards = state.players.reduce((sum, p) => sum + p.cards.length, 0);
        if (totalCards === 0) {
            playErrorSound();
            alert('¡Primero debes comprar al menos un cartón para comenzar a jugar!');
            clearAutoPlay();
            return;
        }
    }

    if (state.drawIndex >= state.allNumbers.length) {
        document.getElementById('call-announcement').textContent = '¡Se acabaron todas las bolillas!';
        clearAutoPlay();
        return;
    }

    const num = state.allNumbers[state.drawIndex];
    state.drawIndex++;
    state.calledNumbers.push(num);

    const letter = getLetterForNumber(num);

    // Sonido y Voz narradora
    playBallDrawSound();
    speakNumber(letter, num);

    // Animación de la bolilla grande
    const ballContainer = document.getElementById('current-ball');
    ballContainer.classList.remove('popping', 'ball-b', 'ball-i', 'ball-n', 'ball-g', 'ball-o');
    void ballContainer.offsetHeight; // trigger reflow
    ballContainer.classList.add('popping', `ball-${letter.toLowerCase()}`);

    document.getElementById('ball-letter').textContent = letter;
    document.getElementById('ball-number').textContent = num;

    const announcement = document.getElementById('call-announcement');
    announcement.textContent = `${letter}-${num}`;
    announcement.classList.add('highlight');
    setTimeout(() => announcement.classList.remove('highlight'), 1500);

    // Marcado automático (Auto-daub) si está activado
    if (state.autoDaub && state.gameMode !== 'host') {
        let anyMarked = false;
        state.players.forEach(p => {
            p.cards.forEach(c => {
                for (let r = 0; r < 5; r++) {
                    for (let col = 0; col < 5; col++) {
                        if (c.matrix[r][col] === num && !c.marked[r][col]) {
                            c.marked[r][col] = true;
                            anyMarked = true;
                        }
                    }
                }
            });
        });
        if (anyMarked) {
            setTimeout(playCellMarkSound, 200);
        }
    }

    // Actualizar grids e historial
    renderAll();
    
    // Comprobar victorias después de marcar
    if (state.gameMode !== 'host') {
        checkWin();
    }
}

function getLetterForNumber(num) {
    if (num <= 15) return 'B';
    if (num <= 30) return 'I';
    if (num <= 45) return 'N';
    if (num <= 60) return 'G';
    return 'O';
}

function renderCalledNumbers() {
    COLUMNS.forEach(letter => {
        const list = document.getElementById(`called-${letter}`);
        if (!list) return;
        list.innerHTML = '';

        const nums = state.calledNumbers
            .filter(n => getLetterForNumber(n) === letter)
            .sort((a, b) => a - b);

        nums.forEach(n => {
            const el = document.createElement('div');
            el.className = 'called-num';
            el.textContent = n;
            if (n === state.calledNumbers[state.calledNumbers.length - 1]) {
                el.classList.add('latest');
            }
            list.appendChild(el);
        });
    });
}

function updateCalledCount() {
    const el = document.getElementById('called-count');
    if (el) el.textContent = `${state.calledNumbers.length}/75`;
}

// --- Autoplay loop ---
function toggleAutoPlay() {
    if (state.gameOver) return;
    state.autoPlay = !state.autoPlay;
    const btn = document.getElementById('auto-btn');
    const btnText = document.getElementById('auto-btn-text');

    if (state.autoPlay) {
        btn.classList.add('active-auto');
        btnText.textContent = 'Detener Auto';
        // 3.5 segundos por tirada para dar tiempo a la voz en español latino
        state.autoInterval = setInterval(() => {
            if (state.drawIndex >= state.allNumbers.length || state.gameOver) {
                clearAutoPlay();
                return;
            }
            drawNumber();
        }, 3600);
    } else {
        clearAutoPlay();
    }
}

function clearAutoPlay() {
    state.autoPlay = false;
    if (state.autoInterval) {
        clearInterval(state.autoInterval);
        state.autoInterval = null;
    }
    const btn = document.getElementById('auto-btn');
    const btnText = document.getElementById('auto-btn-text');
    if (btn) btn.classList.remove('active-auto');
    if (btnText) btnText.textContent = 'Auto Play';
}

// =============================================
// CONTROL DE VICTORIAS Y PREMIOS
// =============================================
function checkWin() {
    if (state.gameOver) return;

    let winners = [];

    state.players.forEach(p => {
        p.cards.forEach((c, idx) => {
            let won = false;
            let winningCells = [];

            if (state.winMode === 'line') {
                const res = checkLines(c.marked, 1);
                won = res.won;
                winningCells = res.cells;
            } else if (state.winMode === 'two-lines') {
                const res = checkLines(c.marked, 2);
                won = res.won;
                winningCells = res.cells;
            } else if (state.winMode === 'full') {
                const res = checkFullCard(c.marked);
                won = res.won;
                winningCells = res.cells;
            }

            if (won) {
                winners.push({
                    player: p,
                    card: c,
                    cardIndex: idx + 1,
                    cells: winningCells
                });
            }
        });
    });

    if (winners.length > 0) {
        state.gameOver = true;
        clearAutoPlay();

        // Si hay empates simultáneos, se divide el pozo
        const coinsPrize = Math.floor(state.pot / winners.length);
        let winnersNames = winners.map(w => w.player.name).join(' y ');

        // Marcar visualmente las celdas ganadoras en la pantalla
        winners.forEach(w => {
            // Acreditar premio de monedas a cada ganador
            w.player.coins += coinsPrize;
            
            w.cells.forEach(([r, c]) => {
                const cell = document.getElementById(`cell-${w.card.id}-${r}-${c}`);
                if (cell) cell.classList.add('winning-cell');
            });
        });

        // Descontar del pozo
        state.pot = 0;

        // Sonidos y voz de victoria
        playWinSound();
        speakWinner(winnersNames);

        // Mostrar pantalla de celebración con confetti
        setTimeout(() => {
            const winMsg = document.getElementById('win-message');
            if (winners.length === 1) {
                const w = winners[0];
                winMsg.innerHTML = `¡${w.player.name} completó el Bingo con su Cartón #${w.cardIndex}!<br><br><span style="color:var(--accent-amber); font-weight:800; font-size:1.2rem;">🪙 ¡Se lleva el pozo entero de ${coinsPrize} monedas!</span>`;
            } else {
                winMsg.innerHTML = `¡Empate simultáneo entre ${winnersNames}!<br><br><span style="color:var(--accent-amber); font-weight:800; font-size:1.1rem;">🪙 ¡Se dividen el pozo de monedas llevando ${coinsPrize} c/u!</span>`;
            }
            document.getElementById('win-modal').classList.remove('hidden');
            launchConfetti();
        }, 600);
    }
}

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

    // Diagonal 1 (Top-Left to Bottom-Right)
    let d1 = true;
    const d1Cells = [];
    for (let i = 0; i < 5; i++) {
        if (!markedMatrix[i][i]) d1 = false;
        d1Cells.push([i, i]);
    }
    if (d1) completed.push(d1Cells);

    // Diagonal 2 (Top-Right to Bottom-Left)
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

function setWinMode(mode, btn) {
    if (socket && socket.connected) {
        if (state.gameMode === 'host') {
            socket.emit('set_win_mode', { mode });
        }
        return;
    }

    state.winMode = mode;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    // Si se cambia el modo en mitad del juego, re-validar victorias
    if (!state.gameOver && state.gameMode !== 'host') {
        checkWin();
    }
}

// =============================================
// CONFETTI CELEBRACIÓN
// =============================================
function launchConfetti() {
    const container = document.getElementById('confetti-container');
    if (!container) return;
    const colors = ['#a855f7', '#ec4899', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#f97316'];
    const shapes = ['square', 'circle'];

    for (let i = 0; i < 140; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';

        const color = colors[Math.floor(Math.random() * colors.length)];
        const shape = shapes[Math.floor(Math.random() * shapes.length)];
        const left = Math.random() * 100;
        const size = Math.random() * 7 + 6;
        const duration = Math.random() * 2 + 1.8;
        const delay = Math.random() * 1.5;

        piece.style.left = `${left}%`;
        piece.style.width = `${size}px`;
        piece.style.height = `${size}px`;
        piece.style.backgroundColor = color;
        piece.style.borderRadius = shape === 'circle' ? '50%' : '1px';
        piece.style.animationDuration = `${duration}s`;
        piece.style.animationDelay = `${delay}s`;

        container.appendChild(piece);
    }

    setTimeout(() => { container.innerHTML = ''; }, 5500);
}

// =============================================
// REINICIOS Y SIGUIENTES PARTIDAS
// =============================================
function startNewRound() {
    state.allNumbers = generateShuffledPool();
    state.drawIndex = 0;
    state.calledNumbers = [];
    state.gameOver = false;
    
    // En cada nueva ronda, limpiamos los marcados de los cartones que ya posean los jugadores reales
    // ¡Los jugadores NO pierden sus cartones comprados! Simplemente los limpian para jugar gratis otra vez.
    state.players.forEach(p => {
        p.cards.forEach(c => {
            c.marked = Array(5).fill(null).map(() => Array(5).fill(false));
            c.marked[2][2] = true; // El centro libre permanece libre
        });
    });

    clearAutoPlay();
    resetBallDisplay();
    renderAll();
}

function generateShuffledPool() {
    const nums = [];
    for (let i = 1; i <= 75; i++) nums.push(i);
    for (let i = nums.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nums[i], nums[j]] = [nums[j], nums[i]];
    }
    return nums;
}

function resetBallDisplay() {
    const ballContainer = document.getElementById('current-ball');
    ballContainer.classList.remove('popping', 'ball-b', 'ball-i', 'ball-n', 'ball-g', 'ball-o');
    document.getElementById('ball-letter').textContent = '?';
    document.getElementById('ball-number').textContent = '--';
    document.getElementById('call-announcement').textContent = 'Presiona "Sacar Bolilla" para comenzar';
    document.getElementById('call-announcement').classList.remove('highlight');
}

function newGame() {
    // Siguiente partida desde el modal
    closeModal();
    document.getElementById('confetti-container').innerHTML = '';
    if (socket && socket.connected) {
        if (state.gameMode === 'host') {
            socket.emit('restart_game');
        }
        return;
    }
    startNewRound();
}

function resetRound() {
    // Botón manual de reinicio rápido de ronda
    if (confirm('¿Seguro que deseas reiniciar la ronda actual? Se vaciará el bolillero.')) {
        if (socket && socket.connected) {
            if (state.gameMode === 'host') {
                socket.emit('restart_game');
            }
            return;
        }
        startNewRound();
    }
}

function closeModal() {
    document.getElementById('win-modal').classList.add('hidden');
}

// --- Toggles de configuración ---
function toggleSound() {
    state.soundEnabled = !state.soundEnabled;
    const btn = document.getElementById('sound-toggle');
    const icon = document.getElementById('sound-icon');
    const label = document.getElementById('sound-label');

    if (state.soundEnabled) {
        btn.classList.add('active');
        icon.textContent = '🔊';
        label.textContent = 'Sonido';
    } else {
        btn.classList.remove('active');
        icon.textContent = '🔇';
        label.textContent = 'Silencio';
    }
}

function toggleVoice() {
    state.voiceEnabled = !state.voiceEnabled;
    const btn = document.getElementById('voice-toggle');
    const icon = document.getElementById('voice-icon');
    const label = document.getElementById('voice-label');

    if (state.voiceEnabled) {
        btn.classList.add('active');
        icon.textContent = '🗣️';
        label.textContent = 'Voz';
    } else {
        btn.classList.remove('active');
        icon.textContent = '🤐';
        label.textContent = 'Sin voz';
        if (typeof speechSynthesis !== 'undefined') {
            speechSynthesis.cancel();
        }
    }
}

// Inicialización de estilos shake dinámicos
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-6px); }
    40% { transform: translateX(6px); }
    60% { transform: translateX(-4px); }
    80% { transform: translateX(4px); }
}`;
document.head.appendChild(shakeStyle);

// =============================================
// CONEXIÓN Y EVENTOS SOCKET.IO (MULTIJUGADOR)
// =============================================
function connectToServer() {
    if (typeof io === 'undefined') {
        playErrorSound();
        alert("¡Error! La librería Socket.io no está disponible.\nAsegúrate de estar abriendo la página desde un servidor HTTP activo (ej: http://<IP-DE-PC>:3000) y no abriendo el archivo HTML local directamente.");
        return;
    }

    let serverUrl = document.getElementById('server-url-input').value.trim();
    if (!serverUrl) {
        if (window.location.origin && !window.location.origin.startsWith('file')) {
            serverUrl = window.location.origin;
        } else {
            playErrorSound();
            alert("Por favor, ingresa una dirección de servidor válida (ej: http://192.168.1.15:3000).");
            return;
        }
    }

    console.log(`Conectando al servidor: ${serverUrl}`);
    
    // Desactivar autoplay local si estuviera corriendo
    clearAutoPlay();

    socket = io(serverUrl, {
        reconnectionAttempts: 3,
        timeout: 5000,
        extraHeaders: {
            "bypass-tunnel-reminder": "true"
        }
    });

    socket.on('connect', () => {
        console.log(`Conexión exitosa con Socket ID: ${socket.id}`);
        
        // Ocultar pantalla de lobby principal y mostrar interfaz
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('game-interface').classList.remove('hidden');

        // Configuración de visualización basada en el rol de juego
        if (state.gameMode === 'host') {
            document.getElementById('caller-section').classList.remove('hidden');
            document.getElementById('card-section').classList.add('hidden');
            document.getElementById('add-player-btn').classList.add('hidden');
            document.getElementById('reset-round-btn').classList.remove('hidden');
            document.getElementById('mode-indicator').textContent = '📢 Anfitrión (Bolillero)';
            
            // Auto Play y Sacar bolilla activos para el host
            document.getElementById('draw-btn').disabled = false;
            document.getElementById('auto-btn').disabled = false;
        } else if (state.gameMode === 'player') {
            document.getElementById('caller-section').classList.add('hidden');
            document.getElementById('card-section').classList.remove('hidden');
            document.getElementById('add-player-btn').classList.add('hidden');
            document.getElementById('reset-round-btn').classList.add('hidden');
            document.getElementById('mode-indicator').textContent = '🎟️ Jugador en Vivo';
            
            // Auto Play y Sacar bolilla desactivados para el jugador
            document.getElementById('draw-btn').disabled = true;
            document.getElementById('auto-btn').disabled = true;
        }

        // Registrarse oficialmente en la sala de red
        const nameVal = document.getElementById('player-name-input').value.trim();
        socket.emit('join_room', {
            name: nameVal,
            color: state.selectedColor,
            isHost: (state.gameMode === 'host')
        });

        // Configurar los manejadores de eventos recibidos de red
        setupSocketEvents();
    });

    socket.on('connect_error', (error) => {
        console.error("Error de conexión al servidor:", error);
        playErrorSound();
        alert("No se pudo establecer conexión con el servidor de Bingo.\nVerifica que la dirección del servidor sea correcta y que esté en funcionamiento.");
        backToLobby();
    });
}

function setupSocketEvents() {
    // Inicialización y sincronización de estado de la sala
    socket.on('init_state', (data) => {
        syncState(data);
    });

    socket.on('room_state', (data) => {
        syncState(data);
    });

    // Inicio de partida oficial
    socket.on('game_started', (data) => {
        state.status = 'playing';
        state.pot = data.pot;
        state.winMode = data.winMode;
        
        // Sonido de inicio
        playCoinSound();
        
        // Configurar la interfaz
        document.getElementById('lobby-countdown-panel').classList.add('hidden');
        if (state.gameMode === 'player') {
            document.getElementById('claim-bingo-btn').classList.remove('hidden');
        }

        // Renderizar
        renderAll();
    });

    // Recepción de bolilla cantada por el anfitrión
    socket.on('ball_drawn', (data) => {
        state.calledNumbers = data.calledNumbers;
        
        // Sonidos y reproducción de voz
        playBallDrawSound();
        speakNumber(data.letter, data.number);

        // Actualizar bolilla gigante en pantalla
        const ballContainer = document.getElementById('current-ball');
        if (ballContainer) {
            ballContainer.className = 'ball-container'; // Limpiar
            void ballContainer.offsetHeight; // trigger reflow
            ballContainer.classList.add('popping', `ball-${data.letter.toLowerCase()}`);
            document.getElementById('ball-letter').textContent = data.letter;
            document.getElementById('ball-number').textContent = data.number;
        }

        const announcement = document.getElementById('call-announcement');
        if (announcement) {
            announcement.textContent = `${data.letter}-${data.number}`;
            announcement.classList.add('highlight');
            setTimeout(() => announcement.classList.remove('highlight'), 1500);
        }

        // Auto-marcado (Auto-daub) para el modo jugador
        if (state.autoDaub && state.gameMode === 'player') {
            let anyMarked = false;
            const myPlayerId = 'p_' + socket.id.substr(0, 5);
            const playerObj = state.players.find(pl => pl.id === myPlayerId);
            
            if (playerObj) {
                playerObj.cards.forEach(c => {
                    for (let r = 0; r < 5; r++) {
                        for (let col = 0; col < 5; col++) {
                            if (c.matrix[r][col] === data.number && !c.marked[r][col]) {
                                c.marked[r][col] = true;
                                anyMarked = true;
                                // Reportar el marcado al servidor
                                socket.emit('mark_cell', { cardId: c.id, row: r, col: col });
                            }
                        }
                    }
                });
            }
            if (anyMarked) {
                setTimeout(playCellMarkSound, 200);
            }
        }

        renderAll();
    });

    // Actualización rápida de cuenta regresiva
    socket.on('timer_update', (data) => {
        state.countdown = data.countdown;
        state.status = data.status;

        const timerPanel = document.getElementById('lobby-countdown-panel');
        if (state.status === 'lobby' && timerPanel) {
            timerPanel.classList.remove('hidden');
            
            const minutes = Math.floor(data.countdown / 60).toString().padStart(2, '0');
            const seconds = (data.countdown % 60).toString().padStart(2, '0');
            document.getElementById('lobby-time-left').textContent = `${minutes}:${seconds}`;
            
            // Hacer que pulse o cambie de color si falta muy poco
            const timerCircle = document.querySelector('.countdown-circle-wrapper');
            if (timerCircle) {
                if (data.countdown <= 15) {
                    timerCircle.style.borderColor = 'var(--accent-red)';
                    timerCircle.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.4)';
                } else {
                    timerCircle.style.borderColor = 'var(--accent-purple)';
                    timerCircle.style.boxShadow = '';
                }
            }
        }
    });

    // Confirmación de compra exitosa
    socket.on('buy_success', () => {
        playCoinSound();
    });

    // Confirmación de devolución exitosa
    socket.on('return_success', () => {
        playCoinSound();
    });

    // Errores de validación o mensajes del sistema
    socket.on('error_msg', (msg) => {
        playErrorSound();
        alert(msg);
    });

    // Notificaciones de sala
    socket.on('notification', (msg) => {
        console.log("Notificación:", msg);
    });

    // Fin de partida y ganador certificado
    socket.on('game_over', (data) => {
        state.gameOver = true;
        state.status = 'ended';

        // Sonidos y voz de victoria
        playWinSound();
        speakWinner(data.winnerName);

        // Resaltar celdas ganadoras en la pantalla del jugador o anfitrión
        data.winningCells.forEach(([r, c]) => {
            const cell = document.getElementById(`cell-${data.cardId}-${r}-${c}`);
            if (cell) cell.classList.add('winning-cell');
        });

        // Ocultar botón cantar Bingo
        document.getElementById('claim-bingo-btn').classList.add('hidden');

        // Mostrar pantalla de celebración con confetti
        setTimeout(() => {
            const winMsg = document.getElementById('win-message');
            winMsg.innerHTML = `¡${data.winnerName} completó el Bingo con su Cartón #${data.cardIndex}!<br><br><span style="color:var(--accent-amber); font-weight:800; font-size:1.2rem;">🪙 ¡Se lleva el pozo entero de ${data.prize} monedas!</span>`;
            document.getElementById('win-modal').classList.remove('hidden');
            launchConfetti();
        }, 600);

        renderAll();
    });
}

function syncState(data) {
    state.status = data.status;
    state.pot = data.pot;
    state.winMode = data.winMode;
    state.calledNumbers = data.calledNumbers;
    state.players = data.players;
    state.countdown = data.countdown;

    // Actualizar pozo y datos
    document.getElementById('pot-amount').textContent = state.pot;
    document.getElementById('lobby-pot-display-amount').textContent = state.pot;

    // Actualizar selectores visuales de modo de juego (Patrón de Ganar)
    document.querySelectorAll('.mode-btn').forEach(btn => {
        const mode = btn.getAttribute('data-mode');
        if (mode === state.winMode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
        // Deshabilitar botones de patrón si no es anfitrión (solo el host decide)
        btn.disabled = (state.gameMode !== 'host');
    });

    // Actualizar paneles de cuenta regresiva o estado de juego
    const timerPanel = document.getElementById('lobby-countdown-panel');
    const claimBtn = document.getElementById('claim-bingo-btn');

    if (state.status === 'lobby') {
        if (timerPanel) timerPanel.classList.remove('hidden');
        if (claimBtn) claimBtn.classList.add('hidden');
        
        const minutes = Math.floor(state.countdown / 60).toString().padStart(2, '0');
        const seconds = (state.countdown % 60).toString().padStart(2, '0');
        document.getElementById('lobby-time-left').textContent = `${minutes}:${seconds}`;
        
        // Reset bolillero visual
        resetBallDisplay();
    } else if (state.status === 'playing') {
        if (timerPanel) timerPanel.classList.add('hidden');
        if (claimBtn && state.gameMode === 'player') {
            claimBtn.classList.remove('hidden');
        }
    } else if (state.status === 'ended') {
        if (timerPanel) timerPanel.classList.add('hidden');
        if (claimBtn) claimBtn.classList.add('hidden');
    }

    // Actualizar controles del Anfitrión/Bolillero
    const startEarlyBtn = document.getElementById('start-early-btn');
    const drawBtn = document.getElementById('draw-btn');
    const autoBtn = document.getElementById('auto-btn');

    if (state.gameMode === 'host') {
        if (state.status === 'lobby') {
            if (startEarlyBtn) startEarlyBtn.classList.remove('hidden');
            if (drawBtn) drawBtn.classList.add('hidden');
            if (autoBtn) autoBtn.classList.add('hidden');
        } else if (state.status === 'playing') {
            if (startEarlyBtn) startEarlyBtn.classList.add('hidden');
            if (drawBtn) {
                drawBtn.classList.remove('hidden');
                drawBtn.disabled = false;
            }
            if (autoBtn) {
                autoBtn.classList.remove('hidden');
                autoBtn.disabled = false;
            }
        } else if (state.status === 'ended') {
            if (startEarlyBtn) startEarlyBtn.classList.add('hidden');
            if (drawBtn) {
                drawBtn.classList.remove('hidden');
                drawBtn.disabled = true;
            }
            if (autoBtn) {
                autoBtn.classList.remove('hidden');
                autoBtn.disabled = true;
            }
        }
    } else {
        // Para jugadores, ocultar todo lo del bolillero
        if (startEarlyBtn) startEarlyBtn.classList.add('hidden');
    }

    renderAll();
}

function claimBingo() {
    if (socket && socket.connected) {
        socket.emit('claim_bingo');
    }
}

function startHostGameEarly() {
    if (socket && socket.connected && state.gameMode === 'host') {
        socket.emit('start_game_early');
    }
}

// Registro del Service Worker para soporte PWA (Instalación en móviles)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker de Bingo registrado con éxito.'))
            .catch(err => console.error('Error al registrar el Service Worker de Bingo:', err));
    });
}
