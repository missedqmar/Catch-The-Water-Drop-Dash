// ---- Game State ----
const state = {
    running: false,
    score: 0,
    combo: 0,
    bestCombo: 0,
    bestPctByMode: { easy: 0, normal: 0, hard: 0 },
    progress: 0, // 0..progressGoal (can exceed for animation ease)
    timer: 60,
    spawnInterval: 900,
    hazardChance: 0.25,
    items: new Set(),
    rafId: null,
    spawnId: null,
    tickId: null,
    muted: false,
    difficulty: 'normal'
};

// ---- Difficulty settings (meaningful rule changes) ----
const DIFFICULTY_SETTINGS = {
    easy: {
        label: 'Easy',
        timer: 90,
        spawnInterval: 1000,
        hazardChance: 0.15,
        progressPerCan: 6,
        progressGoal: 90,          // win earlier on Easy
        speedMultiplier: 0.85,
        missPenalty: 0,            // no progress loss on miss
        hitProgressPenalty: 0,     // hazards don’t reduce progress, just score
        hazardScorePenalty: 1,
        comboBonusProgress: 2
    },
    normal: {
        label: 'Normal',
        timer: 60,
        spawnInterval: 900,
        hazardChance: 0.25,
        progressPerCan: 5,
        progressGoal: 100,         // standard goal
        speedMultiplier: 1.0,
        missPenalty: 1,            // 1% progress loss on miss
        hitProgressPenalty: 1,     // hazards reduce progress 1%
        hazardScorePenalty: 1,
        comboBonusProgress: 2
    },
    hard: {
        label: 'Hard',
        timer: 45,
        spawnInterval: 680,
        hazardChance: 0.55,        // Much more obstacles (55% hazards!)
        progressPerCan: 4,
        progressGoal: 120,         // higher win goal for Hard
        speedMultiplier: 1.3,
        missPenalty: 2,            // steeper punishments
        hitProgressPenalty: 2,
        hazardScorePenalty: 2,
        comboBonusProgress: 3
    }
};

// ---- DOM refs ----
const $ = sel => document.querySelector(sel);
const gameArea = $('#game-area');
const overlay = $('#overlay');
const milestone = $('#milestone');
const badgesEl = $('#badges');
const scoreEl = $('#score');
const comboEl = $('#combo');
const bestComboEl = $('#bestCombo');
const bestPctEl = $('#bestPct');
const timerEl = $('#timer');
const progressBar = $('#progressBar');
const progressPct = $('#progressPct');
const diffRules = $('#diffRules');
const startBtn = $('#startBtn');
const bigStart = $('#bigStart');
const pauseBtn = $('#pauseBtn');
const resetBtn = $('#resetBtn');
const muteBtn = $('#muteBtn');
const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
const playerEl = document.getElementById('player');
const player = { x: 0, y: 0, w: 80, h: 32, speed: 380 };
const keys = { left: false, right: false };

// ---- Layout & input ----
function layoutPlayer() {
    const rect = gameArea.getBoundingClientRect();
    player.y = rect.height - 14 - player.h;
    if (player.x === 0) player.x = (rect.width - player.w) / 2;
    player.x = clamp(player.x, 0, rect.width - player.w);
    updatePlayerEl();
}
function updatePlayerEl() {
    playerEl.style.top = player.y + 'px';
    playerEl.style.left = player.x + 'px';
}
function intersects(obj) {
    return obj.y + obj.h >= player.y && obj.y <= player.y + player.h &&
        obj.x + obj.w >= player.x && obj.x <= player.x + player.w;
}

let dragging = false;
function moveToPointer(e) {
    const rect = gameArea.getBoundingClientRect();
    const targetX = e.clientX - rect.left - player.w / 2;
    player.x = clamp(targetX, 0, rect.width - player.w);
    updatePlayerEl();
}
gameArea.addEventListener('pointerdown', (e) => { dragging = true; moveToPointer(e); });
window.addEventListener('pointerup', () => dragging = false);
gameArea.addEventListener('pointermove', (e) => { if (dragging) moveToPointer(e); });

