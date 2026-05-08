'use strict';

window.initColorUp = function(canvas, onScore) {

    onScore = onScore || function(){};

    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    (function setupCanvas() {
        const p = canvas.parentElement;
        const w = (p && p.clientWidth  > 10) ? p.clientWidth  : window.innerWidth;
        const h = (p && p.clientHeight > 10) ? p.clientHeight : window.innerHeight;
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';
    })();

    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    let W = canvas.width  / dpr;
    let H = canvas.height / dpr;

    let destroyed = false;
    let paused    = false;
    let raf       = null;
    let lastTS    = 0;

    const COLORS = [
        { id: 0, fill: '#22CC44', stroke: '#0E9930', name: 'GREEN'  },
        { id: 1, fill: '#FFD700', stroke: '#CC9900', name: 'YELLOW' },
        { id: 2, fill: '#EE2233', stroke: '#AA1122', name: 'RED'    },
        { id: 3, fill: '#00BBEE', stroke: '#0088AA', name: 'BLUE'   },
    ];

    const STATE = { READY: 0, PLAYING: 1, DEAD: 2 };
    let gameState = STATE.READY;

    let score    = 0;
    let best     = parseInt(localStorage.getItem('colorup_v13_best') || '0');
    let combo    = 0;
    let maxCombo = 0;

    const BALL_R = Math.max(14, Math.round(Math.min(W, H) * 0.038));

    const ball = {
        x: 0, screenY: 0, targetX: 0,
        colorIdx: -1,
        bouncing: false,
        bounceT: 0, bounceDur: 0,
        startY: 0, endY: 0,
        trail: [], pulseT: 0,
        squash: 1, stretch: 1, rotation: 0,
    };

    const QUADS_PER_FULL = 3;
    let plates         = [];
    let targetPlateIdx = -1;
    let seqCount       = 0;
    let nextBallColor  = -1;
    let plateIdCounter = 0;

    let PLATE_H       = 0;
    let PLATE_GAP     = 0;
    let PLATE_W       = 0;
    let PLATE_SPACING = 0;
    let BALL_LAND_Y   = 0;
    let ARC_HEIGHT    = 0;

    // ── SPEED: fixed starting speed, same as mid-game ──
    let SCROLL_PX_PER_SEC = 0;
    // Start at 1.4x so it feels active from frame 1
    let speedMult = 1.4;

    let particles  = [];
    let floatTexts = [];
    let rings      = [];
    let flashA = 0, flashCol = '#fff';
    let shakeX = 0, shakeY = 0, shakeT = 0;
    let bgT = 0, deadTimer = 0;

    const stars = mkStars(70);
    let dragging = false;
    let _ev      = {};

    // ── Audio ──
    let audioCtx = null;
    function getAudio() {
        if (!audioCtx) try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }
    function tone(freq, type, dur, vol, f0) {
        const ac = getAudio(); if (!ac) return;
        try {
            const o = ac.createOscillator(), g = ac.createGain();
            o.connect(g); g.connect(ac.destination);
            o.type = type || 'sine';
            const t = ac.currentTime;
            o.frequency.setValueAtTime(f0 || freq, t);
            if (f0) o.frequency.exponentialRampToValueAtTime(freq, t + 0.05);
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(vol || 0.14, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.001, t + dur);
            o.start(t); o.stop(t + dur + 0.01);
        } catch(e) {}
    }
    const SFX = {
        bounce()  { tone(460, 'sine', 0.14, 0.16, 300); },
        correct() { tone(780, 'sine', 0.14, 0.17, 580); setTimeout(()=>tone(980,'sine',0.12,0.12,740),80); },
        color()   { tone(580, 'sine', 0.18, 0.18, 380); setTimeout(()=>tone(730,'sine',0.15,0.13,530),85); },
        wrong()   { tone(210, 'sawtooth', 0.28, 0.2, 290); setTimeout(()=>tone(150,'sawtooth',0.30,0.17,210),170); },
        combo()   { tone(860,'sine',0.1,0.14); setTimeout(()=>tone(1080,'sine',0.1,0.12),65); setTimeout(()=>tone(1300,'sine',0.13,0.13),130); },
    };

    initLayout();
    bindInput();
    raf = requestAnimationFrame(loop);

    const titleEl = document.getElementById('current-game-title');
    if (titleEl) titleEl.textContent = 'Color Up';

    // ══════════════════════════════════════════════
    //  LAYOUT
    // ══════════════════════════════════════════════
    function initLayout() {
        W = canvas.width  / dpr;
        H = canvas.height / dpr;

        PLATE_GAP     = Math.max(5, Math.round(W * 0.015));
        PLATE_H       = Math.round(Math.max(40, H * 0.068));
        PLATE_W       = Math.round((W - 5 * PLATE_GAP) / 4);
        PLATE_SPACING = Math.round(H * 0.30);
        BALL_LAND_Y   = H * 0.80;
        ARC_HEIGHT    = PLATE_SPACING * 0.68;

        // Base speed: one spacing in ~2.0s (snappy from start)
        SCROLL_PX_PER_SEC = PLATE_SPACING / 2.0;

        ball.x        = W / 2;
        ball.screenY  = BALL_LAND_Y;
        ball.startY   = BALL_LAND_Y;
        ball.endY     = BALL_LAND_Y;
        ball.targetX  = W / 2;
        ball.squash   = 1;
        ball.stretch  = 1;
        ball.rotation = 0;
    }

    function mkStars(n) {
        return Array.from({ length: n }, () => ({
            x: Math.random(), y: Math.random(),
            r:  Math.random() * 1.8 + 0.4,
            ph: Math.random() * Math.PI * 2,
            sp: Math.random() * 0.007 + 0.002,
        }));
    }

    // ══════════════════════════════════════════════
    //  INPUT
    // ══════════════════════════════════════════════
    function bindInput() {
        const onTD = e => { e.preventDefault(); pDown(e.touches[0].clientX); };
        const onTM = e => { e.preventDefault(); pMove(e.touches[0].clientX); };
        const onTE = e => { e.preventDefault(); pUp(); };
        const onMD = e => pDown(e.clientX);
        const onMM = e => { if (dragging) pMove(e.clientX); };
        const onMU = () => pUp();

        canvas.addEventListener('touchstart', onTD, { passive: false });
        canvas.addEventListener('touchmove',  onTM, { passive: false });
        canvas.addEventListener('touchend',   onTE, { passive: false });
        canvas.addEventListener('mousedown',  onMD);
        window.addEventListener('mousemove',  onMM);
        window.addEventListener('mouseup',    onMU);

        _ev = { onTD, onTM, onTE, onMD, onMM, onMU };
    }

    function pDown(cx) {
        getAudio();
        if (gameState === STATE.READY) { startGame(); return; }
        if (gameState === STATE.DEAD && deadTimer > 800) { startGame(); return; }
        if (gameState === STATE.PLAYING) { dragging = true; pMove(cx); }
    }
    function pMove(cx) {
        if (!dragging || gameState !== STATE.PLAYING) return;
        const rect  = canvas.getBoundingClientRect();
        const gx    = (cx - rect.left) * (W / rect.width);
        ball.targetX = Math.max(BALL_R, Math.min(W - BALL_R, gx));
    }
    function pUp() { dragging = false; }

    // ══════════════════════════════════════════════
    //  START GAME
    // ══════════════════════════════════════════════
    function startGame() {
        score = 0; combo = 0; maxCombo = 0;
        // ── KEY FIX: start at 1.4x, same as after a few points ──
        speedMult = 1.4;
        seqCount = 0; plates = []; targetPlateIdx = -1; plateIdCounter = 0;
        particles = []; floatTexts = []; rings = [];
        flashA = 0; shakeT = 0; deadTimer = 0;
        dragging = false; nextBallColor = -1;

        ball.colorIdx  = -1;
        ball.x         = W / 2;
        ball.targetX   = W / 2;
        ball.screenY   = BALL_LAND_Y;
        ball.startY    = BALL_LAND_Y;
        ball.endY      = BALL_LAND_Y;
        ball.bouncing  = false;
        ball.bounceT   = 0;
        ball.trail     = [];
        ball.pulseT    = 0;
        ball.squash    = 1;
        ball.stretch   = 1;
        ball.rotation  = 0;

        gameState = STATE.PLAYING;
        onScore(0);

        buildPlates();

        setTimeout(() => { if (gameState === STATE.PLAYING) launchToNext(); }, 200);
    }

    // ══════════════════════════════════════════════
    //  PLATES
    // ══════════════════════════════════════════════
    function buildPlates() {
        let logY = BALL_LAND_Y - PLATE_SPACING;

        const fc = Math.floor(Math.random() * COLORS.length);
        plates.push({
            id: plateIdCounter++,
            type: 'full', colorIdx: fc,
            y: logY, passed: false, flashT: 0, correct: false, vis: 0
        });
        seqCount = 1;
        nextBallColor = fc;

        for (let i = 1; i < 12; i++) {
            logY -= PLATE_SPACING;
            spawnPlate(logY);
        }
    }

    function spawnPlate(y) {
        const pos = seqCount % (QUADS_PER_FULL + 1);
        if (pos === 0) {
            const ci = Math.floor(Math.random() * COLORS.length);
            plates.push({
                id: plateIdCounter++,
                type: 'full', colorIdx: ci,
                y, passed: false, flashT: 0, correct: false, vis: 0
            });
            nextBallColor = ci;
        } else {
            spawnQuad(y, nextBallColor);
        }
        seqCount++;
    }

    function spawnQuad(y, bc) {
        const si  = Math.floor(Math.random() * 4);
        const col = Array.from({ length: 4 }, () => Math.floor(Math.random() * COLORS.length));
        col[si] = bc;
        for (let i = 0; i < 4; i++) {
            if (i === si) continue;
            let attempts = 0;
            while (col[i] === bc && attempts++ < 10) {
                col[i] = Math.floor(Math.random() * COLORS.length);
            }
        }
        plates.push({
            id: plateIdCounter++,
            type: 'quad', colors: col, safeIdx: si,
            y, passed: false, hitIdx: -1, flashT: 0, correct: false, vis: 0
        });
    }

    function refillAbove() {
        let minY = Infinity;
        for (const p of plates) if (p.y < minY) minY = p.y;
        while (minY > -PLATE_SPACING * 3) {
            minY -= PLATE_SPACING;
            spawnPlate(minY);
        }
    }

    // ══════════════════════════════════════════════
    //  LAUNCH
    // ══════════════════════════════════════════════
    function launchToNext() {
        if (gameState !== STATE.PLAYING) return;

        let bestPlate = null;
        let bestDist  = Infinity;

        for (const p of plates) {
            if (p.passed) continue;
            if (p.y >= BALL_LAND_Y) continue;
            const dist = BALL_LAND_Y - p.y;
            if (dist < bestDist) {
                bestDist  = dist;
                bestPlate = p;
            }
        }

        if (!bestPlate) {
            setTimeout(() => { if (gameState === STATE.PLAYING) launchToNext(); }, 40);
            return;
        }

        targetPlateIdx = bestPlate.id;

        const currentDist = BALL_LAND_Y - bestPlate.y;
        const spd         = SCROLL_PX_PER_SEC * speedMult;
        const durSec      = currentDist / spd;
        const durMs       = durSec * 1000;

        ball.bouncing  = true;
        ball.bounceT   = 0;
        ball.bounceDur = Math.max(260, Math.min(1600, durMs));
        ball.startY    = BALL_LAND_Y;
        ball.endY      = BALL_LAND_Y;

        SFX.bounce();
    }

    function getPlateById(id) {
        for (const p of plates) if (p.id === id) return p;
        return null;
    }

    // ══════════════════════════════════════════════
    //  UPDATE
    // ══════════════════════════════════════════════
    function update(dt) {
        const S = dt / 1000;

        bgT         += dt * 0.0010;
        ball.pulseT += dt * 0.0025;
        stars.forEach(s => { s.ph += s.sp * (dt / 16.67); });
        updateFX(dt / 16.67, dt);

        if (gameState === STATE.DEAD)    { deadTimer += dt; return; }
        if (gameState !== STATE.PLAYING) return;

        // ── SPEED RAMP ──
        // Start at 1.4x, ramp smoothly upward with score
        // So from very first bounce it feels fast and fun
        if (score < 10) {
            // 1.4 → 1.6 over first 10 points
            speedMult = 1.4 + score * 0.020;
        } else if (score < 30) {
            // 1.6 → 2.0 over next 20 points
            speedMult = 1.6 + (score - 10) * 0.020;
        } else {
            // 2.0 → max 2.6 beyond 30 points
            speedMult = Math.min(2.6, 2.0 + (score - 30) * 0.010);
        }

        // Scroll plates down
        const scrollThisFrame = SCROLL_PX_PER_SEC * speedMult * S;
        for (const p of plates) {
            p.y += scrollThisFrame;
            if (p.vis < 1) p.vis = Math.min(1, p.vis + 0.08 * (dt / 16.67));
        }

        // Ball X smooth follow
        const Sf = dt / 16.67;
        ball.x += (ball.targetX - ball.x) * 0.16 * Sf;

        // Squash/stretch recovery
        ball.squash  += (1 - ball.squash)  * 0.11 * Sf;
        ball.stretch += (1 - ball.stretch) * 0.11 * Sf;

        // ── BOUNCE ANIMATION ──
        if (ball.bouncing) {
            ball.bounceT += dt / ball.bounceDur;

            if (ball.bounceT >= 1) {
                ball.bounceT  = 1;
                ball.bouncing = false;
                ball.screenY  = BALL_LAND_Y;
                ball.rotation = 0;
                ball.squash   = 1.60;
                ball.stretch  = 0.52;
                onArrived();
            } else {
                const t   = ball.bounceT;
                const arc = Math.sin(t * Math.PI) * ARC_HEIGHT;
                ball.screenY  = BALL_LAND_Y - arc;
                ball.rotation = t * Math.PI * 2.0;

                const phase = Math.cos(t * Math.PI);
                if (phase > 0) {
                    ball.stretch = 1 + phase * 0.40;
                    ball.squash  = 1 / ball.stretch;
                } else {
                    ball.stretch = 1 - Math.abs(phase) * 0.16;
                    ball.squash  = 1 / ball.stretch;
                }
            }

            ball.trail.unshift({ x: ball.x, y: ball.screenY, c: ball.colorIdx, a: 1 });
            if (ball.trail.length > 28) ball.trail.pop();
        } else {
            ball.trail = ball.trail.filter(t => { t.a -= 0.058; return t.a > 0; });
        }

        // Early collision snap
        if (ball.bouncing && targetPlateIdx >= 0) {
            const tp = getPlateById(targetPlateIdx);
            if (tp && !tp.passed && tp.y >= BALL_LAND_Y && ball.bounceT < 0.98) {
                ball.bounceT  = 1;
                ball.bouncing = false;
                ball.screenY  = BALL_LAND_Y;
                ball.rotation = 0;
                ball.squash   = 1.60;
                ball.stretch  = 0.52;
                onArrived();
            }
        }

        // Cleanup plates below screen
        plates = plates.filter(p => p.y < H + PLATE_H * 2);

        // Refill above
        refillAbove();

        // Plate flash decay
        for (const p of plates) {
            if (p.flashT > 0) p.flashT = Math.max(0, p.flashT - 0.048 * Sf);
        }
    }

    // ══════════════════════════════════════════════
    //  COLLISION
    // ══════════════════════════════════════════════
    function onArrived() {
        const plate = getPlateById(targetPlateIdx);
        if (!plate || plate.passed) {
            launchToNext();
            return;
        }

        plate.passed = true;
        plate.flashT = 1;

        if (plate.type === 'full') hitFull(plate);
        else                       hitQuad(plate);
    }

    function hitFull(plate) {
        ball.colorIdx = plate.colorIdx;
        plate.correct = true;
        const col     = COLORS[plate.colorIdx];

        burst(ball.x, ball.screenY, col.fill, 30);
        rings.push({ x: ball.x, y: ball.screenY, r: BALL_R,      maxR: 120, alpha: 0.95, col: col.fill });
        rings.push({ x: ball.x, y: ball.screenY, r: BALL_R + 20, maxR: 160, alpha: 0.40, col: col.fill });
        floatTexts.push({ x: ball.x, y: ball.screenY - 55, text: col.name + '!', col: col.fill, life: 1200, op: 1, big: true });
        flashA = 0.32; flashCol = col.fill;
        SFX.color();
        launchToNext();
    }

    function hitQuad(plate) {
        const colIdx = getColAt(ball.x);
        plate.hitIdx = colIdx;

        if (colIdx < 0 || plate.colors[colIdx] !== ball.colorIdx) {
            die();
            return;
        }

        plate.correct = true;
        combo++;
        if (combo > maxCombo) maxCombo = combo;
        const bonus = combo > 3 ? Math.floor(combo * 0.5) : 0;
        const pts   = 1 + bonus;
        score += pts;
        if (score > best) { best = score; localStorage.setItem('colorup_v13_best', best); }
        onScore(score);

        const col = COLORS[ball.colorIdx].fill;
        burst(ball.x, ball.screenY, col, 24);
        rings.push({ x: ball.x, y: ball.screenY, r: BALL_R, maxR: 88, alpha: 0.92, col });

        const label = combo > 2 ? `×${combo}  +${pts}` : `+${pts}`;
        floatTexts.push({
            x: ball.x, y: ball.screenY - 44, text: label,
            col: combo > 2 ? '#FFD700' : '#00FF88', life: 950, op: 1, big: combo > 4
        });

        if (combo >= 5) { shakeT = 5; flashA = 0.16; flashCol = col; SFX.combo(); }
        else SFX.correct();

        launchToNext();
    }

    function getColAt(bx) {
        for (let i = 0; i < 4; i++) {
            const px = PLATE_GAP + i * (PLATE_W + PLATE_GAP);
            if (bx >= px && bx <= px + PLATE_W) return i;
        }
        return -1;
    }

    function die() {
        gameState = STATE.DEAD; deadTimer = 0;
        ball.bouncing = false; dragging = false;
        ball.squash = 1.9; ball.stretch = 0.35;
        const col = ball.colorIdx >= 0 ? COLORS[ball.colorIdx].fill : '#ffffff';
        burst(ball.x, ball.screenY, col, 38);
        burst(ball.x, ball.screenY, '#FF2244', 28);
        flashA = 0.80; flashCol = '#FF1133'; shakeT = 28; combo = 0;
        SFX.wrong();
        onScore(score, true);
    }

    // ══════════════════════════════════════════════
    //  FX
    // ══════════════════════════════════════════════
    function burst(x, y, col, n) {
        for (let i = 0; i < n && particles.length < 350; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 9.5 + 2.5;
            particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s - 4.5, r: Math.random()*6+1.5, life: 1, col });
        }
    }

    function updateFX(Sf, dt) {
        if (flashA > 0) flashA = Math.max(0, flashA - 0.017 * Sf);
        if (shakeT > 0) {
            shakeT = Math.max(0, shakeT - Sf);
            shakeX = (Math.random()-0.5) * shakeT * 0.90;
            shakeY = (Math.random()-0.5) * shakeT * 0.45;
        } else { shakeX = 0; shakeY = 0; }

        rings      = rings.filter(r  => { r.r += 4.5*Sf; r.alpha -= 0.028*Sf; return r.alpha > 0; });
        particles  = particles.filter(p => {
            p.x += p.vx*Sf; p.y += p.vy*Sf; p.vy += 0.28*Sf; p.vx *= 0.962;
            p.life -= 0.022*Sf; return p.life > 0;
        });
        floatTexts = floatTexts.filter(t => {
            t.y -= 0.88*Sf; t.life -= dt; t.op = Math.min(1, t.life/450); return t.life > 0;
        });
    }

    // ══════════════════════════════════════════════
    //  DRAW
    // ══════════════════════════════════════════════
    function draw() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        ctx.fillStyle = '#090014';
        ctx.fillRect(0, 0, W, H);

        ctx.save();
        ctx.translate(shakeX || 0, shakeY || 0);

        drawBG();
        drawColGuides();
        if (gameState === STATE.PLAYING) drawArcGuide();
        drawPlates();
        drawTrail();
        drawBall();
        drawRings();
        drawParticles();
        drawFloatTexts();

        if (flashA > 0.004) {
            ctx.globalAlpha = flashA;
            ctx.fillStyle   = flashCol;
            ctx.fillRect(0, 0, W, H);
            ctx.globalAlpha = 1;
        }
        ctx.restore();

        drawHUD();
        if (gameState === STATE.READY) drawReady();
        if (gameState === STATE.DEAD)  drawDead();
    }

    function drawBG() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0,    '#0D0020');
        g.addColorStop(0.35, '#170730');
        g.addColorStop(0.75, '#110428');
        g.addColorStop(1,    '#07000E');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        const rg = ctx.createRadialGradient(W/2, H*0.25, 0, W/2, H*0.25, H*0.55);
        rg.addColorStop(0,   'rgba(90,20,170,0.16)');
        rg.addColorStop(0.6, 'rgba(55,10,120,0.07)');
        rg.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.fillRect(0, 0, W, H);

        stars.forEach(s => {
            const a = 0.08 + ((Math.sin(s.ph) + 1) * 0.5) * 0.32;
            ctx.globalAlpha = a;
            ctx.fillStyle   = '#D8E8FF';
            ctx.beginPath();
            ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    function drawColGuides() {
        if (gameState !== STATE.PLAYING) return;
        for (let i = 0; i < 4; i++) {
            const px = PLATE_GAP + i * (PLATE_W + PLATE_GAP);
            ctx.globalAlpha = 0.025;
            ctx.fillStyle   = COLORS[i].fill;
            ctx.fillRect(px, 0, PLATE_W, H);
        }
        ctx.globalAlpha = 0.035;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth   = 0.8;
        for (let i = 1; i < 4; i++) {
            const px = PLATE_GAP + i * (PLATE_W + PLATE_GAP) - PLATE_GAP / 2;
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, H);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawArcGuide() {
        if (!ball.bouncing) return;
        const tp = getPlateById(targetPlateIdx);
        if (!tp) return;

        ctx.save();
        ctx.setLineDash([3, 16]);
        ctx.strokeStyle = 'rgba(255,255,255,0.055)';
        ctx.lineWidth   = 1.5;
        ctx.beginPath();
        for (let t = 0; t <= 1; t += 0.025) {
            const arc = Math.sin(t * Math.PI) * ARC_HEIGHT;
            const gy  = BALL_LAND_Y - arc;
            if (t === 0) ctx.moveTo(ball.x, gy);
            else         ctx.lineTo(ball.x, gy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    function drawPlates() {
        for (const plate of plates) {
            if (plate.y < -PLATE_H * 3 || plate.y > H + PLATE_H * 1.5) continue;
            const va = Math.min(1, plate.vis || 0);
            if (va < 0.01) continue;
            if (plate.type === 'full') drawFull(plate, va);
            else                       drawQuad(plate, va);
        }
    }

    function drawFull(p, va) {
        const col = COLORS[p.colorIdx];
        const h   = PLATE_H + 14;
        const x   = PLATE_GAP;
        const w   = W - PLATE_GAP * 2;
        const y   = Math.round(p.y - h / 2);
        const R   = h / 2;

        ctx.save();
        ctx.globalAlpha = (p.passed ? Math.max(0, p.flashT * 0.38) : 0.97) * va;

        if (!p.passed) {
            ctx.shadowColor = col.fill;
            ctx.shadowBlur  = 24;
        }

        const g = ctx.createLinearGradient(x, y, x, y + h);
        g.addColorStop(0,   lighten(col.fill, 80));
        g.addColorStop(0.4, col.fill);
        g.addColorStop(1,   col.stroke);

        ctx.fillStyle = (p.flashT > 0.45 && p.correct) ? '#ffffff' : g;
        rrect(x, y, w, h, R);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (!p.passed) {
            ctx.globalAlpha = 0.75 * va;
            ctx.strokeStyle = 'rgba(255,255,255,0.65)';
            ctx.lineWidth   = 2.2;
            rrect(x, y, w, h, R);
            ctx.stroke();

            ctx.globalAlpha = 0.24 * va;
            ctx.fillStyle   = '#ffffff';
            rrect(x + 8, y + 5, w - 16, h * 0.28, R * 0.35);
            ctx.fill();

            ctx.globalAlpha  = va;
            const fs = Math.max(14, Math.round(PLATE_H * 0.54));
            ctx.font         = `900 ${fs}px -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor  = 'rgba(0,0,0,0.80)';
            ctx.shadowBlur   = 8;
            ctx.fillStyle    = '#ffffff';
            ctx.fillText(col.name, W / 2, p.y);
            ctx.shadowBlur   = 0;
        }
        ctx.restore();
    }

    function drawQuad(p, va) {
        const h = PLATE_H + 6;
        const R = Math.min(h / 2, PLATE_W / 2);

        for (let i = 0; i < 4; i++) {
            const ci  = p.colors[i];
            const col = COLORS[ci];
            const px  = Math.round(PLATE_GAP + i * (PLATE_W + PLATE_GAP));
            const pw  = Math.round(PLATE_W);
            const y   = Math.round(p.y - h / 2);

            const isHit   = p.hitIdx === i;
            const isMatch = !p.passed && ball.colorIdx >= 0 && ci === ball.colorIdx;
            const flash   = isHit ? p.flashT : 0;

            ctx.save();

            let alp = p.passed
                ? (isHit ? Math.max(0, p.flashT * 0.55) : 0)
                : (0.90 + (isMatch ? 0.10 : 0));
            ctx.globalAlpha = alp * va;

            if (isMatch && !p.passed) {
                ctx.shadowColor = col.fill;
                ctx.shadowBlur  = 28;
            }
            if (flash > 0) {
                ctx.shadowColor = p.correct ? '#00FF88' : '#FF2244';
                ctx.shadowBlur  = 36 * flash;
            }

            const g = ctx.createLinearGradient(px, y, px, y + h);
            g.addColorStop(0,   lighten(col.fill, 60));
            g.addColorStop(0.5, col.fill);
            g.addColorStop(1,   col.stroke);

            ctx.fillStyle = (flash > 0.45 && isHit)
                ? (p.correct ? '#44FF88' : '#FF3355')
                : g;
            rrect(px, y, pw, h, R);
            ctx.fill();
            ctx.shadowBlur = 0;

            if (!p.passed) {
                ctx.globalAlpha = (isMatch ? 0.95 : 0.30) * va;
                ctx.strokeStyle = isMatch ? 'rgba(255,255,255,0.92)' : col.stroke;
                ctx.lineWidth   = isMatch ? 2.8 : 0.9;
                rrect(px, y, pw, h, R);
                ctx.stroke();

                ctx.globalAlpha = 0.18 * va;
                ctx.fillStyle   = '#ffffff';
                rrect(px + 3, y + 4, pw - 6, h * 0.28, R * 0.36);
                ctx.fill();

                ctx.globalAlpha = (isMatch ? 0.95 : 0.20) * va;
                ctx.fillStyle   = '#ffffff';
                if (isMatch) { ctx.shadowColor = col.fill; ctx.shadowBlur = 16; }
                ctx.beginPath();
                ctx.arc(px + pw / 2, p.y, isMatch ? 5.5 : 2.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;

                if (isMatch) {
                    ctx.globalAlpha = 0.65 * va;
                    const fs2 = Math.max(9, Math.round(PLATE_H * 0.38));
                    ctx.font         = `700 ${fs2}px -apple-system,Arial,sans-serif`;
                    ctx.textAlign    = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle    = '#ffffff';
                    ctx.fillText(col.name[0], px + pw / 2, p.y);
                }
            }
            ctx.restore();
        }
    }

    function drawTrail() {
        for (let i = 0; i < ball.trail.length; i++) {
            const t   = ball.trail[i];
            if (t.a <= 0) continue;
            const col = t.c >= 0 ? COLORS[t.c].fill : '#8888AA';
            ctx.globalAlpha = t.a * 0.26;
            ctx.fillStyle   = col;
            ctx.beginPath();
            ctx.arc(t.x, t.y, Math.max(1.5, BALL_R * t.a * 0.58), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawBall() {
        const bx = ball.x;
        const by = ball.screenY;
        const ci = ball.colorIdx;

        const pulse = 1 + Math.sin(ball.pulseT * 2.2) * 0.044;
        const rX    = BALL_R * pulse * (ball.squash  || 1);
        const rY    = BALL_R * pulse * (ball.stretch || 1);

        ctx.save();
        ctx.translate(bx, by);
        if (ball.rotation) ctx.rotate(ball.rotation);

        if (ball.bouncing) {
            const hAbove = BALL_LAND_Y - ball.screenY;
            const ratio  = Math.max(0, 1 - hAbove / (ARC_HEIGHT * 0.9));
            ctx.save();
            ctx.globalAlpha = 0.28 * ratio;
            ctx.fillStyle   = 'rgba(0,0,0,0.6)';
            ctx.beginPath();
            ctx.ellipse(0, hAbove + BALL_R * 0.4, BALL_R * (0.45 + 0.55*ratio), 4.5, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.restore();
        }

        if (ci < 0) {
            ctx.shadowColor = 'rgba(150,140,200,0.45)';
            ctx.shadowBlur  = 16;
            const bg = ctx.createRadialGradient(-rX*0.28, -rY*0.30, 0, 0, 0, Math.max(rX, rY) * 1.05);
            bg.addColorStop(0,   '#E2E2F8');
            bg.addColorStop(0.5, '#6E6E9E');
            bg.addColorStop(1,   '#323255');
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.ellipse(0, 0, rX, rY, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.40)';
            ctx.lineWidth   = 1.8;
            ctx.beginPath();
            ctx.ellipse(0, 0, rX, rY, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha  = 0.72;
            ctx.font         = `800 ${Math.round(BALL_R * 1.05)}px -apple-system,Arial,sans-serif`;
            ctx.fillStyle    = '#ffffff';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', 0, 1);
        } else {
            const col = COLORS[ci];

            ctx.globalAlpha  = 0.22;
            ctx.strokeStyle  = col.fill;
            ctx.lineWidth    = 9;
            ctx.beginPath();
            ctx.ellipse(0, 0, rX + 14, rY + 14, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.shadowColor = col.fill;
            ctx.shadowBlur  = 36;
            const bg = ctx.createRadialGradient(-rX*0.28, -rY*0.30, 0, 0, 0, Math.max(rX, rY) * 1.08);
            bg.addColorStop(0,    lighten(col.fill, 100));
            bg.addColorStop(0.35, col.fill);
            bg.addColorStop(0.80, col.stroke);
            bg.addColorStop(1,    '#000000');
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.ellipse(0, 0, rX, rY, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur  = 0;

            ctx.strokeStyle = 'rgba(255,255,255,0.68)';
            ctx.lineWidth   = 2.4;
            ctx.beginPath();
            ctx.ellipse(0, 0, rX, rY, 0, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.globalAlpha = 0.44;
        ctx.fillStyle   = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(-rX*0.20, -rY*0.26, rX*0.26, rY*0.14, -0.36, 0, Math.PI*2);
        ctx.fill();

        ctx.globalAlpha = 0.18;
        ctx.fillStyle   = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(rX*0.22, rY*0.28, rX*0.10, rY*0.055, 0.48, 0, Math.PI*2);
        ctx.fill();

        ctx.restore();
    }

    function drawRings() {
        for (const r of rings) {
            ctx.globalAlpha = Math.max(0, r.alpha);
            ctx.strokeStyle = r.col;
            ctx.lineWidth   = 3.0 * r.alpha;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = Math.max(0, p.life * 0.90);
            ctx.fillStyle   = p.col;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.3, p.r * p.life), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function drawFloatTexts() {
        for (const t of floatTexts) {
            ctx.save();
            ctx.globalAlpha = t.op;
            const fs = t.big ? 26 : 19;
            ctx.font         = `800 ${fs}px -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle  = 'rgba(0,0,0,0.78)';
            ctx.lineWidth    = 5;
            ctx.lineJoin     = 'round';
            ctx.strokeText(t.text, t.x, t.y);
            ctx.fillStyle = t.col;
            ctx.fillText(t.text, t.x, t.y);
            ctx.restore();
        }
    }

    // ══════════════════════════════════════════════
    //  HUD
    // ══════════════════════════════════════════════
    function drawHUD() {
        if (gameState === STATE.READY) return;

        const bW = 192, bH = 50, bX = Math.round(W/2 - bW/2), bY = 14;

        ctx.save();
        ctx.globalAlpha = 0.32; ctx.fillStyle = '#000';
        rrect(bX+3, bY+4, bW, bH, 15); ctx.fill();
        ctx.restore();

        ctx.fillStyle   = 'rgba(50,8,26,0.94)';
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth   = 1;
        rrect(bX, bY, bW, bH, 15); ctx.fill();
        rrect(bX, bY, bW, bH, 15); ctx.stroke();

        ctx.font         = `800 26px -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif`;
        ctx.fillStyle    = '#ffffff';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = 'rgba(180,80,255,0.50)';
        ctx.shadowBlur   = 12;
        ctx.fillText(score.toLocaleString(), W/2, bY + bH*0.40);
        ctx.shadowBlur   = 0;

        if (best > 0) {
            ctx.font      = '500 10px -apple-system,Arial,sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.30)';
            ctx.fillText('Best  ' + best, W/2, bY + bH*0.82);
        }

        const ci = ball.colorIdx;
        ctx.save();
        ctx.globalAlpha = 0.14; ctx.fillStyle = '#000';
        rrect(12, 14, 50, 30, 10); ctx.fill();
        ctx.restore();
        ctx.fillStyle   = 'rgba(16,4,38,0.94)';
        rrect(12, 14, 50, 30, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
        rrect(12, 14, 50, 30, 10); ctx.stroke();

        if (ci >= 0) {
            const col = COLORS[ci];
            ctx.fillStyle   = col.fill;
            ctx.shadowColor = col.fill;
            ctx.shadowBlur  = 16;
            ctx.beginPath();
            ctx.arc(37, 29, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur  = 0;
            ctx.strokeStyle = 'rgba(255,255,255,0.75)';
            ctx.lineWidth   = 2;
            ctx.beginPath();
            ctx.arc(37, 29, 12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.font         = '700 7px Arial';
            ctx.fillStyle    = 'rgba(255,255,255,0.62)';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(col.name[0], 37, 29);
        } else {
            ctx.font         = '700 14px Arial';
            ctx.fillStyle    = 'rgba(175,170,215,0.78)';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('?', 37, 29);
        }

        const sp = Math.min(1, (speedMult - 1.4) / (2.6 - 1.4));
        const sl = Math.min(10, Math.ceil(sp * 10) + 1);
        ctx.save();
        ctx.globalAlpha = 0.14; ctx.fillStyle = '#000';
        rrect(W-62, 14, 50, 30, 10); ctx.fill();
        ctx.restore();
        ctx.fillStyle   = 'rgba(16,4,38,0.94)';
        rrect(W-62, 14, 50, 30, 10); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
        rrect(W-62, 14, 50, 30, 10); ctx.stroke();
        ctx.font         = '700 10px -apple-system,Arial,sans-serif';
        ctx.fillStyle    = '#CC88FF';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`SPD ${sl}`, W - 37, 29);

        if (combo > 2) {
            const blink = 0.55 + Math.sin(bgT * 7) * 0.38;
            ctx.globalAlpha  = blink;
            ctx.font         = '800 15px -apple-system,Arial,sans-serif';
            ctx.fillStyle    = '#FFD700';
            ctx.shadowColor  = '#FF8800';
            ctx.shadowBlur   = 10;
            ctx.textAlign    = 'center';
            ctx.fillText(`🔥 ${combo} COMBO`, W/2, bY + bH + 22);
            ctx.shadowBlur   = 0;
            ctx.globalAlpha  = 1;
        }

        drawColorBar();

        if (score < 3 && ci >= 0) {
            const blink = 0.28 + Math.sin(bgT * 2.2) * 0.25;
            ctx.globalAlpha = blink;
            ctx.font        = '500 12px -apple-system,Arial,sans-serif';
            ctx.fillStyle   = 'rgba(175,165,255,0.95)';
            ctx.textAlign   = 'center';
            ctx.fillText('← DRAG ball to matching color →', W/2, H - 20);
            ctx.globalAlpha = 1;
        }
    }

    function drawColorBar() {
        const n = COLORS.length, sw = 38, sh = 10, gap = 10;
        const totW = n * sw + (n-1) * gap;
        const sx   = Math.round(W/2 - totW/2);
        const sy   = H - 26;

        COLORS.forEach((col, i) => {
            const isActive = i === ball.colorIdx;
            const px = Math.round(sx + i * (sw + gap));
            const ph = isActive ? sh + 8 : sh;
            const py = Math.round(sy + (isActive ? -2 : 2));

            ctx.save();
            if (isActive) {
                ctx.globalAlpha = 0.22;
                ctx.fillStyle   = col.fill;
                rrect(px - 2, py + 2, sw + 4, ph, ph/2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle   = isActive ? col.fill : col.fill + '44';
            ctx.shadowColor = isActive ? col.fill : 'transparent';
            ctx.shadowBlur  = isActive ? 16 : 0;
            rrect(px, py, sw, ph, ph/2);
            ctx.fill();
            ctx.shadowBlur  = 0;

            if (isActive) {
                ctx.strokeStyle = 'rgba(255,255,255,0.80)';
                ctx.lineWidth   = 1.8;
                rrect(px, py, sw, ph, ph/2);
                ctx.stroke();
                ctx.font         = '700 7px Arial';
                ctx.fillStyle    = 'rgba(255,255,255,0.68)';
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(col.name[0], px + sw/2, py + ph/2);
            }
            ctx.restore();
        });
    }

    // ══════════════════════════════════════════════
    //  SCREENS
    // ══════════════════════════════════════════════
    function drawReady() {
        ctx.fillStyle = 'rgba(0,0,12,0.90)';
        ctx.fillRect(0, 0, W, H);

        const cx = Math.round(W/2), cy = Math.round(H/2);
        const pw = Math.min(W - 24, 330), ph = 368;
        const px = Math.round(cx - pw/2), py = Math.round(cy - ph/2);

        ctx.save();
        ctx.globalAlpha = 0.40; ctx.fillStyle = '#000';
        rrect(px+4, py+6, pw, ph, 28); ctx.fill();
        ctx.restore();

        ctx.fillStyle   = 'rgba(15,3,40,0.98)';
        ctx.strokeStyle = 'rgba(130,60,245,0.36)';
        ctx.lineWidth   = 1.8;
        rrect(px, py, pw, ph, 28); ctx.fill();
        rrect(px, py, pw, ph, 28); ctx.stroke();

        const lg = ctx.createLinearGradient(px, 0, px+pw, 0);
        lg.addColorStop(0,   'transparent');
        lg.addColorStop(0.5, 'rgba(110,50,245,0.58)');
        lg.addColorStop(1,   'transparent');
        ctx.fillStyle = lg;
        rrect(px+1, py+1, pw-2, 2.5, 1.5);
        ctx.fill();

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        ctx.font        = `900 42px -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif`;
        ctx.fillStyle   = '#00FF88';
        ctx.shadowColor = '#00CC66'; ctx.shadowBlur = 26;
        ctx.fillText('COLOR UP', cx, py + 56);
        ctx.shadowBlur  = 0;

        ctx.font      = '400 13px -apple-system,Arial,sans-serif';
        ctx.fillStyle = 'rgba(175,155,255,0.70)';
        ctx.fillText('Plates scroll down — land on them!', cx, py + 90);
        ctx.fillText('Drag ball to the matching color.', cx, py + 110);

        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.fillRect(px + 20, py + 126, pw - 40, 1);

        const steps = [
            { icon: '⚪', text: 'Ball starts colorless' },
            { icon: '🎨', text: 'Full plate → ball gets that color' },
            { icon: '↔️',  text: 'Drag to the matching column' },
            { icon: '⚡', text: 'Speed increases as you score' },
        ];
        steps.forEach((s, i) => {
            ctx.font      = '400 13px -apple-system,Arial,sans-serif';
            ctx.fillStyle = 'rgba(195,182,255,0.80)';
            ctx.textAlign = 'left';
            ctx.fillText(s.icon + '  ' + s.text, px + 32, py + 144 + i * 30);
        });

        const n = COLORS.length, sw = 50, sh = 26, gap = 8;
        let sxi = cx - (n*sw + (n-1)*gap)/2;
        COLORS.forEach(col => {
            ctx.save();
            ctx.fillStyle   = col.fill;
            ctx.shadowColor = col.fill;
            ctx.shadowBlur  = 12;
            rrect(Math.round(sxi), py + 278, sw, sh, sh/2);
            ctx.fill();
            ctx.shadowBlur   = 0;
            ctx.font         = '700 9px -apple-system,Arial,sans-serif';
            ctx.fillStyle    = '#ffffff';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(col.name, Math.round(sxi + sw/2), py + 278 + sh/2);
            sxi += sw + gap;
            ctx.restore();
        });

        if (best > 0) {
            ctx.font        = '700 14px -apple-system,Arial,sans-serif';
            ctx.fillStyle   = '#FFD700';
            ctx.textAlign   = 'center';
            ctx.shadowColor = '#FF8800'; ctx.shadowBlur = 8;
            ctx.fillText('⭐  Best: ' + best, cx, py + 320);
            ctx.shadowBlur  = 0;
        }

        const blink = 0.44 + Math.sin(bgT * 2.8) * 0.44;
        ctx.globalAlpha  = blink;
        ctx.font         = `800 22px -apple-system,Arial,sans-serif`;
        ctx.fillStyle    = '#00DDFF';
        ctx.shadowColor  = '#00AAFF'; ctx.shadowBlur = 14;
        ctx.textAlign    = 'center';
        ctx.fillText('▶  TAP TO START', cx, py + ph - 28);
        ctx.shadowBlur   = 0;
        ctx.globalAlpha  = 1;
    }

    function drawDead() {
        const fade = Math.min(1, deadTimer / 460);
        ctx.fillStyle = `rgba(0,0,10,${fade * 0.90})`;
        ctx.fillRect(0, 0, W, H);
        if (fade < 0.18) return;

        const pa = Math.min(1, (fade - 0.18) / 0.82);
        const cx = Math.round(W/2), cy = Math.round(H/2);
        const pw = Math.min(W - 24, 318), ph = 298;
        const px = Math.round(cx - pw/2), py = Math.round(cy - ph/2);

        ctx.save();
        ctx.globalAlpha = pa * 0.42; ctx.fillStyle = '#000';
        rrect(px+4, py+6, pw, ph, 28); ctx.fill();
        ctx.globalAlpha = pa;

        ctx.fillStyle   = 'rgba(7,0,20,0.99)';
        ctx.strokeStyle = 'rgba(255,25,70,0.50)';
        ctx.lineWidth   = 1.8;
        rrect(px, py, pw, ph, 28); ctx.fill();
        rrect(px, py, pw, ph, 28); ctx.stroke();

        const rg = ctx.createLinearGradient(px, 0, px+pw, 0);
        rg.addColorStop(0,   'transparent');
        rg.addColorStop(0.5, 'rgba(255,35,80,0.68)');
        rg.addColorStop(1,   'transparent');
        ctx.fillStyle = rg;
        rrect(px+1, py+1, pw-2, 2.5, 1.5);
        ctx.fill();

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        ctx.font        = `900 34px -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif`;
        ctx.fillStyle   = '#FF1F55';
        ctx.shadowColor = '#FF0030'; ctx.shadowBlur = 22;
        ctx.fillText('GAME OVER', cx, py + 48);
        ctx.shadowBlur  = 0;

        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(px + 22, py + 70, pw - 44, 1);

        const isNew = score >= best && score > 0;
        if (isNew) {
            ctx.save();
            const bg2 = ctx.createLinearGradient(cx-74, 0, cx+74, 0);
            bg2.addColorStop(0,   'rgba(255,200,0,0.10)');
            bg2.addColorStop(0.5, 'rgba(255,215,0,0.26)');
            bg2.addColorStop(1,   'rgba(255,200,0,0.10)');
            ctx.fillStyle   = bg2;
            ctx.strokeStyle = 'rgba(255,215,0,0.60)';
            ctx.lineWidth   = 1;
            rrect(cx-76, py+77, 152, 26, 8); ctx.fill();
            rrect(cx-76, py+77, 152, 26, 8); ctx.stroke();
            ctx.font         = '700 10px -apple-system,Arial,sans-serif';
            ctx.fillStyle    = '#FFD700';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor  = '#FF8800'; 
                        ctx.shadowBlur   = 8;
            ctx.fillText('✦  NEW BEST SCORE!  ✦', cx, py + 90);
            ctx.shadowBlur   = 0;
            ctx.restore();
        }

        const st = isNew ? py + 108 : py + 82;
        const stats = [
            { l: 'SCORE',     v: score,    col: isNew ? '#00FFDD' : '#ffffff', big: true },
            { l: 'BEST',      v: best,     col: isNew ? '#FFD700' : '#888888' },
            { l: 'MAX COMBO', v: '×' + maxCombo, col: '#FF8800' },
            { l: 'SPEED LVL', v: Math.min(10, Math.ceil(Math.min(1,(speedMult-1.4)/(2.6-1.4))*10)+1), col: '#CC88FF' },
        ];

        stats.forEach((s, i) => {
            const ry = st + i * 40;

            if (i % 2 === 0) {
                ctx.globalAlpha = pa * 0.06;
                ctx.fillStyle   = '#ffffff';
                rrect(px + 16, ry - 14, pw - 32, 30, 6);
                ctx.fill();
                ctx.globalAlpha = pa;
            }

            ctx.font      = '400 11px -apple-system,Arial,sans-serif';
            ctx.fillStyle = 'rgba(145,125,188,1)';
            ctx.textAlign = 'left';
            ctx.fillText(s.l, px + 28, ry);

            ctx.font      = `${s.big ? '800 25px' : '700 17px'} -apple-system,Arial,sans-serif`;
            ctx.fillStyle = s.col;
            ctx.textAlign = 'right';
            if (s.big) { ctx.shadowColor = s.col; ctx.shadowBlur = 10; }
            ctx.fillText(
                typeof s.v === 'number' ? s.v.toLocaleString() : s.v,
                px + pw - 28, ry
            );
            ctx.shadowBlur = 0;

            if (i < stats.length - 1) {
                ctx.fillStyle   = 'rgba(255,255,255,0.045)';
                ctx.fillRect(px + 22, ry + 18, pw - 44, 1);
            }
        });

        if (deadTimer > 800) {
            const bp = 0.46 + Math.sin(bgT * 3.2) * 0.42;
            ctx.globalAlpha  = pa * bp;
            ctx.font         = `700 16px -apple-system,Arial,sans-serif`;
            ctx.fillStyle    = '#CC44FF';
            ctx.shadowColor  = '#8800CC'; ctx.shadowBlur = 10;
            ctx.textAlign    = 'center';
            ctx.fillText('● TAP TO PLAY AGAIN ●', cx, py + ph - 26);
            ctx.shadowBlur   = 0;
        }

        ctx.restore();
    }

    // ══════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════
    function rrect(x, y, w, h, r) {
        r = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y,     x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x,     y + h, r);
        ctx.arcTo(x,     y + h, x,     y,     r);
        ctx.arcTo(x,     y,     x + w, y,     r);
        ctx.closePath();
    }

    function lighten(hex, amt) {
        const n = parseInt(hex.replace('#', ''), 16);
        return `rgb(${Math.min(255,(n>>16)+amt)},${Math.min(255,((n>>8)&0xff)+amt)},${Math.min(255,(n&0xff)+amt)})`;
    }

    // ══════════════════════════════════════════════
    //  MAIN LOOP
    // ══════════════════════════════════════════════
    function loop(ts) {
        if (destroyed) return;
        const dt = Math.min(ts - (lastTS || ts), 50);
        lastTS   = ts;
        if (!paused) update(dt);
        draw();
        raf = requestAnimationFrame(loop);
    }

    // ══════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════
    const instance = {
        togglePause() {
            paused = !paused;
            if (!paused) lastTS = performance.now();
            return paused;
        },
        resize() {
            const p = canvas.parentElement;
            const w = (p && p.clientWidth  > 10) ? p.clientWidth  : window.innerWidth;
            const h = (p && p.clientHeight > 10) ? p.clientHeight : window.innerHeight;
            canvas.width  = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvas.style.width  = w + 'px';
            canvas.style.height = h + 'px';
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            initLayout();
        },
        destroy() {
            destroyed = true;
            cancelAnimationFrame(raf);
            canvas.removeEventListener('touchstart', _ev.onTD);
            canvas.removeEventListener('touchmove',  _ev.onTM);
            canvas.removeEventListener('touchend',   _ev.onTE);
            canvas.removeEventListener('mousedown',  _ev.onMD);
            window.removeEventListener('mousemove',  _ev.onMM);
            window.removeEventListener('mouseup',    _ev.onMU);
            if (audioCtx) try { audioCtx.close(); } catch(e) {}
        },
        get isPaused() { return paused; }
    };

    window._activeGameInstance = instance;
    return instance;
};