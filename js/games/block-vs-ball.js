'use strict';

/* ============================================================
   BLOCK VS BALL — UFO Edition
   - UFO at bottom shoots orange balls
   - Slow block descent (user has time)
   - Spread shot (multiple balls)
   - Addictive progression
   ============================================================ */

class BlockVsBall {
    constructor(canvas, onScore) {
        this.canvas  = canvas;
        this.onScore = onScore || function(){};
        this.destroyed = false;
        this.paused    = false;

        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this._resize();
        this.ctx = this.canvas.getContext('2d');
        this.W   = this.canvas.width  / this.dpr;
        this.H   = this.canvas.height / this.dpr;

        // ── Grid ──
        this.COLS      = 7;
        this.BLOCK_PAD = 5;
        this.BLOCK_H   = 50;
        this.BLOCK_TOP = 100;

        // ── Physics ──
        this.BALL_R   = 8;
        this.BALL_SPD = 11;

        // ── UFO dims ──
        this.UFO_W = 80;
        this.UFO_H = 32;

        // ── Colors ──
        this.COLORS = {
            blue:   { fill:'#4DA6FF', dark:'#1A77DD', text:'#fff' },
            teal:   { fill:'#22DDCC', dark:'#119988', text:'#fff' },
            green:  { fill:'#44DD66', dark:'#1DAA44', text:'#fff' },
            yellow: { fill:'#FFD700', dark:'#CC9900', text:'#222' },
            orange: { fill:'#FF8833', dark:'#CC5511', text:'#fff' },
            red:    { fill:'#FF4455', dark:'#CC1122', text:'#fff' },
            purple: { fill:'#BB55FF', dark:'#8822CC', text:'#fff' },
            pink:   { fill:'#FF44AA', dark:'#CC1177', text:'#fff' },
        };

        // ── States ──
        this.STATE = { MENU:0, AIMING:1, SHOOTING:2, DEAD:3 };
        this.state = this.STATE.MENU;

        this.score    = 0;
        this.best     = parseInt(localStorage.getItem('bvb3_best') || '0');
        this.round    = 0;
        this.ballCount = 1;
        this.combo    = 0;
        this.maxCombo = 0;

        // ── Objects ──
        this.blocks     = [];
        this.balls      = [];
        this.pickups    = [];
        this.parts      = [];
        this.floatTexts = [];
        this.rings      = [];
        this.stars      = this._mkStars(60);

        // ── UFO ──
        this.ufo = {
            x: 0, y: 0,
            targetX: 0,
            hoverOffset: 0,
            engineGlow: 0,
            shootFlash: 0,
            catchGlow: 0,
            lights: [
                { phase: 0,    col: '#FF006E' },
                { phase: 1.57, col: '#FFD700' },
                { phase: 3.14, col: '#00FF88' },
                { phase: 4.71, col: '#00D4FF' },
            ]
        };

        // ── Aim ──
        this.aimAngle   = -Math.PI / 2;
        this.isDragging = false;
        this.aimDots    = [];

        // ── Round tracking ──
        this.launched     = 0;
        this.returned     = 0;
        this.firstLandX   = null;
        this.pendingBalls = 0;

        // ── FX ──
        this.shakeAmt = 0;
        this.flashA   = 0;
        this.flashCol = '#fff';
        this.bgT      = 0;
        this.time     = 0;

        // ── Game over callback flag ──
        this._gameOverCalled = false;

        this._initLayout();
        this._bindInput();

        this.lastTS = 0;
        this.raf = requestAnimationFrame(ts => this._loop(ts));
    }

    // ═══════════════════════════════════
    //  SETUP
    // ═══════════════════════════════════

    _resize() {
        const p = this.canvas.parentElement;
        const w = (p && p.clientWidth  > 10) ? p.clientWidth  : window.innerWidth;
        const h = (p && p.clientHeight > 10) ? p.clientHeight : window.innerHeight;
        this.canvas.width  = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
    }

    _initLayout() {
        this.W = this.canvas.width  / this.dpr;
        this.H = this.canvas.height / this.dpr;

        this.BAR_H   = 65;
        this.FLOOR_Y = this.H - this.BAR_H - 8;

        // UFO sits just above floor
        this.ufo.x       = this.W / 2;
        this.ufo.y       = this.FLOOR_Y - this.UFO_H / 2 - 2;
        this.ufo.targetX = this.W / 2;

        this.BLOCK_W  = (this.W - 10 - (this.COLS - 1) * this.BLOCK_PAD) / this.COLS;
        this.DANGER_Y = this.FLOOR_Y - this.UFO_H - 60;
    }

    _mkStars(n) {
        return Array.from({ length: n }, () => ({
            x:  Math.random(),
            y:  Math.random() * 0.88,
            r:  Math.random() * 1.3 + 0.2,
            ph: Math.random() * Math.PI * 2,
            sp: Math.random() * 0.018 + 0.003,
        }));
    }

    // ═══════════════════════════════════
    //  INPUT
    // ═══════════════════════════════════

    _bindInput() {
        const getPos = (e) => {
            const r   = this.canvas.getBoundingClientRect();
            const src = e.touches ? e.touches[0] : e;
            return {
                x: (src.clientX - r.left) * (this.W / r.width),
                y: (src.clientY - r.top)  * (this.H / r.height),
            };
        };

        const onDown = (e) => {
            e.preventDefault();
            const p = getPos(e);
            if (this.state === this.STATE.MENU) {
                this._startGame(); return;
            }
            // ── FIXED: Dead state pe tap to restart ──
            if (this.state === this.STATE.DEAD && this.bgT > 1.8) {
                this._startGame(); return;
            }
            if (this.state === this.STATE.AIMING) {
                this.isDragging = true;
                this._updateAim(p);
            }
        };

        const onMove = (e) => {
            e.preventDefault();
            if (this.isDragging && this.state === this.STATE.AIMING) {
                this._updateAim(getPos(e));
            }
        };

        const onUp = (e) => {
            e.preventDefault();
            if (this.isDragging && this.state === this.STATE.AIMING) {
                this.isDragging = false;
                if (this.aimDots.length > 3) this._shootAll();
                else this.aimDots = [];
            }
        };

        this.canvas.addEventListener('mousedown',  onDown);
        this.canvas.addEventListener('mousemove',  onMove);
        this.canvas.addEventListener('mouseup',    onUp);
        this.canvas.addEventListener('touchstart', onDown, { passive: false });
        this.canvas.addEventListener('touchmove',  onMove, { passive: false });
        this.canvas.addEventListener('touchend',   onUp,   { passive: false });

        this._evD = onDown;
        this._evM = onMove;
        this._evU = onUp;
    }