function getKeyDirection(e) {
    return {
        isLeft: e.code === 'ArrowLeft' || e.key.toLowerCase() === 'a',
        isRight: e.code === 'ArrowRight' || e.key.toLowerCase() === 'd'
    };
}

window.addEventListener('keydown', (e) => {
    const { isLeft, isRight } = getKeyDirection(e);
    if (isLeft) { keys.left = true; e.preventDefault(); }
    if (isRight) { keys.right = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
    const { isLeft, isRight } = getKeyDirection(e);
    if (isLeft) keys.left = false;
    if (isRight) keys.right = false;
});
window.addEventListener('resize', layoutPlayer);

// ---- Persistence ----
function saveToLocal(key, value) {
    try { localStorage.setItem(key, String(value)); } catch { }
}

function loadFromLocal(key, fallback = '0') {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

state.bestCombo = parseInt(loadFromLocal('sfw_best_combo'), 10) || 0;
['easy', 'normal', 'hard'].forEach(d => {
    state.bestPctByMode[d] = parseInt(loadFromLocal(`sfw_best_pct_${d}`), 10) || 0;
});

bestComboEl.textContent = state.bestCombo;

// ---- Audio (SFX files) ----
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

const sfx = (() => {
    const files = {
        catch: 'sfx/catch.mp3',
        hit: 'sfx/hit.mp3',
        click: 'sfx/click.mp3',
        win: 'sfx/win.mp3',
        fail: 'sfx/fail.mp3',
    };
    const bank = {};
    for (const [k, src] of Object.entries(files)) {
        const a = new Audio(src);
        a.preload = 'auto';
        a.volume = 0.5;
        bank[k] = a;
    }

    function play(name) {
        if (state.muted) return;
        const a = bank[name];
        if (a && a.readyState >= 2) {
            try { a.currentTime = 0; a.play(); } catch { }
        }
    }
    return { play };
})();

// ---- UI helpers ----
function setOverlay(show, innerHTML) {
    overlay.style.display = show ? 'block' : 'none';
    if (innerHTML !== undefined) {
        const cardBody = overlay.querySelector('.card-body');
        if (cardBody) cardBody.innerHTML = innerHTML;
    }
}

function createOverlayHTML(title, message, buttonHTML) {
    return `
    <h3 class="fw-bold">${title}</h3>
    <p class="text-muted">${message}</p>
    <div class="d-flex gap-2 justify-content-center">
      ${buttonHTML}
    </div>
  `;
}

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// Helper: Get current difficulty settings
const getSettings = () => DIFFICULTY_SETTINGS[state.difficulty];

// Helper: Adjust progress with automatic clamping
function adjustProgress(delta) {
    const settings = getSettings();
    state.progress = clamp(state.progress + delta, 0, settings.progressGoal);
}

// Helper: Remove item from game
function removeItem(obj) {
    obj.el.remove();
    state.items.delete(obj);
}

// Helper: Update best combo if current combo is higher
function updateBestCombo() {
    if (state.combo > state.bestCombo) {
        state.bestCombo = state.combo;
        saveToLocal('sfw_best_combo', state.bestCombo);
    }
}

// Helper: Get feedback label position for an object
function getFeedbackPosition(obj) {
    const rect = gameArea.getBoundingClientRect();
    return {
        x: rect.left + obj.x + obj.w / 2,
        y: rect.top + player.y
    };
}

function updateHUD() {
    scoreEl.textContent = state.score;
    comboEl.textContent = 'x' + state.combo;
    timerEl.textContent = state.timer;
    progressBar.style.width = state.progress + '%';
    progressPct.textContent = Math.round(state.progress) + '%';
    bestPctEl.textContent = `${state.bestPctByMode[state.difficulty]}%`;
}
function showMilestone(text) {
    milestone.textContent = text;
    milestone.style.display = 'inline-block';
    setTimeout(() => milestone.style.display = 'none', 2000);
}
function addBadge(text) {
    const chip = document.createElement('span');
    chip.className = 'badge rounded-pill text-bg-warning text-dark fw-semibold';
    chip.textContent = text;
    badgesEl.appendChild(chip);
}

// ---- Milestones ----
const FACTS = [
    'Access to clean water can improve school attendance.',
    'Clean water reduces time spent collecting water—more time for opportunities.',
    'Safe water helps reduce waterborne illnesses.',
    'Communities thrive when clean water is close to home.'
];

const MILESTONE_THRESHOLDS = [
    { pct: 25, fact: FACTS[1], badge: '25%' },
    { pct: 50, fact: FACTS[2], badge: '50%' },
    { pct: 75, fact: FACTS[3], badge: '75%' }
];

function resetMilestones() {
    MILESTONE_THRESHOLDS.forEach((_, i) => checkMilestones[`m${i}`] = false);
    badgesEl.innerHTML = '';
}

function checkMilestones() {
    const p = state.progress;
    const settings = getSettings();

    if (p >= settings.progressGoal) { endGame(true); return; }

    MILESTONE_THRESHOLDS.forEach((m, i) => {
        const key = `m${i}`;
        if (p >= m.pct && !checkMilestones[key]) {
            checkMilestones[key] = true;
            showMilestone(m.fact);
            addBadge(m.badge);
        }
    });
}

// ---- Win/Lose ----
function saveBestPercent() {
    const settings = getSettings();
    const pct = Math.min(Math.round(state.progress), settings.progressGoal);
    if (pct > state.bestPctByMode[state.difficulty]) {
        state.bestPctByMode[state.difficulty] = pct;
        saveToLocal(`sfw_best_pct_${state.difficulty}`, pct);
    }
}

function endGame(won) {
    state.running = false;
    stopLoops();
    saveBestPercent();

    const settings = getSettings();
    const diffLabel = settings.label;

    if (won) {
        sfx.play('win');
        setOverlay(true, createOverlayHTML(
            'You filled a well! 🎉',
            `Great job on <strong>${diffLabel}</strong> mode! Final score: <strong>${state.score}</strong>`,
            `<button class="btn btn-cw" id="playAgain">Play Again</button>
          <a class="btn btn-outline-dark" href="https://www.charitywater.org/donate" target="_blank" rel="noopener">Donate</a>`
        ));
    } else {
        sfx.play('hit');
        setOverlay(true, createOverlayHTML(
            'Time\'s up!',
            `You made it to <strong>${Math.round(state.progress)}%</strong> with a score of <strong>${state.score}</strong> on <strong>${diffLabel}</strong> mode.`,
            `<button class="btn btn-cw" id="playAgain">Try Again</button>
          <a class="btn btn-outline-dark" href="https://www.charitywater.org/" target="_blank" rel="noopener">Learn more</a>`
        ));
    }

    $('#playAgain').onclick = () => { sfx.play('click'); resetGame(true); };
    updateHUD();
}

// ---- Spawning ----
function handleItemInteraction(obj) {
    const pos = getFeedbackPosition(obj);
    if (!obj.isHazard) {
        onCollect(pos.x, pos.y);
        obj.el.classList.add('collected');
        setTimeout(() => removeItem(obj), 300);
    } else {
        onHazard(pos.x, pos.y);
    }
}

function spawnItem() {
    const settings = getSettings();
    const isHazard = Math.random() < settings.hazardChance;

    const el = document.createElement('div');
    el.className = isHazard ? 'hazard' : 'can';

    const gw = gameArea.clientWidth;
    const w = isHazard ? 46 : 56;
    const x = Math.max(8, Math.random() * (gw - (w + 8)));
    el.style.left = x + 'px';
    el.style.top = '-64px';

    const baseSpeed = 120 + Math.random() * 80 + (100 - state.timer) * 0.8;
    const speed = baseSpeed * settings.speedMultiplier;
    const obj = { el, x, y: -64, w, h: w, speed, isHazard };

    // Click-to-collect / hit
    el.addEventListener('click', (e) => {
        if (!state.running) return;
        handleItemInteraction(obj);
    });

    gameArea.appendChild(el);
    state.items.add(obj);
}

function onCollect(labelX, labelY) {
    const settings = getSettings();
    state.score += 1;
    state.combo += 1;
    updateBestCombo();

    // Base progress
    adjustProgress(settings.progressPerCan);

    // Combo bonus every 5
    if (state.combo > 0 && state.combo % 5 === 0) {
        adjustProgress(settings.comboBonusProgress);
        feedbackLabel(labelX, labelY, `+${settings.comboBonusProgress}% Combo!`);
    } else {
        feedbackLabel(labelX, labelY, '+1');
    }

    sfx.play('catch');
    updateHUD();
    checkMilestones();
}

function onHazard(labelX, labelY) {
    const settings = getSettings();

    state.score = Math.max(0, state.score - settings.hazardScorePenalty);
    state.combo = 0;

    if (settings.hitProgressPenalty > 0) {
        adjustProgress(-settings.hitProgressPenalty);
        feedbackLabel(labelX, labelY, `–${settings.hazardScorePenalty} & –${settings.hitProgressPenalty}%`, true);
    } else {
        feedbackLabel(labelX, labelY, `–${settings.hazardScorePenalty}`, true);
    }

    gameArea.classList.remove('shake'); void gameArea.offsetWidth; gameArea.classList.add('shake');
    sfx.play('hit');
    updateHUD();
}

function feedbackLabel(clientX, clientY, text, negative = false) {
    const rect = gameArea.getBoundingClientRect();
    const label = document.createElement('div');
    label.className = 'float-label';
    label.textContent = text;
    label.style.left = (clientX - rect.left - 8) + 'px';
    label.style.top = (clientY - rect.top - 12) + 'px';
    label.style.color = negative ? '#dc3545' : '#198754';
    gameArea.appendChild(label);
    setTimeout(() => label.remove(), 720);
}

// ---- Main loop ----
function frame(now) {
    const dt = frame.last ? (now - frame.last) / 1000 : 0;
    frame.last = now;

    const settings = getSettings();

    // Player movement
    let dx = 0;
    if (keys.left) dx -= player.speed * dt;
    if (keys.right) dx += player.speed * dt;
    if (dx) { player.x = clamp(player.x + dx, 0, gameArea.clientWidth - player.w); updatePlayerEl(); }

    // Items
    for (const obj of [...state.items]) {
        obj.y += obj.speed * dt;
        obj.el.style.top = obj.y + 'px';

        // Collision
        if (intersects(obj)) {
            handleItemInteraction(obj);
            removeItem(obj);
            continue;
        }

        // Off-screen removal (+ miss logic)
        if (obj.y > gameArea.clientHeight + 80) {
            if (!obj.isHazard) {
                state.combo = 0;
                const pos = getFeedbackPosition(obj);
                feedbackLabel(pos.x, pos.y + 50, 'miss', true);
                if (settings.missPenalty > 0) {
                    adjustProgress(-settings.missPenalty);
                }
                sfx.play('fail');
                updateHUD();
            }
            removeItem(obj);
        }
    }

    if (state.running) state.rafId = requestAnimationFrame(frame);
}

// ---- Loops ----
function startLoops() {
    stopLoops();
    state.rafId = requestAnimationFrame(frame);
    state.spawnId = setInterval(spawnItem, state.spawnInterval);
    state.tickId = setInterval(() => {
        state.timer -= 1;

        // Speed up spawns every 15s (floor to 450ms)
        if (state.timer % 15 === 0 && state.spawnInterval > 450) {
            state.spawnInterval -= 80;
            clearInterval(state.spawnId);
            state.spawnId = setInterval(spawnItem, state.spawnInterval);
        }

        updateHUD();
        if (state.timer <= 0) endGame(false);
    }, 1000);
}

function stopLoops() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    if (state.spawnId) clearInterval(state.spawnId);
    if (state.tickId) clearInterval(state.tickId);
    state.rafId = state.spawnId = state.tickId = null;
}

// ---- Game lifecycle ----
function explainDifficulty() {
    const s = getSettings();
    diffRules.innerHTML =
        `<span class="text-muted">
      Goal: <strong>${s.progressGoal}%</strong> • Time: <strong>${s.timer}s</strong> • Progress/Can: <strong>${s.progressPerCan}%</strong> •
      Miss: <strong>-${s.missPenalty}%</strong> • Hazard: <strong>-${s.hazardScorePenalty} pt${s.hazardScorePenalty > 1 ? 's' : ''}${s.hitProgressPenalty > 0 ? ` & -${s.hitProgressPenalty}%` : ''}</strong> •
      Combo bonus every <strong>5</strong> cans: <strong>+${s.comboBonusProgress}%</strong>
     </span>`;
}

function resetGame(autoStart = false) {
    stopLoops();
    state.items.forEach(obj => obj.el.remove());
    state.items.clear();

    // Read selected difficulty
    const selectedDiff = document.querySelector('input[name="difficulty"]:checked');
    state.difficulty = selectedDiff?.value || 'normal';
    const settings = getSettings();

    Object.assign(state, {
        running: false,
        score: 0,
        combo: 0,
        progress: 0,
        timer: settings.timer,
        spawnInterval: settings.spawnInterval,
        hazardChance: settings.hazardChance
    });

    updateHUD();
    resetMilestones();
    explainDifficulty();

    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = resetBtn.disabled = true;
    startBtn.disabled = false;

    const diffLabel = settings.label;
    setOverlay(!autoStart, createOverlayHTML(
        'Ready to help fill the well?',
        `Difficulty: <strong>${diffLabel}</strong> — Goal <strong>${settings.progressGoal}%</strong>, ${settings.timer}s, ${settings.progressPerCan}% per can<br>Catch cans, avoid hazards, and hit milestones to learn impact facts.`,
        `<button class="btn btn-cw" id="playAgain">Start Game</button>`
    ));
    $('#playAgain')?.addEventListener('click', () => { sfx.play('click'); startGame(); });
    if (autoStart) startGame();

    bestPctEl.textContent = `${state.bestPctByMode[state.difficulty]}%`;
}

function startGame() {
    if (state.running) return;
    state.running = true;
    setOverlay(false);
    startBtn.disabled = true;
    pauseBtn.disabled = resetBtn.disabled = false;
    layoutPlayer();
    startLoops();
}

// ---- Controls / buttons ----
startBtn.onclick = () => { sfx.play('click'); startGame(); };
bigStart.onclick = () => { sfx.play('click'); startGame(); };
pauseBtn.onclick = () => {
    sfx.play('click');
    const shouldResume = !state.running && state.timer > 0;
    state.running = shouldResume;
    pauseBtn.textContent = shouldResume ? 'Pause' : 'Resume';
    shouldResume ? startLoops() : stopLoops();
};
resetBtn.onclick = () => { sfx.play('click'); resetGame(false); };
muteBtn.onclick = () => {
    sfx.play('click');
    state.muted = !state.muted;
    const isMuted = state.muted;
    muteBtn.classList.toggle('btn-outline-secondary', !isMuted);
    muteBtn.classList.toggle('btn-outline-dark', isMuted);
    muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
    saveToLocal('sfw_muted', isMuted ? '1' : '0');
    if (audioCtx.state === 'suspended') audioCtx.resume();
};

// Difficulty change listener - reset game when difficulty changes (only between games)
difficultyRadios.forEach(radio => {
    radio.addEventListener('change', () => {
        if (!state.running && state.timer > 0) resetGame(false);
    });
});

// Restore mute preference
if (loadFromLocal('sfw_muted') === '1') {
    state.muted = true;
    muteBtn.classList.replace('btn-outline-secondary', 'btn-outline-dark');
    muteBtn.textContent = 'Unmute';
}

// Init
layoutPlayer();
explainDifficulty();
updateHUD();
