// Etat du jeu
const ROWS = 6, COLS = 7;
let board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let currentPlayer = 1; // 1 rouge (host), 2 jaune (guest)
let gameOver = false;
let mode = null; // 'ai' | 'online'
let myOnlineRole = null; // 'host' | 'guest' | 'spectator'
let roomId = null;
let aiDepth = 5;

// Joueurs
let myNickname = '';
let myTokenStyle = 0; // 0..10
let oppNickname = '';
let oppTokenStyle = 0;
let spectators = []; // noms des spectateurs

// Id client (sans Auth), pour spectateurs
const viewerId = `viewer_${Math.random().toString(36).slice(2, 10)}`;

// Timers
let preCountdownTimer = null;
let turnTimerId = null;
let turnRemaining = 20;
let isStartingOnlineGame = false;

// Audio autoplay friendly
const bgm = document.getElementById('bgm');
let audioUnlocked = false;

// Firebase
const { db, ref, onValue, set, update, get, child, remove, serverTimestamp } = window._firebase;

// UI
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const restartBtn = document.getElementById('restart');
const aiDepthSel = document.getElementById('ai-depth');
const modeAI = document.getElementById('mode-ai');
const modeOnline = document.getElementById('mode-online');
const onlineSetup = document.getElementById('online-setup');
const roomCodeInput = document.getElementById('room-code');
const roomInfo = document.getElementById('room-info');
const countdownEl = document.getElementById('countdown');
const turnTimerEl = document.getElementById('turn-timer');
const controlsEl = document.getElementById('controls');

const preGame = document.getElementById('pre-game');
const nicknameInput = document.getElementById('nickname');
const nickHint = document.getElementById('nick-hint');
const tokenStyleSel = document.getElementById('token-style');
const previewImg = document.getElementById('preview-img');
const tokenSwatchesEl = document.getElementById('token-swatches');

const nameRedEl = document.getElementById('name-red');
const nameYellowEl = document.getElementById('name-yellow');
const spectatorListEl = document.getElementById('spectator-list');
const resultModalEl = document.getElementById('result-modal');
const resultTitleEl = document.getElementById('result-title');
const resultMessageEl = document.getElementById('result-message');
const resultRestartBtn = document.getElementById('result-restart');
const resultCloseBtn = document.getElementById('result-close');
const toastsEl = document.getElementById('toasts');

// Fonctions utilitaires manquantes
function genDefaultNick() {
    const adjectives = ['Brave', 'Swift', 'Clever', 'Bold', 'Quick'];
    const nouns = ['Player', 'Gamer', 'Hero', 'Champion', 'Warrior'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adj}${noun}${Math.floor(Math.random() * 100)}`;
}

function genRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function captureLocalPlayerPrefs() {
    myNickname = (nicknameInput.value || '').trim().slice(0, 20) || genDefaultNick();
    myTokenStyle = parseInt(tokenStyleSel.value, 10) || 0;
    nicknameInput.value = myNickname;
}

function setInputsLocked(locked) {
    // Fonction pour verrouiller/déverrouiller les contrôles
    const inputs = [nicknameInput, tokenStyleSel, aiDepthSel];
    inputs.forEach(input => {
        if (input) input.disabled = locked;
    });
}

function startBackgroundMusic() {
    if (audioUnlocked && bgm) {
        bgm.play().catch(e => console.log('BGM play failed:', e));
    }
}

function notify(type, title, message) {
    if (!toastsEl) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type || 'info'}`;
    const content = document.createElement('div');
    const titleEl = document.createElement('div');
    const msgEl = document.createElement('div');
    const closeBtn = document.createElement('button');
    titleEl.className = 'title';
    msgEl.className = 'msg';
    closeBtn.className = 'close';
    closeBtn.setAttribute('aria-label', 'Fermer');
    closeBtn.textContent = '×';
    titleEl.textContent = title;
    msgEl.textContent = message;
    content.appendChild(titleEl);
    content.appendChild(msgEl);
    toast.appendChild(content);
    toast.appendChild(closeBtn);
    const close = () => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 200);
    };
    closeBtn.addEventListener('click', close);
    toastsEl.appendChild(toast);
    setTimeout(close, 3600);
}