    _updateAim(p) {
        const ufoTopY = this.ufo.y - this.UFO_H / 2 - 4;
        const dx = p.x - this.ufo.x;
        const dy = p.y - ufoTopY;
        if (dy >= -20) return;
        this.aimAngle = Math.atan2(dy, dx);
        this.aimAngle = Math.max(-Math.PI + 0.14, Math.min(-0.14, this.aimAngle));
        this._buildDots();
    }

    _buildDots() {
        this.aimDots = [];
        const startX = this.ufo.x;
        const startY = this.ufo.y - this.UFO_H / 2 - 4;
        let x  = startX, y = startY;
        let vx = Math.cos(this.aimAngle) * 20;
        let vy = Math.sin(this.aimAngle) * 20;

        for (let i = 0; i < 50; i++) {
            x += vx; y += vy;
            if (x < this.BALL_R)          { x = this.BALL_R;          vx =  Math.abs(vx); }
            if (x > this.W - this.BALL_R) { x = this.W - this.BALL_R; vx = -Math.abs(vx); }
            if (y < this.BLOCK_TOP - 5)   break;
            if (i % 2 === 0) this.aimDots.push({ x, y, a: 1 - i / 50 });
        }
    }

    // ═══════════════════════════════════
    //  GAME FLOW
    // ═══════════════════════════════════

    _startGame() {
        this.score          = 0;
        this.round          = 0;
        this.ballCount      = 1;
        this.combo          = 0;
        this.maxCombo       = 0;
        this.blocks         = [];
        this.balls          = [];
        this.pickups        = [];
        this.parts          = [];
        this.floatTexts     = [];
        this.rings          = [];
        this.bgT            = 0;
        this.time           = 0;
        this.firstLandX     = null;
        this.launched       = 0;
        this.returned       = 0;
        this.pendingBalls   = 0;
        this.isDragging     = false;
        this.aimDots        = [];
        this._gameOverCalled = false;

        this.ufo.x          = this.W / 2;
        this.ufo.targetX    = this.W / 2;
        this.ufo.shootFlash = 0;
        this.ufo.catchGlow  = 0;

        this._genRound();
        this.state = this.STATE.AIMING;
        this.onScore(0);
    }

    _genRound() {
        this.round++;

        // Drop existing blocks
        const dropAmount = Math.min(
            this.BLOCK_H + this.BLOCK_PAD,
            (this.BLOCK_H + this.BLOCK_PAD) * 0.45
            + Math.min(this.round * 1.8, (this.BLOCK_H + this.BLOCK_PAD) * 0.55)
        );
        this.blocks.forEach(b => { b.y += dropAmount; b.entryScale = 1; });

        // Game over check — blocks reached danger zone
        if (this.blocks.some(b => !b.dead && b.y + b.h >= this.DANGER_Y)) {
            this._gameOver();
            return;
        }

        // Remove dead blocks
        this.blocks = this.blocks.filter(b => !b.dead);

        // New row HP
        const hpBase   = Math.max(1, Math.floor(1 + this.round * 0.55));
        const variance = Math.max(1, Math.floor(hpBase * 0.45));
        const gapChance = Math.max(0.08, 0.30 - this.round * 0.008);

        for (let c = 0; c < this.COLS; c++) {
            if (Math.random() < gapChance) continue;
            const hp  = hpBase + Math.floor(Math.random() * variance);
            const col = this._hpToColor(hp);
            this.blocks.push({
                x: 5 + c * (this.BLOCK_W + this.BLOCK_PAD),
                y: this.BLOCK_TOP,
                w: this.BLOCK_W,
                h: this.BLOCK_H,
                hp, maxHp: hp,
                color: col,
                hitAnim:    0,
                dead:       false,
                entryScale: 0,
            });
        }

        // Ball pickup
        if (this.round > 1 && Math.random() < 0.45) {
            this.pickups.push({
                x: 25 + Math.random() * (this.W - 50),
                y: this.ufo.y - this.UFO_H / 2 - 18,
                r: 11,
                collected: false,
                bob:   Math.random() * Math.PI * 2,
                pulse: 0,
            });
        }

        // Every 5 rounds bonus ball
        if (this.round % 5 === 0 && this.round > 0) {
            this.ballCount++;
            this.floatTexts.push({
                x: this.W / 2, y: this.H / 2 - 60,
                text: `🎁 +1 BALL! Round ${this.round}`,
                col: '#00FF88', life: 2000, op: 1,
            });
            this.flashA   = 0.2;
            this.flashCol = '#00FF88';
        }
    }

    _hpToColor(hp) {
        if (hp <= 1)  return 'blue';
        if (hp <= 3)  return 'teal';
        if (hp <= 6)  return 'green';
        if (hp <= 10) return 'yellow';
        if (hp <= 15) return 'orange';
        if (hp <= 22) return 'red';
        if (hp <= 32) return 'purple';
        return 'pink';
    }

    // ═══════════════════════════════════
    //  SHOOTING
    // ═══════════════════════════════════

    _shootAll() {
        if (this.state !== this.STATE.AIMING) return;

        this.state        = this.STATE.SHOOTING;
        this.aimDots      = [];
        this.launched     = 0;
        this.returned     = 0;
        this.firstLandX   = null;
        this.pendingBalls = this.ballCount;

        this.ufo.shootFlash = 1;
        this.ufo.engineGlow = 1;

        const angle = this.aimAngle;

        for (let i = 0; i < this.ballCount; i++) {
            setTimeout(() => {
                if (this.destroyed || this.state === this.STATE.DEAD) return;

                const spread = this.ballCount > 1
                    ? (i - (this.ballCount - 1) / 2) * 0.055
                    : 0;
                const a  = angle + spread;
                const vx = Math.cos(a) * this.BALL_SPD;
                const vy = Math.sin(a) * this.BALL_SPD;

                this.balls.push({
                    x: this.ufo.x,
                    y: this.ufo.y - this.UFO_H / 2 - this.BALL_R - 2,
                    vx, vy,
                    r:      this.BALL_R,
                    active: true,
                    trail:  [],
                    id:     i,
                });
                this.launched++;
                this.ufo.shootFlash = 0.8;
            }, i * 130);
        }
    }

