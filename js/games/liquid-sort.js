// liquid-sort.js - Premium Liquid Sort Game v3.2 OPTIMIZED
'use strict';

class LiquidSort {
    constructor(canvasElement, onScoreCallback) {
        this._onScore = onScoreCallback || function(){};
        this._destroyed = false;

        this.COLORS = [
            { hex: "#FF2244", name: "Red",      light: "#FF6677", dark: "#AA0022", glow: "rgba(255,34,68,0.4)" },
            { hex: "#00EE66", name: "Green",    light: "#66FFaa", dark: "#007733", glow: "rgba(0,238,102,0.4)" },
            { hex: "#1166FF", name: "Blue",     light: "#66AAFF", dark: "#003399", glow: "rgba(17,102,255,0.4)" },
            { hex: "#FFD700", name: "Yellow",   light: "#FFE866", dark: "#AA8800", glow: "rgba(255,215,0,0.4)" },
            { hex: "#DD00FF", name: "Magenta",  light: "#EE77FF", dark: "#880099", glow: "rgba(221,0,255,0.4)" },
            { hex: "#00EEFF", name: "Cyan",     light: "#77FFFF", dark: "#007788", glow: "rgba(0,238,255,0.4)" },
            { hex: "#FF7700", name: "Orange",   light: "#FFAA44", dark: "#993300", glow: "rgba(255,119,0,0.4)" },
            { hex: "#9900FF", name: "Purple",   light: "#CC66FF", dark: "#550099", glow: "rgba(153,0,255,0.4)" },
            { hex: "#FF0099", name: "Pink",     light: "#FF66CC", dark: "#990055", glow: "rgba(255,0,153,0.4)" },
            { hex: "#00FFAA", name: "Mint",     light: "#77FFCC", dark: "#007744", glow: "rgba(0,255,170,0.4)" },
            { hex: "#7777FF", name: "Lavender", light: "#AAAAFF", dark: "#3333AA", glow: "rgba(119,119,255,0.4)" },
            { hex: "#FF8888", name: "Salmon",   light: "#FFBBBB", dark: "#CC4444", glow: "rgba(255,136,136,0.4)" },
        ];

        this.LEVELS = [
            { colors: 3,  emptyTubes: 2, layers: 4 },
            { colors: 4,  emptyTubes: 2, layers: 4 },
            { colors: 5,  emptyTubes: 2, layers: 4 },
            { colors: 6,  emptyTubes: 2, layers: 4 },
            { colors: 7,  emptyTubes: 2, layers: 4 },
            { colors: 8,  emptyTubes: 2, layers: 4 },
            { colors: 9,  emptyTubes: 2, layers: 4 },
            { colors: 10, emptyTubes: 2, layers: 4 },
            { colors: 11, emptyTubes: 2, layers: 4 },
            { colors: 12, emptyTubes: 2, layers: 4 },
        ];

        this.TUBE_CAPACITY = 4;

        // ── PERFORMANCE FIX: Lower DPR on mobile ──
        const isMobile = window.innerWidth < 768 || ('ontouchstart' in window);
        this.DPR = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);

        // State
        this.tubes = [];
        this.selectedTube = null;
        this.currentLevel = 0;
        this.moves = 0;
        this.gameWon = false;
        this.history = [];
        this.score = 0;
        this.timerInterval = null;
        this.timeElapsed = 0;
        this.tubePositions = [];
        this.hoverTube = -1;

        // ── PERFORMANCE FIX: Limit particles ──
        this.particles = [];
        this.splashParticles = [];
        this.MAX_PARTICLES = isMobile ? 40 : 80;

        this.audioCtx = null;
        this.animationFrameId = null;
        this.globalTime = 0;
        this.fsBtnRect = { x: 0, y: 0, w: 0, h: 0 };
        this.pourAnim = null;
        this.bgCache = null;

        // ── PERFORMANCE FIX: Cache gradients ──
        this._gradCache = new Map();
        this._lastFrameTime = 0;
        this._frameSkip = 0;

        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        this._handleClick = this._onHandleClick.bind(this);
        this._handleMouseMove = this._onMouseMove.bind(this);
        this._handleKey = this._onKey.bind(this);
        this._handleResize = this._onResize.bind(this);