function scheduleRoomAutoCleanup(roomId, timestamp) {
    // Fonction pour programmer le nettoyage automatique des salles
    // Implémentation simplifiée
    setTimeout(() => {
        console.log(`Room ${roomId} should be cleaned up`);
    }, 3600000); // 1 heure
}

// Initial pseudo par défaut
nicknameInput.value = genDefaultNick();
nickHint.textContent = `Par défaut: ${nicknameInput.value}`;

// Preview token
updatePreview();
tokenStyleSel.addEventListener('change', updatePreview);
createTokenSwatches();
resultRestartBtn.addEventListener('click', () => {
    hideResultModal();
    restartBtn.click();
});
resultCloseBtn.addEventListener('click', hideResultModal);

function updatePreview() {
    const val = parseInt(tokenStyleSel.value, 10);
    if (val > 0) {
        previewImg.src = `jetons/${val}.png`;
        previewImg.style.display = 'block';
    } else {
        previewImg.removeAttribute('src');
        previewImg.style.display = 'none';
    }
    updateTokenSwatchSelection();
}

function createTokenSwatches() {
    if (!tokenSwatchesEl) return;
    tokenSwatchesEl.innerHTML = '';
    for (let i = 0; i <= 10; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'token-swatch';
        btn.dataset.value = `${i}`;
        btn.title = i === 0 ? 'Sans effet' : `Effet ${i}`;
        if (i === 0) {
            const dot = document.createElement('div');
            dot.className = 'plain-dot';
            btn.appendChild(dot);
        } else {
            const img = document.createElement('img');
            img.src = `jetons/${i}.png`;
            img.alt = `Effet ${i}`;
            btn.appendChild(img);
        }
        btn.addEventListener('click', () => {
            tokenStyleSel.value = `${i}`;
            updatePreview();
        });
        tokenSwatchesEl.appendChild(btn);
    }
    updateTokenSwatchSelection();
}

function updateTokenSwatchSelection() {
    if (!tokenSwatchesEl) return;
    const selected = tokenStyleSel.value;
    tokenSwatchesEl.querySelectorAll('.token-swatch').forEach((el) => {
        el.classList.toggle('active', el.dataset.value === selected);
    });
}

// Init UI
renderBoard();
setStatus("Choisissez un mode.");

// Déverrouiller l'audio au premier clic
document.addEventListener('click', () => { audioUnlocked = true; }, { once: true });

// Mode IA
modeAI.addEventListener('click', () => {
    mode = 'ai';
    myOnlineRole = null;
    roomId = null;
    oppNickname = '';
    oppTokenStyle = 0;
    onlineSetup.classList.add('hidden');
    captureLocalPlayerPrefs();
    resetGame();
    setInputsLocked(false);
    startPreGameCountdown(() => {
        startBackgroundMusic();
        document.body.classList.add('in-game');
        setStatus("Mode IA: à vous de jouer (rouge).");
        startTurnIfNeeded();
    });
});

// Mode Online
modeOnline.addEventListener('click', () => {
    mode = 'online';
    onlineSetup.classList.remove('hidden');
    setStatus("Créez un salon ou rejoignez avec un code.");
});

// Créer Salon
const createRoomBtn = document.getElementById('create-room');
createRoomBtn.addEventListener('click', async () => {
    if (mode !== 'online') return;
    captureLocalPlayerPrefs();
    roomId = genRoomCode();
    myOnlineRole = 'host';
    resetGame();
    setInputsLocked(false);
    roomInfo.textContent = `Salon créé: ${roomId} (partagez ce code)`;
    setStatus("En attente d'un joueur...");
    notify('success', 'Salon créé', `Code: ${roomId}`);

    await set(ref(db, `rooms/${roomId}`), {
        createdAt: Date.now(),
        state: {
            board,
            currentPlayer,
            gameOver,
            styles: { host: myTokenStyle, guest: 0 },
            names: { host: myNickname, guest: "" },
            started: false
        },
        players: { host: true, guest: false },
        spectators: {}
    });

    scheduleRoomAutoCleanup(roomId, Date.now());
    listenRoom(roomId);
});

