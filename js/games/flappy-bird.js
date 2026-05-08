'use strict';

class FlappyBird {
    constructor(canvas, onScore) {
        this.canvas  = canvas;
        this.onScore = onScore;

        this.isMobile = ('ontouchstart' in window) || window.innerWidth < 768;
        this.dpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 2 : 2.5);

        this.setupHDCanvas();
        this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        this.W = canvas.width  / this.dpr;
        this.H = canvas.height / this.dpr;

        this.FONT_TITLE = 'Orbitron, monospace';
        this.FONT_UI    = 'Rajdhani, sans-serif';
        this.loadFonts();

        this.soundEnabled = true;
        this.audioCtx = null;
        this.soundDefs = null;
        this.initSounds();

        this.gameState = 'menu';
        this.score     = 0;
        this.bestScore = parseInt(localStorage.getItem('flappy_best_v2') || '0');
        this.paused    = false;
        this.destroyed = false;

        this.bird = {
            x:         this.W * 0.25,
            y:         this.H * 0.45,
            r:         this.isMobile ? 14 : 17,
            vy:        0,
            gravity:   0.38,
            flapPow:   -7.2,
            rotation:  0,
            flapAnim:  0,
            wingPhase: 0,
            trail:     [],
            pulseT:    0,
            alive:     true,
            blinkT:    0,
            squishX:   1,
            squishY:   1,
            frameT:    0,
            wingFrame: 0,
        };

        this.pipes        = [];
        this.pipeW        = this.isMobile ? 52 : 64;
        this.pipeGap      = this.isMobile ? 160 : 178;
        this.pipeSpeed    = 2.0;
        this.pipeDist     = this.isMobile ? 230 : 260;
        this.nextPipeX    = 0;
        this.pipeCount    = 0;

        this.groundH  = this.isMobile ? 55 : 68;
        this.groundX  = 0;

        this.particles  = [];
        this.floatTexts = [];
        this.rings      = [];
        this.MAX_PARTICLES = this.isMobile ? 20 : 80;

        this.stars     = this.makeStars(this.isMobile ? 25 : 70);
        this.clouds    = this.makeClouds();
        this.bgLayers  = this.makeBgLayers();

        // Bird sprite sheets
        this.birdSprites = {};
        this.birdSpriteSize = 0;
        this.pipeCache  = {};
        this.colorCache = {};
        this._buildBirdSprites();

        this.screenShake = { x: 0, y: 0, timer: 0, force: 0 };
        this.flashAlpha  = 0;
        this.flashColor  = '#fff';
        this.bgTime      = 0;

        this.deathTimer = 0;
        this.menuBirdY  = this.H * 0.4;
        this.menuBirdT  = 0;

        this.frame        = 0;
        this.fpsHistory   = [];
        this.adaptiveMode = false;

        this.boundClick = this.handleInput.bind(this);
        this.boundKey   = this.handleKey.bind(this);
        this.boundTouch = this.handleTouch.bind(this);

        canvas.addEventListener('click',      this.boundClick);
        canvas.addEventListener('touchstart', this.boundTouch, { passive: false });
        document.addEventListener('keydown',  this.boundKey);