    // ═══════════════════════════════════
    //  UPDATE
    // ═══════════════════════════════════

    update(dt) {
        const S = dt / 16.67;
        this.bgT  += dt * 0.001;
        this.time += dt;

        // Stars twinkle
        this.stars.forEach(s => s.ph += s.sp * S);

        // FX decay
        if (this.flashA   > 0) this.flashA   = Math.max(0, this.flashA   - 0.04 * S);
        if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - 0.6  * S);

        // UFO animations
        this.ufo.hoverOffset = Math.sin(this.bgT * 3.2) * 3.5;
        this.ufo.engineGlow  = Math.max(0, this.ufo.engineGlow  - 0.04 * S);
        this.ufo.shootFlash  = Math.max(0, this.ufo.shootFlash  - 0.06 * S);
        this.ufo.catchGlow   = Math.max(0, this.ufo.catchGlow   - 0.05 * S);
        this.ufo.lights.forEach(l => l.phase += 0.06 * S);

        // UFO smooth follow
        const diff = this.ufo.targetX - this.ufo.x;
        this.ufo.x += diff * 0.07 * S;
        this.ufo.x  = Math.max(this.UFO_W / 2 + 6, Math.min(this.W - this.UFO_W / 2 - 6, this.ufo.x));

        // Block animations
        this.blocks.forEach(b => {
            b.entryScale = Math.min(1, b.entryScale + 0.09 * S);
            b.hitAnim    = Math.max(0, b.hitAnim    - 0.11 * S);
        });

        // Pickups bob
        this.pickups.forEach(p => { p.bob += 0.06 * S; p.pulse = Math.sin(p.bob) * 4; });

        // Particles
        this.parts = this.parts.filter(p => {
            p.x  += p.vx * S; p.y += p.vy * S;
            p.vy += 0.18 * S; p.vx *= 0.97;
            p.life -= 0.032 * S;
            return p.life > 0;
        });

        // Float texts
        this.floatTexts = this.floatTexts.filter(t => {
            t.y   -= 0.75 * S;
            t.life -= dt;
            t.op   = Math.min(1, t.life / 380);
            return t.life > 0;
        });

        // Rings
        this.rings = this.rings.filter(r => {
            r.radius += 3 * S;
            r.alpha  -= 0.04 * S;
            return r.alpha > 0;
        });

        if (this.state !== this.STATE.SHOOTING) return;

        // ── Ball physics ──
        for (let i = 0; i < this.balls.length; i++) {
            const b = this.balls[i];
            if (!b.active) continue;

            // Trail
            b.trail.unshift({ x: b.x, y: b.y });
            if (b.trail.length > 9) b.trail.pop();

            b.x += b.vx * S;
            b.y += b.vy * S;

            // Walls
            if (b.x - b.r < 0) {
                b.x  = b.r;
                b.vx = Math.abs(b.vx);
                this._wallFx(b.x, b.y);
            }
            if (b.x + b.r > this.W) {
                b.x  = this.W - b.r;
                b.vx = -Math.abs(b.vx);
                this._wallFx(b.x, b.y);
            }

            // Ceiling
            if (b.y - b.r < this.BLOCK_TOP) {
                b.y  = this.BLOCK_TOP + b.r;
                b.vy = Math.abs(b.vy);
            }

            // ── Block collision ──
            let hitBlock = false;
            for (let j = 0; j < this.blocks.length; j++) {
                const bl = this.blocks[j];
                if (bl.dead) continue;

                const cx   = Math.max(bl.x, Math.min(b.x, bl.x + bl.w));
                const cy   = Math.max(bl.y, Math.min(b.y, bl.y + bl.h));
                const dist = Math.hypot(b.x - cx, b.y - cy);

                if (dist < b.r) {
                    const oL = (b.x + b.r) - bl.x;
                    const oR = (bl.x + bl.w) - (b.x - b.r);
                    const oT = (b.y + b.r) - bl.y;
                    const oB = (bl.y + bl.h) - (b.y - b.r);
                    const m  = Math.min(oL, oR, oT, oB);

                    if      (m === oL) { b.vx = -Math.abs(b.vx); b.x = bl.x - b.r - 1; }
                    else if (m === oR) { b.vx =  Math.abs(b.vx); b.x = bl.x + bl.w + b.r + 1; }
                    else if (m === oT) { b.vy = -Math.abs(b.vy); b.y = bl.y - b.r - 1; }
                    else               { b.vy =  Math.abs(b.vy); b.y = bl.y + bl.h + b.r + 1; }

                    bl.hp--;
                    bl.hitAnim = 1;
                    this.combo++;
                    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

                    const mult = this.combo >= 8 ? 4 : this.combo >= 5 ? 3 : this.combo >= 3 ? 2 : 1;
                    const pts  = Math.max(1, this.round) * mult;
                    this.score += pts;

                    if (this.score > this.best) {
                        this.best = this.score;
                        localStorage.setItem('bvb3_best', this.best);
                    }

                    // Score update (not game over)
                    this.onScore(this.score);

                    this.floatTexts.push({
                        x:    bl.x + bl.w / 2,
                        y:    bl.y - 4,
                        text: this.combo >= 5 ? `🔥×${mult} +${pts}` : `+${pts}`,
                        col:  this.combo >= 5 ? '#FFD700' : '#ffffff',
                        life: 700, op: 1,
                    });

                    if (bl.hp <= 0) {
                        bl.dead = true;
                        this._blockBurst(bl);
                        this.shakeAmt = Math.min(9, 2 + Math.floor(bl.maxHp / 5));
                        const bonus = bl.maxHp * this.round * 2;
                        this.score += bonus;
                        this.onScore(this.score);
                        this.floatTexts.push({
                            x:    bl.x + bl.w / 2,
                            y:    bl.y - 18,
                            text: `💥 +${bonus}`,
                            col:  this.COLORS[bl.color].fill,
                            life: 1000, op: 1,
                        });
                    }

                    hitBlock = true;
                    break;
                }
            }
            if (!hitBlock) this.combo = 0;

            // ── Pickup collision ──
            this.pickups.forEach(pu => {
                if (pu.collected) return;
                if (Math.hypot(b.x - pu.x, b.y - (pu.y + pu.pulse)) < b.r + pu.r) {
                    pu.collected = true;
                    this.ballCount++;
                    this.flashA   = 0.22;
                    this.flashCol = '#FF8800';
                    this.floatTexts.push({
                        x: pu.x, y: pu.y - 24,
                        text: '+1 BALL 🏆', col: '#FF8800', life: 1300, op: 1
                    });
                    this.rings.push({ x: pu.x, y: pu.y, radius: 8, alpha: 1, col: '#FF8800' });
                    this._burst(pu.x, pu.y, '#FF8800', 10);
                }
            });
            this.pickups = this.pickups.filter(p => !p.collected);

            // ── Ball returns to UFO zone ──
            if (b.y + b.r >= this.ufo.y - this.UFO_H / 2 - 5) {
                b.active = false;
                if (this.firstLandX === null) this.firstLandX = b.x;
                this.returned++;
                this.ufo.targetX  = b.x;
                this.ufo.catchGlow = 1;
                this.rings.push({ x: b.x, y: this.ufo.y, radius: 6, alpha: 0.85, col: '#AAAAFF' });
            }
        }