// Rejoindre (joueur ou spectateur si plein)
const joinRoomBtn = document.getElementById('join-room');
joinRoomBtn.addEventListener('click', async () => {
    if (mode !== 'online') return;
    captureLocalPlayerPrefs();
    const code = roomCodeInput.value.trim().toUpperCase();
    if (!code) return alert("Entrez un code de salon.");
    const snap = await get(child(ref(db), `rooms/${code}`));
    if (!snap.exists()) return alert("Salon introuvable.");

    roomId = code;
    const data = snap.val();
    const players = data.players || {};

    if (!players.host) {
        // Devenir host
        myOnlineRole = 'host';
        await update(ref(db, `rooms/${roomId}`), {
            players: { host: true, guest: players.guest || false },
            state: {
                ...data.state,
                names: { host: myNickname, guest: data.state?.names?.guest || "" },
                styles: { host: myTokenStyle, guest: data.state?.styles?.guest || 0 }
            }
        });
        notify('success', 'Salon rejoint', 'Vous êtes Rouge (Hôte).');
    } else if (!players.guest) {
        // Devenir guest
        myOnlineRole = 'guest';
        await update(ref(db, `rooms/${roomId}`), {
            players: { host: players.host, guest: true },
            state: {
                ...data.state,
                names: { host: data.state?.names?.host || "", guest: myNickname },
                styles: { host: data.state?.styles?.host || 0, guest: myTokenStyle }
            }
        });
        notify('success', 'Salon rejoint', 'Vous êtes Jaune (Invité).');
    } else {
        // Devenir spectateur
        myOnlineRole = 'spectator';
        await update(ref(db, `rooms/${roomId}/spectators/${viewerId}`), {
            name: myNickname,
            joinedAt: Date.now()
        });
        notify('info', 'Vous êtes spectateur', 'La partie est pleine.');
    }

    setInputsLocked(false);
    roomInfo.textContent = `Salon: ${roomId}`;
    listenRoom(roomId);
});

// Redémarrer
restartBtn.addEventListener('click', async () => {
    stopTurnTimer();
    if (preCountdownTimer) clearInterval(preCountdownTimer);

    if (mode === 'online' && roomId) {
        // On garde les pseudos/styles mais on remet le plateau et started=false
        const stateSnap = await get(child(ref(db), `rooms/${roomId}/state`));
        const st = stateSnap.val() || {};
        board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        currentPlayer = 1;
        gameOver = false;
        await update(ref(db, `rooms/${roomId}`), {
            state: {
                board,
                currentPlayer,
                gameOver,
                styles: st.styles || { host: 0, guest: 0 },
                names: st.names || { host: "", guest: "" },
                started: false
            }
        });
    }

    resetGame();
    setInputsLocked(false);

    startPreGameCountdown(async () => {
        startBackgroundMusic();
        document.body.classList.add('in-game');
        if (mode === 'online' && roomId) {
            await update(ref(db, `rooms/${roomId}/state`), { started: true });
            setInputsLocked(true);
        }
        startTurnIfNeeded();
    });
});

aiDepthSel.addEventListener('change', (e) => {
    aiDepth = parseInt(e.target.value, 10);
});

// Construction plateau
function renderBoard() {
    boardEl.innerHTML = '';
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.col = c;
            cell.addEventListener('click', () => handleColumnClick(c));
            if (board[r][c] !== 0) {
                const d = makeDisc(board[r][c]);
                cell.appendChild(d);
            }
            boardEl.appendChild(cell);
        }
    }
}

function makeDisc(player) {
    const d = document.createElement('div');
    d.className = `disc ${player === 1 ? 'p1' : 'p2'}`;
    const img = document.createElement('img');
    const styleId = resolveStyleForPlayer(player);
    if (styleId > 0) {
        img.src = `jetons/${styleId}.png`;
        d.appendChild(img);
    }
    return d;
}

function resolveStyleForPlayer(player) {
    if (mode === 'online') {
        // host joue Rouge (1), guest joue Jaune (2)
        if (player === 1) {
            return myOnlineRole === 'host' ? myTokenStyle : oppTokenStyle;
        } else {
            return myOnlineRole === 'guest' ? myTokenStyle : oppTokenStyle;
        }
    } else {
        // IA: p1=humain, p2=IA
        return player === 1 ? myTokenStyle : 0;
    }
}

