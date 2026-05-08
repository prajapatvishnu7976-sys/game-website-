/* ============================================================
   BOTTLE SHOOTING v4.1 - CINEMATIC GLASS RANGE + FIXED AUDIO
   File: C:\Users\praja\neonarcade\js\games\bottle-shooting.js
   ============================================================ */

'use strict';

class BottleShooting {
    constructor(canvas, onScore, options = {}) {
        this.canvas   = canvas;
        this.onScore  = onScore;
        this.options  = options;
        this.destroyed = false;
        this.paused    = false;
        this.gameOver  = false;
        this.isPaused  = false;

        // ── HD CANVAS ──
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.setupHDCanvas();
        this.ctx = this.canvas.getContext('2d');
        this.W = this.canvas.width  / this.dpr;
        this.H = this.canvas.height / this.dpr;
        this.ctx.scale(this.dpr, this.dpr);

        // ── MOBILE DETECT ──
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
            || ('ontouchstart' in window)
            || (window.innerWidth < 768);

        // ── CONSTANTS ──
        this.TAU      = Math.PI * 2;
        this.MAX_TIME = 60;
        this.MAX_AMMO = 6;
        this.MAX_PARTICLES = this.isMobile ? 100 : 200;

        // ── FONTS ──
        this.FONT_TITLE = '"Cinzel", "Georgia", serif';
        this.FONT_UI    = '"Manrope", "Segoe UI", Arial, sans-serif';

        // ── PALETTES ──
        this.PALETTES = {
            emerald: { top:'#baf2da', mid:'#52b98f', bottom:'#123f38', liquid:'#258d6c', label:'rgba(255,242,220,.20)', glow:'125,245,210' },
            cyan:    { top:'#aeddff', mid:'#67b7ff', bottom:'#123d63', liquid:'#3189c5', label:'rgba(255,244,228,.18)', glow:'155,215,255' },
            amber:   { top:'#f7d4a0', mid:'#e0963b', bottom:'#734316', liquid:'#c96d1b', label:'rgba(255,241,216,.18)', glow:'255,205,145' },
            gold:    { top:'#fff0b9', mid:'#ffd35b', bottom:'#936419', liquid:'#ffbc2e', label:'rgba(255,249,224,.22)', glow:'255,223,125' },
            nitro:   { top:'#ffb4a8', mid:'#ff6542', bottom:'#6b170e', liquid:'#db2c17', label:'rgba(50,8,8,.34)',      glow:'255,116,95'  }
        };

        // ── GAME STATE ──
        this.STATE = { WAITING:0, PLAYING:1, DEAD:2 };
        this.state = this.STATE.WAITING;

        this.score         = 0;
        this.bestScore     = parseInt(localStorage.getItem('bottleshoot_cinematic_best') || '0');
        this.timeLeft      = this.MAX_TIME;
        this.ammo          = this.MAX_AMMO;
        this.reloading     = false;
        this.reloadTimer   = 0;
        this.combo         = 0;
        this.bestCombo     = 0;
        this.totalShots    = 0;
        this.totalHits     = 0;
        this.bottlesBroken = 0;
        this.spawnTimer    = 0.35;
        this.lastHitTime   = -10;
        this.gameClock     = 0;
        this.lastWholeSecond = this.MAX_TIME;

        // ── CROSSHAIR ──
        this.crosshair = {
            x: this.W / 2, y: this.H / 2,
            targetX: this.W / 2, targetY: this.H / 2,
            pulse: 0, spread: 0
        };

        // ── FX STATE ──
        this.cameraShake       = 0;
        this.crossPulse        = 0;
        this.flash             = 0;
        this.flashColor        = '#fff';
        this.deathOverlayAlpha = 0;

        // ── OBJECT POOLS ──
        this.bottles       = [];
        this.particles     = [];
        this.glassShards   = [];
        this.splashes      = [];
        this.floatingTexts = [];
        this.scorePopups   = [];
        this.shellCasings  = [];
        this.bulletTrails  = [];
        this.dust          = [];
        this.idleBottles   = [];
        this.stars         = [];
        this.clouds        = [];
        this.mountains     = [];
        this.lanes         = [];
        this.planks        = [];

        // ── TIMING ──
        this.time         = 0;
        this.frame        = 0;
        this.ambientClock = 0;
        this.lastTime     = 0;

        // ── AUDIO (FIX: properly initialized) ──
        this.audioCtx    = null;
        this.masterGain  = null;
        this.audioReady  = false;
        this._pendingSounds = [];

        // ── FULLSCREEN ──
        this.fsBtn = null;
        this.createFullscreenButton();

        // ── INIT ──
        this.buildAll();
        this.bindEvents();

        this.animId = requestAnimationFrame(t => this.loop(t));
    }