        // Clean dead blocks
        this.blocks = this.blocks.filter(b => !b.dead);

        // All balls returned?
        const allBack = this.balls.every(b => !b.active);
        const sentAll = this.launched >= this.pendingBalls;
        if (sentAll && allBack && this.returned >= this.pendingBalls) {
            this._roundEnd();
        }
    }

    _roundEnd() {
        if (this.firstLandX !== null) {
            this.ufo.targetX = Math.max(
                this.UFO_W / 2 + 8,
                Math.min(this.W - this.UFO_W / 2 - 8, this.firstLandX)
            );
        }
        this.balls   = [];
        this.combo   = 0;
        this.state   = this.STATE.AIMING;
        this.aimDots = [];

        setTimeout(() => {
            if (!this.destroyed && this.state === this.STATE.AIMING) {
                this._genRound();
            }
        }, 280);
    }

    // ── FIXED: Game Over — sirf ek baar callback call hoga ──
    _gameOver() {
        if (this.state === this.STATE.DEAD) return;
        this.state = this.STATE.DEAD;
        this.bgT   = 0;
        this.balls = [];

        if (this.score > this.best) {
            this.best = this.score;
            localStorage.setItem('bvb3_best', this.best);
        }

        // ── CRITICAL FIX: Game over callback sirf ek baar ──
        if (!this._gameOverCalled) {
            this._gameOverCalled = true;
            // Thoda delay do taaki score screen render ho sake
            setTimeout(() => {
                if (!this.destroyed) {
                    this.onScore(this.score, true);
                }
            }, 400);
        }

        this.flashA   = 0.65;
        this.flashCol = '#FF1133';
        this.shakeAmt = 18;
        this._burst(this.W / 2, this.H / 2, '#FF3344', 45);
        this._burst(this.W / 2, this.H / 2, '#FF8800', 20);
    }

    // ═══════════════════════════════════
    //  FX
    // ═══════════════════════════════════

    _burst(x, y, col, n) {
        for (let i = 0; i < n && this.parts.length < 220; i++) {
            const a = Math.random() * Math.PI * 2;
            const s = Math.random() * 6 + 1.5;
            this.parts.push({
                x, y,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s - 2.5,
                r:  Math.random() * 5 + 1,
                life: 1, col
            });
        }
    }

    _blockBurst(bl) {
        const col = this.COLORS[bl.color].fill;
        const cx  = bl.x + bl.w / 2;
        const cy  = bl.y + bl.h / 2;
        this._burst(cx, cy, col, 14);
        this.rings.push({ x: cx, y: cy, radius: bl.w * 0.25, alpha: 0.9, col });
        this.flashA   = Math.min(this.flashA + 0.05, 0.28);
        this.flashCol = col;
    }

    _wallFx(x, y) {
        this.parts.push({
            x, y,
            vx: (Math.random() - 0.5) * 3,
            vy: -Math.random() * 3,
            r:  3, life: 0.55, col: '#AABBFF'
        });
    }

    // ═══════════════════════════════════
    //  DRAW
    // ═══════════════════════════════════

    draw() {
        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

        let sx = 0, sy = 0;
        if (this.shakeAmt > 0) {
            sx = (Math.random() - 0.5) * this.shakeAmt;
            sy = (Math.random() - 0.5) * this.shakeAmt * 0.5;
        }
        ctx.save();
        ctx.translate(sx, sy);

        this._drawBG();
        this._drawRings();
        this._drawBlocks();
        this._drawPickups();
        this._drawAimLine();
        this._drawBalls();
        this._drawUFO();
        this._drawParticles();
        this._drawFloatTexts();
        this._drawFloor();
        this._drawHUD();
        this._drawBottomBar();

        if (this.flashA > 0.01) {
            ctx.globalAlpha = this.flashA;
            ctx.fillStyle   = this.flashCol;
            ctx.fillRect(0, 0, this.W, this.H);
            ctx.globalAlpha = 1;
        }

        ctx.restore();

        if (this.state === this.STATE.MENU) this._drawMenu();
        if (this.state === this.STATE.DEAD) this._drawDead();
    }

    // ── Background ──
    _drawBG() {
        const ctx = this.ctx;
        const g = ctx.createLinearGradient(0, 0, 0, this.H);
        g.addColorStop(0,   '#070720');
        g.addColorStop(0.5, '#0b0b2e');
        g.addColorStop(1,   '#040416');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, this.W, this.H);

        // Stars
        this.stars.forEach(s => {
            ctx.globalAlpha = 0.1 + ((Math.sin(s.ph) + 1) * 0.5) * 0.65;
            ctx.fillStyle   = '#cce8ff';
            ctx.beginPath();
            ctx.arc(s.x * this.W, s.y * this.H, s.r, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;

        // Nebula glow
        const cx = this.W / 2, cy = this.H * 0.42;
        const nb = ctx.createRadialGradient(cx, cy, 0, cx, cy, this.W * 0.6);
        nb.addColorStop(0,   'rgba(70,25,130,0.20)');
        nb.addColorStop(0.5, 'rgba(40,15,90,0.08)');
        nb.addColorStop(1,   'transparent');
        ctx.fillStyle = nb;
        ctx.fillRect(0, 0, this.W, this.H);
    }

    // ── Blocks ──
    _drawBlocks() {
        const ctx = this.ctx;
        this.blocks.forEach(bl => {
            if (bl.dead) return;
            const col = this.COLORS[bl.color];
            const sc  = bl.entryScale * (1 + bl.hitAnim * 0.09);
            const bx  = bl.x + bl.w / 2;
            const by  = bl.y + bl.h / 2;
            const hpR = bl.hp / bl.maxHp;
            const w2  = bl.w / 2;
            const h2  = bl.h / 2;

            ctx.save();
            ctx.translate(bx, by);
            ctx.scale(sc, sc);

            ctx.shadowColor   = col.fill;
            ctx.shadowBlur    = bl.hitAnim > 0.3 ? 24 : 8;
            ctx.shadowOffsetY = 2;

            ctx.globalAlpha = 0.62 + hpR * 0.38;
            ctx.fillStyle   = bl.hitAnim > 0.55 ? '#ffffff' : col.fill;
            this._rr(ctx, -w2, -h2, bl.w, bl.h, 10);
            ctx.fill();

            ctx.shadowBlur    = 0;
            ctx.shadowOffsetY = 0;

            // Shine
            ctx.globalAlpha = 0.88;
            const sh = ctx.createLinearGradient(-w2, -h2, w2, h2 * 0.35);
            sh.addColorStop(0, 'rgba(255,255,255,0.42)');
            sh.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sh;
            this._rr(ctx, -w2, -h2, bl.w, bl.h, 10);
            ctx.fill();

            // Border
            ctx.globalAlpha = 1;
            ctx.strokeStyle = bl.hitAnim > 0.4 ? '#ffffff' : col.dark;
            ctx.lineWidth   = bl.hitAnim > 0.4 ? 2.5 : 1.4;
            this._rr(ctx, -w2, -h2, bl.w, bl.h, 10);
            ctx.stroke();

            // HP text
            ctx.shadowBlur = 0;
            const fs = Math.min(20, Math.max(10, bl.h * 0.40));
            ctx.font         = `bold ${fs}px Arial`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle    = 'rgba(0,0,0,0.38)';
            ctx.fillText(bl.hp, 1, 2);
            ctx.fillStyle = hpR < 0.3 ? '#FF6666' : col.text;
            ctx.fillText(bl.hp, 0, 0);

            ctx.restore();
        });
    }

    _rr(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x,     y + h, x,     y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x,     y,     x + r, y);
        ctx.closePath();
    }

    // ── UFO ──
    _drawUFO() {
        const ctx = this.ctx;
        const u   = this.ufo;
        const ux  = u.x;
        const uy  = u.y + u.hoverOffset;
        const uw  = this.UFO_W;
        const uh  = this.UFO_H;

        ctx.save();
        ctx.translate(ux, uy);

        // Engine beam (shooting)
        if (u.shootFlash > 0.05) {
            ctx.globalAlpha = u.shootFlash * 0.5;
            const beamG = ctx.createLinearGradient(0, -uh / 2, 0, -uh / 2 - 80);
            beamG.addColorStop(0, '#00D4FF');
            beamG.addColorStop(1, 'transparent');
            ctx.fillStyle = beamG;
            ctx.beginPath();
            ctx.moveTo(-8, -uh / 2);
            ctx.lineTo( 8, -uh / 2);
            ctx.lineTo( 3, -uh / 2 - 80);
            ctx.lineTo(-3, -uh / 2 - 80);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // Engine glow
        const egA = 0.35 + u.engineGlow * 0.35 + Math.sin(this.bgT * 5) * 0.1;
        const eg  = ctx.createRadialGradient(0, uh * 0.35, 0, 0, uh * 0.35, uw * 0.45);
        eg.addColorStop(0,   `rgba(0,200,255,${egA})`);
        eg.addColorStop(0.5, `rgba(80,0,200,${egA * 0.4})`);
        eg.addColorStop(1,   'transparent');
        ctx.fillStyle = eg;
        ctx.beginPath();
        ctx.ellipse(0, uh * 0.35, uw * 0.45, uh * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // Saucer dish
        const dg = ctx.createLinearGradient(-uw / 2, uh * 0.1, uw / 2, uh / 2);
        dg.addColorStop(0,   '#1A4FAA');
        dg.addColorStop(0.5, '#2266CC');
        dg.addColorStop(1,   '#0A2866');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.ellipse(0, uh * 0.2, uw / 2, uh * 0.3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(80,150,255,0.45)';
        ctx.lineWidth   = 1.2;
        ctx.stroke();

        // Dome
        const dmg = ctx.createRadialGradient(-uw * 0.12, -uh * 0.15, 0, 0, 0, uw * 0.42);
        dmg.addColorStop(0,    '#BBDDFF');
        dmg.addColorStop(0.35, '#55AADD');
        dmg.addColorStop(0.7,  '#2266BB');
        dmg.addColorStop(1,    '#081A44');
        ctx.fillStyle = dmg;
        ctx.beginPath();
        ctx.ellipse(0, 0, uw * 0.42, uh * 0.58, 0, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(100,200,255,0.75)';
        ctx.lineWidth   = 1.4;
        ctx.stroke();

        // Rim lights
        u.lights.forEach((l, i) => {
            const ang = l.phase;
            const lx  = Math.cos(ang) * uw * 0.38;
            const ly  = uh * 0.24 + Math.sin(ang) * 2.5;
            const on  = Math.sin(this.bgT * 5 + i * 1.6) > 0;
            ctx.fillStyle = on ? l.col : '#111130';
            ctx.beginPath();
            ctx.arc(lx, ly, 4, 0, Math.PI * 2);
            ctx.fill();
            if (on) {
                ctx.shadowBlur  = 10;
                ctx.shadowColor = l.col;
                ctx.beginPath();
                ctx.arc(lx, ly, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        });

        // Cockpit
        const cg = ctx.createRadialGradient(-4, -10, 0, 0, -6, 14);
        cg.addColorStop(0,   'rgba(200,245,255,0.92)');
        cg.addColorStop(0.4, 'rgba(80,180,240,0.5)');
        cg.addColorStop(1,   'rgba(20,80,160,0.22)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.ellipse(0, -6, 12, 9, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(180,240,255,0.5)';
        ctx.lineWidth   = 0.8;
        ctx.stroke();

        // Alien eyes
        [-1, 1].forEach(side => {
            ctx.fillStyle = '#00FF88';
            ctx.beginPath();
            ctx.arc(side * 4.5, -6, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        // Catch glow
        if (u.catchGlow > 0.05) {
            ctx.globalAlpha = u.catchGlow * 0.55;
            ctx.strokeStyle = '#00FF88';
            ctx.lineWidth   = 3;
            ctx.beginPath();
            ctx.ellipse(0, uh * 0.25, uw * 0.42, uh * 0.28, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    // ── Aim line ──
    _drawAimLine() {
        if (!this.isDragging || !this.aimDots.length || this.state !== this.STATE.AIMING) return;
        const ctx = this.ctx;

        this.aimDots.forEach((d, i) => {
            const last = i === this.aimDots.length - 1;
            ctx.globalAlpha = d.a * (last ? 1 : 0.78);
            if (last) {
                ctx.fillStyle = '#ffffff';
                ctx.save();
                ctx.translate(d.x, d.y);
                ctx.rotate(Math.PI / 4);
                ctx.fillRect(-6, -6, 12, 12);
                ctx.restore();
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(d.x, d.y, 4, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        ctx.globalAlpha = 1;
    }

    // ── Balls ──
    _drawBalls() {
        const ctx = this.ctx;
        this.balls.forEach(b => {
            if (!b.active) return;

            // Trail
            b.trail.forEach((t, i) => {
                const a  = (1 - i / b.trail.length) * 0.3;
                const tr = b.r * (1 - i / b.trail.length * 0.65);
                ctx.globalAlpha = a;
                ctx.fillStyle   = '#FF9900';
                ctx.beginPath();
                ctx.arc(t.x, t.y, tr, 0, Math.PI * 2);
                ctx.fill();
            });
            ctx.globalAlpha = 1;

            ctx.shadowColor = '#FF9900';
            ctx.shadowBlur  = 18;
            const bg = ctx.createRadialGradient(b.x - 3, b.y - 3, 0, b.x, b.y, b.r);
            bg.addColorStop(0,    '#FFF0A0');
            bg.addColorStop(0.35, '#FF9000');
            bg.addColorStop(0.75, '#CC5500');
            bg.addColorStop(1,    '#882200');
            ctx.fillStyle = bg;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = 'rgba(255,255,255,0.65)';
            ctx.beginPath();
            ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.28, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // ── Pickups ──
    _drawPickups() {
        const ctx = this.ctx;
        this.pickups.forEach(pu => {
            if (pu.collected) return;
            const dy = pu.y + pu.pulse;

            ctx.shadowColor = '#FF9900';
            ctx.shadowBlur  = 16;
            const g = ctx.createRadialGradient(pu.x - 3, dy - 3, 0, pu.x, dy, pu.r);
            g.addColorStop(0,   '#FFE090');
            g.addColorStop(0.4, '#FF8C00');
            g.addColorStop(1,   '#BB4400');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(pu.x, dy, pu.r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;

            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            ctx.arc(pu.x - 3, dy - 3, pu.r * 0.3, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(255,180,0,${0.3 + Math.sin(pu.bob) * 0.2})`;
            ctx.lineWidth   = 1.5;
            ctx.beginPath();
            ctx.arc(pu.x, dy, pu.r + 5 + Math.sin(pu.bob) * 2, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    // ── Particles ──
    _drawParticles() {
        const ctx = this.ctx;
        this.parts.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle   = p.col;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.1, p.r * p.life), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1;
    }

    // ── Float texts ──
    _drawFloatTexts() {
        const ctx = this.ctx;
        this.floatTexts.forEach(t => {
            ctx.globalAlpha  = t.op;
            ctx.font         = 'bold 14px Arial';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle  = 'rgba(0,0,0,0.55)';
            ctx.lineWidth    = 3;
            ctx.lineJoin     = 'round';
            ctx.strokeText(t.text, t.x, t.y);
            ctx.fillStyle    = t.col;
            ctx.fillText(t.text, t.x, t.y);
        });
        ctx.globalAlpha = 1;
    }

    // ── Rings ──
    _drawRings() {
        const ctx = this.ctx;
        this.rings.forEach(r => {
            ctx.globalAlpha = Math.max(0, r.alpha);
            ctx.strokeStyle = r.col;
            ctx.lineWidth   = 2 * r.alpha;
            ctx.beginPath();
            ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
            ctx.stroke();
        });
        ctx.globalAlpha = 1;
    }

    // ── Floor ──
    _drawFloor() {
        const ctx = this.ctx;
        ctx.shadowColor = '#5533FF';
        ctx.shadowBlur  = 10;
        ctx.fillStyle   = '#5533CC';
        ctx.fillRect(0, this.FLOOR_Y - 1, this.W, 2);
        ctx.shadowBlur  = 0;

        const fg = ctx.createLinearGradient(0, this.FLOOR_Y, 0, this.FLOOR_Y + 18);
        fg.addColorStop(0, 'rgba(85,51,200,0.15)');
        fg.addColorStop(1, 'transparent');
        ctx.fillStyle = fg;
        ctx.fillRect(0, this.FLOOR_Y, this.W, 18);
    }

    // ── HUD ──
    _drawHUD() {
        const ctx = this.ctx;

        ctx.fillStyle = 'rgba(5,8,38,0.97)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(this.W, 0);
        ctx.lineTo(this.W, 56);
        ctx.quadraticCurveTo(this.W * 0.72, 78, this.W / 2, 80);
        ctx.quadraticCurveTo(this.W * 0.28, 78, 0, 56);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = '#2244BB';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.moveTo(0, 56);
        ctx.quadraticCurveTo(this.W * 0.28, 78, this.W / 2, 80);
        ctx.quadraticCurveTo(this.W * 0.72, 78, this.W, 56);
        ctx.stroke();

        ctx.font         = '13px Arial';
        ctx.fillStyle    = '#FFD700';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👑 ' + this.best.toLocaleString(), this.W / 2, 20);

        ctx.font      = 'bold 28px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(this.score.toLocaleString(), this.W / 2, 53);

        this._btn(this.W - 52, 24, 18, 'ⓘ', '#1A5FFF');
        this._btn(this.W - 20, 24, 18, '⏸', '#1A5FFF');

        ctx.font         = '11px Arial';
        ctx.fillStyle    = 'rgba(180,200,255,0.3)';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('ROUND ' + this.round, 10, 88);

        if (this.combo >= 3) {
            const ca = 0.55 + Math.sin(this.time / 110) * 0.35;
            ctx.globalAlpha = ca;
            ctx.font        = 'bold 13px Arial';
            ctx.fillStyle   = this.combo >= 8 ? '#FF3300' : this.combo >= 5 ? '#FFD700' : '#FF8800';
            ctx.textAlign   = 'right';
            ctx.fillText(`🔥 COMBO ×${this.combo}`, this.W - 8, 88);
            ctx.globalAlpha = 1;
        }
    }

    _btn(x, y, r, icon, col) {
        const ctx = this.ctx;
        ctx.fillStyle    = col;
        ctx.strokeStyle  = 'rgba(100,170,255,0.55)';
        ctx.lineWidth    = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.font         = '12px Arial';
        ctx.fillStyle    = '#fff';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, x, y + 1);
        ctx.textBaseline = 'alphabetic';
    }

    // ── Bottom Bar ──
    _drawBottomBar() {
        const ctx  = this.ctx;
        const barY = this.H - this.BAR_H;

        ctx.fillStyle = 'rgba(3,3,20,0.98)';
        ctx.fillRect(0, barY, this.W, this.BAR_H);

        ctx.shadowColor = '#5533CC';
        ctx.shadowBlur  = 7;
        ctx.strokeStyle = '#5533CC';
        ctx.lineWidth   = 2;
        ctx.beginPath(); ctx.moveTo(0, barY); ctx.lineTo(this.W, barY); ctx.stroke();
        ctx.shadowBlur  = 0;

        const maxIcons = Math.min(this.ballCount, 9);
        for (let i = 0; i < maxIcons; i++) {
            const bx = 14 + i * 14;
            const bg = ctx.createRadialGradient(bx - 2, barY + 20, 0, bx, barY + 22, 6);
            bg.addColorStop(0,   '#FFE090');
            bg.addColorStop(0.5, '#FF8C00');
            bg.addColorStop(1,   '#AA4400');
            ctx.fillStyle = bg;
            ctx.beginPath(); ctx.arc(bx, barY + 22, 6, 0, Math.PI * 2); ctx.fill();
        }
        if (this.ballCount > 9) {
            ctx.font         = 'bold 11px Arial';
            ctx.fillStyle    = '#FF8800';
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`+${this.ballCount - 9}`, 14 + 9 * 14 + 2, barY + 22);
        }

        ctx.textBaseline = 'alphabetic';
        ctx.font         = 'bold 12px Arial';
        ctx.fillStyle    = '#aaaadd';
        ctx.textAlign    = 'left';
        ctx.fillText('BALLS', 10, barY + 44);
        ctx.font         = 'bold 20px Arial';
        ctx.fillStyle    = '#ffffff';
        ctx.fillText('×' + this.ballCount, 10, barY + 62);

        ctx.textAlign = 'center';
        ctx.font      = 'bold 14px Arial';
        ctx.fillStyle = '#4DA6FF';
        ctx.fillText('BLOCK', this.W / 2, barY + 28);
        ctx.font      = 'bold 14px Arial';
        ctx.fillStyle = '#FFD700';
        ctx.fillText('VS BALL', this.W / 2, barY + 46);

        if (this.state === this.STATE.AIMING && !this.isDragging) {
            const blink = 0.3 + Math.sin(this.time / 380) * 0.42;
            ctx.globalAlpha = blink;
            ctx.font        = '10px Arial';
            ctx.fillStyle   = '#7799FF';
            ctx.fillText('↑ DRAG UP TO AIM & RELEASE', this.W / 2, barY + 62);
            ctx.globalAlpha = 1;
        }
    }

    // ── Menu ──
    _drawMenu() {
        const ctx = this.ctx;
        ctx.fillStyle = 'rgba(0,0,12,0.86)';
        ctx.fillRect(0, 0, this.W, this.H);

        const cx = this.W / 2, cy = this.H / 2;

        ctx.fillStyle   = 'rgba(10,12,55,0.97)';
        ctx.strokeStyle = '#2244AA';
        ctx.lineWidth   = 1.5;
        this._rr(ctx, cx - 145, cy - 155, 290, 115, 20);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#2255CC';
        this._rr(ctx, cx - 145, cy - 155, 290, 4, 4);
        ctx.fill();

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.font         = 'bold 38px Arial';
        ctx.fillStyle    = '#4DA6FF';
        ctx.fillText('BLOCK', cx, cy - 117);
        ctx.font         = 'bold 24px Arial';
        ctx.fillStyle    = '#FFD700';
        ctx.fillText('VS BALL', cx, cy - 84);
        ctx.font         = '12px Arial';
        ctx.fillStyle    = 'rgba(180,180,255,0.45)';
        ctx.fillText('Best: ' + this.best.toLocaleString(), cx, cy - 58);

        // UFO preview
        ctx.save();
        ctx.translate(cx, cy + 20 + Math.sin(this.bgT * 2.8) * 6);
        this._drawUFOSmall(ctx, 64, 26);
        ctx.restore();

        // Ball
        const ballY = cy + 72;
        ctx.shadowColor = '#FF9900'; ctx.shadowBlur = 22;
        const pg = ctx.createRadialGradient(cx - 4, ballY - 4, 0, cx, ballY, 15);
        pg.addColorStop(0,   '#FFF090');
        pg.addColorStop(0.4, '#FF9000');
        pg.addColorStop(1,   '#AA4400');
        ctx.fillStyle = pg;
        ctx.beginPath(); ctx.arc(cx, ballY, 15, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur  = 0;
        ctx.fillStyle   = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.arc(cx - 4, ballY - 4, 4, 0, Math.PI * 2); ctx.fill();

        const blink = 0.4 + Math.sin(this.bgT * 2.8) * 0.45;
        ctx.globalAlpha = blink;
        ctx.font        = 'bold 22px Arial';
        ctx.fillStyle   = '#00FF88';
        ctx.fillText('▶  TAP TO START', cx, cy + 110);
        ctx.globalAlpha = 1;

        const tips = [
            'Drag from UFO to aim • Release to fire',
            'Collect 🟠 pickups = +1 ball next round',
            'Every 5 rounds you get a bonus ball!',
            'Blocks drop slowly — take your time 🎯',
        ];
        tips.forEach((t, i) => {
            ctx.font      = '11px Arial';
            ctx.fillStyle = `rgba(160,160,220,${0.28 + i * 0.02})`;
            ctx.fillText(t, cx, cy + 138 + i * 18);
        });
    }

    _drawUFOSmall(ctx, uw, uh) {
        const dg = ctx.createLinearGradient(-uw/2, uh*0.1, uw/2, uh/2);
        dg.addColorStop(0, '#1A4FAA'); dg.addColorStop(1, '#0A2866');
        ctx.fillStyle = dg;
        ctx.beginPath();
        ctx.ellipse(0, uh*0.2, uw/2, uh*0.3, 0, 0, Math.PI*2);
        ctx.fill();

        const dmg = ctx.createRadialGradient(-uw*0.12, -uh*0.15, 0, 0, 0, uw*0.42);
        dmg.addColorStop(0, '#BBDDFF'); dmg.addColorStop(1, '#081A44');
        ctx.fillStyle = dmg;
        ctx.beginPath();
        ctx.ellipse(0, 0, uw*0.42, uh*0.58, 0, Math.PI, 0);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(100,200,255,0.7)';
        ctx.lineWidth   = 1.2; ctx.stroke();

        const cols = ['#FF006E','#FFD700','#00FF88','#00D4FF'];
        cols.forEach((c, i) => {
            const ang = this.bgT*3 + i*Math.PI/2;
            const lx  = Math.cos(ang)*uw*0.36;
            const ly  = uh*0.24;
            ctx.fillStyle = Math.sin(this.bgT*5+i)>0 ? c : '#111130';
            ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI*2); ctx.fill();
        });

        const eg = ctx.createRadialGradient(0, uh*0.35, 0, 0, uh*0.35, uw*0.38);
        eg.addColorStop(0, 'rgba(0,200,255,0.4)');
        eg.addColorStop(1, 'transparent');
        ctx.fillStyle = eg;
        ctx.beginPath(); ctx.arc(0, uh*0.35, uw*0.38, 0, Math.PI*2); ctx.fill();
    }

    // ── Game Over ──
    _drawDead() {
        const ctx  = this.ctx;
        const fade = Math.min(1, this.bgT / 0.9);

        ctx.fillStyle = `rgba(0,0,12,${fade * 0.86})`;
        ctx.fillRect(0, 0, this.W, this.H);
        if (fade < 0.35) return;

        const pa = Math.min(1, (fade - 0.35) / 0.65);
        const cx = this.W / 2;
        const cy = this.H / 2;
        const pw = Math.min(this.W - 30, 295);
        const ph = 285;

        ctx.save();
        ctx.globalAlpha = pa;

        ctx.fillStyle   = 'rgba(5,5,28,0.98)';
        ctx.strokeStyle = 'rgba(180,70,220,0.55)';
        ctx.lineWidth   = 1.5;
        this._rr(ctx, cx-pw/2, cy-ph/2, pw, ph, 20);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = 'rgba(180,70,220,0.4)';
        this._rr(ctx, cx-pw/2, cy-ph/2, pw, 4, 4);
        ctx.fill();

        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor  = '#FF3366';
        ctx.shadowBlur   = 18;
        ctx.font         = 'bold 32px Arial';
        ctx.fillStyle    = '#FF3366';
        ctx.fillText('GAME OVER', cx, cy - ph/2 + 42);
        ctx.shadowBlur   = 0;

        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(cx - pw/2 + 20, cy - ph/2 + 66, pw - 40, 1);

        const isNewBest = this.score >= this.best && this.score > 0;
        const stats = [
            { label:'SCORE',     val: this.score.toLocaleString(), col: isNewBest ? '#00FFDD' : '#ffffff', big: true  },
            { label:'BEST',      val: this.best.toLocaleString(),  col: isNewBest ? '#FFD700' : '#777777', big: false },
            { label:'ROUND',     val: String(this.round),          col: '#AA66FF',                         big: false },
            { label:'BALLS',     val: '×' + this.ballCount,       col: '#FF8800',                         big: false },
            { label:'MAX COMBO', val: '×' + this.maxCombo,        col: '#FF4400',                         big: false },
        ];

        stats.forEach((s, i) => {
            const ry = cy - ph/2 + 86 + i * 36;
            ctx.font         = '11px Arial';
            ctx.fillStyle    = 'rgba(160,140,210,1)';
            ctx.textAlign    = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(s.label, cx - pw/2 + 24, ry);
            ctx.font      = `bold ${s.big ? 24 : 17}px Arial`;
            ctx.fillStyle = s.col;
            ctx.textAlign = 'right';
            ctx.fillText(s.val, cx + pw/2 - 24, ry);
            if (i < stats.length - 1) {
                ctx.fillStyle = 'rgba(255,255,255,0.04)';
                ctx.fillRect(cx - pw/2 + 20, ry + 16, pw - 40, 1);
            }
        });

        if (isNewBest) {
            const badgeY = cy - ph/2 + 82;
            ctx.fillStyle   = 'rgba(255,215,0,0.13)';
            ctx.strokeStyle = 'rgba(255,215,0,0.55)';
            ctx.lineWidth   = 1;
            this._rr(ctx, cx - 68, badgeY, 136, 24, 7);
            ctx.fill(); ctx.stroke();
            ctx.font         = 'bold 11px Arial';
            ctx.fillStyle    = '#FFD700';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✦ NEW BEST SCORE! ✦', cx, badgeY + 12);
        }

        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(cx - pw/2 + 20, cy + ph/2 - 58, pw - 40, 1);

        if (this.bgT > 1.8) {
            const bp = 0.4 + Math.sin(this.bgT * 3) * 0.45;
            ctx.globalAlpha  = pa * bp;
            ctx.font         = 'bold 16px Arial';
            ctx.fillStyle    = '#CC55FF';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('● TAP TO PLAY AGAIN ●', cx, cy + ph/2 - 30);
        }

        ctx.restore();
    }

    // ═══════════════════════════════════
    //  MAIN LOOP
    // ═══════════════════════════════════

    _loop(ts) {
        if (this.destroyed) return;
        const dt = Math.min(ts - (this.lastTS || ts), 48);
        this.lastTS = ts;
        if (!this.paused) this.update(dt);
        this.draw();
        this.raf = requestAnimationFrame(t => this._loop(t));
    }

    // ═══════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════

    resize() {
        this._resize();
        this._initLayout();
    }

    togglePause() {
        this.paused = !this.paused;
        if (!this.paused) this.lastTS = performance.now();
        return this.paused;
    }

    destroy() {
        this.destroyed = true;
        cancelAnimationFrame(this.raf);
        this.canvas.removeEventListener('mousedown',  this._evD);
        this.canvas.removeEventListener('mousemove',  this._evM);
        this.canvas.removeEventListener('mouseup',    this._evU);
        this.canvas.removeEventListener('touchstart', this._evD);
        this.canvas.removeEventListener('touchmove',  this._evM);
        this.canvas.removeEventListener('touchend',   this._evU);
    }
}