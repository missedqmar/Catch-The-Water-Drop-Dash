// Extracted from index.html
// ---- Game State ----
const state = {
    running: false,
    score: 0,
    combo: 0,
    bestCombo: 0,
    progress: 0, // 0..100
    timer: 60,
    spawnInterval: 900,
    hazardChance: 0.25,
    items: new Set(),
    rafId: null,
    spawnId: null,
    tickId: null,
    muted: false
};
const $ = sel => document.querySelector(sel);
const gameArea = $('#game-area');
const overlay = $('#overlay');
const milestone = $('#milestone');
const confettiLayer = $('#confetti-layer');
const scoreEl = $('#score');
const comboEl = $('#combo');
const bestComboEl = $('#bestCombo');
const timerEl = $('#timer');
const progressBar = $('#progressBar');
const progressPct = $('#progressPct');
const startBtn = $('#startBtn');
const bigStart = $('#bigStart');
const pauseBtn = $('#pauseBtn');
const resetBtn = $('#resetBtn');
const muteBtn = $('#muteBtn');
const playerEl = document.getElementById('player');
const player = { x: 0, y: 0, w: 78, h: 28, speed: 380 };
const keys = { left: false, right: false };
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
window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { keys.left = true; e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') { keys.right = true; e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keys.left = false;
    if (e.code === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});