// Clic joueur
async function handleColumnClick(col) {
    if (gameOver) return;

    // Si spectateur: aucune interaction
    if (mode === 'online' && myOnlineRole === 'spectator') return;

    if (mode === 'online') {
        const myTurn = (myOnlineRole === 'host' && currentPlayer === 1) ||
            (myOnlineRole === 'guest' && currentPlayer === 2);
        if (!myTurn) return;
    }

    const row = getAvailableRow(col);
    if (row === -1) return;

    placeDiscAnimated(row, col, currentPlayer);
    const winner = checkWinner(board);
    if (winner || isBoardFull(board)) {
        finishGameNotify(winner);
    } else {
        switchTurn();
    }

    if (mode === 'online' && roomId) {
        const stateSnap = await get(child(ref(db), `rooms/${roomId}/state`));
        const st = stateSnap.val() || {};
        await update(ref(db, `rooms/${roomId}`), {
            state: {
                board,
                currentPlayer,
                gameOver,
                styles: st.styles || { host: 0, guest: 0 },
                names: st.names || { host: "", guest: "" },
                started: true
            }
        });
    }
}

function updateStatusTurn() {
    if (mode === 'ai') {
        setStatus(currentPlayer === 1 ? "À vous (rouge)." : "IA réfléchit...");
    } else if (mode === 'online') {
        const redName = nameRedEl.textContent || 'Rouge';
        const yellowName = nameYellowEl.textContent || 'Jaune';
        const turnText = currentPlayer === 1 ? `${redName} (Rouge)` : `${yellowName} (Jaune)`;
        setStatus(`Au tour de ${turnText}.`);
    } else {
        setStatus(currentPlayer === 1 ? "Au tour de Rouge." : "Au tour de Jaune.");
    }
}

function setStatus(t) {
    statusEl.textContent = t;
}

function resetGame() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
    currentPlayer = 1;
    gameOver = false;
    renderBoard();
    updateStatusTurn();
    stopTurnTimer();
    countdownEl.classList.add('hidden');
    document.body.classList.remove('in-game');
    hideResultModal();
    if (mode === 'online' && myOnlineRole === 'spectator') {
        document.body.classList.add('spectator');
    } else {
        document.body.classList.remove('spectator');
    }
}

// Helpers
function getAvailableRow(col) {
    for (let r = ROWS - 1; r >= 0; r--) {
        if (board[r][col] === 0) return r;
    }
    return -1;
}

function placeDiscAnimated(row, col, player) {
    board[row][col] = player;
    const indexTarget = row * COLS + col;
    const targetCell = boardEl.children[indexTarget];
    const disc = makeDisc(player);
    const distanceFactor = (row + 1) / ROWS;
    const duration = 0.25 + distanceFactor * 0.35;
    disc.style.setProperty('--fall', `${duration}s`);
    disc.classList.add('drop');
    targetCell.appendChild(disc);
}

function isBoardFull(b) {
    return b.every(row => row.every(v => v !== 0));
}

// Détection victoire
function checkWinner(b) {
    // Horizontal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            const v = b[r][c];
            if (v && v === b[r][c + 1] && v === b[r][c + 2] && v === b[r][c + 3]) return v;
        }
    }
    // Vertical
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r <= ROWS - 4; r++) {
            const v = b[r][c];
            if (v && v === b[r + 1][c] && v === b[r + 2][c] && v === b[r + 3][c]) return v;
        }
    }
    // Diagonal descendante
    for (let r = 0; r <= ROWS - 4; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            const v = b[r][c];
            if (v && v === b[r + 1][c + 1] && v === b[r + 2][c + 2] && v === b[r + 3][c + 3]) return v;
        }
    }
    // Diagonal montante
    for (let r = 3; r < ROWS; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            const v = b[r][c];
            if (v && v === b[r - 1][c + 1] && v === b[r - 2][c + 2] && v === b[r - 3][c + 3]) return v;
        }
    }
    return 0;
}

// Tour + timers
function switchTurn() {
    currentPlayer = currentPlayer === 1 ? 2 : 1;
    updateStatusTurn();
    startTurnIfNeeded();
}

function startTurnIfNeeded() {
    document.body.classList.add('in-game');

    if (mode === 'ai') {
        if (currentPlayer === 2 && !gameOver) {
            stopTurnTimer();
            aiMove();
        } else {
            startTurnTimerIfHuman();
        }
    } else if (mode === 'online') {
        if (myOnlineRole === 'spectator') {
            stopTurnTimer();
            turnTimerEl.classList.add('hidden');
        } else {
            startTurnTimerIfMyTurn();
        }
    }
}