        this._init();
    }

    _init() {
        this._initAudio();
        this._setupCanvas();

        const savedLevel = this._loadProgress();
        this._startLevel(savedLevel);

        this.canvas.addEventListener('click', this._handleClick);
        this.canvas.addEventListener('touchstart', this._handleClick, { passive: false });
        this.canvas.addEventListener('mousemove', this._handleMouseMove);
        this.canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
        window.addEventListener('keydown', this._handleKey);
        window.addEventListener('resize', this._handleResize);

        this._resumeAudio = () => {
            if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
            document.removeEventListener('click', this._resumeAudio);
            document.removeEventListener('touchstart', this._resumeAudio);
        };
        document.addEventListener('click', this._resumeAudio);
        document.addEventListener('touchstart', this._resumeAudio);

        this._mainLoop();
    }

    destroy() {
        this._destroyed = true;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this._stopTimer();

        this.canvas.removeEventListener('click', this._handleClick);
        this.canvas.removeEventListener('touchstart', this._handleClick);
        this.canvas.removeEventListener('mousemove', this._handleMouseMove);
        window.removeEventListener('keydown', this._handleKey);
        window.removeEventListener('resize', this._handleResize);

        if (this._resumeAudio) {
            document.removeEventListener('click', this._resumeAudio);
            document.removeEventListener('touchstart', this._resumeAudio);
        }

        if (this.audioCtx) { try { this.audioCtx.close(); } catch(e) {} }

        this.tubes = [];
        this.particles = [];
        this.splashParticles = [];
        this._gradCache.clear();
    }

    resize() { this._setupCanvas(); }
    togglePause() { return false; }

    // ══════════════════ CANVAS SETUP ══════════════════

    _setupCanvas() {
        const parent = this.canvas.parentElement;
        let cw = parent ? (parent.clientWidth  || parent.offsetWidth)  : (this.canvas.clientWidth  || 400);
        let ch = parent ? (parent.clientHeight || parent.offsetHeight) : (this.canvas.clientHeight || 600);

        // Fallback
        if (cw < 10) cw = window.innerWidth;
        if (ch < 10) ch = window.innerHeight;

        cw = Math.max(cw, 340);
        ch = Math.max(ch, 480);

        this.canvas.width  = Math.round(cw * this.DPR);
        this.canvas.height = Math.round(ch * this.DPR);
        this.canvas.style.width  = cw + 'px';
        this.canvas.style.height = ch + 'px';

        // Clear caches on resize
        this.bgCache = null;
        this._gradCache.clear();
        this._calculateLayout();
    }

    // ══════════════════ AUDIO ══════════════════

    _initAudio() {
        try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }

    _playTone(freq, dur, type = 'sine', vol = 0.12) {
        if (!this.audioCtx) return;
        try {
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            osc.frequency.value = freq; osc.type = type;
            gain.gain.setValueAtTime(vol, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + dur);
            osc.start(this.audioCtx.currentTime);
            osc.stop(this.audioCtx.currentTime + dur);
        } catch(e) {}
    }

    _playSelect()   { this._playTone(540, 0.12, 'sine', 0.1); }
    _playError()    { this._playTone(180, 0.25, 'square', 0.07); }
    _playUndo()     { this._playTone(330, 0.15, 'sine', 0.08); }
    _playPour() {
        this._playTone(440, 0.18, 'sine', 0.08);
        setTimeout(() => this._playTone(660, 0.15, 'sine', 0.08), 120);
    }
    _playWin() {
        [523, 659, 784, 1047].forEach((f, i) =>
            setTimeout(() => this._playTone(f, 0.25, 'sine', 0.13), i * 160));
    }
    _playTubeComplete() {
        this._playTone(700, 0.12, 'sine', 0.1);
        setTimeout(() => this._playTone(900, 0.18, 'sine', 0.1), 110);
    }

    // ══════════════════ GAME LOGIC ══════════════════

    _generateLevel(levelIndex) {
        const lvl = this.LEVELS[Math.min(levelIndex, this.LEVELS.length - 1)];
        const { colors: numColors, emptyTubes, layers } = lvl;
        let pool = [];
        for (let c = 0; c < numColors; c++)
            for (let l = 0; l < layers; l++) pool.push(c);
        for (let s = 0; s < 7; s++)
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
        let newTubes = [];
        for (let i = 0; i < numColors; i++)
            newTubes.push(pool.slice(i * layers, i * layers + layers));
        for (let i = 0; i < emptyTubes; i++) newTubes.push([]);
        return newTubes;
    }

    _getTopColor(tube)      { return tube.length === 0 ? -1 : tube[tube.length - 1]; }
    _getTopColorCount(tube) {
        if (!tube.length) return 0;
        const top = tube[tube.length - 1];
        let count = 0;
        for (let i = tube.length - 1; i >= 0 && tube[i] === top; i--) count++;
        return count;
    }

    _canPour(from, to) {
        if (!from.length) return false;
        if (to.length >= this.TUBE_CAPACITY) return false;
        if (!to.length) return true;
        return this._getTopColor(from) === this._getTopColor(to);
    }

    _executePour(fromIdx, toIdx) {
        const from = this.tubes[fromIdx], to = this.tubes[toIdx];
        if (!this._canPour(from, to)) return 0;
        this.history.push(JSON.parse(JSON.stringify(this.tubes)));
        const topColor = this._getTopColor(from);
        const topCount = this._getTopColorCount(from);
        const space    = this.TUBE_CAPACITY - to.length;
        const count    = Math.min(topCount, space);
        for (let i = 0; i < count; i++) to.push(from.pop());
        this.moves++;
        this._createSplashParticles(toIdx, topColor);
        if (to.length === this.TUBE_CAPACITY && this._getTopColorCount(to) === this.TUBE_CAPACITY) {
            this._playTubeComplete();
            this.score += 150;
            this._createCompletionParticles(toIdx);
        }
        this._onScore(this.score);
        return count;
    }

    _undoMove() {
        if (!this.history.length || this.pourAnim) return;
        this.tubes = this.history.pop();
        this.moves = Math.max(0, this.moves - 1);
        this.selectedTube = null;
        this._playUndo();
    }

    _checkWin() {
        for (const t of this.tubes) {
            if (!t.length) continue;
            if (t.length !== this.TUBE_CAPACITY) return false;
            if (this._getTopColorCount(t) !== this.TUBE_CAPACITY) return false;
        }
        return true;
    }

    _isTubeComplete(tube) {
        return tube.length === this.TUBE_CAPACITY && this._getTopColorCount(tube) === this.TUBE_CAPACITY;
    }

    // ══════════════════ POUR ANIMATION ══════════════════

    _startPourAnimation(fromIdx, toIdx) {
        const from     = this.tubes[fromIdx];
        const topColor = this._getTopColor(from);
        const topCount = this._getTopColorCount(from);
        const space    = this.TUBE_CAPACITY - this.tubes[toIdx].length;
        const layers   = Math.min(topCount, space);
        const fromPos  = this.tubePositions[fromIdx];
        const toPos    = this.tubePositions[toIdx];
        const D        = this.DPR;

        const floatingLayers = [];
        const layerH = this._getTubeLayerH(fromPos);
        for (let i = 0; i < layers; i++) {
            const srcIdx  = from.length - 1 - i;
            const srcY    = fromPos.y + fromPos.h - 8*D - (srcIdx+1)*layerH;
            const destIdx = this.tubes[toIdx].length + i;
            const destY   = toPos.y + toPos.h - 8*D - (destIdx+1)*this._getTubeLayerH(toPos);
            floatingLayers.push({
                startX: fromPos.cx, startY: srcY + layerH/2,
                endX: toPos.cx,     endY: destY + this._getTubeLayerH(toPos)/2,
                color: topColor,    delay: i * 0.12,
            });
        }

        this.pourAnim = {
            fromIndex: fromIdx, toIndex: toIdx,
            colorIndex: topColor, layers,
            progress: 0, floatingLayers,
        };
    }

    _getTubeLayerH(pos) { return (pos.h - 16*this.DPR) / this.TUBE_CAPACITY; }

    _updatePourAnim() {
        if (!this.pourAnim) return;
        // ── PERFORMANCE FIX: Faster animation ──
        this.pourAnim.progress += 0.04;
        if (this.pourAnim.progress >= 1) {
            this._executePour(this.pourAnim.fromIndex, this.pourAnim.toIndex);
            this._playPour();
            const won = this._checkWin();
            this.pourAnim = null;
            this.selectedTube = null;
            if (won) {
                this.gameWon = true;
                this.score += Math.max(0, 600 - this.moves*5 - this.timeElapsed*2);
                this._stopTimer();
                this._playWin();
                this._createWinParticles();
                this._saveHighScore();
                this._onScore(this.score, true);
            }
        }
    }

    _drawFloatingLayers() {
        if (!this.pourAnim) return;
        const { floatingLayers, progress, fromIndex } = this.pourAnim;
        const fromPos = this.tubePositions[fromIndex];
        const ctx = this.ctx, D = this.DPR;

        floatingLayers.forEach((fl) => {
            const adjP = Math.max(0, Math.min(1, (progress - fl.delay) / Math.max(0.01, 1 - fl.delay * floatingLayers.length * 0.5)));
            if (adjP <= 0) return;
            const ease = this._easeInOutCubic(adjP);
            const x    = fl.startX + (fl.endX - fl.startX) * ease;
            const arcH = -50*D * Math.sin(adjP * Math.PI);
            const y    = fl.startY + (fl.endY - fl.startY) * ease + arcH;
            const col  = this.COLORS[fl.color];
            const layerH = this._getTubeLayerH(fromPos);
            const innerW = fromPos.w - 12*D;
            const w = innerW * (0.7 + 0.3*(1 - Math.sin(adjP*Math.PI)*0.3));
            const h = layerH * 0.85;
            const r = Math.min(h/2, 8*D);

            ctx.save();
            ctx.globalAlpha = 0.92;
            ctx.shadowColor = col.hex;
            ctx.shadowBlur  = 12*D;

            const grad = ctx.createLinearGradient(x-w/2, y-h/2, x-w/2, y+h/2);
            grad.addColorStop(0, col.light);
            grad.addColorStop(0.45, col.hex);
            grad.addColorStop(1, col.dark);
            ctx.fillStyle = grad;
            ctx.beginPath();
            this._roundRectPath(ctx, x-w/2, y-h/2, w, h, r);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.restore();
        });
    }

    // ══════════════════ PARTICLES (optimized) ══════════════════

    _addParticle(arr, p) {
        if (arr.length < this.MAX_PARTICLES) arr.push(p);
    }

    _createSplashParticles(tubeIdx, colorIdx) {
        const pos = this.tubePositions[tubeIdx];
        if (!pos) return;
        const col   = this.COLORS[colorIdx].hex;
        const count = window.innerWidth < 768 ? 6 : 12;
        for (let i = 0; i < count; i++) {
            this._addParticle(this.splashParticles, {
                x: pos.cx + (Math.random()-0.5)*pos.w*0.5,
                y: pos.y + pos.h*0.2,
                vx: (Math.random()-0.5)*4*this.DPR,
                vy: (-Math.random()*3-1)*this.DPR,
                life: 1, color: col,
                size: (Math.random()*2+1.5)*this.DPR,
            });
        }
    }

    _createCompletionParticles(tubeIdx) {
        const pos   = this.tubePositions[tubeIdx];
        if (!pos) return;
        const count = window.innerWidth < 768 ? 15 : 28;
        for (let i = 0; i < count; i++) {
            this._addParticle(this.particles, {
                x: pos.cx, y: pos.y + pos.h/2,
                vx: (Math.random()-0.5)*8*this.DPR,
                vy: (Math.random()-0.5)*8*this.DPR - 2*this.DPR,
                life: 1, color: `hsl(${Math.random()*360},100%,65%)`,
                size: (Math.random()*3+2)*this.DPR,
            });
        }
    }

    _createWinParticles() {
        const count = window.innerWidth < 768 ? 60 : 100;
        for (let i = 0; i < count; i++) {
            this._addParticle(this.particles, {
                x: this.canvas.width/2 + (Math.random()-0.5)*this.canvas.width*0.9,
                y: this.canvas.height/2 + (Math.random()-0.5)*this.canvas.height*0.6,
                vx: (Math.random()-0.5)*12*this.DPR,
                vy: (Math.random()-0.5)*12*this.DPR - 2*this.DPR,
                life: 1, color: `hsl(${Math.random()*360},100%,65%)`,
                size: (Math.random()*4+2)*this.DPR,
            });
        }
    }

    _updateParticles() {
        const g = 0.15*this.DPR;
        for (let i = this.particles.length-1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx; p.y += p.vy; p.vy += g; p.life -= 0.016;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        for (let i = this.splashParticles.length-1; i >= 0; i--) {
            const p = this.splashParticles[i];
            p.x += p.vx; p.y += p.vy; p.vy += g*0.8; p.life -= 0.032;
            if (p.life <= 0) this.splashParticles.splice(i, 1);
        }
    }

    _drawParticles() {
        const ctx = this.ctx;
        const all = [...this.particles, ...this.splashParticles];
        if (!all.length) return;
        ctx.save();
        // ── PERFORMANCE FIX: Batch particles by color ──
        ctx.shadowBlur = 8*this.DPR;
        for (const p of all) {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle   = p.color;
            ctx.shadowColor = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore();
    }

    // ══════════════════ LAYOUT ══════════════════

    _calculateLayout() {
        if (!this.tubes.length) return;
        const total = this.tubes.length;
        const cw = this.canvas.width, ch = this.canvas.height, D = this.DPR;
        const topH = 90*D, botH = 90*D, padX = 24*D, gapX = 12*D, gapY = 20*D;
        const availW = cw - padX*2, availH = ch - topH - botH;

        let cols, rows;
        if      (total <= 4)  { cols = total;            rows = 1; }
        else if (total <= 8)  { cols = Math.ceil(total/2); rows = 2; }
        else                  { cols = Math.ceil(total/3); rows = 3; }

        const maxTW = 60*D, maxTH = 240*D;
        let tW = Math.min(maxTW, (availW - (cols-1)*gapX) / cols);
        let tH = Math.min(maxTH, (availH - (rows-1)*gapY) / rows);
        tW = Math.max(34*D, tW);
        tH = Math.max(130*D, tH);
        if (tH < tW*3) tH = Math.min(maxTH, tW*3.2);

        const neededH = rows*tH + (rows-1)*gapY;
        if (neededH > availH) tH = (availH - (rows-1)*gapY) / rows;

        const totalW = cols*tW + (cols-1)*gapX;
        const totalH = rows*tH + (rows-1)*gapY;
        const startX = (cw - totalW) / 2;
        const startY = topH + (availH - totalH) / 2;

        this.tubePositions = [];
        for (let i = 0; i < total; i++) {
            const row = Math.floor(i/cols), col = i%cols;
            let rowOff = 0;
            if (rows > 1 && row === rows-1) {
                const lastCols = total - (rows-1)*cols;
                rowOff = ((cols - lastCols) * (tW+gapX)) / 2;
            }
            const x = startX + col*(tW+gapX) + rowOff;
            const y = startY + row*(tH+gapY);
            this.tubePositions.push({ x, y, w: tW, h: tH, cx: x+tW/2 });
        }
    }

    // ══════════════════ RENDERING ══════════════════

    _drawBackground() {
        const ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height;
        if (!this.bgCache || this.bgCache.w !== cw || this.bgCache.h !== ch) {
            const off = document.createElement('canvas');
            off.width = cw; off.height = ch;
            const oc = off.getContext('2d');
            const g = oc.createLinearGradient(0,0,0,ch);
            g.addColorStop(0,'#06061a'); g.addColorStop(0.5,'#0a0a24'); g.addColorStop(1,'#06061a');
            oc.fillStyle = g; oc.fillRect(0,0,cw,ch);
            // ── PERFORMANCE FIX: Fewer grid lines ──
            const D = this.DPR;
            oc.strokeStyle = 'rgba(100,120,255,0.03)'; oc.lineWidth = D;
            const gs = 70*D;
            for (let x = 0; x < cw; x += gs) { oc.beginPath(); oc.moveTo(x,0); oc.lineTo(x,ch); oc.stroke(); }
            for (let y = 0; y < ch; y += gs) { oc.beginPath(); oc.moveTo(0,y); oc.lineTo(cw,y); oc.stroke(); }
            const v = oc.createRadialGradient(cw/2,ch/2,ch*0.2,cw/2,ch/2,ch*0.85);
            v.addColorStop(0,'rgba(0,0,0,0)'); v.addColorStop(1,'rgba(0,0,0,0.5)');
            oc.fillStyle = v; oc.fillRect(0,0,cw,ch);
            this.bgCache = { img: off, w: cw, h: ch };
        }
        ctx.drawImage(this.bgCache.img, 0, 0);
    }

    _drawTopBar() {
        const ctx = this.ctx, cw = this.canvas.width, D = this.DPR;
        const pd = 18*D, midY = 44*D;
        const bW = 110*D, bH = 32*D, bX = pd, bY = midY-bH/2;

        ctx.fillStyle = 'rgba(0,200,150,0.12)';
        ctx.strokeStyle = 'rgba(0,255,200,0.4)';
        ctx.lineWidth = 1.5*D;
        this._roundRect(ctx, bX, bY, bW, bH, 8*D, true, true);

        ctx.fillStyle = '#00ffcc';
        ctx.font = `bold ${13*D}px "Orbitron","Segoe UI",sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 8*D;
        ctx.fillText(`LEVEL ${this.currentLevel+1}`, bX+bW/2, midY);
        ctx.shadowBlur = 0;

        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${16*D}px "Orbitron","Segoe UI",sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`${this.score} pts`, cw/2, midY);

        const mins = Math.floor(this.timeElapsed/60).toString().padStart(2,'0');
        const secs = (this.timeElapsed%60).toString().padStart(2,'0');
        ctx.fillStyle = '#aabbdd';
        ctx.font = `${11*D}px "Segoe UI",sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(`Moves: ${this.moves}  ${mins}:${secs}`, cw-pd, midY-7*D);

        let hs = 0;
        try { hs = parseInt(localStorage.getItem('liquidSort_highScore')||'0'); } catch(e){}
        ctx.fillStyle = '#7788aa';
        ctx.font = `${10*D}px "Segoe UI",sans-serif`;
        ctx.fillText(`Best: ${hs}`, cw-pd, midY+8*D);

        const lineY = 72*D;
        ctx.strokeStyle = 'rgba(0,255,200,0.3)';
        ctx.lineWidth = D;
        ctx.beginPath(); ctx.moveTo(pd,lineY); ctx.lineTo(cw-pd,lineY); ctx.stroke();
    }

    _drawBottomBar() {
        const ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height, D = this.DPR;
        const pd = 18*D, lineY = ch-72*D;
        ctx.strokeStyle = 'rgba(0,255,200,0.28)';
        ctx.lineWidth = D;
        ctx.beginPath(); ctx.moveTo(pd,lineY); ctx.lineTo(cw-pd,lineY); ctx.stroke();

        const btnY = ch-40*D, bW = 100*D, bH = 34*D;
        const btns = [
            {label:'↩ UNDO', x:cw*0.18},
            {label:'⟳ RESTART', x:cw*0.45},
            {label:'⏭ SKIP', x:cw*0.72}
        ];
        btns.forEach(b => {
            ctx.fillStyle  = 'rgba(0,255,200,0.05)';
            ctx.strokeStyle = 'rgba(0,255,200,0.25)';
            ctx.lineWidth  = 1.5*D;
            this._roundRect(ctx, b.x-bW/2, btnY-bH/2, bW, bH, 9*D, true, true);
            ctx.fillStyle = '#00ffcc';
            ctx.font = `bold ${10*D}px "Segoe UI",sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(b.label, b.x, btnY);
        });
    }

    _drawFullscreenBtn() {
        const ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height, D = this.DPR;
        const sz = 40*D, mg = 10*D, bx = cw-sz-mg, by = ch-sz-mg;
        this.fsBtnRect = { x: bx, y: by, w: sz, h: sz };

        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = 'rgba(0,10,20,0.55)';
        ctx.strokeStyle = 'rgba(0,255,200,0.25)';
        ctx.lineWidth = 1.5*D;
        this._roundRect(ctx, bx, by, sz, sz, 10*D, true, true);

        const cx = bx+sz/2, cy = by+sz/2, ic = 6*D;
        ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 2*D; ctx.lineCap = 'round';
        [
            [-ic, -(ic-3*D), -ic, -ic, -(ic-3*D), -ic],
            [ic-3*D, -ic, ic, -ic, ic, -(ic-3*D)],
            [-ic, ic-3*D, -ic, ic, -(ic-3*D), ic],
            [ic-3*D, ic, ic, ic, ic, ic-3*D]
        ].forEach(([x1,y1,x2,y2,x3,y3]) => {
            ctx.beginPath();
            ctx.moveTo(cx+x1, cy+y1);
            ctx.lineTo(cx+x2, cy+y2);
            ctx.lineTo(cx+x3, cy+y3);
            ctx.stroke();
        });
        ctx.restore();
    }

    _toggleFullscreen() {
        if (window.NeonFS) {
            window.NeonFS.toggle();
        } else {
            const el = document.documentElement;
            const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
            if (!isFS) (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
            else (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
        }
        setTimeout(() => this._setupCanvas(), 250);
    }

    // ══════════════════ TUBE DRAWING (optimized) ══════════════════

    _drawTube(index) {
        const tube = this.tubes[index];
        const pos  = this.tubePositions[index];
        if (!pos) return;

        const ctx   = this.ctx, D = this.DPR;
        const isSel  = this.selectedTube === index;
        const isHov  = this.hoverTube === index;
        const isComp = this._isTubeComplete(tube);
        const isPF   = this.pourAnim && this.pourAnim.fromIndex === index;
        const { x, y, w: tW, h: tH } = pos;

        let offY = 0;
        if (isSel && !this.pourAnim) offY = -8*D;
        const tx = x, ty = y + offY;

        ctx.save();
        if (isSel || isPF)   { ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 20*D; }
        else if (isComp)     { ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 16*D; }
        else if (isHov)      { ctx.shadowColor = 'rgba(255,255,255,0.4)'; ctx.shadowBlur = 10*D; }

        this._drawTubeGlass(tx, ty, tW, tH, isSel, isComp, isHov);
        ctx.shadowBlur = 0;

        ctx.save();
        this._clipTubeShape(tx, ty, tW, tH);
        let visTube = tube;
        if (isPF && this.pourAnim)
            visTube = tube.slice(0, tube.length - this.pourAnim.layers);
        this._drawLiquids(visTube, tx, ty, tW, tH);
        ctx.restore();

        this._drawTubeRim(tx, ty, tW, tH, isSel, isComp);
        ctx.restore();

        if (isComp) {
            ctx.save();
            ctx.font = `bold ${16*D}px "Segoe UI"`;
            ctx.fillStyle = '#00ff88';
            ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 12*D;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('✓', tx+tW/2, ty-10*D);
            ctx.restore();
        }
    }

    _drawTubeGlass(x, y, w, h, isSel, isComp, isHov) {
        const ctx = this.ctx, D = this.DPR, pad = 2*D, r = w/2-pad;
        const sc = isSel ? '#00ffcc' : isComp ? '#00ff88' : isHov ? 'rgba(255,255,255,0.45)' : 'rgba(180,200,255,0.18)';
        const lw = isSel ? 2.5*D : isComp ? 2*D : 1.5*D;

        ctx.fillStyle  = 'rgba(255,255,255,0.05)';
        ctx.strokeStyle = sc; ctx.lineWidth = lw;
        ctx.beginPath();
        this._tubePathNew(ctx, x, y, w, h, r, pad);
        ctx.fill(); ctx.stroke();
    }

    _tubePathNew(ctx, x, y, w, h, r, pad) {
        const D = this.DPR, tf = 4*D;
        ctx.moveTo(x+pad-tf, y);
        ctx.lineTo(x+pad, y+16*D);
        ctx.lineTo(x+pad, y+h-r);
        ctx.arcTo(x+pad, y+h, x+w/2, y+h, r);
        ctx.arcTo(x+w-pad, y+h, x+w-pad, y+h-r, r);
        ctx.lineTo(x+w-pad, y+16*D);
        ctx.lineTo(x+w-pad+tf, y);
    }

    _clipTubeShape(x, y, w, h) {
        const pad = 2*this.DPR, r = w/2-pad;
        this.ctx.beginPath();
        this._tubePathNew(this.ctx, x, y, w, h, r, pad);
        this.ctx.closePath();
        this.ctx.clip();
    }

    _drawLiquids(tube, x, y, w, h) {
        if (!tube.length) return;
        const ctx    = this.ctx, D = this.DPR;
        const pad    = 2*D, innerW = w-pad*2-4*D, innerX = x+pad+2*D;
        const bottomPad = 6*D, topPad = 16*D;
        const usableH   = h - bottomPad - topPad;
        const layerH    = usableH / this.TUBE_CAPACITY;
        const now       = this.globalTime;

        for (let j = 0; j < tube.length; j++) {
            const ci   = tube[j], col = this.COLORS[ci];
            const layerY = y + h - bottomPad - (j+1)*layerH;
            const isTop  = j === tube.length-1;
            const isBot  = j === 0;

            // ── PERFORMANCE FIX: Cache liquid gradients ──
            const gKey = `liq_${ci}_${Math.round(innerW)}_${Math.round(layerH)}`;
            let lg = this._gradCache.get(gKey);
            if (!lg) {
                lg = ctx.createLinearGradient(0, 0, 0, layerH);
                lg.addColorStop(0, col.light);
                lg.addColorStop(0.35, col.hex);
                lg.addColorStop(1, col.dark);
                this._gradCache.set(gKey, lg);
            }
            ctx.fillStyle = lg;

            ctx.save();
            ctx.translate(innerX, layerY);

            if (isBot) {
                const br = Math.min(innerW/2-D, layerH*0.35);
                ctx.beginPath();
                ctx.moveTo(0, 0); ctx.lineTo(innerW, 0);
                ctx.lineTo(innerW, layerH-br);
                ctx.arcTo(innerW, layerH, innerW-br, layerH, br);
                ctx.lineTo(br, layerH);
                ctx.arcTo(0, layerH, 0, layerH-br, br);
                ctx.closePath(); ctx.fill();
            } else {
                ctx.fillRect(0, 0, innerW, layerH+0.5);
            }

            // Shine
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(0, 0, innerW*0.4, layerH);

            // Layer divider
            if (j > 0 && tube[j] !== tube[j-1]) {
                ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = D;
                ctx.beginPath(); ctx.moveTo(0, layerH); ctx.lineTo(innerW, layerH); ctx.stroke();
            }

            // Wave effect on top layer only
            if (isTop) {
                const wa = 1.5*D, ws = now/800;
                ctx.beginPath();
                ctx.moveTo(0, wa);
                for (let wx = 0; wx <= innerW; wx += 3)
                    ctx.lineTo(wx, Math.sin((wx/innerW)*Math.PI*3+ws)*wa);
                ctx.lineTo(innerW, layerH);
                ctx.lineTo(0, layerH);
                ctx.closePath();
                ctx.fillStyle = 'rgba(255,255,255,0.08)';
                ctx.fill();
            }
            ctx.restore();
        }
    }

    _drawTubeRim(x, y, w, h, isSel, isComp) {
        const ctx = this.ctx, D = this.DPR;
        const rc  = isSel ? 'rgba(0,255,200,0.55)' : isComp ? 'rgba(0,255,136,0.45)' : 'rgba(255,255,255,0.12)';
        const pad = 2*D, tf = 4*D;
        ctx.strokeStyle = rc; ctx.lineWidth = 2.5*D; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x+pad-tf, y); ctx.lineTo(x+pad, y+14*D); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+w-pad+tf, y); ctx.lineTo(x+w-pad, y+14*D); ctx.stroke();
        ctx.lineWidth = 2.5*D;
        ctx.beginPath(); ctx.moveTo(x+pad-tf-D, y); ctx.lineTo(x+w-pad+tf+D, y); ctx.stroke();
    }

    // ══════════════════ WIN OVERLAY ══════════════════

    _drawWinOverlay() {
        const ctx = this.ctx, cw = this.canvas.width, ch = this.canvas.height, D = this.DPR;
        ctx.fillStyle = 'rgba(5,5,20,0.78)';
        ctx.fillRect(0, 0, cw, ch);

        const boxW = Math.min(440*D, cw-40*D), boxH = 270*D;
        const boxX = (cw-boxW)/2, boxY = (ch-boxH)/2;

        ctx.save();
        ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 35*D;
        ctx.fillStyle   = 'rgba(0,40,60,0.97)';
        ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 2.5*D;
        this._roundRect(ctx, boxX, boxY, boxW, boxH, 16*D, true, true);
        ctx.restore();

        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#00ffcc';
        ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 14*D;
        ctx.font = `bold ${22*D}px "Orbitron","Segoe UI",sans-serif`;
        ctx.fillText('🎉 LEVEL COMPLETE!', cw/2, boxY+44*D);
        ctx.restore();

        const statY = boxY+100*D;
        const mins  = Math.floor(this.timeElapsed/60).toString().padStart(2,'0');
        const secs  = (this.timeElapsed%60).toString().padStart(2,'0');
        [{l:'MOVES',v:`${this.moves}`},{l:'TIME',v:`${mins}:${secs}`},{l:'SCORE',v:`${this.score}`}]
        .forEach((st, i) => {
            const colW = boxW/3, sx = boxX+colW*i+colW/2;
            const crdW = colW-12*D, crdH = 46*D;
            ctx.fillStyle  = 'rgba(0,255,200,0.06)';
            ctx.strokeStyle = 'rgba(0,255,200,0.2)';
            ctx.lineWidth  = D;
            this._roundRect(ctx, sx-crdW/2, statY-crdH/2, crdW, crdH, 7*D, true, true);

            ctx.save();
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(150,200,220,0.65)';
            ctx.font = `${9*D}px "Segoe UI",sans-serif`;
            ctx.fillText(st.l, sx, statY-10*D);
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${16*D}px "Orbitron","Segoe UI",sans-serif`;
            ctx.fillText(st.v, sx, statY+9*D);
            ctx.restore();
        });

        const btnW = 180*D, btnH = 42*D, btnX = (cw-btnW)/2, btnY = boxY+boxH-58*D;
        ctx.fillStyle  = '#00ddaa';
        ctx.strokeStyle = '#00ffcc'; ctx.lineWidth = 2*D;
        ctx.shadowColor = '#00ffcc'; ctx.shadowBlur = 14*D;
        this._roundRect(ctx, btnX, btnY, btnW, btnH, 11*D, true, true);
        ctx.shadowBlur = 0;
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#061518';
        ctx.font = `bold ${12*D}px "Orbitron","Segoe UI",sans-serif`;
        ctx.fillText('NEXT LEVEL →', cw/2, btnY+btnH/2);
        ctx.restore();
    }

    // ══════════════════ HELPERS ══════════════════

    _easeInOutCubic(t) { return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }

    _roundRect(ctx, x, y, w, h, r, fill, stroke) {
        ctx.beginPath();
        this._roundRectPath(ctx, x, y, w, h, r);
        if (fill)   ctx.fill();
        if (stroke) ctx.stroke();
    }

    _roundRectPath(ctx, x, y, w, h, r) {
        ctx.moveTo(x+r, y);
        ctx.arcTo(x+w, y, x+w, y+h, r);
        ctx.arcTo(x+w, y+h, x, y+h, r);
        ctx.arcTo(x, y+h, x, y, r);
        ctx.arcTo(x, y, x+w, y, r);
        ctx.closePath();
    }

    // ══════════════════ INPUT ══════════════════

    _getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const sx = this.canvas.width / rect.width;
        const sy = this.canvas.height / rect.height;
        const src = e.touches ? e.touches[0] : e;
        return { x: (src.clientX-rect.left)*sx, y: (src.clientY-rect.top)*sy };
    }

    _getTubeAt(px, py) {
        const D = this.DPR;
        for (let i = 0; i < this.tubePositions.length; i++) {
            const p = this.tubePositions[i];
            if (px >= p.x-5*D && px <= p.x+p.w+5*D && py >= p.y-16*D && py <= p.y+p.h+20*D)
                return i;
        }
        return -1;
    }

    _getButtonAt(px, py) {
        const cw = this.canvas.width, ch = this.canvas.height, D = this.DPR;
        const btnY = ch-40*D, bW = 100*D, bH = 34*D;
        const btns = [{a:'undo',x:cw*0.18},{a:'restart',x:cw*0.45},{a:'skip',x:cw*0.72}];
        for (const b of btns)
            if (px>=b.x-bW/2 && px<=b.x+bW/2 && py>=btnY-bH/2 && py<=btnY+bH/2) return b.a;
        return null;
    }

    _isInsideFSBtn(px, py) {
        const r = this.fsBtnRect;
        return px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h;
    }

    _onHandleClick(e) {
        e.preventDefault();
        if (this.pourAnim) return;
        const pos = this._getPos(e);

        if (this._isInsideFSBtn(pos.x, pos.y)) { this._toggleFullscreen(); return; }

        if (this.gameWon) {
            const cw = this.canvas.width, ch = this.canvas.height, D = this.DPR;
            const boxW = Math.min(440*D,cw-40*D), boxH = 270*D, boxY = (ch-boxH)/2;
            const btnW = 180*D, btnH = 42*D, btnX = (cw-btnW)/2, btnBY = boxY+boxH-58*D;
            if (pos.x>=btnX && pos.x<=btnX+btnW && pos.y>=btnBY && pos.y<=btnBY+btnH)
                this._nextLevel();
            return;
        }

        const btn = this._getButtonAt(pos.x, pos.y);
        if (btn) {
            if (btn==='undo')    this._undoMove();
            else if (btn==='restart') this._restartLevel();
            else if (btn==='skip')    this._nextLevel();
            return;
        }

        const ti = this._getTubeAt(pos.x, pos.y);
        if (ti === -1) { this.selectedTube = null; return; }

        if (this.selectedTube === null) {
            if (!this.tubes[ti].length || this._isTubeComplete(this.tubes[ti])) return;
            this.selectedTube = ti; this._playSelect();
        } else if (this.selectedTube === ti) {
            this.selectedTube = null; this._playSelect();
        } else {
            if (this._canPour(this.tubes[this.selectedTube], this.tubes[ti])) {
                this._startPourAnimation(this.selectedTube, ti);
            } else {
                this._playError();
                if (this.tubes[ti].length && !this._isTubeComplete(this.tubes[ti])) {
                    this.selectedTube = ti; this._playSelect();
                } else {
                    this.selectedTube = null;
                }
            }
        }
    }

    _onMouseMove(e) {
        if (this.gameWon || this.pourAnim) return;
        const pos = this._getPos(e);
        this.hoverTube = this._getTubeAt(pos.x, pos.y);
        const overBtn = this._getButtonAt(pos.x, pos.y) || this._isInsideFSBtn(pos.x, pos.y);
        this.canvas.style.cursor = (this.hoverTube >= 0 || overBtn) ? 'pointer' : 'default';
    }

    _onKey(e) {
        if (this.pourAnim) return;
        if ((e.ctrlKey||e.metaKey) && e.key==='z') { e.preventDefault(); this._undoMove(); }
        if (e.key==='r') this._restartLevel();
        if (e.key==='n' && this.gameWon) this._nextLevel();
        if (e.key==='Escape') this.selectedTube = null;
        if (e.key==='f'||e.key==='F') this._toggleFullscreen();
        const num = parseInt(e.key);
        if (num>=1 && num<=this.tubes.length) {
            const ti = num-1;
            if (this.selectedTube===null) {
                if (this.tubes[ti].length && !this._isTubeComplete(this.tubes[ti])) {
                    this.selectedTube = ti; this._playSelect();
                }
            } else if (this.selectedTube===ti) {
                this.selectedTube = null;
            } else {
                if (this._canPour(this.tubes[this.selectedTube], this.tubes[ti]))
                    this._startPourAnimation(this.selectedTube, ti);
                else { this._playError(); this.selectedTube = null; }
            }
        }
    }

    _onResize() { this._setupCanvas(); }

    // ══════════════════ GAME FLOW ══════════════════

    _startLevel(lvl) {
        this.currentLevel   = lvl;
        this.tubes          = this._generateLevel(lvl);
        this.selectedTube   = null;
        this.moves          = 0;
        this.gameWon        = false;
        this.history        = [];
        this.particles      = [];
        this.splashParticles = [];
        this.timeElapsed    = 0;
        this.pourAnim       = null;
        this.bgCache        = null;
        this._gradCache.clear();
        this._calculateLayout();
        this._startTimer();
    }

    _restartLevel() {
        this._startLevel(this.currentLevel);
        this._playTone(440, 0.15, 'sine', 0.08);
    }

    _nextLevel() {
        if (this.currentLevel+1 >= this.LEVELS.length) {
            this.currentLevel = 0; this.score += 3000;
        } else {
            this.currentLevel++;
        }
        this._startLevel(this.currentLevel);
        this._playTone(550, 0.2, 'sine', 0.1);
    }

    _startTimer() {
        this._stopTimer();
        this.timerInterval = setInterval(() => {
            if (!this.gameWon && !this.pourAnim) this.timeElapsed++;
        }, 1000);
    }

    _stopTimer() {
        if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    }

    _saveHighScore() {
        try {
            const k  = 'liquidSort_highScore';
            const ex = parseInt(localStorage.getItem(k)||'0');
            if (this.score > ex) localStorage.setItem(k, this.score.toString());
            const lk = 'liquidSort_level';
            const sl = parseInt(localStorage.getItem(lk)||'0');
            if (this.currentLevel+1 > sl) localStorage.setItem(lk, (this.currentLevel+1).toString());
        } catch(e) {}
    }

    _loadProgress() {
        try { return parseInt(localStorage.getItem('liquidSort_level')||'0'); } catch(e) { return 0; }
    }

    // ══════════════════ MAIN LOOP (optimized) ══════════════════

    _mainLoop(ts) {
        if (this._destroyed) return;
        this.globalTime = ts || 0;

        const ctx = this.ctx;
        const cw  = this.canvas.width;
        const ch  = this.canvas.height;

        // ── PERFORMANCE FIX: Cap at 60fps, skip extra frames ──
        const elapsed = ts - this._lastFrameTime;
        if (elapsed < 14) {
            this.animationFrameId = requestAnimationFrame(t => this._mainLoop(t));
            return;
        }
        this._lastFrameTime = ts;

        ctx.clearRect(0, 0, cw, ch);

        this._drawBackground();
        this._drawTopBar();

        // Draw tubes — non-source first, then source tube on top
        for (let i = 0; i < this.tubes.length; i++) {
            if (this.pourAnim && this.pourAnim.fromIndex === i) continue;
            this._drawTube(i);
        }
        if (this.pourAnim) this._drawTube(this.pourAnim.fromIndex);

        this._drawFloatingLayers();
        this._drawBottomBar();
        this._drawFullscreenBtn();
        this._drawParticles();

        if (this.gameWon) this._drawWinOverlay();

        this._updateParticles();
        this._updatePourAnim();

        this.animationFrameId = requestAnimationFrame(t => this._mainLoop(t));
    }
}