window.addEventListener('resize', layoutPlayer);
try { state.bestCombo = parseInt(localStorage.getItem('sfw_best_combo') || '0', 10) || 0; } catch { }
bestComboEl.textContent = state.bestCombo;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep(freq = 600, duration = 0.08, type = 'square') {
    if (state.muted) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = 0.06;
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    setTimeout(() => { o.stop(); }, duration * 1000);
}
function setOverlay(show, innerHTML) {
    overlay.style.display = show ? 'block' : 'none';
    if (innerHTML !== undefined) {
        const cardBody = overlay.querySelector('.card-body');
        if (cardBody) cardBody.innerHTML = innerHTML;
    }
}
function updateHUD() {
    scoreEl.textContent = state.score;
    comboEl.textContent = 'x' + state.combo;
    timerEl.textContent = state.timer;
    progressBar.style.width = state.progress + '%';
    progressPct.textContent = Math.round(state.progress) + '%';
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function showMilestone(text) {
    milestone.textContent = text;
    milestone.style.display = 'inline-block';
    setTimeout(() => milestone.style.display = 'none', 2000);
}
const FACTS = [
    'Access to clean water can improve school attendance.',
    'Clean water reduces time spent collecting water—more time for opportunities.',
    'Safe water helps reduce waterborne illnesses.',
    'Communities thrive when clean water is close to home.'
];
function checkMilestones() {
    const p = state.progress;
    if (p >= 100) { celebrateWin(); return; }
    if (p >= 75 && !checkMilestones.m75) { checkMilestones.m75 = true; showMilestone(FACTS[3]); }
    else if (p >= 50 && !checkMilestones.m50) { checkMilestones.m50 = true; showMilestone(FACTS[2]); }
    else if (p >= 25 && !checkMilestones.m25) { checkMilestones.m25 = true; showMilestone(FACTS[1]); }
}
function confettiBurst() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = [getComputedStyle(document.documentElement).getPropertyValue('--cw-yellow').trim(), '#ffffff', '#e0e0e0'];
    const count = 140;
    const rect = confettiLayer.getBoundingClientRect();
    for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        const size = 6 + Math.random() * 6;
        piece.style.position = 'absolute';
        piece.style.width = size + 'px';
        piece.style.height = (size * 0.6) + 'px';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.left = Math.random() * rect.width + 'px';
        piece.style.top = '-10px';
        piece.style.opacity = '0.95';
        piece.style.transform = `rotate(${Math.random() * 360}deg)`;
        confettiLayer.appendChild(piece);
        const fall = () => {
            const start = performance.now();
            const duration = 1800 + Math.random() * 800;
            const drift = (Math.random() - 0.5) * 120;
            const startX = parseFloat(piece.style.left);
            function step(now) {
                const t = Math.min(1, (now - start) / duration);
                piece.style.top = (t * (rect.height + 40) - 10) + 'px';
                piece.style.left = (startX + t * drift) + 'px';
                piece.style.opacity = (1 - t).toString();
                if (t < 1) requestAnimationFrame(step); else piece.remove();
            }
            requestAnimationFrame(step);
        };
        fall();
    }
}
function celebrateWin() {
    state.running = false;
    stopLoops();
    beep(880, 0.12, 'triangle');
    setTimeout(() => beep(1046, 0.12, 'triangle'), 120);
    setTimeout(() => beep(1318, 0.12, 'triangle'), 240);
    confettiBurst();
    setOverlay(true, `
<h3 class="fw-bold">You filled a well! 🎉</h3>
<p class="text-muted">Great job. Final score: <strong>${state.score}</strong></p>
<div class="d-flex gap-2 justify-content-center">
  <button class="btn btn-cw" id="playAgain">Play Again</button>
  <a class="btn btn-outline-dark" href="https://www.charitywater.org/" target="_blank" rel="noopener">Learn more</a>
</div>
`);
    $('#playAgain').onclick = () => resetGame(true);
}
function spawnItem() {
    const isHazard = Math.random() < state.hazardChance;
    const el = document.createElement('div');
    el.className = isHazard ? 'hazard' : 'can';
    const gw = gameArea.clientWidth;
    const w = isHazard ? 46 : 56;
    const x = Math.max(8, Math.random() * (gw - (w + 8)));
    el.style.left = x + 'px';
    el.style.top = '-64px';
    const speed = 120 + Math.random() * 80 + (100 - state.timer) * 0.8;
    const obj = { el, x, y: -64, w, h: w, speed, isHazard };
    el.addEventListener('click', (e) => {
        if (!state.running) return;
        if (!obj.isHazard) {
            state.score += 1;
            state.combo += 1;
            state.bestCombo = Math.max(state.bestCombo, state.combo);
            try { localStorage.setItem('sfw_best_combo', String(state.bestCombo)); } catch { }
            state.progress = clamp(state.progress + 5, 0, 100);
            feedbackLabel(e.clientX, e.clientY, '+1');
            beep(760, 0.06);
            el.remove();
            state.items.delete(obj);
            updateHUD();
            checkMilestones();
        } else {
            state.score = Math.max(0, state.score - 1);
            state.combo = 0;
            feedbackLabel(e.clientX, e.clientY, '–1', true);
            gameArea.classList.remove('shake'); void gameArea.offsetWidth; gameArea.classList.add('shake');
            beep(280, 0.08, 'sawtooth');
            updateHUD();
        }
    });
    gameArea.appendChild(el);
    state.items.add(obj);
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
function frame(now) {
    const dt = frame.last ? (now - frame.last) / 1000 : 0;
    frame.last = now;
    let dx = 0;
    if (keys.left) dx -= player.speed * dt;
    if (keys.right) dx += player.speed * dt;
    if (dx) { player.x = clamp(player.x + dx, 0, gameArea.clientWidth - player.w); updatePlayerEl(); }
    for (const obj of [...state.items]) {
        obj.y += obj.speed * dt;
        obj.el.style.top = obj.y + 'px';
        if (intersects(obj)) {
            const rect = gameArea.getBoundingClientRect();
            if (!obj.isHazard) {
                state.score += 1;
                state.combo += 1;
                state.bestCombo = Math.max(state.bestCombo, state.combo);
                try { localStorage.setItem('sfw_best_combo', String(state.bestCombo)); } catch { }
                state.progress = clamp(state.progress + 5, 0, 100);
                feedbackLabel(rect.left + obj.x + obj.w / 2, rect.top + player.y, '+1');
                beep(760, 0.06);
                updateHUD();
                checkMilestones();
            } else {
                state.score = Math.max(0, state.score - 1);
                state.combo = 0;
                feedbackLabel(rect.left + obj.x + obj.w / 2, rect.top + player.y, '–1', true);
                gameArea.classList.remove('shake'); void gameArea.offsetWidth; gameArea.classList.add('shake');
                beep(280, 0.08, 'sawtooth');
                updateHUD();
            }
            obj.el.remove();
            state.items.delete(obj);
            continue;
        }
        if (obj.y > gameArea.clientHeight + 80) {
            obj.el.remove();
            state.items.delete(obj);
        }
    }
    if (state.running) state.rafId = requestAnimationFrame(frame);
}
function startLoops() {
    stopLoops();
    state.rafId = requestAnimationFrame(frame);
    state.spawnId = setInterval(() => {
        if (!state.running) return;
        spawnItem();
    }, state.spawnInterval);
    state.tickId = setInterval(() => {
        if (!state.running) return;
        state.timer -= 1;
        if (state.timer % 15 === 0 && state.spawnInterval > 450) {
            state.spawnInterval -= 80;
            clearInterval(state.spawnId);
            state.spawnId = setInterval(spawnItem, state.spawnInterval);
        }
        updateHUD();
        if (state.timer <= 0) {
            gameOver();
        }
    }, 1000);
}
function stopLoops() {
    if (state.rafId) cancelAnimationFrame(state.rafId), state.rafId = null;
    if (state.spawnId) clearInterval(state.spawnId), state.spawnId = null;
    if (state.tickId) clearInterval(state.tickId), state.tickId = null;
}
function resetMilestones() {
    checkMilestones.m25 = false;
    checkMilestones.m50 = false;
    checkMilestones.m75 = false;
}
function gameOver() {
    state.running = false;
    stopLoops();
    beep(220, 0.15, 'sawtooth');
    setOverlay(true, `
<h3 class="fw-bold">Time's up!</h3>
<p class="text-muted">You made it to <strong>${Math.round(state.progress)}%</strong> with a score of <strong>${state.score}</strong>.</p>
<div class="d-flex gap-2 justify-content-center">
  <button class="btn btn-cw" id="playAgain">Try Again</button>
  <a class="btn btn-outline-dark" href="https://www.charitywater.org/" target="_blank" rel="noopener">Learn more</a>
</div>
`);
    $('#playAgain').onclick = () => resetGame(true);
}
function resetGame(autoStart = false) {
    stopLoops();
    for (const obj of [...state.items]) { obj.el.remove(); }
    state.items.clear();
    Object.assign(state, {
        running: false,
        score: 0,
        combo: 0,
        progress: 0,
        timer: 60,
        spawnInterval: 900,
        hazardChance: 0.25
    });
    layoutPlayer();
    updateHUD();
    resetMilestones();
    pauseBtn.textContent = 'Pause';
    pauseBtn.disabled = true;
    resetBtn.disabled = true;
    startBtn.disabled = false;
    setOverlay(!autoStart, `
<h3 class="fw-bold">Ready to help fill the well?</h3>
<p class="text-muted mb-3">Catch cans, avoid hazards, and hit milestones to learn impact facts.</p>
<button class="btn btn-cw" id="playAgain">Start Game</button>
`);
    const btn = $('#playAgain');
    if (btn) btn.onclick = () => startGame();
    if (autoStart) startGame();
}
function startGame() {
    if (state.running) return;
    state.running = true;
    setOverlay(false);
    startBtn.disabled = true;
    pauseBtn.disabled = false;
    resetBtn.disabled = false;
    layoutPlayer();
    startLoops();
}
startBtn.onclick = startGame;
bigStart.onclick = startGame;
pauseBtn.onclick = () => {
    if (!state.running && state.timer > 0) {
        state.running = true;
        pauseBtn.textContent = 'Pause';
        startLoops();
    } else {
        state.running = false;
        pauseBtn.textContent = 'Resume';
        stopLoops();
    }
};
resetBtn.onclick = () => resetGame(false);
muteBtn.onclick = () => {
    state.muted = !state.muted;
    muteBtn.classList.toggle('btn-outline-secondary', !state.muted);
    muteBtn.classList.toggle('btn-outline-dark', state.muted);
    muteBtn.textContent = state.muted ? 'Unmute' : 'Mute';
    if (audioCtx.state === 'suspended') audioCtx.resume();
};
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); if (!pauseBtn.disabled) pauseBtn.click(); }
});
updateHUD();