function startTurnTimerIfHuman() {
    if (currentPlayer !== 1 || gameOver) return;
    startTurnTimer(() => {
        const moves = validMoves(board);
        if (moves.length === 0) return;
        const col = moves[Math.floor(Math.random() * moves.length)];
        const row = getAvailableRow(col);
        if (row !== -1) {
            placeDiscAnimated(row, col, 1);
            notify('warn', 'Coup automatique', 'Temps écoulé — colonne aléatoire jouée.');
            const w = checkWinner(board);
            if (w || isBoardFull(board)) finishGameNotify(w);
            else switchTurn();
        }
    });
}

function startTurnTimerIfMyTurn() {
    if (gameOver) return;
    const myTurn = (myOnlineRole === 'host' && currentPlayer === 1) ||
        (myOnlineRole === 'guest' && currentPlayer === 2);
    if (!myTurn) {
        stopTurnTimer();
        turnTimerEl.classList.add('hidden');
        return;
    }
    startTurnTimer(async () => {
        const moves = validMoves(board);
        if (moves.length === 0) return;
        const col = moves[Math.floor(Math.random() * moves.length)];
        const row = getAvailableRow(col);
        if (row !== -1) {
            placeDiscAnimated(row, col, currentPlayer);
            notify('warn', 'Coup automatique', 'Temps écoulé — colonne aléatoire jouée.');
            const w = checkWinner(board);
            if (w || isBoardFull(board)) {
                finishGameNotify(w);
            } else {
                currentPlayer = currentPlayer === 1 ? 2 : 1;
                updateStatusTurn();
            }
            if (mode === 'online' && roomId) {
                const stateSnap = await get(child(ref(db), `rooms/${roomId}/state`));
                const st = stateSnap.val() || {};
                await update(ref(db, `rooms/${roomId}`), {
                    state: {
                        board,
                        currentPlayer,
                        gameOver,
                        styles: st.styles || { host: 0, guest: 0 },
                        names: st.names || { host: "", guest: "" },
                        started: true
                    }
                });
            }
            startTurnIfNeeded();
        }
    });
}

function startTurnTimer(onExpire) {
    stopTurnTimer();
    turnRemaining = 20;
    turnTimerEl.textContent = `${turnRemaining}s`;
    turnTimerEl.classList.remove('hidden');
    turnTimerId = setInterval(() => {
        turnRemaining--;
        if (turnRemaining <= 0) {
            stopTurnTimer();
            turnTimerEl.textContent = '0s';
            turnTimerEl.classList.add('hidden');
            onExpire && onExpire();
        } else {
            turnTimerEl.textContent = `${turnRemaining}s`;
        }
    }, 1000);
}

function stopTurnTimer() {
    if (turnTimerId) {
        clearInterval(turnTimerId);
        turnTimerId = null;
    }
    turnTimerEl.classList.add('hidden');
}

// Début partie: chrono 3..2..1..Go!
function startPreGameCountdown(onDone) {
    countdownEl.classList.remove('hidden');
    let val = 3;
    countdownEl.textContent = `${val}`;
    if (preCountdownTimer) clearInterval(preCountdownTimer);
    preCountdownTimer = setInterval(() => {
        val--;
        if (val <= 0) {
            clearInterval(preCountdownTimer);
            preCountdownTimer = null;
            countdownEl.textContent = 'Go!';
            setTimeout(() => {
                countdownEl.classList.add('hidden');
                onDone && onDone();
            }, 500);
        } else {
            countdownEl.textContent = `${val}`;
        }
    }, 1000);
}

// Fin de partie sans overlay (notifications)
function finishGameNotify(winner) {
    gameOver = true;
    stopTurnTimer();
    if (winner === 1) {
        notify('success', 'Victoire Rouge', `${nameRedEl.textContent || 'Rouge'} gagne !`);
        setStatus('Victoire Rouge.');
        showResultModal('Victoire Rouge', `${nameRedEl.textContent || 'Rouge'} remporte la partie.`);
    } else if (winner === 2) {
        notify('success', 'Victoire Jaune', `${nameYellowEl.textContent || 'Jaune'} gagne !`);
        setStatus('Victoire Jaune.');
        showResultModal('Victoire Jaune', `${nameYellowEl.textContent || 'Jaune'} remporte la partie.`);
    } else {
        notify('info', 'Match nul', 'Aucun vainqueur.');
        setStatus('Match nul.');
        showResultModal('Match nul', 'Aucun vainqueur cette fois.');
    }
}