    // ════════════════════════════════════════════════
    //  HELPERS
    // ════════════════════════════════════════════════
    clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
    rand(mn, mx)     { return mn + Math.random() * (mx - mn); }
    pick(arr)        { return arr[(Math.random() * arr.length) | 0]; }
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // ════════════════════════════════════════════════
    //  HD CANVAS
    // ════════════════════════════════════════════════
    setupHDCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const w = rect.width  || this.canvas.clientWidth  || 400;
        const h = rect.height || this.canvas.clientHeight || 700;
        this.canvas.width  = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
    }

    // ════════════════════════════════════════════════
    //  FULLSCREEN BUTTON
    // ════════════════════════════════════════════════
    createFullscreenButton() {
        const existing = document.getElementById('bottleShooterFsBtn');
        if (existing) existing.remove();

        this.fsBtn = document.createElement('button');
        this.fsBtn.id = 'bottleShooterFsBtn';
        this.fsBtn.title = 'Fullscreen';
        this.fsBtn.setAttribute('aria-label', 'Toggle fullscreen');

        Object.assign(this.fsBtn.style, {
            position:'fixed', bottom:'18px', right:'18px', zIndex:'9999',
            width:'44px', height:'44px', border:'none', borderRadius:'12px',
            background:'rgba(10,8,14,0.72)',
            backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)',
            boxShadow:'0 4px 18px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.1)',
            cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'center', padding:'0',
            transition:'background .2s, transform .15s, box-shadow .2s'
        });

        this.fsBtn.innerHTML = this._fsExpandSVG();
        document.body.appendChild(this.fsBtn);

        this.fsBtn.addEventListener('mouseenter', () => {
            this.fsBtn.style.background  = 'rgba(24,18,30,0.88)';
            this.fsBtn.style.transform   = 'scale(1.08)';
            this.fsBtn.style.boxShadow   = '0 6px 22px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,210,120,0.22)';
        });
        this.fsBtn.addEventListener('mouseleave', () => {
            this.fsBtn.style.background  = 'rgba(10,8,14,0.72)';
            this.fsBtn.style.transform   = 'scale(1)';
            this.fsBtn.style.boxShadow   = '0 4px 18px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.1)';
        });

        this._boundFsClick  = () => this._toggleFullscreen();
        this._boundFsChange = () => this._updateFsIcon();

        this.fsBtn.addEventListener('click', this._boundFsClick);
        document.addEventListener('fullscreenchange',       this._boundFsChange);
        document.addEventListener('webkitfullscreenchange', this._boundFsChange);
    }

    _fsExpandSVG() {
        return `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:#ffd27c;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;">
            <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`;
    }
    _fsCollapseSVG() {
        return `<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:none;stroke:#ffd27c;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;">
            <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
            <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/></svg>`;
    }
    _isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    _updateFsIcon() { if (this.fsBtn) this.fsBtn.innerHTML = this._isFullscreen() ? this._fsCollapseSVG() : this._fsExpandSVG(); }
    _toggleFullscreen() {
        const el = document.documentElement;
        if (!this._isFullscreen()) {
            (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen).call(el);
        } else {
            (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen).call(document);
        }
    }

    // ════════════════════════════════════════════════
    //  AUDIO SYSTEM - FULLY FIXED
    // ════════════════════════════════════════════════

    // Step 1: Create AudioContext on first user interaction
    initAudio() {
        if (this.audioCtx) {
            // Resume if suspended (browser policy)
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().then(() => {
                    this.audioReady = true;
                    this._flushPendingSounds();
                });
            }
            return;
        }

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;

            this.audioCtx = new AudioCtx();

            // Master gain
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.setValueAtTime(0.28, this.audioCtx.currentTime);
            this.masterGain.connect(this.audioCtx.destination);

            // Compressor to prevent clipping
            this.compressor = this.audioCtx.createDynamicsCompressor();
            this.compressor.threshold.setValueAtTime(-18, this.audioCtx.currentTime);
            this.compressor.knee.setValueAtTime(8, this.audioCtx.currentTime);
            this.compressor.ratio.setValueAtTime(4, this.audioCtx.currentTime);
            this.compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
            this.compressor.release.setValueAtTime(0.15, this.audioCtx.currentTime);
            this.compressor.connect(this.masterGain);

            // Resume if needed
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume().then(() => {
                    this.audioReady = true;
                    this._flushPendingSounds();
                });
            } else {
                this.audioReady = true;
                this._flushPendingSounds();
            }

        } catch(e) {
            console.warn('BottleShooter: Audio init failed:', e);
        }
    }

    // Flush any sounds that were requested before audio was ready
    _flushPendingSounds() {
        while (this._pendingSounds.length > 0) {
            const fn = this._pendingSounds.shift();
            try { fn(); } catch(e) {}
        }
    }

    // Safe audio check
    _audioOk() {
        return this.audioCtx && this.audioReady && this.audioCtx.state === 'running';
    }

    // Get output node (compressor if available, else masterGain)
    _out() {
        return this.compressor || this.masterGain;
    }

    // ── Oscillator tone ──
    _tone(type, freq, dur, vol, endFreqMul = 1, delay = 0) {
        if (!this._audioOk()) return;
        try {
            const ctx = this.audioCtx;
            const now = ctx.currentTime + delay;

            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(Math.max(20, freq), now);
            if (endFreqMul !== 1) {
                osc.frequency.exponentialRampToValueAtTime(
                    Math.max(20, freq * endFreqMul),
                    now + dur
                );
            }

            gain.gain.setValueAtTime(0.0001, now);
            gain.gain.linearRampToValueAtTime(vol, now + 0.008);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(dur, 0.01));

            osc.connect(gain);
            gain.connect(this._out());

            osc.start(now);
            osc.stop(now + dur + 0.05);
        } catch(e) {}
    }

    // ── White noise burst ──
    _noise(dur, vol, hpFreq = 800, delay = 0) {
        if (!this._audioOk()) return;
        try {
            const ctx = this.audioCtx;
            const now = ctx.currentTime + delay;
            const sr  = ctx.sampleRate;
            const len = Math.max(1, Math.floor(sr * dur));

            const buf  = ctx.createBuffer(1, len, sr);
            const data = buf.getChannelData(0);
            for (let i = 0; i < len; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 0.6);
            }

            const src = ctx.createBufferSource();
            src.buffer = buf;

            const hp = ctx.createBiquadFilter();
            hp.type = 'highpass';
            hp.frequency.setValueAtTime(hpFreq, now);
            hp.Q.setValueAtTime(0.7, now);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(vol, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(dur, 0.01));

            src.connect(hp);
            hp.connect(gain);
            gain.connect(this._out());

            src.start(now);
            src.stop(now + dur + 0.04);
        } catch(e) {}
    }

    // ════════════════════════════════════════════════
    //  SOUND EFFECTS
    // ════════════════════════════════════════════════

    playShot() {
        if (!this._audioOk()) return;
        // Low body thud
        this._tone('sine',    85,  0.06, 0.18, 0.3,  0);
        // Mid crack
        this._tone('triangle',220, 0.05, 0.12, 0.4,  0);
        // High noise snap
        this._noise(0.05, 0.22, 1200, 0);
        // Tail noise
        this._noise(0.12, 0.08, 400, 0.02);
    }

    playBreakNormal() {
        if (!this._audioOk()) return;
        // Glass shatter noise
        this._noise(0.12, 0.18, 2000, 0);
        this._noise(0.08, 0.12, 3500, 0.03);
        // Resonant glass tones
        this._tone('sine',    980,  0.14, 0.08, 0.3,  0);
        this._tone('triangle',1640, 0.10, 0.05, 0.2,  0.02);
        this._tone('sine',    520,  0.18, 0.06, 0.4,  0.01);
    }

    playBreakGold() {
        if (!this._audioOk()) return;
        // Bright golden shimmer
        this._noise(0.08, 0.14, 3000, 0);
        this._tone('sine',    1200, 0.22, 0.10, 0.55, 0);
        this._tone('triangle',1800, 0.16, 0.07, 0.40, 0.04);
        this._tone('sine',    2400, 0.12, 0.05, 0.30, 0.08);
        // Sparkle
        this._tone('sine',    3200, 0.08, 0.04, 0.20, 0.12);
    }

    playBreakNitro() {
        if (!this._audioOk()) return;
        // Explosion boom
        this._tone('sine',    55,   0.22, 0.28, 0.15, 0);
        this._tone('sawtooth',110,  0.14, 0.14, 0.20, 0);
        // Explosion noise
        this._noise(0.22, 0.30, 180, 0);
        this._noise(0.16, 0.18, 600, 0.04);
        // Debris
        this._tone('triangle',380,  0.12, 0.08, 0.35, 0.06);
    }

    playMiss() {
        if (!this._audioOk()) return;
        // Ricoche whine
        this._tone('sine',    680,  0.08, 0.06, 1.8,  0);
        this._tone('square',  340,  0.04, 0.03, 0.6,  0.01);
        this._noise(0.03, 0.04, 2000, 0);
    }

    playReload() {
        if (!this._audioOk()) return;
        // Magazine click out
        this._noise(0.025, 0.12, 1800, 0);
        this._tone('square', 180, 0.03, 0.06, 0.8, 0);
        // Slide back
        this._noise(0.04, 0.08, 1000, 0.08);
        this._tone('triangle', 240, 0.04, 0.05, 1.3, 0.10);
        // Magazine in
        this._noise(0.03, 0.14, 1600, 0.30);
        this._tone('square', 320, 0.04, 0.07, 0.7, 0.30);
        // Slide forward + chamber round
        this._noise(0.06, 0.18, 800, 0.55);
        this._tone('triangle', 160, 0.08, 0.10, 1.6, 0.55);
        this._tone('sine',     380, 0.05, 0.05, 0.6, 0.62);
    }

    playCombo(count) {
        if (!this._audioOk()) return;
        const notes = [523, 587, 659, 740, 784, 880, 988, 1047];
        const n = Math.min(count - 2, notes.length - 1);
        // Play arpeggio up to combo count
        for (let i = 0; i <= Math.min(n, 3); i++) {
            this._tone('sine', notes[Math.min(i, notes.length-1)], 0.12, 0.08, 1, i * 0.07);
        }
        // Final note louder
        this._tone('triangle', notes[Math.min(n, notes.length-1)], 0.18, 0.10, 1.05, n * 0.07);
    }

    playTick(urgent) {
        if (!this._audioOk()) return;
        if (urgent) {
            this._tone('square', 1100, 0.06, 0.08, 1.1, 0);
            this._tone('sine',   880,  0.05, 0.04, 0.9, 0.02);
        } else {
            this._tone('sine',   740,  0.05, 0.05, 1.05, 0);
        }
    }

    playGoldTimeBonus() {
        if (!this._audioOk()) return;
        // Ascending sparkle sweep
        [880, 1047, 1319, 1568].forEach((f, i) => {
            this._tone('sine', f, 0.14, 0.07, 1.02, i * 0.06);
        });
        this._noise(0.06, 0.05, 4000, 0);
    }

    playGameOver() {
        if (!this._audioOk()) return;
        [380, 320, 260, 200, 160].forEach((f, i) => {
            this._tone('sine',     f,       0.5, 0.12, 0.7, i * 0.18);
            this._tone('triangle', f * 1.5, 0.4, 0.06, 0.6, i * 0.18 + 0.04);
        });
        this._noise(0.3, 0.04, 200, 0);
    }

    playLevelUp() {
        if (!this._audioOk()) return;
        [523, 659, 784, 1047, 1319].forEach((f, i) => {
            this._tone('sine',     f,     0.22, 0.10, 1.02, i * 0.10);
            this._tone('triangle', f * 2, 0.14, 0.05, 1.01, i * 0.10 + 0.05);
        });
    }

    // ════════════════════════════════════════════════
    //  BUILD WORLD
    // ════════════════════════════════════════════════
    buildAll() {
        this.buildLanes();
        this.buildPlanks();
        this.buildDust();
        this.buildIdleBottles();
        this.buildStars();
        this.buildClouds();
        this.buildMountains();
    }

    buildLanes() {
        this.lanes = [
            { y:this.H*0.38, scale:this.clamp(this.H/900,0.72,0.8),         speed:0.88, index:0 },
            { y:this.H*0.56, scale:this.clamp(this.H/900+0.08,0.92,1.02),   speed:1.0,  index:1 },
            { y:this.H*0.74, scale:this.clamp(this.H/900+0.16,1.08,1.2),    speed:1.16, index:2 }
        ];
    }

    buildPlanks() {
        this.planks = [];
        let x = -30;
        while (x < this.W + 40) {
            const pw = this.rand(46, 74);
            this.planks.push({ x, w:pw, light:this.rand(18, 30) });
            x += pw + this.rand(2, 5);
        }
    }

    buildDust() {
        this.dust = [];
        const count = Math.round((this.W * this.H) / 22000);
        for (let i = 0; i < count; i++) {
            this.dust.push({
                x:this.rand(0,this.W), y:this.rand(0,this.H),
                r:this.rand(0.6,2.3),
                vx:this.rand(-7,10), vy:this.rand(-2,5),
                alpha:this.rand(0.04,0.16),
                layer:Math.random()<0.68?0:1,
                tw:this.rand(0.7,2.2), seed:Math.random()*this.TAU
            });
        }
    }

    buildIdleBottles() {
        this.idleBottles = [];
        this.lanes.forEach((lane, idx) => {
            const inset  = 84 + idx * 22;
            const spots  = idx === 1 ? 5 : 4;
            const usable = Math.max(200, this.W - inset * 2);
            for (let i = 0; i < spots; i++) {
                this.idleBottles.push({
                    x:inset + usable*((i+0.5)/spots) + this.rand(-18,18),
                    lane,
                    size:lane.scale * this.rand(0.92,1.05),
                    tint:this.pick(['emerald','cyan','amber']),
                    type:Math.random()<0.12?'gold':'normal',
                    phase:this.rand(0,this.TAU),
                    wobbleAmp:this.rand(1.1,3.0)*lane.scale,
                    wobbleSpeed:this.rand(1.2,2.1),
                    rotBias:this.rand(-0.02,0.02)
                });
            }
        });
        this.idleBottles.sort((a,b) => a.lane.index - b.lane.index);
    }

    buildStars() {
        const count = this.isMobile ? 55 : 120;
        this.stars = Array.from({length:count}, () => ({
            x:this.rand(0,this.W), y:this.rand(0,this.H*0.5),
            size:this.rand(0.3,1.8),
            phase:this.rand(0,this.TAU), speed:this.rand(0.005,0.015),
            brightness:Math.random()
        }));
    }

    buildClouds() {
        this.clouds = Array.from({length:4}, () => ({
            x:this.rand(0,this.W), y:this.rand(30,100),
            cw:this.rand(60,180), ch:this.rand(20,45),
            speed:this.rand(4,14), alpha:this.rand(0.025,0.065)
        }));
    }

    buildMountains() {
        this.mountains = [];
        let x = 0;
        while (x < this.W + 80) {
            this.mountains.push({ x, mh:this.rand(40,120) });
            x += this.rand(30,90);
        }
    }

    // ════════════════════════════════════════════════
    //  BOTTLE HELPERS
    // ════════════════════════════════════════════════
    bottlePalette(b) {
        if (b.type==='gold')  return this.PALETTES.gold;
        if (b.type==='nitro') return this.PALETTES.nitro;
        return this.PALETTES[b.tint] || this.PALETTES.emerald;
    }

    bottleHitWeight(b, x, y) {
        const cx=b.x, cy=b.y-56*b.size;
        const dx=x-cx, dy=y-cy;
        const rx=17*b.size, ry=58*b.size;
        const inside=(dx*dx)/(rx*rx)+(dy*dy)/(ry*ry)<=1;
        return inside?(dx*dx+dy*dy-b.lane.scale*40):Infinity;
    }

    pickBottleAt(x, y) {
        let target=null, best=Infinity;
        for (const b of this.bottles) {
            if (b.dead) continue;
            const w2 = this.bottleHitWeight(b,x,y);
            if (w2<best) { best=w2; target=b; }
        }
        return target;
    }

    // ════════════════════════════════════════════════
    //  EVENTS
    // ════════════════════════════════════════════════
    bindEvents() {
        this.canvas.style.cursor = 'none';

        this._onMouseMove = (e) => {
            const r = this.canvas.getBoundingClientRect();
            this.crosshair.targetX = (e.clientX - r.left) * (this.W / r.width);
            this.crosshair.targetY = (e.clientY - r.top)  * (this.H / r.height);
        };

        this._onClick = (e) => {
            e.preventDefault();
            // CRITICAL: initAudio must be called on every click
            this.initAudio();
            const r  = this.canvas.getBoundingClientRect();
            const mx = (e.clientX - r.left) * (this.W / r.width);
            const my = (e.clientY - r.top)  * (this.H / r.height);
            this.handleInput(mx, my);
        };

        this._onTouchStart = (e) => {
            e.preventDefault();
            // CRITICAL: initAudio must be called on every touch
            this.initAudio();
            const r  = this.canvas.getBoundingClientRect();
            const mx = (e.touches[0].clientX - r.left) * (this.W / r.width);
            const my = (e.touches[0].clientY - r.top)  * (this.H / r.height);
            this.crosshair.x = mx;
            this.crosshair.y = my;
            this.crosshair.targetX = mx;
            this.crosshair.targetY = my;
            this.handleInput(mx, my);
        };

        this._onTouchMove = (e) => {
            e.preventDefault();
            const r = this.canvas.getBoundingClientRect();
            this.crosshair.targetX = (e.touches[0].clientX - r.left) * (this.W / r.width);
            this.crosshair.targetY = (e.touches[0].clientY - r.top)  * (this.H / r.height);
        };

        this._onKeyDown = (e) => {
            if (e.code === 'Space') {
                e.preventDefault();
                this.initAudio();
                if (this.state === this.STATE.WAITING) {
                    this.startGame();
                } else if (this.state === this.STATE.DEAD && this.deathOverlayAlpha > 0.8) {
                    this.restartGame();
                }
            }
            if (e.code === 'KeyR' && this.state === this.STATE.PLAYING) {
                e.preventDefault();
                this.initAudio();
                this.beginReload();
            }
        };

        this._onContext = (e) => e.preventDefault();

        this.canvas.addEventListener('mousemove',   this._onMouseMove);
        this.canvas.addEventListener('click',       this._onClick);
        this.canvas.addEventListener('touchstart',  this._onTouchStart, { passive:false });
        this.canvas.addEventListener('touchmove',   this._onTouchMove,  { passive:false });
        this.canvas.addEventListener('contextmenu', this._onContext);
        document.addEventListener('keydown', this._onKeyDown);
    }

    handleInput(mx, my) {
        if (this.state === this.STATE.WAITING) {
            this.startGame();
            return;
        }
        if (this.state === this.STATE.DEAD && this.deathOverlayAlpha > 0.8) {
            this.restartGame();
            return;
        }
        if (this.state !== this.STATE.PLAYING) return;
        this.shoot(mx, my);
    }

    // ════════════════════════════════════════════════
    //  GAME CONTROL
    // ════════════════════════════════════════════════
    startGame() {
        this.state         = this.STATE.PLAYING;
        this.score         = 0;
        this.timeLeft      = this.MAX_TIME;
        this.ammo          = this.MAX_AMMO;
        this.reloading     = false;
        this.reloadTimer   = 0;
        this.combo         = 0;
        this.bestCombo     = 0;
        this.totalShots    = 0;
        this.totalHits     = 0;
        this.bottlesBroken = 0;
        this.spawnTimer    = 0.35;
        this.lastHitTime   = -10;
        this.cameraShake   = 0;
        this.crossPulse    = 0;
        this.flash         = 0;
        this.gameClock     = 0;
        this.lastWholeSecond   = this.MAX_TIME;
        this.deathOverlayAlpha = 0;
        this.gameOver      = false;

        this.bottles.length       = 0;
        this.particles.length     = 0;
        this.glassShards.length   = 0;
        this.splashes.length      = 0;
        this.floatingTexts.length = 0;
        this.scorePopups.length   = 0;
        this.shellCasings.length  = 0;
        this.bulletTrails.length  = 0;

        this.canvas.style.cursor = 'none';
        this.onScore(0);
    }

    restartGame() { this.startGame(); }

    titleForScore(s) {
        if (s>=8000) return 'Legend of Glass';
        if (s>=6000) return 'Range Phantom';
        if (s>=4200) return 'Sharpshooter';
        if (s>=2500) return 'Steady Hand';
        return 'Rookie Hunter';
    }

    triggerGameOver() {
        if (this.state !== this.STATE.PLAYING) return;
        this.state    = this.STATE.DEAD;
        this.gameOver = true;
        this.canvas.style.cursor = 'pointer';

        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('bottleshoot_cinematic_best', this.bestScore);
        }

        this.playGameOver();
        setTimeout(() => {
            if (!this.destroyed) this.onScore(this.score, true);
        }, 1200);
    }

    // ════════════════════════════════════════════════
    //  RELOAD
    // ════════════════════════════════════════════════
    beginReload() {
        if (this.state !== this.STATE.PLAYING) return;
        if (this.reloading || this.ammo === this.MAX_AMMO) return;
        this.reloading   = true;
        this.reloadTimer = 1.6;
        this.playReload();
    }

    // ════════════════════════════════════════════════
    //  SPAWN
    // ════════════════════════════════════════════════
    getSpawnInterval() {
        const el = this.MAX_TIME - this.timeLeft;
        const df = 1 + (el / this.MAX_TIME) * 1.25;
        return this.rand(0.42, 0.82) / df;
    }

    spawnWave() {
        const el   = this.MAX_TIME - this.timeLeft;
        const diff = 1 + (el / this.MAX_TIME) * 1.35;
        const dir  = Math.random() < 0.5 ? 1 : -1;
        const roll = Math.random();
        const count = roll < 0.22 + diff*0.05 ? 3 : roll < 0.54 + diff*0.06 ? 2 : 1;
        const lIdx  = this.shuffle([0,1,2]);

        for (let i = 0; i < count; i++) {
            const lane = this.lanes[lIdx[i % this.lanes.length]];
            const tr   = Math.random();
            let type   = 'normal';
            if (tr < 0.08)      type = 'gold';
            else if (tr < 0.22) type = 'nitro';

            this.bottles.push({
                x:    dir===1 ? -95-i*74 : this.W+95+i*74,
                y:    lane.y, lane,
                size: lane.scale * this.rand(0.95,1.08),
                dir, type,
                speed: this.rand(112,172) * diff * lane.speed * (type==='gold'?1.05:1),
                tint:  this.pick(['emerald','cyan','amber']),
                phase: this.rand(0,this.TAU),
                wobbleAmp:   this.rand(1.4,4.3)*lane.scale,
                wobbleSpeed: this.rand(2.1,4.0),
                rot:0, t:this.rand(0,10),
                value: type==='gold'?320:type==='nitro'?180:100,
                dead:false
            });
        }
    }

    // ════════════════════════════════════════════════
    //  SHOOT
    // ════════════════════════════════════════════════
    shoot(mx, my) {
        if (this.state !== this.STATE.PLAYING) return;
        if (this.reloading) return;
        if (this.ammo <= 0) { this.beginReload(); return; }

        this.totalShots++;
        this.ammo--;
        this.crossPulse   = 1;
        this.flash        = 0.65;
        this.cameraShake += 3.4;

        // SOUND - Gun shot
        this.playShot();

        // Shell casing
        this.shellCasings.push({
            x:this.W*0.5+25, y:this.H-30,
            vx:2+Math.random()*3, vy:-4-Math.random()*3,
            rot:0, rotSpd:(Math.random()-0.5)*0.4, life:2
        });

        // Bullet trail
        this.bulletTrails.push({
            sx:this.W*0.5, sy:this.H-25,
            ex:mx, ey:my, prog:0, opacity:1
        });

        // Muzzle sparks
        for (let i = 0; i < 4 && this.particles.length < this.MAX_PARTICLES; i++) {
            this.particles.push({
                x:mx+(Math.random()-0.5)*8, y:my+(Math.random()-0.5)*8,
                vx:(Math.random()-0.5)*4, vy:(Math.random()-0.5)*4,
                size:1.5+Math.random()*2, life:1, decay:0.12,
                color:'255,221,68', grav:0, type:'dot'
            });
        }

        const target = this.pickBottleAt(mx, my);

        if (target) {
            this.totalHits++;
            const since = this.gameClock - this.lastHitTime;
            this.combo = since < 1.0 ? this.combo + 1 : 1;
            this.lastHitTime = this.gameClock;
            this.bestCombo = Math.max(this.bestCombo, this.combo);
            const multi = 1 + Math.min(this.combo-1, 6) * 0.25;

            // Combo sound
            if (this.combo >= 3) this.playCombo(this.combo);

            this.explodeBottle(target, false, multi);

            if (this.combo >= 3) {
                this.floatingTexts.push({
                    x:target.x, y:target.y - 80*target.size,
                    text:`${this.combo}x COMBO!`, color:'255,140,0',
                    size:16, life:80, opacity:1, scale:0.4
                });
                this.flash = 0.08;
                this.flashColor = '#FFD700';
            }
            if (this.combo === 5) {
                this.floatingTexts.push({
                    x:target.x, y:target.y-100*target.size,
                    text:'ON FIRE!', color:'255,0,85',
                    size:18, life:100, opacity:1, scale:0.4
                });
            }
            if (this.combo === 10) {
                this.floatingTexts.push({
                    x:target.x, y:target.y-100*target.size,
                    text:'UNSTOPPABLE!', color:'170,68,255',
                    size:20, life:110, opacity:1, scale:0.4
                });
            }
        } else {
            this.combo = 0;
            this.floatingTexts.push({
                x:mx, y:my, text:'MISS', color:'255,100,100',
                size:12, life:40, opacity:1, scale:1
            });
            // SOUND - Miss
            this.playMiss();

            for (let i = 0; i < 3 && this.particles.length < this.MAX_PARTICLES; i++) {
                this.particles.push({
                    x:mx, y:my,
                    vx:(Math.random()-0.5)*2, vy:(Math.random()-0.5)*2,
                    size:1+Math.random(), life:1, decay:0.08,
                    color:'150,150,150', grav:0.02, type:'dot'
                });
            }
        }

        if (this.ammo === 0) this.beginReload();
    }

    // ════════════════════════════════════════════════
    //  EXPLODE BOTTLE
    // ════════════════════════════════════════════════
    explodeBottle(b, chained=false, multiplier=1) {
        if (!b || b.dead) return;
        b.dead = true;

        let gain = b.value * (chained ? 0.8 : multiplier);
        let textColor = '255,245,228';

        if (b.type === 'gold') {
            gain += chained ? 120 : 180;
            this.timeLeft = Math.min(this.MAX_TIME, this.timeLeft + 2.2);
            textColor = '255,224,140';
            // SOUND - Gold break
            this.playBreakGold();
            this.playGoldTimeBonus();
            this.floatingTexts.push({
                x:b.x, y:b.y-88*b.size,
                text:'GOLD +2.2s', color:textColor,
                size:16, life:90, opacity:1, scale:0.4
            });
        } else if (b.type === 'nitro') {
            gain += 70;
            textColor = '255,130,95';
            // SOUND - Nitro break
            this.playBreakNitro();
            this.floatingTexts.push({
                x:b.x, y:b.y-82*b.size,
                text:'BLAST', color:textColor,
                size:14, life:70, opacity:1, scale:0.4
            });
        } else {
            textColor = this.bottlePalette(b).glow;
            // SOUND - Normal break
            this.playBreakNormal();
        }

        this.score += Math.round(gain);
        this.bottlesBroken++;
        this.cameraShake += b.type==='nitro' ? 5.4 : 2.4;
        this.onScore(this.score);

        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            localStorage.setItem('bottleshoot_cinematic_best', this.bestScore);
        }

        this.scorePopups.push({
            x:b.x, y:b.y-b.size*68,
            text:`+${Math.round(gain)}`,
            color:gain>=200?'255,0,136':gain>=100?'255,215,0':'0,255,136',
            life:1200, opacity:1
        });

        this.createShatter(b, chained?10:16);
        this.createGlassShards(b);
        this.createSplash(b);
        if (b.type === 'nitro') this.createBlast(b);

        // Nitro chain reaction
        if (b.type === 'nitro') {
            const radius = 150 * b.size;
            for (const other of this.bottles) {
                if (other.dead || other===b) continue;
                const dx = other.x - b.x;
                const dy = (other.y-52*other.size) - (b.y-52*b.size);
                if (Math.hypot(dx,dy) < radius) {
                    // Stagger chain explosions
                    setTimeout(() => {
                        if (!this.destroyed) this.explodeBottle(other, true, 1);
                    }, 80 + Math.random()*120);
                }
            }
        }
    }

    // ════════════════════════════════════════════════
    //  PARTICLE CREATORS
    // ════════════════════════════════════════════════
    createBlast(b) {
        this.particles.push({
            type:'ring', x:b.x, y:b.y-54*b.size,
            life:0.35, maxLife:0.35, maxR:125*b.size, color:'255,130,90'
        });
        for (let i = 0; i < 18; i++) {
            const a  = (i/18)*this.TAU + this.rand(-0.15,0.15);
            const sp = this.rand(80,210)*b.size;
            this.particles.push({
                type:'spark', x:b.x, y:b.y-54*b.size,
                vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
                life:this.rand(0.18,0.34), maxLife:this.rand(0.18,0.34),
                len:this.rand(10,20)*b.size, color:'255,166,120', decay:0.06, grav:0
            });
        }
    }

    createShatter(b, count) {
        const p = this.bottlePalette(b);
        const baseY = b.y - 54*b.size;
        for (let i = 0; i < count && this.particles.length < this.MAX_PARTICLES; i++) {
            const a  = this.rand(-Math.PI*0.96, Math.PI*0.96);
            const sp = this.rand(85,265)*b.size*(b.type==='nitro'?1.22:1);
            this.particles.push({
                type:'shard',
                x:b.x+this.rand(-7,7), y:baseY+this.rand(-8,8),
                vx:Math.cos(a)*sp+b.dir*b.speed*0.25,
                vy:Math.sin(a)*sp-this.rand(20,145),
                life:this.rand(0.5,1.0), maxLife:this.rand(0.5,1.0),
                size:this.rand(3,8)*b.size,
                rot:this.rand(0,this.TAU), spin:this.rand(-7,7),
                color:p.glow, decay:0.02, grav:240
            });
        }
    }

    createGlassShards(b) {
        const p = this.bottlePalette(b);
        const gp = p.glow.split(',');
        const col = '#' + gp.map(n => parseInt(n).toString(16).padStart(2,'0')).join('');

        for (let i = 0; i < 14 && this.glassShards.length < this.MAX_PARTICLES; i++) {
            const angle = Math.random()*this.TAU;
            const sp = 2 + Math.random()*6;
            this.glassShards.push({
                x:b.x+(Math.random()-0.5)*b.size*20,
                y:b.y-b.size*54+(Math.random()-0.5)*b.size*20,
                vx:Math.cos(angle)*sp, vy:Math.sin(angle)*sp-3,
                w:2+Math.random()*6, h:1.5+Math.random()*3,
                rotation:Math.random()*this.TAU, rotSpeed:(Math.random()-0.5)*0.3,
                life:1, decay:0.022,
                color:b.type==='gold'?'#ffd35b':col, grav:0.28
            });
        }
        for (let i = 0; i < 6 && this.glassShards.length < this.MAX_PARTICLES; i++) {
            const angle = Math.random()*this.TAU;
            this.glassShards.push({
                x:b.x, y:b.y-b.size*54,
                vx:Math.cos(angle)*(1+Math.random()*4), vy:Math.sin(angle)*3-2,
                w:1+Math.random()*2.5, h:1+Math.random()*1.5,
                rotation:Math.random()*this.TAU, rotSpeed:(Math.random()-0.5)*0.5,
                life:0.8, decay:0.03, color:'#ffffff', grav:0.22
            });
        }
    }

    createSplash(b) {
        const p = this.bottlePalette(b);
        for (let i = 0; i < 12 && this.splashes.length < this.MAX_PARTICLES; i++) {
            const angle = Math.random()*this.TAU;
            const sp = 2 + Math.random()*5;
            this.splashes.push({
                x:b.x+(Math.random()-0.5)*b.size*10,
                y:b.y-b.size*40,
                vx:Math.cos(angle)*sp, vy:Math.sin(angle)*sp-3,
                r:2+Math.random()*4,
                life:1, decay:0.028, color:`rgba(${p.glow},0.8)`, grav:0.2
            });
        }
    }

    // ════════════════════════════════════════════════
    //  UPDATE
    // ════════════════════════════════════════════════
    update(dt) {
        if (this.paused) return;

        this.time += dt;
        this.frame++;
        this.ambientClock += dt;

        // Crosshair smooth
        this.crosshair.x += (this.crosshair.targetX - this.crosshair.x) * Math.min(1, dt*16);
        this.crosshair.y += (this.crosshair.targetY - this.crosshair.y) * Math.min(1, dt*16);
        this.crosshair.pulse  += 0.05;
        if (this.crosshair.spread > 0) this.crosshair.spread = Math.max(0, this.crosshair.spread - 0.75);

        // FX decay
        this.cameraShake = Math.max(0, this.cameraShake - dt*14);
        this.crossPulse  = Math.max(0, this.crossPulse  - dt*3.7);
        this.flash       = Math.max(0, this.flash        - dt*2.8);

        // Stars + Clouds
        for (const s of this.stars)  s.phase += s.speed;
        for (const c of this.clouds) { c.x += c.speed*dt; if (c.x > this.W+c.cw) c.x=-c.cw; }

        // Dust
        for (const d of this.dust) {
            d.x += d.vx*dt*(d.layer?1.25:0.7);
            d.y += d.vy*dt*(d.layer?1.08:0.55) + Math.sin(this.ambientClock*d.tw+d.seed)*dt*4;
            if (d.x>this.W+30) d.x=-30; if (d.x<-30) d.x=this.W+30;
            if (d.y>this.H+30) d.y=-30; if (d.y<-30) d.y=this.H+30;
        }

        if (this.state === this.STATE.WAITING) { this.updateFX(dt); return; }

        if (this.state === this.STATE.DEAD) {
            this.deathOverlayAlpha = Math.min(1, this.deathOverlayAlpha + 0.014);
            this.updateFX(dt);
            return;
        }

        // ── PLAYING ──
        this.gameClock += dt;
        this.timeLeft   = Math.max(0, this.timeLeft - dt);

        // Tick sounds
        const whole = Math.ceil(this.timeLeft);
        if (whole !== this.lastWholeSecond) {
            if (whole > 0 && whole <= 10) this.playTick(whole <= 3);
            this.lastWholeSecond = whole;
        }

        if (this.timeLeft <= 0) { this.triggerGameOver(); return; }

        if (this.combo > 0 && this.gameClock - this.lastHitTime > 1.12) this.combo = 0;

        // Reload
        if (this.reloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                this.reloading = false;
                this.ammo = this.MAX_AMMO;
            }
        }

        // Spawn bottles
        this.spawnTimer -= dt;
        const alive = this.bottles.filter(b => !b.dead).length;
        const maxB  = this.clamp(Math.round(7 + (this.MAX_TIME - this.timeLeft) / 7), 7, 11);
        while (this.spawnTimer <= 0 && alive + 1 <= maxB) {
            this.spawnWave();
            this.spawnTimer += this.getSpawnInterval();
            break;
        }

        // Move bottles
        for (let i = this.bottles.length-1; i >= 0; i--) {
            const b = this.bottles[i];
            if (b.dead) { this.bottles.splice(i,1); continue; }
            b.t += dt;
            b.x += b.speed * b.dir * dt;
            b.y  = b.lane.y + Math.sin(b.t*b.wobbleSpeed+b.phase)*b.wobbleAmp;
            b.rot = Math.sin(b.t*2.2+b.phase)*0.045 + b.dir*0.016;
            if ((b.dir===1&&b.x>this.W+140)||(b.dir===-1&&b.x<-140)) this.bottles.splice(i,1);
        }

        this.updateFX(dt);
    }

    updateFX(dt) {
        // Cinematic particles
        for (let i = this.particles.length-1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life<=0) { this.particles.splice(i,1); continue; }
            if (p.type==='ring') continue;
            p.x += p.vx*dt; p.y += p.vy*dt;
            if (p.grav) p.vy += p.grav*dt;
            p.vx *= (p.type==='spark'||p.type==='dot') ? 0.98 : 0.993;
            if (p.type==='shard') p.rot += p.spin*dt;
            if (p.size) p.size *= 0.99;
        }

        // Glass shards
        for (let i = this.glassShards.length-1; i >= 0; i--) {
            const s = this.glassShards[i];
            s.x += s.vx*dt*60; s.y += s.vy*dt*60;
            s.vy += s.grav*dt*60; s.vx *= 0.97;
            s.life -= s.decay; s.rotation += s.rotSpeed*dt*60;
            if (s.life<=0) this.glassShards.splice(i,1);
        }

        // Splashes
        for (let i = this.splashes.length-1; i >= 0; i--) {
            const s = this.splashes[i];
            s.x += s.vx*dt*60; s.y += s.vy*dt*60;
            s.vy += s.grav*dt*60; s.vx *= 0.97; s.r *= 0.97;
            s.life -= s.decay;
            if (s.life<=0) this.splashes.splice(i,1);
        }

        // Shell casings
        for (let i = this.shellCasings.length-1; i >= 0; i--) {
            const s = this.shellCasings[i];
            s.x += s.vx*dt*60; s.y += s.vy*dt*60;
            s.vy += 0.3*dt*60; s.rot += s.rotSpd*dt*60; s.life -= dt;
            if (s.y>this.H || s.life<=0) this.shellCasings.splice(i,1);
        }

        // Bullet trails
        for (let i = this.bulletTrails.length-1; i >= 0; i--) {
            const t = this.bulletTrails[i];
            t.prog += 0.09; t.opacity -= 0.06;
            if (t.opacity<=0) this.bulletTrails.splice(i,1);
        }

        // Score popups
        for (let i = this.scorePopups.length-1; i >= 0; i--) {
            const p = this.scorePopups[i];
            p.y -= 1.2; p.life -= dt*1000; p.opacity = Math.min(1, p.life/500);
            if (p.life<=0) this.scorePopups.splice(i,1);
        }

        // Floating texts
        for (let i = this.floatingTexts.length-1; i >= 0; i--) {
            const t = this.floatingTexts[i];
            t.y -= 0.55; t.life--;
            t.opacity = Math.min(1, t.life/30);
            if (t.scale!==undefined) t.scale += (1-t.scale)*0.14;
            if (t.life<=0) this.floatingTexts.splice(i,1);
        }
    }

    // ════════════════════════════════════════════════
    //  DRAW — BACKGROUND
    // ════════════════════════════════════════════════
    drawNightSky(ctx) {
        const W=this.W, H=this.H;
        const sky = ctx.createLinearGradient(0,0,0,H*0.72);
        sky.addColorStop(0,   '#050510');
        sky.addColorStop(0.5, '#0a0520');
        sky.addColorStop(1,   '#1a0a30');
        ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);

        // Stars
        for (const s of this.stars) {
            const tw = 0.3 + ((Math.sin(s.phase)+1)/2)*0.7;
            ctx.globalAlpha = s.brightness*tw;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(s.x,s.y,s.size,0,this.TAU); ctx.fill();
            if (s.size>1.4) {
                ctx.globalAlpha = s.brightness*tw*0.25;
                ctx.beginPath(); ctx.arc(s.x,s.y,s.size*3,0,this.TAU); ctx.fill();
            }
        }
        ctx.globalAlpha=1;

        // Moon
        ctx.save();
        ctx.shadowBlur=25; ctx.shadowColor='#FFE4A0';
        ctx.fillStyle='rgba(255,255,220,0.92)';
        ctx.beginPath(); ctx.arc(W*0.85,H*0.09,15,0,this.TAU); ctx.fill();
        ctx.shadowBlur=0;
        const mg=ctx.createRadialGradient(W*0.85,H*0.09,12,W*0.85,H*0.09,50);
        mg.addColorStop(0,'rgba(255,255,230,0.3)'); mg.addColorStop(1,'rgba(255,255,200,0)');
        ctx.fillStyle=mg; ctx.beginPath(); ctx.arc(W*0.85,H*0.09,50,0,this.TAU); ctx.fill();
        ctx.restore();

        // Clouds
        for (const c of this.clouds) {
            ctx.fillStyle=`rgba(255,255,255,${c.alpha})`;
            ctx.beginPath(); ctx.ellipse(c.x,c.y,c.cw/2,c.ch/2,0,0,this.TAU); ctx.fill();
            ctx.beginPath(); ctx.ellipse(c.x-c.cw*0.22,c.y+4,c.cw*0.28,c.ch*0.38,0,0,this.TAU); ctx.fill();
        }

        // Mountains
        ctx.fillStyle='#0d0d20';
        ctx.beginPath(); ctx.moveTo(0,H*0.42);
        for (const m of this.mountains) ctx.lineTo(m.x,H*0.42-m.mh*0.6);
        ctx.lineTo(W,H*0.42); ctx.lineTo(W,H); ctx.lineTo(0,H);
        ctx.closePath(); ctx.fill();
    }

    drawBackdrop(ctx) {
        const W=this.W, H=this.H, wallTop=H*0.26;

        [[W*0.18,H*0.16,180,0.06],[W*0.44,H*0.14,220,0.05],[W*0.72,H*0.22,240,0.04]]
            .forEach(([x,y,r,a])=>{
                const g=ctx.createRadialGradient(x,y,0,x,y,r);
                g.addColorStop(0,`rgba(255,210,160,${a})`); g.addColorStop(1,'rgba(255,210,160,0)');
                ctx.fillStyle=g; ctx.fillRect(x-r,y-r,r*2,r*2);
            });

        const wg=ctx.createLinearGradient(0,wallTop,0,H);
        wg.addColorStop(0,'#80502f'); wg.addColorStop(0.08,'#8d5631');
        wg.addColorStop(0.55,'#4c2a18'); wg.addColorStop(1,'#1c0f0b');
        ctx.fillStyle=wg; ctx.fillRect(0,wallTop,W,H-wallTop);

        const sp=ctx.createRadialGradient(W*0.5,H*0.49,0,W*0.5,H*0.49,W*0.42);
        sp.addColorStop(0,'rgba(255,195,130,.15)'); sp.addColorStop(1,'rgba(255,170,100,0)');
        ctx.fillStyle=sp; ctx.fillRect(0,wallTop,W,H-wallTop);

        for (const pl of this.planks) {
            ctx.fillStyle=`hsl(24 46% ${pl.light}%)`;
            ctx.fillRect(pl.x,wallTop,pl.w,H-wallTop);
            ctx.fillStyle='rgba(255,221,186,.045)'; ctx.fillRect(pl.x,wallTop,1,H-wallTop);
            ctx.fillStyle='rgba(0,0,0,.16)'; ctx.fillRect(pl.x+pl.w-1,wallTop,2,H-wallTop);
        }

        const bg=ctx.createLinearGradient(0,wallTop-34,0,wallTop+8);
        bg.addColorStop(0,'#844b2a'); bg.addColorStop(1,'#3d2010');
        ctx.fillStyle=bg; ctx.fillRect(0,wallTop-34,W,38);

        ctx.fillStyle='#32180d';
        ctx.fillRect(0,wallTop-34,28,H); ctx.fillRect(W-28,wallTop-34,28,H);

        const ts=ctx.createLinearGradient(0,wallTop-6,0,wallTop+94);
        ts.addColorStop(0,'rgba(0,0,0,.36)'); ts.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=ts; ctx.fillRect(0,wallTop-6,W,110);

        [W*0.18,W*0.5,W*0.82].forEach((x,i)=>{
            const by=wallTop+16+Math.sin(this.ambientClock*1.4+i)*1.5;
            ctx.strokeStyle='rgba(22,12,9,.85)'; ctx.lineWidth=2;
            ctx.beginPath(); ctx.moveTo(x,wallTop-34); ctx.lineTo(x,by-5); ctx.stroke();
            const pulse=0.82+0.18*Math.sin(this.ambientClock*4+i*1.7);
            const gl=ctx.createRadialGradient(x,by,0,x,by,42);
            gl.addColorStop(0,`rgba(255,216,148,${0.22*pulse})`);
            gl.addColorStop(0.4,`rgba(255,180,100,${0.12*pulse})`);
            gl.addColorStop(1,'rgba(255,160,100,0)');
            ctx.fillStyle=gl; ctx.fillRect(x-44,by-44,88,88);
            ctx.fillStyle='#ffdca6'; ctx.beginPath(); ctx.ellipse(x,by,4.5,6,0,0,this.TAU); ctx.fill();
            ctx.fillStyle='rgba(78,40,18,.9)'; ctx.fillRect(x-3,by-9,6,3);
        });

        ctx.font=`700 ${Math.max(18,W*0.026)}px ${this.FONT_TITLE}`;
        ctx.textAlign='center';
        ctx.fillStyle='rgba(255,225,185,.08)';
        ctx.fillText('BOTTLE SHOOTER',W*0.5,wallTop+58);
    }

    // ════════════════════════════════════════════════
    //  DRAW — SHELVES
    // ════════════════════════════════════════════════
    drawShelf(ctx, lane, idx) {
        const inset=54+idx*20, width=this.W-inset*2;
        const y=lane.y+8, thick=18*lane.scale+idx*3;

        const g=ctx.createLinearGradient(0,y,0,y+thick);
        g.addColorStop(0,'#a2683e'); g.addColorStop(0.2,'#8a5531'); g.addColorStop(1,'#3b1d0f');
        ctx.fillStyle=g; ctx.fillRect(inset,y,width,thick);

        const lip=ctx.createLinearGradient(0,y+thick,0,y+thick+14*lane.scale);
        lip.addColorStop(0,'#3a1b0d'); lip.addColorStop(1,'#180c07');
        ctx.fillStyle=lip; ctx.fillRect(inset,y+thick-1,width,12*lane.scale);

        ctx.fillStyle='rgba(255,220,170,.18)'; ctx.fillRect(inset,y,width,2);

        const sh=ctx.createLinearGradient(0,y+thick,0,y+thick+28*lane.scale);
        sh.addColorStop(0,'rgba(0,0,0,.33)'); sh.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=sh; ctx.fillRect(inset,y+thick,width,30*lane.scale);
    }

    // ════════════════════════════════════════════════
    //  DRAW — BOTTLE
    // ════════════════════════════════════════════════
    _bottleShape(ctx) {
        ctx.beginPath();
        ctx.moveTo(-7,-110);
        ctx.quadraticCurveTo(-7,-116,-4,-116); ctx.lineTo(-4,-94);
        ctx.quadraticCurveTo(-11,-94,-13,-84);
        ctx.quadraticCurveTo(-16,-56,-16,-22);
        ctx.quadraticCurveTo(-16,-8,-11,-1);
        ctx.quadraticCurveTo(-6,2,0,2);
        ctx.quadraticCurveTo(6,2,11,-1);
        ctx.quadraticCurveTo(16,-8,16,-22);
        ctx.quadraticCurveTo(16,-56,13,-84);
        ctx.quadraticCurveTo(11,-94,4,-94); ctx.lineTo(4,-116);
        ctx.quadraticCurveTo(7,-116,7,-110); ctx.lineTo(7,-101);
        ctx.quadraticCurveTo(7,-97,5,-95); ctx.lineTo(-5,-95);
        ctx.quadraticCurveTo(-7,-97,-7,-101);
        ctx.closePath();
    }

    drawBottleShadow(ctx, b, palette) {
        ctx.save();
        ctx.translate(b.x, b.lane.y+8*b.lane.scale);
        ctx.scale(b.size, b.size*0.9);
        ctx.fillStyle='rgba(0,0,0,.24)';
        ctx.beginPath(); ctx.ellipse(0,0,15,5,0,0,this.TAU); ctx.fill();
        if (b.type==='gold'||b.type==='nitro') {
            const gw=ctx.createRadialGradient(0,0,0,0,0,24);
            gw.addColorStop(0,`rgba(${palette.glow},${b.type==='gold'?0.08:0.06})`);
            gw.addColorStop(1,`rgba(${palette.glow},0)`);
            ctx.fillStyle=gw; ctx.beginPath(); ctx.ellipse(0,0,24,8,0,0,this.TAU); ctx.fill();
        }
        ctx.restore();
    }

    drawBottle(ctx, b) {
        const p=this.bottlePalette(b);
        ctx.save();
        ctx.translate(b.x,b.y); ctx.rotate(b.rot); ctx.scale(b.size,b.size);

        if (b.type==='gold'||b.type==='nitro') {
            const aura=ctx.createRadialGradient(0,-50,6,0,-50,50);
            aura.addColorStop(0,`rgba(${p.glow},${b.type==='gold'?0.24:0.18})`);
            aura.addColorStop(1,`rgba(${p.glow},0)`);
            ctx.fillStyle=aura; ctx.beginPath(); ctx.arc(0,-50,50,0,this.TAU); ctx.fill();
        }

        this._bottleShape(ctx);
        const glass=ctx.createLinearGradient(-12,-116,14,4);
        glass.addColorStop(0,p.top); glass.addColorStop(0.28,p.mid); glass.addColorStop(1,p.bottom);
        ctx.globalAlpha=0.4; ctx.fillStyle=glass; ctx.fill(); ctx.globalAlpha=1;

        this._bottleShape(ctx);
        ctx.save(); ctx.clip();

        const lt=(b.type==='gold'?-56:-48)+Math.sin((b.t||this.ambientClock)*3.1+b.phase)*1.3;
        const liq=ctx.createLinearGradient(0,lt,0,2);
        liq.addColorStop(0,p.mid); liq.addColorStop(1,p.liquid);
        ctx.fillStyle=liq; ctx.globalAlpha=0.78; ctx.fillRect(-18,lt,36,58); ctx.globalAlpha=1;

        const inner=ctx.createLinearGradient(-16,0,16,0);
        inner.addColorStop(0,'rgba(255,255,255,.22)');
        inner.addColorStop(0.36,'rgba(255,255,255,.02)');
        inner.addColorStop(1,'rgba(0,0,0,.18)');
        ctx.fillStyle=inner; ctx.fillRect(-18,-120,36,126);

        if (b.type==='nitro') {
            ctx.fillStyle=p.label; ctx.fillRect(-14,-56,28,14);
            ctx.fillStyle='rgba(255,204,204,.12)';
            for (let lx=-12;lx<=8;lx+=8) ctx.fillRect(lx,-54,4,10);
        } else {
            ctx.fillStyle=p.label; ctx.fillRect(-14,-58,28,12);
            ctx.fillStyle='rgba(80,45,20,.16)'; ctx.fillRect(-14,-54,28,3);
        }

        const streak=ctx.createLinearGradient(-10,-105,-2,-4);
        streak.addColorStop(0,'rgba(255,255,255,.86)');
        streak.addColorStop(0.16,'rgba(255,255,255,.42)');
        streak.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=streak; ctx.fillRect(-11,-104,6,98);

        const ss=ctx.createLinearGradient(4,-100,14,-8);
        ss.addColorStop(0,'rgba(255,255,255,.14)'); ss.addColorStop(1,'rgba(255,255,255,0)');
        ctx.fillStyle=ss; ctx.fillRect(4,-102,10,96);
        ctx.restore();

        this._bottleShape(ctx);
        ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1.2; ctx.stroke();

        const neck=ctx.createLinearGradient(0,-121,0,-90);
        neck.addColorStop(0,'rgba(255,255,255,.3)'); neck.addColorStop(1,'rgba(255,255,255,.04)');
        ctx.fillStyle=neck; ctx.fillRect(-4.2,-120,8.4,28);

        const cork=ctx.createLinearGradient(0,-122,0,-111);
        cork.addColorStop(0,'#d7ad74'); cork.addColorStop(1,'#73411d');
        ctx.fillStyle=cork; ctx.fillRect(-4.3,-122,8.6,7.5);
        ctx.fillStyle='rgba(0,0,0,.22)'; ctx.fillRect(-4.5,-115,9,1.1);

        ctx.restore();
    }

    drawIdleSet(ctx) {
        for (const b of this.idleBottles) {
            const y=b.lane.y+Math.sin(this.ambientClock*b.wobbleSpeed+b.phase)*b.wobbleAmp;
            const mock={...b, y, rot:Math.sin(this.ambientClock*1.7+b.phase)*0.03+b.rotBias};
            this.drawBottleShadow(ctx,mock,this.bottlePalette(mock));
            this.drawBottle(ctx,mock);
        }
    }

    // ════════════════════════════════════════════════
    //  DRAW — FX
    // ════════════════════════════════════════════════
    drawParticlesFX(ctx) {
        for (const p of this.particles) {
            const alpha=this.clamp(p.life/(p.maxLife||1),0,1);
            if (p.type==='ring') {
                const r=20+p.maxR*(1-alpha);
                ctx.strokeStyle=`rgba(${p.color},${0.38*alpha})`;
                ctx.lineWidth=4*alpha+1;
                ctx.beginPath(); ctx.arc(p.x,p.y,r,0,this.TAU); ctx.stroke();
            } else if (p.type==='spark') {
                ctx.strokeStyle=`rgba(${p.color},${alpha})`;
                ctx.lineWidth=1.4;
                ctx.beginPath();
                ctx.moveTo(p.x,p.y);
                ctx.lineTo(p.x-p.vx*0.028,p.y-p.vy*0.028);
                ctx.stroke();
            } else if (p.type==='shard') {
                ctx.save();
                ctx.translate(p.x,p.y); ctx.rotate(p.rot);
                ctx.fillStyle=`rgba(${p.color},${0.24*alpha})`;
                ctx.strokeStyle=`rgba(255,255,255,${0.34*alpha})`;
                ctx.lineWidth=1;
                ctx.beginPath();
                ctx.moveTo(-p.size*0.7,-p.size*0.4);
                ctx.lineTo(p.size*0.85,-p.size*0.2);
                ctx.lineTo(p.size*0.34,p.size*0.8);
                ctx.lineTo(-p.size*0.74,p.size*0.2);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.restore();
            } else {
                ctx.globalAlpha=Math.max(0,p.life);
                ctx.fillStyle=`rgb(${p.color})`;
                ctx.beginPath(); ctx.arc(p.x,p.y,Math.max(0.3,(p.size||2)*p.life),0,this.TAU); ctx.fill();
                ctx.globalAlpha=1;
            }
        }
    }

    drawGlassShardsFX(ctx) {
        ctx.save();
        for (const s of this.glassShards) {
            ctx.globalAlpha=Math.max(0,s.life)*0.7;
            ctx.save();
            ctx.translate(s.x,s.y); ctx.rotate(s.rotation);
            ctx.fillStyle=s.color; ctx.fillRect(-s.w/2,-s.h/2,s.w,s.h);
            ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.fillRect(-s.w/2+0.5,-s.h/2,s.w*0.3,s.h);
            ctx.restore();
        }
        ctx.globalAlpha=1; ctx.restore();
    }

    drawSplashesFX(ctx) {
        ctx.save();
        for (const s of this.splashes) {
            ctx.globalAlpha=Math.max(0,s.life)*0.65;
            ctx.fillStyle=s.color;
            ctx.beginPath(); ctx.arc(s.x,s.y,Math.max(0.5,s.r),0,this.TAU); ctx.fill();
            ctx.globalAlpha=Math.max(0,s.life)*0.25;
            ctx.beginPath(); ctx.arc(s.x,s.y,Math.max(0.5,s.r*2),0,this.TAU); ctx.fill();
        }
        ctx.globalAlpha=1; ctx.restore();
    }

    drawShellCasingsFX(ctx) {
        for (const s of this.shellCasings) {
            ctx.save();
            ctx.translate(s.x,s.y); ctx.rotate(s.rot);
            ctx.fillStyle='#d4a017'; ctx.fillRect(-1.5,-6,3,12);
            ctx.fillStyle='#b8860b'; ctx.fillRect(-1.5,-6,3,2.5);
            ctx.restore();
        }
    }

    drawBulletTrailsFX(ctx) {
        ctx.save();
        for (const t of this.bulletTrails) {
            const prog=Math.min(1,t.prog);
            const ex=t.sx+(t.ex-t.sx)*prog, ey=t.sy+(t.ey-t.sy)*prog;
            ctx.globalAlpha=t.opacity*0.4;
            ctx.strokeStyle='#FFD700'; ctx.lineWidth=1.5;
            ctx.setLineDash([4,5]);
            ctx.beginPath(); ctx.moveTo(t.sx,t.sy); ctx.lineTo(ex,ey); ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.globalAlpha=1; ctx.restore();
    }

    drawMuzzleFlashFX(ctx) {
        if (this.crossPulse<=0) return;
        const cx=this.crosshair.x, cy=this.crosshair.y;
        ctx.save();
        ctx.globalAlpha=this.crossPulse*0.45;
        const fg=ctx.createRadialGradient(cx,cy,0,cx,cy,35);
        fg.addColorStop(0,'rgba(255,255,200,0.7)');
        fg.addColorStop(0.3,'rgba(255,200,50,0.35)');
        fg.addColorStop(1,'rgba(255,100,0,0)');
        ctx.fillStyle=fg; ctx.beginPath(); ctx.arc(cx,cy,35,0,this.TAU); ctx.fill();
        ctx.restore();
    }

    drawScorePopupsFX(ctx) {
        for (const p of this.scorePopups) {
            ctx.save();
            ctx.font=`800 13px ${this.FONT_UI}`;
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.globalAlpha=p.opacity;
            ctx.shadowBlur=5; ctx.shadowColor=`rgb(${p.color})`;
            ctx.strokeStyle='rgba(0,0,0,0.6)'; ctx.lineWidth=2.5; ctx.lineJoin='round';
            ctx.strokeText(p.text,p.x,p.y);
            ctx.fillStyle=`rgb(${p.color})`; ctx.fillText(p.text,p.x,p.y);
            ctx.shadowBlur=0; ctx.restore();
        }
    }

    drawFloatingTextsFX(ctx) {
        for (const t of this.floatingTexts) {
            const sc=Math.min(1,t.scale||1);
            ctx.save();
            ctx.font=`800 ${(t.size||14)*sc}px ${this.FONT_UI}`;
            ctx.textAlign='center'; ctx.textBaseline='middle';
            ctx.globalAlpha=Math.max(0,t.opacity);
            ctx.shadowBlur=8; ctx.shadowColor=`rgb(${t.color})`;
            ctx.strokeStyle='rgba(0,0,0,0.5)'; ctx.lineWidth=3; ctx.lineJoin='round';
            ctx.strokeText(t.text,t.x,t.y);
            ctx.fillStyle=`rgb(${t.color})`; ctx.fillText(t.text,t.x,t.y);
            ctx.shadowBlur=0; ctx.restore();
        }
    }

    drawDust(ctx, layer) {
        for (const d of this.dust) {
            if (d.layer!==layer) continue;
            const a=d.alpha*(0.55+0.45*Math.sin(this.ambientClock*d.tw+d.seed));
            ctx.fillStyle=`rgba(255,232,188,${a})`;
            ctx.beginPath(); ctx.arc(d.x,d.y,layer?d.r*1.55:d.r,0,this.TAU); ctx.fill();
        }
    }

    drawFrontCounter(ctx) {
        const W=this.W, H=this.H, railY=H*0.84, y=H*0.87;
        const rl=ctx.createLinearGradient(0,railY,0,railY+18);
        rl.addColorStop(0,'#693619'); rl.addColorStop(1,'#31170a');
        ctx.fillStyle=rl; ctx.fillRect(0,railY,W,18);

        const ct=ctx.createLinearGradient(0,y,0,H);
        ct.addColorStop(0,'#4b2411'); ct.addColorStop(0.3,'#2a120a'); ct.addColorStop(1,'#090506');
        ctx.fillStyle=ct; ctx.fillRect(0,y,W,H-y);

        ctx.fillStyle='rgba(255,220,170,.12)'; ctx.fillRect(0,railY,W,2);
        const gw=ctx.createRadialGradient(W*0.5,y-16,0,W*0.5,y-16,W*0.36);
        gw.addColorStop(0,'rgba(255,200,120,.08)'); gw.addColorStop(1,'rgba(255,170,100,0)');
        ctx.fillStyle=gw; ctx.fillRect(0,y-80,W,140);
    }

    drawVignette(ctx) {
        const W=this.W, H=this.H;
        const vg=ctx.createRadialGradient(W*0.5,H*0.44,Math.min(W,H)*0.14,W*0.5,H*0.52,Math.max(W,H)*0.8);
        vg.addColorStop(0,'rgba(0,0,0,0)'); vg.addColorStop(1,'rgba(0,0,0,.56)');
        ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);
    }

    // ════════════════════════════════════════════════
    //  DRAW — CROSSHAIR
    // ════════════════════════════════════════════════
    drawCrosshair(ctx) {
        const hovered=this.pickBottleAt(this.crosshair.x,this.crosshair.y);
        let color='255,245,230';
        if (hovered) color=this.bottlePalette(hovered).glow;

        const cx=this.crosshair.x, cy=this.crosshair.y;
        const pulse=1+this.crossPulse*0.32;
        const inner=13*pulse, outer=26+this.crossPulse*7;
        const gap=8+this.crosshair.spread*0.4, len=12;

        ctx.save(); ctx.translate(cx,cy);
        ctx.strokeStyle=`rgba(${color},.9)`; ctx.lineWidth=1.6;
        ctx.beginPath(); ctx.arc(0,0,inner,0,this.TAU); ctx.stroke();
        ctx.strokeStyle=`rgba(${color},.32)`;
        ctx.beginPath(); ctx.arc(0,0,outer+this.crosshair.spread,0,this.TAU); ctx.stroke();
        ctx.strokeStyle=`rgba(${color},.95)`;
        ctx.beginPath();
        ctx.moveTo(-(inner+gap+len),0); ctx.lineTo(-(inner+gap),0);
        ctx.moveTo(inner+gap,0);        ctx.lineTo(inner+gap+len,0);
        ctx.moveTo(0,-(inner+gap+len)); ctx.lineTo(0,-(inner+gap));
        ctx.moveTo(0,inner+gap);        ctx.lineTo(0,inner+gap+len);
        ctx.stroke();
        ctx.fillStyle=`rgba(${color},.95)`;
        ctx.beginPath(); ctx.arc(0,0,1.9+this.crossPulse*0.7,0,this.TAU); ctx.fill();
        ctx.strokeStyle=`rgba(${color},.5)`; ctx.lineWidth=0.8;
        ctx.beginPath();
        ctx.moveTo(0,-gap); ctx.lineTo(gap,0); ctx.lineTo(0,gap); ctx.lineTo(-gap,0);
        ctx.closePath(); ctx.stroke();
        const rA=this.time*3;
        ctx.strokeStyle=`rgba(${color},.35)`; ctx.lineWidth=1;
        ctx.beginPath(); ctx.arc(0,0,outer+this.crosshair.spread+3,rA,rA+Math.PI); ctx.stroke();
        ctx.restore();
    }

    // ════════════════════════════════════════════════
    //  DRAW — HUD
    // ════════════════════════════════════════════════
    drawHUD(ctx) {
        const W=this.W, H=this.H, mob=this.isMobile;

        const hg=ctx.createLinearGradient(0,0,0,62);
        hg.addColorStop(0,'rgba(0,0,0,0.62)'); hg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=hg; ctx.fillRect(0,0,W,66);

        // Score
        ctx.font=`600 10px ${this.FONT_UI}`;
        ctx.textAlign='left'; ctx.fillStyle='rgba(255,242,220,.55)';
        ctx.fillText('SCORE',14,14);
        ctx.font=`800 ${mob?16:20}px ${this.FONT_TITLE}`;
        ctx.fillStyle='#ffd27c'; ctx.shadowBlur=6; ctx.shadowColor='rgba(255,210,120,.3)';
        ctx.fillText(this.score.toLocaleString(),14,30); ctx.shadowBlur=0;
        if (this.bestScore>0) {
            ctx.font=`600 9px ${this.FONT_UI}`;
            ctx.fillStyle='rgba(255,215,0,.4)';
            ctx.fillText(`BEST: ${this.bestScore.toLocaleString()}`,14,44);
        }

        // Timer
        const tc=this.timeLeft<=10?'#ff8a6b':'#ffe7a6';
        ctx.font=`600 10px ${this.FONT_UI}`;
        ctx.textAlign='center'; ctx.fillStyle='rgba(255,242,220,.55)';
        ctx.fillText('TIME LEFT',W/2,14);
        ctx.font=`800 ${mob?18:24}px ${this.FONT_TITLE}`;
        ctx.fillStyle=tc;
        if (this.timeLeft<=10) { ctx.shadowBlur=8; ctx.shadowColor='rgba(255,110,88,.3)'; }
        ctx.fillText(this.timeLeft.toFixed(1),W/2,32); ctx.shadowBlur=0;

        // Timer bar
        const bW=Math.min(W*0.36,300), bH=7, bX=(W-bW)/2, bY=38;
        ctx.fillStyle='rgba(255,245,220,.12)';
        ctx.beginPath(); ctx.roundRect(bX,bY,bW,bH,99); ctx.fill();
        const fW=bW*this.clamp(this.timeLeft/this.MAX_TIME,0,1);
        if (fW>0) {
            const fg=ctx.createLinearGradient(bX,0,bX+bW,0);
            if (this.timeLeft<=10) { fg.addColorStop(0,'#ffb889'); fg.addColorStop(0.45,'#ff7b57'); fg.addColorStop(1,'#ff5353'); }
            else { fg.addColorStop(0,'#ffe7a6'); fg.addColorStop(0.54,'#ffb366'); fg.addColorStop(1,'#ff7f58'); }
            ctx.fillStyle=fg; ctx.beginPath(); ctx.roundRect(bX,bY,fW,bH,99); ctx.fill();
        }

        // Ammo
        ctx.font=`600 10px ${this.FONT_UI}`;
        ctx.textAlign='right'; ctx.fillStyle='rgba(255,242,220,.55)';
        ctx.fillText('AMMO',W-14,14);
        const rw=mob?7:9, rh=mob?20:24, rg=mob?5:7;
        const aTW=this.MAX_AMMO*rw+(this.MAX_AMMO-1)*rg;
        const aSX=W-14-aTW, aY=22;
        for (let i=0;i<this.MAX_AMMO;i++) {
            const rx=aSX+i*(rw+rg);
            if (this.reloading) {
                ctx.globalAlpha=0.18+0.4*(0.5+0.5*Math.sin(this.time*7+i*0.5));
            } else {
                ctx.globalAlpha=(!this.reloading&&i<this.ammo)?1:0.22;
            }
            const rg2=ctx.createLinearGradient(rx,aY,rx,aY+rh);
            rg2.addColorStop(0,'#ffe2a6'); rg2.addColorStop(0.28,'#e0af63');
            rg2.addColorStop(0.72,'#b97733'); rg2.addColorStop(1,'#6f3f18');
            ctx.fillStyle=rg2; ctx.beginPath(); ctx.roundRect(rx,aY,rw,rh,99); ctx.fill();
        }
        ctx.globalAlpha=1;

        // Combo / Reloading text
        if (this.combo>1) {
            ctx.font=`800 ${mob?11:13}px ${this.FONT_UI}`;
            ctx.textAlign='right'; ctx.fillStyle=this.combo>=5?'#ffe7a6':'#ffd27c';
            if (this.combo>=5) { ctx.shadowBlur=12; ctx.shadowColor='rgba(255,205,120,.35)'; }
            ctx.fillText(`${this.combo}x COMBO`,W-14,aY+rh+16); ctx.shadowBlur=0;
        } else if (this.reloading) {
            ctx.font=`800 ${mob?11:13}px ${this.FONT_UI}`;
            ctx.textAlign='right'; ctx.fillStyle='#ffd27c';
            ctx.fillText('RELOADING...',W-14,aY+rh+16);
        }

        // Accuracy & bottles
        const acc=this.totalShots>0?Math.round((this.totalHits/this.totalShots)*100):100;
        ctx.font=`600 9px ${this.FONT_UI}`; ctx.textAlign='left';
        ctx.fillStyle=acc>70?'rgba(0,255,136,.5)':acc>40?'rgba(255,215,0,.5)':'rgba(255,100,100,.5)';
        ctx.fillText(`ACC: ${acc}%`,14,56);
        ctx.fillStyle='rgba(255,255,255,.3)';
        ctx.fillText(`BOTTLES: ${this.bottles.filter(b=>!b.dead).length}`,90,56);

        // Bottom hint
        const bbar=ctx.createLinearGradient(0,H-28,0,H);
        bbar.addColorStop(0,'rgba(0,0,0,0)'); bbar.addColorStop(1,'rgba(0,0,0,0.35)');
        ctx.fillStyle=bbar; ctx.fillRect(0,H-28,W,28);
        ctx.font=`600 9px ${this.FONT_UI}`; ctx.textAlign='center';
        ctx.fillStyle='rgba(255,255,255,.22)';
        ctx.fillText('Click / Tap to Shoot  •  R to Reload',W/2,H-10);
    }

    // ════════════════════════════════════════════════
    //  DRAW — WAITING SCREEN
    // ════════════════════════════════════════════════
    drawWaiting(ctx) {
        const W=this.W, H=this.H, cx=W/2, cy=H/2;

        ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,W,H);

        const pw=Math.min(W-40,600), ph=240, px=cx-pw/2, py=cy-ph/2;
        ctx.fillStyle='rgba(6,4,10,0.85)';
        ctx.beginPath(); ctx.roundRect(px,py,pw,ph,20); ctx.fill();
        ctx.strokeStyle='rgba(255,210,120,.15)'; ctx.lineWidth=1;
        ctx.beginPath(); ctx.roundRect(px,py,pw,ph,20); ctx.stroke();

        ctx.font=`600 11px ${this.FONT_TITLE}`;
        ctx.textAlign='center'; ctx.fillStyle='rgba(255,242,220,.6)';
        ctx.fillText('CINEMATIC GLASS RANGE',cx,py+38);

        ctx.font=`800 ${this.isMobile?28:42}px ${this.FONT_TITLE}`;
        ctx.fillStyle='#ffd27c'; ctx.shadowBlur=12; ctx.shadowColor='rgba(255,210,120,.25)';
        ctx.fillText('BOTTLE SHOOTER',cx,py+82); ctx.shadowBlur=0;

        ctx.font=`400 ${this.isMobile?11:13}px ${this.FONT_UI}`;
        ctx.fillStyle='rgba(255,243,224,.7)';
        ctx.fillText('Smash gold bottles for bonus time • Ignite nitro chains',cx,py+110);

        ctx.font=`600 10px ${this.FONT_UI}`;
        ctx.fillStyle='rgba(255,239,214,.5)';
        ctx.fillText('Mouse / Tap to aim & shoot  •  R to reload',cx,py+136);

        const bob=Math.sin(this.time*3)*3;
        ctx.font=`800 15px ${this.FONT_UI}`;
        ctx.fillStyle='#ffd27c'; ctx.shadowBlur=8; ctx.shadowColor='rgba(255,210,120,.2)';
        ctx.fillText('CLICK TO START',cx,py+ph-28+bob); ctx.shadowBlur=0;
    }

    // ════════════════════════════════════════════════
    //  DRAW — GAME OVER / DEATH SCREEN
    // ════════════════════════════════════════════════
    drawDeathScreen(ctx) {
        const W=this.W, H=this.H, cx=W/2, cy=H/2;
        const alpha=this.deathOverlayAlpha;

        ctx.fillStyle=`rgba(0,0,0,${alpha*0.78})`; ctx.fillRect(0,0,W,H);
        const vg=ctx.createRadialGradient(cx,cy,50,cx,cy,W*0.6);
        vg.addColorStop(0,'rgba(0,0,0,0)');
        vg.addColorStop(1,`rgba(80,0,0,${alpha*0.2})`);
        ctx.fillStyle=vg; ctx.fillRect(0,0,W,H);

        if (alpha<0.5) return;
        const pa=(alpha-0.5)/0.5;
        const pw=Math.min(W-30,340), ph=340, px=cx-pw/2, py=cy-ph/2;

        ctx.globalAlpha=pa;
        ctx.fillStyle='rgba(6,3,12,0.95)';
        ctx.beginPath(); ctx.roundRect(px,py,pw,ph,18); ctx.fill();
        ctx.strokeStyle='rgba(255,140,90,.25)'; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.roundRect(px,py,pw,ph,18); ctx.stroke();
        ctx.globalAlpha=1;

        const isNew=this.score>=this.bestScore&&this.score>0;
        ctx.save(); ctx.globalAlpha=pa;
        ctx.font=`800 22px ${this.FONT_TITLE}`; ctx.textAlign='center';
        ctx.fillStyle=isNew?'#FFD700':'#ff8b57';
        ctx.shadowBlur=10; ctx.shadowColor=isNew?'rgba(255,215,0,.3)':'rgba(255,140,90,.3)';
        ctx.fillText(isNew?'NEW RECORD':this.titleForScore(this.score).toUpperCase(),cx,py+38);
        ctx.shadowBlur=0;

        ctx.font=`900 ${this.isMobile?42:56}px ${this.FONT_TITLE}`;
        ctx.fillStyle='#ffe4a1'; ctx.shadowBlur=14; ctx.shadowColor='rgba(255,190,95,.18)';
        ctx.fillText(this.score.toLocaleString(),cx,py+100); ctx.shadowBlur=0;

        ctx.fillStyle=`rgba(255,255,255,${0.07*pa})`; ctx.fillRect(px+20,py+115,pw-40,1);

        const acc=this.totalShots>0?Math.round((this.totalHits/this.totalShots)*100):0;
        [
            {label:'BEST',       val:this.bestScore.toLocaleString(), color:'#FFD700'},
            {label:'BOTTLES',    val:String(this.bottlesBroken),      color:'#00D4FF'},
            {label:'ACCURACY',   val:`${acc}%`,                       color:acc>70?'#00FF88':'#FFD700'},
            {label:'BEST COMBO', val:`${this.bestCombo}x`,            color:'#FF8C00'},
            {label:'SHOTS FIRED',val:String(this.totalShots),         color:'#aaddff'}
        ].forEach((r,i)=>{
            const ry=py+138+i*26;
            ctx.font=`600 10px ${this.FONT_UI}`; ctx.textAlign='left';
            ctx.fillStyle=`rgba(160,165,180,${pa})`; ctx.fillText(r.label,px+24,ry);
            ctx.font=`800 12px ${this.FONT_UI}`; ctx.textAlign='right';
            ctx.fillStyle=r.color; ctx.globalAlpha=pa; ctx.fillText(r.val,px+pw-24,ry);
        });

        if (isNew) {
            const np=1+Math.sin(this.time*5)*0.06;
            ctx.font=`800 ${13*np}px ${this.FONT_UI}`; ctx.textAlign='center';
            ctx.fillStyle='#FFD700'; ctx.shadowBlur=8; ctx.shadowColor='rgba(255,215,0,.3)';
            ctx.fillText('★ NEW HIGH SCORE ★',cx,py+ph-55); ctx.shadowBlur=0;
        }

        ctx.fillStyle=`rgba(255,255,255,${0.07*pa})`; ctx.fillRect(px+20,py+ph-44,pw-40,1);

        const blink=0.4+Math.sin(this.time*2.5)*0.45;
        ctx.font=`700 12px ${this.FONT_UI}`; ctx.textAlign='center';
        ctx.fillStyle=`rgba(255,210,160,${blink*pa})`;
        ctx.fillText('TAP TO PLAY AGAIN',cx,py+ph-18);
        ctx.restore();
    }

    // ════════════════════════════════════════════════
    //  DRAW — MAIN
    // ════════════════════════════════════════════════
    draw() {
        const ctx=this.ctx, W=this.W, H=this.H;

        ctx.save();
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
        ctx.restore();

        const sx=this.cameraShake?this.rand(-this.cameraShake,this.cameraShake):0;
        const sy=this.cameraShake?this.rand(-this.cameraShake*0.7,this.cameraShake*0.7):0;

        ctx.save();
        ctx.translate(sx,sy);

        this.drawNightSky(ctx);
        this.drawBackdrop(ctx);
        this.drawDust(ctx,0);

        this.lanes.forEach((lane,idx)=>this.drawShelf(ctx,lane,idx));

        const active=this.bottles.filter(b=>!b.dead).sort((a,b)=>a.lane.index-b.lane.index);
        if (active.length) {
            for (const b of active) this.drawBottleShadow(ctx,b,this.bottlePalette(b));
            for (const b of active) this.drawBottle(ctx,b);
        } else if (this.state!==this.STATE.PLAYING) {
            this.drawIdleSet(ctx);
        }

        this.drawGlassShardsFX(ctx);
        this.drawSplashesFX(ctx);
        this.drawParticlesFX(ctx);
        this.drawShellCasingsFX(ctx);
        this.drawBulletTrailsFX(ctx);
        this.drawMuzzleFlashFX(ctx);
        this.drawScorePopupsFX(ctx);
        this.drawFloatingTextsFX(ctx);

        this.drawFrontCounter(ctx);
        this.drawDust(ctx,1);
        this.drawVignette(ctx);

        if (this.flash>0) {
            ctx.fillStyle=`rgba(255,210,160,${this.flash*0.08})`;
            ctx.fillRect(0,0,W,H);
        }

        if (this.state===this.STATE.PLAYING) {
            this.drawCrosshair(ctx);
            this.drawHUD(ctx);
        }

        if (this.state===this.STATE.WAITING) this.drawWaiting(ctx);
        if (this.state===this.STATE.DEAD)    this.drawDeathScreen(ctx);

        ctx.restore();
    }

    // ════════════════════════════════════════════════
    //  GAME LOOP
    // ════════════════════════════════════════════════
    loop(timestamp) {
        if (this.destroyed) return;
        const dt=Math.min((timestamp-(this.lastTime||timestamp))/1000,0.05);
        this.lastTime=timestamp;
        if (!this.paused) this.update(dt);
        this.draw();
        this.animId=requestAnimationFrame(t=>this.loop(t));
    }

    // ════════════════════════════════════════════════
    //  PUBLIC API
    // ════════════════════════════════════════════════
    togglePause() {
        this.paused=!this.paused;
        this.isPaused=this.paused;
        if (!this.paused) this.lastTime=performance.now();
        return this.paused;
    }

    resize() {
        this.ctx.setTransform(1,0,0,1,0,0);
        this.setupHDCanvas();
        this.W=this.canvas.width/this.dpr;
        this.H=this.canvas.height/this.dpr;
        this.ctx.scale(this.dpr,this.dpr);
        this.isMobile=this.W<768||('ontouchstart' in window);
        this.crosshair.x=this.W/2; this.crosshair.y=this.H/2;
        this.crosshair.targetX=this.W/2; this.crosshair.targetY=this.H/2;
        this.buildAll();
    }

    destroy() {
        this.destroyed=true;
        cancelAnimationFrame(this.animId);
        this.canvas.removeEventListener('mousemove',   this._onMouseMove);
        this.canvas.removeEventListener('click',       this._onClick);
        this.canvas.removeEventListener('touchstart',  this._onTouchStart);
        this.canvas.removeEventListener('touchmove',   this._onTouchMove);
        this.canvas.removeEventListener('contextmenu', this._onContext);
        document.removeEventListener('keydown', this._onKeyDown);
        if (this.fsBtn) {
            this.fsBtn.removeEventListener('click', this._boundFsClick);
            document.removeEventListener('fullscreenchange',       this._boundFsChange);
            document.removeEventListener('webkitfullscreenchange', this._boundFsChange);
            this.fsBtn.remove();
        }
        if (this.audioCtx) { try { this.audioCtx.close(); } catch(e) {} }
    }
}