        this._buildStaticGradients();
        this.lastTime = 0;
        this.animId   = requestAnimationFrame(t => this.loop(t));
    }

    // ══════════════════════════════════════════
    // SOUND ENGINE
    // ══════════════════════════════════════════
    initSounds() {
        try {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            this.soundDefs = {
                flap:  () => this._playFlap(),
                score: () => this._playScore(),
                die:   () => this._playDie(),
                hit:   () => this._playHit(),
                start: () => this._playStart(),
                best:  () => this._playBest(),
            };
        } catch(e) { this.audioCtx = null; }
    }

    playSound(name) {
        if (!this.soundEnabled || !this.audioCtx) return;
        if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
        try { if (this.soundDefs && this.soundDefs[name]) this.soundDefs[name](); } catch(e) {}
    }

    _playFlap() {
        const ctx = this.audioCtx, t = ctx.currentTime;
        const osc = ctx.createOscillator(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
        filter.type = 'bandpass'; filter.frequency.value = 800; filter.Q.value = 1.5;
        osc.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, t);
        osc.frequency.exponentialRampToValueAtTime(280, t + 0.09);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.13);
    }

    _playScore() {
        const ctx = this.audioCtx, t = ctx.currentTime;
        [523, 659, 784].forEach((freq, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + i * 0.06);
            gain.gain.setValueAtTime(0, t + i * 0.06);
            gain.gain.linearRampToValueAtTime(0.15, t + i * 0.06 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.06 + 0.22);
            osc.start(t + i * 0.06); osc.stop(t + i * 0.06 + 0.25);
        });
    }

    _playDie() {
        const ctx = this.audioCtx, t = ctx.currentTime;
        const bufSize = ctx.sampleRate * 0.4, buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate), data = buffer.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufSize, 1.5);
        const noise = ctx.createBufferSource(); noise.buffer = buffer;
        const filter = ctx.createBiquadFilter(); filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, t); filter.frequency.exponentialRampToValueAtTime(100, t + 0.4);
        const gain = ctx.createGain(); gain.gain.setValueAtTime(0.5, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination); noise.start(t); noise.stop(t + 0.4);
        const osc = ctx.createOscillator(), og = ctx.createGain();
        osc.connect(og); og.connect(ctx.destination); osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
        og.gain.setValueAtTime(0.5, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.start(t); osc.stop(t + 0.3);
    }

    _playHit() {
        const ctx = this.audioCtx, t = ctx.currentTime;
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination); osc.type = 'square';
        osc.frequency.setValueAtTime(150, t); osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
        gain.gain.setValueAtTime(0.35, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.13);
    }

    _playStart() {
        const ctx = this.audioCtx, t = ctx.currentTime;
        [392, 523, 659, 784].forEach((freq, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t + i * 0.08);
            gain.gain.setValueAtTime(0, t + i * 0.08);
            gain.gain.linearRampToValueAtTime(0.13, t + i * 0.08 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.08 + 0.18);
            osc.start(t + i * 0.08); osc.stop(t + i * 0.08 + 0.2);
        });
    }

    _playBest() {
        const ctx = this.audioCtx, t = ctx.currentTime;
        [523, 659, 784, 1047].forEach((freq, i) => {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = i === 3 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, t + i * 0.07);
            gain.gain.setValueAtTime(0, t + i * 0.07);
            gain.gain.linearRampToValueAtTime(0.18, t + i * 0.07 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.3);
            osc.start(t + i * 0.07); osc.stop(t + i * 0.07 + 0.32);
        });
    }

    // ══════════════════════════════════════════
    // CANVAS SETUP
    // ══════════════════════════════════════════
    setupHDCanvas() {
        const parent = this.canvas.parentElement;
        const w = parent ? (parent.clientWidth  || parent.offsetWidth)  : (this.canvas.clientWidth  || 400);
        const h = parent ? (parent.clientHeight || parent.offsetHeight) : (this.canvas.clientHeight || 700);
        const rw = Math.max(w, 200), rh = Math.max(h, 200);
        this.canvas.width  = Math.round(rw * this.dpr);
        this.canvas.height = Math.round(rh * this.dpr);
        this.canvas.style.width  = rw + 'px';
        this.canvas.style.height = rh + 'px';
    }

    loadFonts() {
        if (document.fonts) {
            document.fonts.ready.then(() => {
                if (document.fonts.check('12px Orbitron')) this.FONT_TITLE = 'Orbitron, monospace';
                if (document.fonts.check('12px Rajdhani')) this.FONT_UI   = 'Rajdhani, sans-serif';
            });
        }
    }

    dX(x)  { return (x * this.dpr + 0.5) | 0; }
    dY(y)  { return (y * this.dpr + 0.5) | 0; }
    dS(s)  { return s * this.dpr; }
    dSr(s) { return (s * this.dpr + 0.5) | 0; }

    hexToRgba(hex, a) {
        const key = hex + a;
        if (this.colorCache[key]) return this.colorCache[key];
        if (!hex || hex[0] !== '#') return hex;
        const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        const result = `rgba(${r},${g},${b},${Math.max(0,Math.min(1,a)).toFixed(2)})`;
        this.colorCache[key] = result; return result;
    }

    _buildStaticGradients() {
        const ctx = this.ctx, W = this.W, H = this.H;

        // Sky — day-like with warm colors
        this.skyGrad = ctx.createLinearGradient(0, 0, 0, this.dY(H * 0.78));
        this.skyGrad.addColorStop(0,    '#1a6b9a');
        this.skyGrad.addColorStop(0.35, '#2e8cc8');
        this.skyGrad.addColorStop(0.7,  '#5ab4e8');
        this.skyGrad.addColorStop(1,    '#87ceeb');

        // Vignette
        this.vigGrad = ctx.createRadialGradient(
            this.dX(W/2), this.dY(H/2), this.dS(H*0.1),
            this.dX(W/2), this.dY(H/2), this.dS(H*0.9)
        );
        this.vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
        this.vigGrad.addColorStop(1, 'rgba(0,0,0,0.35)');

        // Ground
        const gy = H - this.groundH;
        this.groundGrad = ctx.createLinearGradient(0, this.dY(gy), 0, this.dY(H));
        this.groundGrad.addColorStop(0,   '#8BC34A');
        this.groundGrad.addColorStop(0.15, '#7CB342');
        this.groundGrad.addColorStop(0.4,  '#558B2F');
        this.groundGrad.addColorStop(1,    '#33691E');

        this._builtFor = W + 'x' + H;
    }

    // ══════════════════════════════════════════
    // REAL BIRD SPRITE — hand-drawn sparrow/canary
    // Wings: up (flap), mid (glide), down (fall)
    // ══════════════════════════════════════════
    _buildBirdSprites() {
        const r    = this.bird.r;
        const pad  = Math.ceil(r * 2.2);
        const size = Math.ceil((r + pad) * 2 * this.dpr);
        this.birdSpriteSize = size;

        // Build 3 frames: 'up', 'mid', 'down'
        const frames = ['up', 'mid', 'down'];
        frames.forEach(frame => {
            const c = document.createElement('canvas');
            c.width = c.height = size;
            const bx = c.getContext('2d');
            this._paintBird(bx, size, r, frame);
            this.birdSprites[frame] = c;
        });
    }

    _paintBird(bx, size, r, wingFrame) {
        const cx = size / 2;
        const cy = size / 2;
        const d  = r * this.dpr;

        // ── Body shadow ──
        bx.fillStyle = 'rgba(0,0,0,0.18)';
        bx.beginPath();
        bx.ellipse(cx + d*0.15, cy + d*0.92, d*1.05, d*0.22, 0, 0, Math.PI*2);
        bx.fill();

        // ──────────────────────────────────
        // TAIL FEATHERS — left side of body
        // ──────────────────────────────────
        const tailColors = ['#5D4037', '#795548', '#A1887F'];
        for (let i = 0; i < 3; i++) {
            bx.save();
            bx.fillStyle = tailColors[i];
            bx.beginPath();
            const tx = cx - d*0.68;
            const ty = cy + d*(0.12 - i*0.14);
            bx.moveTo(tx, ty);
            bx.bezierCurveTo(
                tx - d*0.55, ty - d*(0.06 - i*0.05),
                tx - d*0.95, ty + d*(0.12 + i*0.08),
                tx - d*1.28, ty + d*(0.24 + i*0.18)
            );
            bx.bezierCurveTo(
                tx - d*0.75, ty + d*(0.18 + i*0.1),
                tx - d*0.35, ty + d*(0.2 + i*0.06),
                tx + d*0.08, ty + d*(0.22 + i*0.04)
            );
            bx.closePath();
            bx.fill();

            // Feather quill line
            bx.strokeStyle = 'rgba(0,0,0,0.18)';
            bx.lineWidth   = this.dS(0.6);
            bx.beginPath();
            bx.moveTo(tx, ty + d*0.1);
            bx.lineTo(tx - d*1.22, ty + d*(0.28 + i*0.18));
            bx.stroke();
            bx.restore();
        }

        // ──────────────────────────────────
        // WING
        // ──────────────────────────────────
        this._paintWing(bx, cx, cy, d, wingFrame);

        // ──────────────────────────────────
        // MAIN BODY
        // ──────────────────────────────────
        // Body base — brown sparrow colors
        const bodyGrad = bx.createRadialGradient(
            cx - d*0.25, cy - d*0.22, d*0.05,
            cx,           cy,          d*1.08
        );
        bodyGrad.addColorStop(0,    '#D7CCC8');  // light chest
        bodyGrad.addColorStop(0.3,  '#BCAAA4');
        bodyGrad.addColorStop(0.58, '#8D6E63');  // brown mid
        bodyGrad.addColorStop(0.82, '#6D4C41');  // darker brown
        bodyGrad.addColorStop(1,    '#4E342E');  // deep dark edge

        bx.fillStyle = bodyGrad;
        bx.beginPath();
        // Slightly ovoid — wider front than back
        bx.ellipse(cx + d*0.06, cy, d*1.06, d*0.88, 0.12, 0, Math.PI*2);
        bx.fill();

        // Wing stripe on shoulder
        bx.strokeStyle = 'rgba(120,80,50,0.3)';
        bx.lineWidth   = this.dS(1.2);
        bx.beginPath();
        bx.moveTo(cx - d*0.3, cy - d*0.55);
        bx.bezierCurveTo(cx + d*0.1, cy - d*0.6, cx + d*0.4, cy - d*0.4, cx + d*0.6, cy - d*0.15);
        bx.stroke();

        // Chest lighter patch
        const chestGrad = bx.createRadialGradient(cx + d*0.22, cy + d*0.1, 0, cx + d*0.22, cy + d*0.1, d*0.55);
        chestGrad.addColorStop(0,   'rgba(245,230,200,0.85)');
        chestGrad.addColorStop(0.6, 'rgba(210,185,155,0.4)');
        chestGrad.addColorStop(1,   'rgba(180,140,110,0)');
        bx.fillStyle = chestGrad;
        bx.beginPath();
        bx.ellipse(cx + d*0.22, cy + d*0.12, d*0.55, d*0.48, 0.2, 0, Math.PI*2);
        bx.fill();

        // Head — slightly darker top
        const headGrad = bx.createRadialGradient(
            cx - d*0.05, cy - d*0.62, d*0.08,
            cx - d*0.05, cy - d*0.5,  d*0.55
        );
        headGrad.addColorStop(0,   '#5D4037');
        headGrad.addColorStop(0.5, '#4E342E');
        headGrad.addColorStop(1,   '#3E2723');
        bx.fillStyle = headGrad;
        bx.beginPath();
        bx.arc(cx - d*0.05, cy - d*0.5, d*0.52, 0, Math.PI*2);
        bx.fill();

        // Head-body blend
        bx.fillStyle = '#6D4C41';
        bx.beginPath();
        bx.ellipse(cx - d*0.04, cy - d*0.05, d*0.42, d*0.35, -0.3, 0, Math.PI*2);
        bx.fill();

        // Body outline
        bx.strokeStyle = 'rgba(50,25,10,0.3)';
        bx.lineWidth   = this.dS(1);
        bx.beginPath();
        bx.ellipse(cx + d*0.06, cy, d*1.06, d*0.88, 0.12, 0, Math.PI*2);
        bx.stroke();

        // ──────────────────────────────────
        // EYE
        // ──────────────────────────────────
        const ex = cx + d*0.22;
        const ey = cy - d*0.55;

        // Eye ring (white sclera)
        bx.fillStyle = '#FFFDE7';
        bx.beginPath();
        bx.arc(ex, ey, d*0.28, 0, Math.PI*2);
        bx.fill();
        bx.strokeStyle = '#3E2723';
        bx.lineWidth   = this.dS(0.8);
        bx.stroke();

        // Iris — dark brown/black
        bx.fillStyle = '#1A1A1A';
        bx.beginPath();
        bx.arc(ex + this.dS(0.8), ey + this.dS(0.6), d*0.17, 0, Math.PI*2);
        bx.fill();

        // Eye shine
        bx.fillStyle = 'rgba(255,255,255,0.92)';
        bx.beginPath();
        bx.arc(ex + this.dS(0.2), ey - this.dS(0.5), d*0.07, 0, Math.PI*2);
        bx.fill();
        bx.fillStyle = 'rgba(255,255,255,0.5)';
        bx.beginPath();
        bx.arc(ex + this.dS(1.2), ey + this.dS(0.2), d*0.04, 0, Math.PI*2);
        bx.fill();

        // ──────────────────────────────────
        // BEAK
        // ──────────────────────────────────
        // Upper beak
        bx.fillStyle = '#F57F17';
        bx.strokeStyle = '#E65100';
        bx.lineWidth   = this.dS(0.8);

        bx.beginPath();
        bx.moveTo(cx + d*0.44, ey - d*0.08);
        bx.bezierCurveTo(
            cx + d*0.82, ey - d*0.18,
            cx + d*0.98, ey + d*0.02,
            cx + d*0.78, ey + d*0.06
        );
        bx.bezierCurveTo(
            cx + d*0.62, ey + d*0.08,
            cx + d*0.48, ey + d*0.04,
            cx + d*0.44, ey - d*0.08
        );
        bx.fill(); bx.stroke();

        // Lower beak
        bx.fillStyle = '#FF8F00';
        bx.beginPath();
        bx.moveTo(cx + d*0.46, ey + d*0.06);
        bx.bezierCurveTo(
            cx + d*0.75, ey + d*0.05,
            cx + d*0.88, ey + d*0.16,
            cx + d*0.72, ey + d*0.22
        );
        bx.bezierCurveTo(
            cx + d*0.58, ey + d*0.24,
            cx + d*0.48, ey + d*0.16,
            cx + d*0.46, ey + d*0.06
        );
        bx.fill(); bx.stroke();

        // Nostril
        bx.fillStyle = 'rgba(100,50,0,0.4)';
        bx.beginPath();
        bx.ellipse(cx + d*0.56, ey - d*0.06, d*0.04, d*0.03, -0.4, 0, Math.PI*2);
        bx.fill();

        // ──────────────────────────────────
        // HEAD FEATHERS (crest) — small tuft
        // ──────────────────────────────────
        const crColors = ['#4E342E', '#6D4C41', '#8D6E63'];
        for (let i = 0; i < 3; i++) {
            const angle = -Math.PI/2 + (i - 1)*0.22;
            const len   = d * (0.42 - i*0.05);
            bx.fillStyle = crColors[i];
            bx.beginPath();
            const hx = cx - d*0.05 + Math.cos(angle - 0.35) * d*0.45;
            const hy = cy - d*0.5  + Math.sin(angle - 0.35) * d*0.45;
            bx.moveTo(hx, hy);
            bx.quadraticCurveTo(
                hx + Math.cos(angle)*d*0.15, hy + Math.sin(angle)*len*0.5,
                hx + Math.cos(angle)*d*0.05, hy + Math.sin(angle)*len
            );
            bx.quadraticCurveTo(
                hx + Math.cos(angle+0.3)*d*0.22, hy + Math.sin(angle+0.3)*len*0.6,
                hx + Math.cos(angle+0.15)*d*0.18, hy + Math.sin(angle+0.15)*d*0.28
            );
            bx.closePath();
            bx.fill();
        }

        // ──────────────────────────────────
        // BODY SHEEN / HIGHLIGHT
        // ──────────────────────────────────
        const sheen = bx.createLinearGradient(cx - d*0.3, cy - d*0.5, cx + d*0.2, cy + d*0.1);
        sheen.addColorStop(0,   'rgba(255,255,255,0.22)');
        sheen.addColorStop(0.5, 'rgba(255,255,255,0.06)');
        sheen.addColorStop(1,   'rgba(255,255,255,0)');
        bx.fillStyle = sheen;
        bx.beginPath();
        bx.ellipse(cx - d*0.04, cy - d*0.25, d*0.62, d*0.38, -0.4, 0, Math.PI*2);
        bx.fill();

        // ──────────────────────────────────
        // FEET (visible when flying)
        // ──────────────────────────────────
        bx.strokeStyle = '#5D4037';
        bx.lineWidth   = this.dS(1.5);
        bx.lineCap     = 'round';
        // Left foot
        bx.beginPath();
        bx.moveTo(cx + d*0.08, cy + d*0.85);
        bx.lineTo(cx + d*0.08, cy + d*1.12);
        bx.stroke();
        // Left toes
        [[-0.22, 0.06], [0, 0.08], [0.2, 0.05]].forEach(([tx, ty]) => {
            bx.beginPath();
            bx.moveTo(cx + d*0.08, cy + d*1.12);
            bx.lineTo(cx + d*(0.08 + tx), cy + d*(1.12 + ty));
            bx.stroke();
        });
        // Right foot
        bx.beginPath();
        bx.moveTo(cx + d*0.3, cy + d*0.78);
        bx.lineTo(cx + d*0.3, cy + d*1.06);
        bx.stroke();
        [[-0.2, 0.06], [0, 0.08], [0.18, 0.04]].forEach(([tx, ty]) => {
            bx.beginPath();
            bx.moveTo(cx + d*0.3, cy + d*1.06);
            bx.lineTo(cx + d*(0.3 + tx), cy + d*(1.06 + ty));
            bx.stroke();
        });
    }

    _paintWing(bx, cx, cy, d, frame) {
        // Wing pivot point
        const wpx = cx - d*0.1;
        const wpy = cy - d*0.05;

        // Wing angle per frame
        const angles = { up: -0.55, mid: 0.1, down: 0.62 };
        const angle  = angles[frame] || 0;

        bx.save();
        bx.translate(wpx, wpy);
        bx.rotate(angle);

        // ── Primary feathers (longest, dark) ──
        const primColors = ['#3E2723', '#4E342E', '#5D4037', '#6D4C41'];
        const numPrim = 4;
        for (let i = 0; i < numPrim; i++) {
            const spread = (i / (numPrim-1)) * 0.45 - 0.1;
            const len    = d * (1.42 - i*0.12);
            bx.fillStyle = primColors[i];
            bx.beginPath();
            bx.moveTo(0, 0);
            bx.bezierCurveTo(
                Math.cos(-0.55 + spread)*d*0.55, Math.sin(-0.55 + spread)*d*0.55,
                Math.cos(-0.55 + spread)*len*0.85, Math.sin(-0.55 + spread)*len*0.88,
                Math.cos(-0.55 + spread)*len, Math.sin(-0.55 + spread)*len
            );
            bx.bezierCurveTo(
                Math.cos(-0.3 + spread)*len*0.8, Math.sin(-0.3 + spread)*len*0.8,
                Math.cos(-0.2 + spread)*d*0.5, Math.sin(-0.2 + spread)*d*0.5,
                0, 0
            );
            bx.fill();

            // Quill
            bx.strokeStyle = 'rgba(255,255,255,0.12)';
            bx.lineWidth   = this.dS(0.5);
            bx.beginPath();
            bx.moveTo(0, 0);
            bx.lineTo(Math.cos(-0.55+spread)*len*0.9, Math.sin(-0.55+spread)*len*0.9);
            bx.stroke();
        }

        // ── Secondary feathers (medium, brownish) ──
        const secColors = ['#6D4C41', '#795548', '#8D6E63'];
        for (let i = 0; i < 3; i++) {
            const spread = (i / 2) * 0.3 + 0.05;
            const len    = d * (0.88 - i*0.08);
            bx.fillStyle = secColors[i];
            bx.beginPath();
            bx.moveTo(0, 0);
            bx.bezierCurveTo(
                Math.cos(spread)*d*0.42, Math.sin(spread)*d*0.42,
                Math.cos(spread)*len*0.8, Math.sin(spread)*len*0.82,
                Math.cos(spread)*len, Math.sin(spread)*len
            );
            bx.bezierCurveTo(
                Math.cos(spread+0.2)*len*0.7, Math.sin(spread+0.2)*len*0.7,
                Math.cos(spread+0.25)*d*0.38, Math.sin(spread+0.25)*d*0.38,
                0, 0
            );
            bx.fill();
        }

        // ── Covert feathers (small, top of wing) ──
        bx.fillStyle = '#A1887F';
        bx.beginPath();
        bx.moveTo(0, 0);
        bx.ellipse(d*0.05, -d*0.06, d*0.52, d*0.2, -0.3, 0, Math.PI*2);
        bx.fill();

        bx.fillStyle = '#BCAAA4';
        bx.beginPath();
        bx.ellipse(d*0.02, -d*0.14, d*0.35, d*0.12, -0.5, 0, Math.PI*2);
        bx.fill();

        // Wing edge highlight
        bx.strokeStyle = 'rgba(200,180,160,0.2)';
        bx.lineWidth   = this.dS(0.7);
        bx.beginPath();
        bx.moveTo(-d*0.15, -d*0.05);
        bx.bezierCurveTo(-d*0.6, -d*0.55, -d*0.4, -d*1.0, -d*0.08, -d*1.35);
        bx.stroke();

        bx.restore();
    }

    // ══════════════════════════════════════════
    // PIPE CACHE
    // ══════════════════════════════════════════
    _buildPipeCanvas(theme, pw) {
        const capH = 20, capExt = 5, totalW = pw + capExt * 2;
        const bodyKey = `body_${theme.body}_${pw}`;
        if (!this.pipeCache[bodyKey]) {
            const bc = document.createElement('canvas'); bc.width = this.dSr(pw); bc.height = 1;
            const bx = bc.getContext('2d');
            const bg = bx.createLinearGradient(0, 0, bc.width, 0);
            bg.addColorStop(0,    this.hexToRgba(theme.dark,  0.95));
            bg.addColorStop(0.2,  this.hexToRgba(theme.body,  0.98));
            bg.addColorStop(0.45, this.hexToRgba(theme.shine, 0.85));
            bg.addColorStop(0.7,  this.hexToRgba(theme.body,  0.95));
            bg.addColorStop(1,    this.hexToRgba(theme.dark,  0.9));
            bx.fillStyle = bg; bx.fillRect(0, 0, bc.width, 1);
            this.pipeCache[bodyKey] = bc;
        }
        const capKey = `cap_${theme.body}_${pw}`;
        if (!this.pipeCache[capKey]) {
            const cc = document.createElement('canvas'); cc.width = this.dSr(totalW); cc.height = this.dSr(capH);
            const cx2 = cc.getContext('2d');
            const cg = cx2.createLinearGradient(0, 0, cc.width, 0);
            cg.addColorStop(0,    this.hexToRgba(theme.dark,  0.98));
            cg.addColorStop(0.2,  this.hexToRgba(theme.body,  1));
            cg.addColorStop(0.45, this.hexToRgba(theme.shine, 0.95));
            cg.addColorStop(0.7,  this.hexToRgba(theme.body,  1));
            cg.addColorStop(1,    this.hexToRgba(theme.dark,  0.98));
            cx2.fillStyle = cg; cx2.fillRect(0, 0, cc.width, cc.height);
            cx2.strokeStyle = this.hexToRgba(theme.shine, 0.45);
            cx2.lineWidth   = Math.max(1, this.dS(1.2));
            cx2.strokeRect(0.5, 0.5, cc.width-1, cc.height-1);
            // Shine stripe
            cx2.fillStyle = 'rgba(255,255,255,0.08)';
            cx2.fillRect((cc.width*0.22)|0, 0, (cc.width*0.14)|0, cc.height);
            this.pipeCache[capKey] = cc;
        }
        return { body: this.pipeCache[bodyKey], cap: this.pipeCache[capKey], capH, capExt };
    }

    // ══════════════════════════════════════════
    // WORLD BUILDERS
    // ══════════════════════════════════════════
    makeStars(n) {
        return Array.from({ length: n }, () => ({
            x: Math.random() * (this.W || 400),
            y: Math.random() * (this.H || 700) * 0.55,
            r: Math.random() * 1.1 + 0.3,
            phase: Math.random() * Math.PI * 2,
            speed: Math.random() * 0.01 + 0.003,
            color: '#fff'
        }));
    }

    makeClouds() {
        const count = this.isMobile ? 5 : 9;
        return Array.from({ length: count }, (_, i) => ({
            x:     (this.W || 400) * (i / count) + Math.random() * 80,
            y:     Math.random() * (this.H || 700) * 0.52 + 20,
            w:     Math.random() * 80 + 50,
            h:     Math.random() * 22 + 14,
            speed: Math.random() * 0.35 + 0.12,
            alpha: Math.random() * 0.65 + 0.55,
            puffs: Math.floor(Math.random() * 2 + 2), // 2-3 puffs per cloud
        }));
    }

    makeBgLayers() {
        // Distant trees / bushes silhouette
        const W = this.W || 400;
        const H = this.H || 700;
        const groundY = H - (this.groundH || 64);
        const count = this.isMobile ? 14 : 28;
        return Array.from({ length: count }, (_, i) => ({
            x:     (W / count) * i + Math.random() * 12,
            w:     Math.random() * 22 + 10,
            h:     Math.random() * 55 + 20,
            color: Math.random() > 0.5
                ? `rgba(76,175,80,${(Math.random()*0.18+0.08).toFixed(3)})`
                : `rgba(33,150,83,${(Math.random()*0.15+0.06).toFixed(3)})`,
            speed: Math.random() * 0.45 + 0.15,
            baseY: groundY,
            type:  Math.random() > 0.5 ? 'tree' : 'bush',
            seed:  Math.random() * 100,
        }));
    }

    // ══════════════════════════════════════════
    // INPUT
    // ══════════════════════════════════════════
    handleInput(e) {
        if (this.paused) return;
        // Check sound toggle button
        if (e && e.type === 'click') {
            const rect = this.canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) * (this.W / rect.width);
            const my = (e.clientY - rect.top)  * (this.H / rect.height);
            if (mx >= this.W - 40 && mx <= this.W - 8 && my >= 12 && my <= 36) {
                this.soundEnabled = !this.soundEnabled; return;
            }
        }
        if (this.gameState === 'menu')    { this.startGame(); return; }
        if (this.gameState === 'dead')    { if (this.deathTimer > 700) this.restart(); return; }
        if (this.gameState === 'playing') this.flap();
    }

    handleTouch(e) { e.preventDefault(); this.handleInput(e); }
    handleKey(e) {
        if (['Space','ArrowUp','KeyW'].includes(e.code)) { e.preventDefault(); this.handleInput(e); }
    }

    flap() {
        if (!this.bird.alive) return;
        this.bird.vy       = this.bird.flapPow;
        this.bird.flapAnim = 1;
        this.bird.wingFrame = 0;  // reset to up-flap frame
        this.bird.squishX  = 0.78;
        this.bird.squishY  = 1.22;
        if (!this.isMobile) {
            this.spawnParticles(this.bird.x - 8, this.bird.y + 6, '#A1887F', 4, { spread: 2.5, vy: 1.8 });
        }
        this.rings.push({ x: this.bird.x, y: this.bird.y, r: this.bird.r, opacity: 0.35, color: '#8D6E63' });
        this.playSound('flap');
    }

    startGame() {
        this.playSound('start');
        this.gameState = 'playing'; this.score = 0; this.pipes = []; this.pipeCount = 0;
        this.pipeSpeed = 2.0;
        this.pipeGap   = this.isMobile ? 160 : 178;
        this.pipeDist  = this.isMobile ? 230 : 260;
        this.particles = []; this.floatTexts = []; this.rings = []; this.pipeCache = {};
        this.bird.y        = this.H * 0.42;
        this.bird.vy       = 0;
        this.bird.rotation = 0;
        this.bird.trail    = [];
        this.bird.alive    = true;
        this.bird.flapAnim = 0;
        this.bird.squishX  = 1;
        this.bird.squishY  = 1;
        this.bird.wingPhase = 0;
        this.bird.wingFrame = 1;
        this.bird.frameT    = 0;
        this.nextPipeX = this.W + 80;
        this.onScore(0);
    }

    restart() { this.deathTimer = 0; this.startGame(); }

    // ══════════════════════════════════════════
    // PIPE SPAWN
    // ══════════════════════════════════════════
    spawnPipe() {
        const margin = this.H * 0.13;
        const minTop = margin;
        const maxTop = this.H - this.groundH - this.pipeGap - margin;
        const gapTop = minTop + Math.random() * (maxTop - minTop);
        const themes = [
            { body: '#4CAF50', shine: '#A5D6A7', dark: '#2E7D32', glow: '#4CAF50' },
            { body: '#43A047', shine: '#A5D6A7', dark: '#1B5E20', glow: '#66BB6A' },
            { body: '#388E3C', shine: '#81C784', dark: '#1B5E20', glow: '#4CAF50' },
            { body: '#2E7D32', shine: '#66BB6A', dark: '#1A3D1A', glow: '#4CAF50' },
        ];
        this.pipes.push({
            x: this.nextPipeX, gapTop, gapBot: gapTop + this.pipeGap,
            passed: false, scored: false,
            theme: themes[this.pipeCount % themes.length],
            topH: gapTop,
            botH: this.H - this.groundH - (gapTop + this.pipeGap)
        });
        this.nextPipeX += this.pipeDist; this.pipeCount++;
    }

    // ══════════════════════════════════════════
    // UPDATE
    // ══════════════════════════════════════════
    update(dt) {
        if (this.paused) return;
        this.frame++;
        this.bgTime += dt * 0.001;

        const doSlow = !this.isMobile || (this.frame % 2 === 0);
        if (doSlow) this.stars.forEach(s => s.phase += s.speed);

        if (this.screenShake.timer > 0) {
            const f = this.screenShake.force * (this.screenShake.timer / 14) * (this.isMobile ? 0.5 : 1);
            this.screenShake.x = (Math.random()-0.5)*f;
            this.screenShake.y = (Math.random()-0.5)*f*0.35;
            this.screenShake.timer--;
        } else { this.screenShake.x = 0; this.screenShake.y = 0; }

        if (this.flashAlpha > 0) this.flashAlpha = Math.max(0, this.flashAlpha - 0.04);

        for (let i = this.rings.length - 1; i >= 0; i--) {
            const rg = this.rings[i]; rg.r += 3.2; rg.opacity -= 0.06;
            if (rg.opacity <= 0) this.rings.splice(i, 1);
        }

        if (doSlow) {
            const spd = dt / 16.67;
            this.clouds.forEach(c => { c.x -= c.speed * spd; if (c.x + c.w * 2 < 0) c.x = this.W + c.w; });
            this.bgLayers.forEach(b => { b.x -= b.speed * spd; if (b.x + b.w < 0) b.x = this.W + b.w; });
        }

        if (this.gameState === 'menu') {
            this.menuBirdT += dt * 0.002;
            this.menuBirdY  = this.H * 0.38 + Math.sin(this.menuBirdT * 1.4) * 14;
            this.updateParticles(); return;
        }

        if (this.gameState === 'dead') {
            this.deathTimer += dt;
            const groundTop = this.H - this.groundH - this.bird.r;
            if (this.bird.y < groundTop) {
                this.bird.vy       += this.bird.gravity * (dt/16.67);
                this.bird.y        += this.bird.vy * (dt/16.67);
                this.bird.rotation  = Math.min(Math.PI * 0.72, this.bird.rotation + 0.07);
                if (this.bird.y >= groundTop) { this.bird.y = groundTop; this.bird.vy = 0; }
            }
            this.updateParticles(); this.updateFloatTexts(); return;
        }

        // PLAYING
        const spd = dt / 16.67;
        this.bird.vy       += this.bird.gravity * spd;
        this.bird.y        += this.bird.vy * spd;
        this.bird.rotation  = Math.max(-0.4, Math.min(Math.PI * 0.38, this.bird.vy * 0.048));
        this.bird.pulseT   += dt * 0.005;
        this.bird.wingPhase += dt * 0.012;

        // Wing animation frame
        this.bird.frameT += dt;
        if (this.bird.flapAnim > 0) {
            this.bird.flapAnim = Math.max(0, this.bird.flapAnim - dt/130);
            // Frame: up → mid → down over flapAnim duration
            if (this.bird.flapAnim > 0.6)      this.bird.wingFrame = 0; // up
            else if (this.bird.flapAnim > 0.25) this.bird.wingFrame = 1; // mid
            else                                this.bird.wingFrame = 2; // down
        } else {
            // Idle glide — slow oscillation between mid and down
            const t = Math.sin(this.bird.wingPhase);
            this.bird.wingFrame = t > 0.3 ? 1 : 2;
        }

        // Squish recovery
        this.bird.squishX += (1 - this.bird.squishX) * 0.22;
        this.bird.squishY += (1 - this.bird.squishY) * 0.22;

        // Blink
        this.bird.blinkT += dt;
        if (this.bird.blinkT > 3500) this.bird.blinkT = 0;

        // Trail
        this.bird.trail.unshift({ x: this.bird.x, y: this.bird.y });
        if (this.bird.trail.length > (this.isMobile ? 4 : 10)) this.bird.trail.pop();

        // Ground scroll
        this.groundX = ((this.groundX - this.pipeSpeed * 1.5 * spd) % 40 + 40) % 40;

        // Pipes
        for (let i = this.pipes.length - 1; i >= 0; i--) {
            const p = this.pipes[i]; p.x -= this.pipeSpeed * spd;
            if (!p.scored && p.x + this.pipeW < this.bird.x - this.bird.r) {
                p.scored = true; this.score++;
                const isNewBest = this.score > this.bestScore;
                if (isNewBest) { this.bestScore = this.score; localStorage.setItem('flappy_best_v2', this.bestScore); this.playSound('best'); }
                else this.playSound('score');
                this.onScore(this.score);
                this.pipeSpeed = Math.min(5.5, 2.0 + this.score * 0.065);
                this.pipeGap   = Math.max(this.isMobile ? 118 : 130, (this.isMobile ? 160 : 178) - this.score * 2);
                this.pipeDist  = Math.max(this.isMobile ? 188 : 208, (this.isMobile ? 230 : 260) - this.score * 1.5);
                this.floatTexts.push({ x: this.W*0.5, y: 85, text: isNewBest ? '★ BEST!' : '+1', color: isNewBest ? '#00FF88' : '#FFD700', life: 45, maxLife: 45, vy: -0.85, scale: 0.4, opacity: 0 });
                this.rings.push({ x: this.bird.x, y: this.bird.y, r: 10, opacity: 0.55, color: '#FFD700' });
                if (!this.isMobile) this.spawnParticles(this.bird.x, this.bird.y, '#8D6E63', 5);
                if (this.score % 5 === 0) {
                    this.floatTexts.push({ x: this.W/2, y: this.H/2-55, text: `${this.score} ★`, color: '#00FF88', life: 68, maxLife: 68, vy: -0.5, scale: 0.3, opacity: 0 });
                    if (!this.isMobile) { this.screenShake.timer = 4; this.screenShake.force = 2.5; }
                }
            }
            if (p.x + this.pipeW < -20) this.pipes.splice(i, 1);
        }

        this.nextPipeX -= this.pipeSpeed * spd;
        if (this.nextPipeX <= this.W + this.pipeW) this.spawnPipe();

        if (this.bird.alive) this.checkCollisions();
        this.updateParticles(); this.updateFloatTexts();
    }

    // ══════════════════════════════════════════
    // COLLISION
    // ══════════════════════════════════════════
    checkCollisions() {
        const b = this.bird, cr = b.r * 0.68;
        if (b.y - cr < 0) { this.die(); return; }
        if (b.y + cr > this.H - this.groundH) { this.die(); return; }
        for (let i = 0; i < this.pipes.length; i++) {
            const p = this.pipes[i];
            if (b.x + cr < p.x || b.x - cr > p.x + this.pipeW) continue;
            if (this.circleRectCollide(b.x, b.y, cr, p.x, 0, p.x+this.pipeW, p.gapTop)) { this.die(); return; }
            if (this.circleRectCollide(b.x, b.y, cr, p.x, p.gapBot, p.x+this.pipeW, this.H-this.groundH)) { this.die(); return; }
        }
    }

    circleRectCollide(cx, cy, r, x1, y1, x2, y2) {
        const nearX = cx < x1 ? x1 : cx > x2 ? x2 : cx;
        const nearY = cy < y1 ? y1 : cy > y2 ? y2 : cy;
        return (cx-nearX)**2 + (cy-nearY)**2 < r*r;
    }

    die() {
        if (!this.bird.alive) return;
        this.bird.alive = false; this.gameState = 'dead'; this.deathTimer = 0;
        this.playSound('hit'); setTimeout(() => this.playSound('die'), 80);
        this.spawnParticles(this.bird.x, this.bird.y, '#8D6E63', this.isMobile ? 10 : 22, { spread: 5 });
        this.spawnParticles(this.bird.x, this.bird.y, '#A1887F', this.isMobile ? 6 : 12, { spread: 3.5 });
        this.spawnParticles(this.bird.x, this.bird.y, '#BCAAA4', this.isMobile ? 4 : 8,  { spread: 4 });
        this.flashAlpha = 0.38; this.flashColor = '#FFCC80';
        this.screenShake.timer = this.isMobile ? 7 : 18;
        this.screenShake.force = this.isMobile ? 5 : 10;
        this.floatTexts.push({ x: this.W/2, y: this.H/2-60, text: 'CRASH!', color: '#FF5722', life: 75, maxLife: 75, vy: -0.45, scale: 0.2, opacity: 0 });
        this.onScore(this.score, true);
    }

    updateParticles() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.97;
            p.life--; p.size *= 0.93;
            if (p.life <= 0 || p.size < 0.4) this.particles.splice(i, 1);
        }
    }

    updateFloatTexts() {
        for (let i = this.floatTexts.length - 1; i >= 0; i--) {
            const t = this.floatTexts[i]; t.y += t.vy; t.life--;
            t.opacity = t.life < 15 ? t.life/15 : (t.maxLife-t.life < 8 ? (t.maxLife-t.life)/8 : 1);
            t.scale += (1 - t.scale) * 0.18;
            if (t.life <= 0) this.floatTexts.splice(i, 1);
        }
    }

    spawnParticles(x, y, color, count, opts = {}) {
        const spread = opts.spread || 5, baseVY = opts.vy || 0;
        const c = Math.min(count, this.MAX_PARTICLES - this.particles.length);
        for (let i = 0; i < c; i++) {
            const a = Math.random()*Math.PI*2, sp = Math.random()*spread+1;
            this.particles.push({ x, y, vx: Math.cos(a)*sp, vy: Math.sin(a)*sp*0.5+baseVY, color, size: Math.random()*3+1.5, life: Math.floor(Math.random()*14+8) });
        }
    }

    // ══════════════════════════════════════════
    // DRAW — master renderer
    // ══════════════════════════════════════════
    draw(timestamp) {
        const ctx = this.ctx;
        ctx.fillStyle = '#87ceeb';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.save();
        if (this.screenShake.x || this.screenShake.y)
            ctx.translate(this.dS(this.screenShake.x), this.dS(this.screenShake.y));

        this.drawBackground(ctx);
        this.drawClouds(ctx);
        this.drawBgLayers(ctx);
        this.drawPipes(ctx);
        this.drawGround(ctx);
        this.drawRingsFX(ctx);

        if (this.gameState === 'menu') {
            this.drawMenuBird(ctx, timestamp);
            this.drawMenu(ctx);
        } else {
            if (!this.isMobile) this.drawBirdTrail(ctx);
            this.drawBird(ctx);
            this.drawParticles(ctx);
            this.drawFloatTexts(ctx);
        }

        if (this.flashAlpha > 0) {
            ctx.fillStyle = this.hexToRgba(this.flashColor, this.flashAlpha);
            ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }

        if (this.gameState === 'playing') this.drawHUD(ctx);
        if (this.gameState === 'dead') {
            this.drawParticles(ctx);
            this.drawFloatTexts(ctx);
            this.drawDeathScreen(ctx);
        }

        ctx.restore();
    }

    // ══════════════════════════════════════════
    // BACKGROUND — day sky
    // ══════════════════════════════════════════
    drawBackground(ctx) {
        const sizeKey = this.W + 'x' + this.H;
        if (this._builtFor !== sizeKey) this._buildStaticGradients();

        ctx.fillStyle = this.skyGrad;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Sun
        const sunX = this.W * 0.78, sunY = this.H * 0.1;
        const sunR  = this.isMobile ? 22 : 30;
        const sunG  = ctx.createRadialGradient(this.dX(sunX), this.dY(sunY), this.dS(2), this.dX(sunX), this.dY(sunY), this.dS(sunR*2.2));
        sunG.addColorStop(0,   'rgba(255,255,220,0.98)');
        sunG.addColorStop(0.3, 'rgba(255,240,150,0.7)');
        sunG.addColorStop(0.65, 'rgba(255,220,80,0.25)');
        sunG.addColorStop(1,   'rgba(255,200,50,0)');
        ctx.fillStyle = sunG;
        ctx.beginPath();
        ctx.arc(this.dX(sunX), this.dY(sunY), this.dS(sunR*2.2), 0, Math.PI*2);
        ctx.fill();

        // Sun disc
        ctx.fillStyle = '#FFFDE7';
        ctx.beginPath();
        ctx.arc(this.dX(sunX), this.dY(sunY), this.dS(sunR), 0, Math.PI*2);
        ctx.fill();

        ctx.fillStyle = this.vigGrad;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // ══════════════════════════════════════════
    // CLOUDS — fluffy white real clouds
    // ══════════════════════════════════════════
    drawClouds(ctx) {
        this.clouds.forEach(c => {
            ctx.save();
            ctx.globalAlpha = c.alpha;

            const cx = this.dX(c.x);
            const cy = this.dY(c.y);
            const ew = this.dS(c.w);
            const eh = this.dS(c.h);

            // Shadow
            ctx.fillStyle = 'rgba(180,210,240,0.35)';
            ctx.beginPath();
            ctx.ellipse(cx + this.dS(4), cy + this.dS(6), ew*0.55, eh*0.55, 0, 0, Math.PI*2);
            ctx.fill();

            // Cloud puffs
            const puffX = [-0.28, 0, 0.28, 0.5];
            const puffY = [0.12,  0, 0.08, 0.18];
            const puffR = [0.38,  0.52, 0.42, 0.3];

            for (let i = 0; i < c.puffs + 1; i++) {
                const px = puffX[i] || 0;
                const py = puffY[i] || 0;
                const pr = puffR[i] || 0.4;
                ctx.fillStyle = '#FFFFFF';
                ctx.beginPath();
                ctx.ellipse(cx + ew*px, cy + eh*py, ew*pr, eh*0.72, 0, 0, Math.PI*2);
                ctx.fill();
            }

            // Top highlight
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.ellipse(cx, cy - eh*0.08, ew*0.38, eh*0.35, 0, 0, Math.PI*2);
            ctx.fill();

            ctx.restore();
        });
    }

    // ══════════════════════════════════════════
    // BG LAYERS — trees / bushes silhouette
    // ══════════════════════════════════════════
    drawBgLayers(ctx) {
        this.bgLayers.forEach(b => {
            ctx.fillStyle = b.color;
            if (b.type === 'tree') {
                // Triangle tree
                const tx = this.dX(b.x + b.w/2);
                const ty = this.dY(b.baseY);
                ctx.beginPath();
                ctx.moveTo(tx, ty);
                ctx.lineTo(tx - this.dS(b.w*0.6), ty);
                ctx.lineTo(tx, ty - this.dS(b.h));
                ctx.closePath(); ctx.fill();
                // Trunk
                ctx.fillStyle = 'rgba(60,30,10,0.12)';
                ctx.fillRect(tx - this.dSr(b.w*0.08), ty - this.dSr(b.h*0.18), this.dSr(b.w*0.16), this.dSr(b.h*0.2));
            } else {
                // Bush — 2 overlapping ellipses
                ctx.beginPath();
                ctx.ellipse(this.dX(b.x + b.w*0.38), this.dY(b.baseY - b.h*0.45), this.dS(b.w*0.55), this.dS(b.h*0.5), 0, 0, Math.PI*2);
                ctx.fill();
                ctx.beginPath();
                ctx.ellipse(this.dX(b.x + b.w*0.7), this.dY(b.baseY - b.h*0.35), this.dS(b.w*0.42), this.dS(b.h*0.4), 0, 0, Math.PI*2);
                ctx.fill();
            }
        });
    }

    // ══════════════════════════════════════════
    // PIPES — green with rim
    // ══════════════════════════════════════════
    drawPipes(ctx) {
        for (let i = 0; i < this.pipes.length; i++) {
            const p = this.pipes[i];
            if (p.gapTop > 2) this._drawPipeFast(ctx, p.x, 0, this.pipeW, p.gapTop, p.theme, true);
            if (p.botH > 2)   this._drawPipeFast(ctx, p.x, p.gapBot, this.pipeW, p.botH, p.theme, false);
        }
    }

    _drawPipeFast(ctx, px, py, pw, ph, theme, isTop) {
        if (ph < 2) return;
        const cached = this._buildPipeCanvas(theme, pw);
        const { capH, capExt } = cached;
        const capY = isTop ? py + ph - capH : py;

        const bx = this.dX(px), by = this.dY(py);
        const bw = this.dSr(pw), bh = this.dSr(ph);

        // Body
        ctx.drawImage(cached.body, bx, by, bw, bh);

        // Shine stripe
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.fillRect(bx + ((bw*0.2)|0), by, (bw*0.12)|0, bh);

        // Cap
        ctx.drawImage(cached.cap, this.dX(px - capExt), this.dY(capY), this.dSr(pw + capExt*2), this.dSr(capH));

        // Pipe edge outline
        ctx.strokeStyle = this.hexToRgba(theme.dark, 0.55);
        ctx.lineWidth   = this.dS(1.2);
        ctx.strokeRect(bx, by, bw, bh);

        // Glow (desktop only)
        if (!this.isMobile) {
            ctx.strokeStyle = this.hexToRgba(theme.glow, 0.18);
            ctx.lineWidth   = this.dS(2);
            ctx.shadowBlur  = this.dS(5);
            ctx.shadowColor = theme.glow;
            ctx.strokeRect(bx, by, bw, bh);
            ctx.shadowBlur  = 0;
        }
    }

    // ══════════════════════════════════════════
    // GROUND — grass + dirt
    // ══════════════════════════════════════════
    drawGround(ctx) {
        const W = this.W, H = this.H, gh = this.groundH, gy = H - gh;

        // Dirt base
        ctx.fillStyle = this.groundGrad;
        ctx.fillRect(0, this.dY(gy), this.canvas.width, this.dSr(gh));

        // Grass top strip
        ctx.fillStyle = '#8BC34A';
        ctx.fillRect(0, this.dY(gy), this.canvas.width, this.dSr(gh * 0.22));

        // Grass line
        ctx.strokeStyle = '#558B2F';
        ctx.lineWidth   = this.dS(1.5);
        ctx.beginPath();
        ctx.moveTo(0, this.dY(gy + gh*0.22));
        ctx.lineTo(this.canvas.width, this.dY(gy + gh*0.22));
        ctx.stroke();

        // Moving grass tufts
        if (!this.isMobile || this.frame % 2 === 0) {
            const tW = 32;
            const off = this.groundX % tW;
            ctx.fillStyle = '#7CB342';
            for (let x = -tW + off; x < W + tW * 2; x += tW) {
                // Tuft shape — 3 small triangles
                for (let j = 0; j < 3; j++) {
                    const tx = x + j*10 - 5;
                    const th = 5 + Math.sin(tx * 0.3 + this.bgTime) * 2;
                    ctx.beginPath();
                    ctx.moveTo(this.dX(tx - 3), this.dY(gy));
                    ctx.lineTo(this.dX(tx), this.dY(gy - th));
                    ctx.lineTo(this.dX(tx + 3), this.dY(gy));
                    ctx.closePath(); ctx.fill();
                }
            }
        }

        // Dirt texture lines
        if (!this.isMobile) {
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = '#33691E';
            ctx.lineWidth   = this.dS(0.6);
            const tW = 38, off2 = this.groundX % tW;
            for (let x = -tW + off2; x < W + tW; x += tW) {
                ctx.beginPath();
                ctx.moveTo(this.dX(x), this.dY(gy + gh*0.25));
                ctx.lineTo(this.dX(x), this.dY(H));
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
    }

    // ══════════════════════════════════════════
    // RINGS FX
    // ══════════════════════════════════════════
    drawRingsFX(ctx) {
        if (!this.rings.length) return;
        this.rings.forEach(rg => {
            ctx.globalAlpha = rg.opacity;
            ctx.strokeStyle = rg.color;
            ctx.lineWidth   = this.dS(1.5 * rg.opacity + 0.5);
            ctx.beginPath();
            ctx.arc(this.dX(rg.x), this.dY(rg.y), this.dS(rg.r), 0, Math.PI*2);
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════
    // BIRD TRAIL
    // ══════════════════════════════════════════
    drawBirdTrail(ctx) {
        const trail = this.bird.trail, len = trail.length;
        for (let i = 0; i < len; i++) {
            const pt = trail[i];
            const alpha = (1 - i/len) * 0.16;
            const r     = this.bird.r * (1 - i/len) * 0.4;
            if (r < 0.5 || alpha < 0.02) continue;
            ctx.globalAlpha = alpha;
            ctx.fillStyle   = '#A1887F';
            ctx.beginPath();
            ctx.arc(this.dX(pt.x), this.dY(pt.y), Math.max(0.5, this.dS(r)), 0, Math.PI*2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ══════════════════════════════════════════
    // DRAW BIRD — real sparrow sprite
    // ══════════════════════════════════════════
    _drawBirdAt(ctx, bx, by, rot, wingFrame, squishX, squishY) {
        const sz = this.birdSpriteSize;
        const frameNames = ['up', 'mid', 'down'];
        const sprite = this.birdSprites[frameNames[wingFrame] || 'mid'];
        if (!sprite) return;

        ctx.save();
        ctx.translate(this.dX(bx), this.dY(by));
        ctx.rotate(rot || 0);
        ctx.scale(squishX || 1, squishY || 1);

        // Soft aura (desktop)
        if (!this.isMobile) {
            const aura = ctx.createRadialGradient(0, 0, this.dS(this.bird.r*0.4), 0, 0, this.dS(this.bird.r*1.8));
            aura.addColorStop(0, 'rgba(180,140,100,0.1)');
            aura.addColorStop(1, 'rgba(180,140,100,0)');
            ctx.fillStyle = aura;
            ctx.beginPath();
            ctx.arc(0, 0, this.dS(this.bird.r*1.8), 0, Math.PI*2);
            ctx.fill();
        }

        // Draw sprite centered
        ctx.drawImage(sprite, -sz/2, -sz/2, sz, sz);

        ctx.restore();
    }

    drawBird(ctx) {
        const b = this.bird;
        this._drawBirdAt(ctx, b.x, b.y, b.rotation, b.wingFrame, b.squishX, b.squishY);
    }

    drawMenuBird(ctx, timestamp) {
        const t   = this.menuBirdT;
        const rot = Math.sin(t * 1.4) * 0.08;
        // Wing animates on menu too
        const wf  = Math.sin(t * 3.5) > 0.2 ? 0 : (Math.sin(t * 3.5) > -0.3 ? 1 : 2);
        this._drawBirdAt(ctx, this.W*0.5, this.menuBirdY, rot, wf, 1, 1);
    }

    // ══════════════════════════════════════════
    // HD TEXT ENGINE
    // ══════════════════════════════════════════
    drawText(ctx, text, x, y, opts = {}) {
        const {
            size     = 14,
            weight   = 'bold',
            color    = '#fff',
            align    = 'left',
            baseline = 'middle',
            family   = null,
            glow     = false,
            glowColor = null,
            glowBlur  = 0,
            stroke    = false,
            strokeColor = 'rgba(0,0,0,0.88)',
            strokeWidth = 3,
            opacity   = 1,
            shadow    = false,
            shadowColor = 'rgba(0,0,0,0.5)',
            shadowBlur  = 0,
            shadowOffX  = 0,
            shadowOffY  = 1,
        } = opts;

        if (opacity <= 0) return;

        ctx.save();
        ctx.globalAlpha  = Math.min(1, opacity);
        ctx.textAlign    = align;
        ctx.textBaseline = baseline;

        // ✅ HD: font size * DPR
        const fs = Math.round(size * this.dpr);
        ctx.font = `${weight} ${fs}px ${family || this.FONT_UI}`;

        const px = this.dX(x);
        const py = this.dY(y);

        // Shadow
        if (shadow && shadowBlur > 0) {
            ctx.shadowColor   = shadowColor;
            ctx.shadowBlur    = shadowBlur * this.dpr;
            ctx.shadowOffsetX = shadowOffX * this.dpr;
            ctx.shadowOffsetY = shadowOffY * this.dpr;
        }

        // Glow
        if (glow && glowBlur > 0 && !this.isMobile) {
            ctx.shadowBlur  = glowBlur * this.dpr;
            ctx.shadowColor = glowColor || color;
        }

        // Stroke (outline)
        if (stroke) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth   = strokeWidth * this.dpr;
            ctx.lineJoin    = 'round';
            ctx.strokeText(text, px, py);
        }

        // Fill
        ctx.shadowBlur = 0;
        ctx.fillStyle  = color;
        ctx.fillText(text, px, py);

        ctx.restore();
    }

    drawRoundRect(ctx, x, y, w, h, r) {
        const dx = this.dX(x), dy = this.dY(y);
        const dw = this.dSr(w), dh = this.dSr(h), dr = this.dS(r);
        ctx.beginPath();
        ctx.moveTo(dx+dr, dy);
        ctx.arcTo(dx+dw, dy,      dx+dw, dy+dh, dr);
        ctx.arcTo(dx+dw, dy+dh,   dx,    dy+dh, dr);
        ctx.arcTo(dx,    dy+dh,   dx,    dy,    dr);
        ctx.arcTo(dx,    dy,      dx+dw, dy,    dr);
        ctx.closePath();
    }

    // ══════════════════════════════════════════
    // HUD
    // ══════════════════════════════════════════
    drawHUD(ctx) {
        const W = this.W;

        // ── Score — center top ──
        this.drawText(ctx, String(this.score), W/2, 44, {
            size: 30, weight: '900',
            color: '#FFFFFF',
            align: 'center', baseline: 'middle',
            family: this.FONT_TITLE,
            stroke: true, strokeColor: 'rgba(0,0,0,0.7)', strokeWidth: 4,
            shadow: true, shadowColor: 'rgba(0,0,0,0.4)', shadowBlur: 6, shadowOffY: 2,
            glow: !this.isMobile, glowColor: '#FFD700', glowBlur: 8,
        });

        // ── Best — top right ──
        this.drawText(ctx, `BEST: ${this.bestScore}`, W - 10, 15, {
            size: 10, weight: '700',
            color: 'rgba(255,220,50,0.72)',
            align: 'right', baseline: 'middle',
            family: this.FONT_UI,
        });

        // ── Speed indicator — top left ──
        const sc = Math.min(1, (this.pipeSpeed - 2.0) / 3.5);
        const speedCol = sc < 0.35 ? '#4CAF50' : sc < 0.7 ? '#FFC107' : '#F44336';
        this.drawText(ctx, `${this.pipeSpeed.toFixed(1)}x`, 10, 15, {
            size: 10, weight: '700',
            color: speedCol,
            align: 'left', baseline: 'middle',
            family: this.FONT_UI,
        });

        // ── Sound icon — top right below best ──
        this.drawText(ctx, this.soundEnabled ? '🔊' : '🔇', W - 10, 34, {
            size: 9, align: 'right', baseline: 'middle',
        });
    }

    // ══════════════════════════════════════════
    // MENU
    // ══════════════════════════════════════════
    drawMenu(ctx) {
        const W = this.W, H = this.H, t = this.bgTime;

        // ── Title card ──
        const cw = Math.min(W - 28, 300);
        const ch = 102;
        const cx = W / 2;
        const cy = H * 0.14;

        // Card shadow
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        this.drawRoundRect(ctx, cx - cw/2 + 3, cy + 3, cw, ch, 16); ctx.fill();

        // Card bg
        ctx.fillStyle = 'rgba(10,40,10,0.88)';
        this.drawRoundRect(ctx, cx - cw/2, cy, cw, ch, 16); ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(100,200,80,0.45)';
        ctx.lineWidth   = this.dS(1.5);
        this.drawRoundRect(ctx, cx - cw/2, cy, cw, ch, 16); ctx.stroke();

        // Top accent
        ctx.fillStyle = 'rgba(100,200,80,0.5)';
        ctx.fillRect(this.dX(cx - cw/2), this.dY(cy), this.dSr(cw), this.dS(2.5));

        // Title
        this.drawText(ctx, 'FLAPPY', cx, cy + 30, {
            size: 26, weight: '900',
            color: '#FFEE58',
            align: 'center', baseline: 'middle',
            family: this.FONT_TITLE,
            stroke: true, strokeColor: 'rgba(0,0,0,0.85)', strokeWidth: 4,
            glow: !this.isMobile, glowColor: '#FFD700', glowBlur: 10,
        });
        this.drawText(ctx, 'BIRD', cx, cy + 62, {
            size: 20, weight: '900',
            color: '#8BC34A',
            align: 'center', baseline: 'middle',
            family: this.FONT_TITLE,
            stroke: true, strokeColor: 'rgba(0,0,0,0.85)', strokeWidth: 3,
            glow: !this.isMobile, glowColor: '#4CAF50', glowBlur: 8,
        });
        this.drawText(ctx, 'REAL WORLD EDITION', cx, cy + 88, {
            size: 8, weight: '600',
            color: 'rgba(200,230,180,0.38)',
            align: 'center', baseline: 'middle',
            family: this.FONT_UI,
        });

        // Best score
        if (this.bestScore > 0) {
            this.drawText(ctx, `BEST: ${this.bestScore}`, cx, H * 0.60, {
                size: 14, weight: '800',
                color: '#FFD700',
                align: 'center', baseline: 'middle',
                family: this.FONT_TITLE,
                glow: !this.isMobile, glowColor: '#FFD700', glowBlur: 6,
                stroke: true, strokeColor: 'rgba(0,0,0,0.7)', strokeWidth: 2,
            });
        }

        // Tap to play
        const pulse = 0.62 + Math.sin(t * 2.8) * 0.32;
        this.drawText(ctx, '▶  TAP  TO  FLY', cx, H * 0.70, {
            size: 13, weight: '800',
            color: '#00E676',
            align: 'center', baseline: 'middle',
            family: this.FONT_TITLE,
            glow: !this.isMobile, glowColor: '#00E676', glowBlur: 6,
            opacity: pulse,
        });

        this.drawText(ctx, 'SPACE / CLICK / TAP', cx, H * 0.76, {
            size: 9, weight: '500',
            color: 'rgba(180,220,160,0.3)',
            align: 'center', baseline: 'middle',
            family: this.FONT_UI,
        });

        // Sound button
        const btnX = W - 40, btnY = 12;
        ctx.fillStyle   = this.soundEnabled ? 'rgba(100,200,80,0.18)' : 'rgba(255,0,80,0.18)';
        this.drawRoundRect(ctx, btnX, btnY, 30, 24, 6); ctx.fill();
        ctx.strokeStyle = this.soundEnabled ? 'rgba(100,200,80,0.5)' : 'rgba(255,0,80,0.5)';
        ctx.lineWidth   = this.dS(1);
        this.drawRoundRect(ctx, btnX, btnY, 30, 24, 6); ctx.stroke();
        this.drawText(ctx, this.soundEnabled ? '🔊' : '🔇', btnX + 15, btnY + 12, {
            size: 10, align: 'center', baseline: 'middle',
        });

        // Tips
        const tips = ['Tap to flap wings', 'Fly through the gaps', "Don't touch the pipes!"];
        tips.forEach((tip, i) => {
            this.drawText(ctx, tip, cx, H * 0.83 + i * 17, {
                size: 9, weight: '500',
                color: 'rgba(180,220,160,0.35)',
                align: 'center', baseline: 'middle',
                family: this.FONT_UI,
            });
        });
    }

    // ══════════════════════════════════════════
    // PARTICLES & FLOAT TEXTS
    // ══════════════════════════════════════════
    drawParticles(ctx) {
        if (!this.particles.length) return;
        this.particles.forEach(p => {
            ctx.globalAlpha = Math.min(1, p.life/10);
            ctx.fillStyle   = p.color;
            ctx.beginPath();
            ctx.arc(this.dX(p.x), this.dY(p.y), Math.max(0.5, this.dS(p.size)), 0, Math.PI*2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    drawFloatTexts(ctx) {
        this.floatTexts.forEach(t => {
            const sc = Math.min(1, t.scale);
            this.drawText(ctx, t.text, t.x, t.y, {
                size: 12 * sc, weight: '900',
                color: t.color,
                align: 'center', baseline: 'middle',
                opacity: t.opacity,
                family: this.FONT_TITLE,
                stroke: true, strokeColor: 'rgba(0,0,0,0.65)', strokeWidth: 2,
                glow: !this.isMobile, glowColor: t.color, glowBlur: 6,
            });
        });
    }

    // ══════════════════════════════════════════
    // DEATH SCREEN
    // ══════════════════════════════════════════
    drawDeathScreen(ctx) {
        const W = this.W, H = this.H;
        const elapsed = this.deathTimer;
        const alpha   = Math.min(1, elapsed / 400);

        ctx.fillStyle = `rgba(0,0,0,${(alpha * 0.6).toFixed(2)})`;
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        if (alpha < 0.25) return;

        const cA = Math.min(1, (alpha - 0.25) / 0.75);
        const cx  = W / 2;

        // Panel
        const pw = Math.min(W - 28, 285);
        const ph = 235;
        const px = cx - pw/2, py = H/2 - ph/2;

        ctx.globalAlpha = cA * 0.95;
        ctx.fillStyle   = 'rgba(8,25,8,0.96)';
        this.drawRoundRect(ctx, px, py, pw, ph, 18); ctx.fill();

        // Green border
        ctx.strokeStyle = 'rgba(100,200,80,0.32)';
        ctx.lineWidth   = this.dS(1.5);
        this.drawRoundRect(ctx, px, py, pw, ph, 18); ctx.stroke();

        // Top accent
        ctx.fillStyle = 'rgba(100,200,80,0.22)';
        ctx.fillRect(this.dX(px), this.dY(py), this.dSr(pw), this.dS(3));

        ctx.globalAlpha = 1;

        // Title
        this.drawText(ctx, 'GAME OVER', cx, py + 36, {
            size: 22, weight: '900',
            color: '#FF5722',
            align: 'center', baseline: 'middle',
            family: this.FONT_TITLE,
            glow: !this.isMobile, glowColor: '#FF5722', glowBlur: 10,
            stroke: true, strokeColor: 'rgba(0,0,0,0.8)', strokeWidth: 3,
            opacity: cA,
        });

        // Score label
        this.drawText(ctx, 'SCORE', cx, py + 66, {
            size: 9, weight: '600',
            color: 'rgba(180,220,160,0.5)',
            align: 'center', baseline: 'middle',
            family: this.FONT_UI, opacity: cA,
        });

        // Score number
        this.drawText(ctx, String(this.score), cx, py + 102, {
            size: 36, weight: '900',
            color: '#FFFFFF',
            align: 'center', baseline: 'middle',
            family: this.FONT_TITLE,
            stroke: true, strokeColor: 'rgba(0,0,0,0.65)', strokeWidth: 5,
            glow: !this.isMobile, glowColor: '#FFD700', glowBlur: 8,
            opacity: cA,
        });

        // Best
        this.drawText(ctx, `BEST:  ${this.bestScore}`, cx, py + 140, {
            size: 13, weight: '800',
            color: '#FFD700',
            align: 'center', baseline: 'middle',
            family: this.FONT_TITLE,
            glow: !this.isMobile, glowColor: '#FFD700', glowBlur: 5,
            opacity: cA,
        });

        // New best badge
        if (this.score > 0 && this.score >= this.bestScore) {
            this.drawText(ctx, '★  NEW BEST!  ★', cx, py + 168, {
                size: 11, weight: '900',
                color: '#00E676',
                align: 'center', baseline: 'middle',
                family: this.FONT_TITLE,
                glow: !this.isMobile, glowColor: '#00E676', glowBlur: 6,
                opacity: cA,
            });
        }

        // Divider
        ctx.globalAlpha = 0.1 * cA;
        ctx.fillStyle   = '#fff';
        ctx.fillRect(this.dX(px + 22), this.dY(py + ph - 50), this.dSr(pw - 44), this.dS(1));
        ctx.globalAlpha = 1;

        // Tap to retry
        if (elapsed > 700) {
            const blink = 0.5 + Math.sin(elapsed / 280) * 0.45;
            this.drawText(ctx, '▶  TAP TO RESTART', cx, py + ph - 22, {
                size: 12, weight: '800',
                color: '#00E676',
                align: 'center', baseline: 'middle',
                family: this.FONT_TITLE,
                glow: !this.isMobile, glowColor: '#00E676', glowBlur: 6,
                opacity: cA * blink,
            });
        } else {
            this.drawText(ctx, 'Wait...', cx, py + ph - 22, {
                size: 9,
                color: 'rgba(160,200,140,0.22)',
                align: 'center', baseline: 'middle',
                family: this.FONT_UI, opacity: cA,
            });
        }
    }

    // ══════════════════════════════════════════
    // PARTICLES
    // ══════════════════════════════════════════

    // ══════════════════════════════════════════
    // MAIN LOOP
    // ══════════════════════════════════════════
    loop(timestamp) {
        if (this.destroyed) return;
        const dt = Math.min(timestamp - (this.lastTime || timestamp), 50);
        this.lastTime = timestamp;

        if (!this.paused) this.update(dt);

        // Adaptive FPS for mobile
        if (this.isMobile) {
            this.fpsHistory.push(dt);
            if (this.fpsHistory.length > 30) this.fpsHistory.shift();
            if (this.fpsHistory.length === 30) {
                const avg = this.fpsHistory.reduce((a,b) => a+b, 0) / 30;
                this.adaptiveMode = avg > 28;
            }
            if (this.adaptiveMode && (this.frame % 2 === 1)) {
                this.animId = requestAnimationFrame(t => this.loop(t)); return;
            }
        }

        this.draw(timestamp);
        this.animId = requestAnimationFrame(t => this.loop(t));
    }

    togglePause() {
        this.paused = !this.paused;
        if (!this.paused) this.lastTime = performance.now();
        return this.paused;
    }

    toggleSound() {
        this.soundEnabled = !this.soundEnabled;
        return this.soundEnabled;
    }

    resize() {
        this.isMobile = ('ontouchstart' in window) || window.innerWidth < 768;
        this.dpr      = Math.min(window.devicePixelRatio || 1, this.isMobile ? 2 : 2.5);
        this.setupHDCanvas();
        this.W = this.canvas.width  / this.dpr;
        this.H = this.canvas.height / this.dpr;
        this.bird.x   = this.W * 0.25;
        this.groundH  = this.isMobile ? 55 : 68;
        this.stars    = this.makeStars(this.isMobile ? 25 : 70);
        this.clouds   = this.makeClouds();
        this.bgLayers = this.makeBgLayers();
        this.pipeCache    = {};
        this.colorCache   = {};
        this.birdSprites  = {};
        this._buildStaticGradients();
        this._buildBirdSprites();
    }

    destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.animId);
        this.canvas.removeEventListener('click',      this.boundClick);
        this.canvas.removeEventListener('touchstart', this.boundTouch);
        document.removeEventListener('keydown',       this.boundKey);
        if (this.audioCtx) { this.audioCtx.close(); this.audioCtx = null; }
        this.pipeCache   = {};
        this.colorCache  = {};
        this.birdSprites = {};
    }
}