function showResultModal(title, message) {
    if (!resultModalEl || !resultTitleEl || !resultMessageEl) return;
    resultTitleEl.textContent = title;
    resultMessageEl.textContent = message;
    resultModalEl.classList.remove('hidden');
    resultModalEl.setAttribute('aria-hidden', 'false');
}

function hideResultModal() {
    if (!resultModalEl) return;
    resultModalEl.classList.add('hidden');
    resultModalEl.setAttribute('aria-hidden', 'true');
}

// IA forte: minimax + alpha-bêta
function cloneBoard(b) { return b.map(r => r.slice()); }

function validMoves(b) { 
    return Array.from({ length: COLS }, (_, c) => c).filter(c => b[0][c] === 0); 
}

function applyMove(b, col, player) {
    const nb = cloneBoard(b);
    for (let r = ROWS - 1; r >= 0; r--) {
        if (nb[r][col] === 0) { 
            nb[r][col] = player; 
            break; 
        }
    }
    return nb;
}

function evaluateWindow(window, player) {
    const opp = player === 1 ? 2 : 1;
    const countP = window.filter(v => v === player).length;
    const countO = window.filter(v => v === opp).length;
    const count0 = window.filter(v => v === 0).length;
    let score = 0;
    if (countP === 4) score += 100000;
    else if (countP === 3 && count0 === 1) score += 500;
    else if (countP === 2 && count0 === 2) score += 100;
    if (countO === 3 && count0 === 1) score -= 600;
    if (countO === 4) score -= 100000;
    return score;
}

function scorePosition(b, player) {
    let score = 0;
    const centerCol = Math.floor(COLS / 2);
    let centerCount = 0;
    for (let r = 0; r < ROWS; r++) if (b[r][centerCol] === player) centerCount++;
    score += centerCount * 6;

    // Horizontal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            const window4 = [b[r][c], b[r][c + 1], b[r][c + 2], b[r][c + 3]];
            score += evaluateWindow(window4, player);
        }
    }
    // Vertical
    for (let c = 0; c < COLS; c++) {
        for (let r = 0; r <= ROWS - 4; r++) {
            const window4 = [b[r][c], b[r + 1][c], b[r + 2][c], b[r + 3][c]];
            score += evaluateWindow(window4, player);
        }
    }
    // Diagonal montante
    for (let r = 3; r < ROWS; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            const window4 = [b[r][c], b[r - 1][c + 1], b[r - 2][c + 2], b[r - 3][c + 3]];
            score += evaluateWindow(window4, player);
        }
    }
    // Diagonal descendante
    for (let r = 0; r <= ROWS - 4; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            const window4 = [b[r][c], b[r + 1][c + 1], b[r + 2][c + 2], b[r + 3][c + 3]];
            score += evaluateWindow(window4, player);
        }
    }
    return score;
}

function minimax(b, depth, alpha, beta, maximizingPlayer) {
    const w = checkWinner(b);
    if (depth === 0 || w !== 0 || isBoardFull(b)) {
        if (w === 2) return { score: 1e9 };
        if (w === 1) return { score: -1e9 };
        return { score: scorePosition(b, 2) };
    }
    const moves = validMoves(b);
    moves.sort((a, b) => Math.abs(a - 3) - Math.abs(b - 3));
    
    if (maximizingPlayer) {
        let value = -Infinity, bestCol = moves[0];
        for (const col of moves) {
            const nb = applyMove(b, col, 2);
            const evalRes = minimax(nb, depth - 1, alpha, beta, false);
            if (evalRes.score > value) { value = evalRes.score; bestCol = col; }
            alpha = Math.max(alpha, value);
            if (alpha >= beta) break;
        }
        return { col: bestCol, score: value };
    } else {
        let value = Infinity, bestCol = moves[0];
        for (const col of moves) {
            const nb = applyMove(b, col, 1);
            const evalRes = minimax(nb, depth - 1, alpha, beta, true);
            if (evalRes.score < value) { value = evalRes.score; bestCol = col; }
            beta = Math.min(beta, value);
            if (alpha >= beta) break;
        }
        return { col: bestCol, score: value };
    }
}

async function aiMove() {
    setStatus("IA réfléchit...");
    await new Promise(r => setTimeout(r, 150));
    const { col } = minimax(board, aiDepth, -Infinity, Infinity, true);
    if (col === undefined) return;
    const row = getAvailableRow(col);
    if (row === -1) return;
    placeDiscAnimated(row, col, 2);
    const winner = checkWinner(board);
    if (winner || isBoardFull(board)) {
        finishGameNotify(winner);
    } else {
        currentPlayer = 1;
        updateStatusTurn();
        startTurnIfNeeded();
    }
}

// Sync Firebase + Scoreboard + Spectateurs
function listenRoom(id) {
    const roomRef = ref(db, `rooms/${id}`);
    const stateRef = ref(db, `rooms/${id}/state`);
    const playersRef = ref(db, `rooms/${id}/players`);
    const spectatorsRef = ref(db, `rooms/${id}/spectators`);
    
    // Etat du jeu
    onValue(stateRef, (snap) => {
        const data = snap.val();
        if (!data) return;
        
        // Synchroniser l'état du jeu
        board = data.board || Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        currentPlayer = data.currentPlayer || 1;
        gameOver = data.gameOver || false;
        
        // Mettre à jour les noms et styles
        if (data.names) {
            if (nameRedEl) nameRedEl.textContent = data.names.host || 'Rouge';
            if (nameYellowEl) nameYellowEl.textContent = data.names.guest || 'Jaune';
        }
        
        if (data.styles) {
            if (myOnlineRole === 'host') {
                oppTokenStyle = data.styles.guest || 0;
            } else if (myOnlineRole === 'guest') {
                oppTokenStyle = data.styles.host || 0;
            }
        }
        
        if (!data.started) {
            document.body.classList.remove('in-game');
            stopTurnTimer();
        }

        // Re-rendre le plateau avec les nouvelles données
        renderBoard();
        updateStatusTurn();
        
        // Gérer le démarrage de la partie
        if (data.started && !document.body.classList.contains('in-game')) {
            document.body.classList.add('in-game');
            startTurnIfNeeded();
        }
    });
    
    // Écouter les changements de joueurs
    onValue(playersRef, async (snap) => {
        const players = snap.val();
        if (!players) return;
        const hasTwoPlayers = Boolean(players.host && players.guest);
        if (!hasTwoPlayers) {
            setStatus("En attente d'un deuxième joueur...");
            return;
        }
        if (document.body.classList.contains('in-game')) return;
        if (myOnlineRole === 'host' && !isStartingOnlineGame) {
            const startedSnap = await get(child(ref(db), `rooms/${id}/state/started`));
            if (startedSnap.val() === true) return;
            isStartingOnlineGame = true;
            startPreGameCountdown(async () => {
                startBackgroundMusic();
                document.body.classList.add('in-game');
                await update(ref(db, `rooms/${id}/state`), { started: true });
                setInputsLocked(true);
                startTurnIfNeeded();
                isStartingOnlineGame = false;
            });
        } else {
            setStatus('Partie prête, en attente du lancement...');
        }
    });
    
    // Écouter les spectateurs
    onValue(spectatorsRef, (snap) => {
        const specData = snap.val();
        spectators = [];
        if (specData) {
            Object.values(specData).forEach(spec => {
                if (spec.name) spectators.push(spec.name);
            });
        }
        
        // Mettre à jour l'affichage des spectateurs
        if (spectatorListEl) {
            spectatorListEl.innerHTML = '';
            spectators.forEach(name => {
                const li = document.createElement('li');
                li.textContent = name;
                li.className = 'spectator-name';
                spectatorListEl.appendChild(li);
            });
            if (spectators.length === 0) {
                spectatorListEl.innerHTML = '<li class="muted">aucun spectateur</li>';
            }
        }
    });

}

window.addEventListener('beforeunload', async () => {
    if (mode === 'online' && roomId && myOnlineRole === 'spectator') {
        await remove(ref(db, `rooms/${roomId}/spectators/${viewerId}`));
    }
});
