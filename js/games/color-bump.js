/* ============================================================
   COLOR BUMP v3.0 — ULTRA HD ZERO-BLUR EDITION
   Crystal Clear | DPR Scaled | No shadowBlur on text
   Fullscreen Button | Mobile-First | Premium Quality
   ============================================================ */

'use strict';

class ColorBump {
    constructor(canvas, onScore) {
        this.canvas    = canvas;
        this.onScore   = onScore;
        this.destroyed = false;
        this.paused    = false;
        this.isPaused  = false;
        this.gameOver  = false;

        // HD setup
        this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        this._setupHD();
        this.ctx = this.canvas.getContext('2d', { alpha: false });

        this.W = this.canvas.width  / this.dpr;
        this.H = this.canvas.height / this.dpr;

        this.isMobile = ('ontouchstart' in window) || window.innerWidth < 768;

        // Fonts
        this.FT = '"Orbitron", "Segoe UI", monospace';
        this.FU = '"Rajdhani", -apple-system, sans-serif';

        // States
        this.STATE = { WAITING: 0, PLAYING: 1, DEAD: 2 };
        this.state = this.STATE.WAITING;

        // Score
        this.score     = 0;
        this.bestScore = parseInt(localStorage.getItem('cb_best') || '0');

        // Colors
        this.COLORS = [
            { fill:'#FF006E', light:'#FF66AA', dark:'#CC0055', name:'Pink'   },
            { fill:'#00D4FF', light:'#66EAFF', dark:'#0099CC', name:'Cyan'   },
            { fill:'#00FF88', light:'#66FFB8', dark:'#00CC66', name:'Green'  },
            { fill:'#FFD700', light:'#FFE866', dark:'#CCA800', name:'Gold'   },
            { fill:'#B94FE3', light:'#D488F0', dark:'#8833AA', name:'Purple' },
            { fill:'#FF8C00', light:'#FFB04D', dark:'#CC6600', name:'Orange' }
        ];

        // Player
        this.pci = 0; // player color index
        this.player = {
            x: this.W/2, y: this.H*0.65,
            tx: this.W/2, ty: this.H*0.65,
            vx:0, vy:0,
            r: this.isMobile ? 20 : 22,
            trail: [],
            scale: 1,
            pulse: 0,
            inv: 0,
            ccAnim: 0
        };

        // Balls
        this.balls = [];
        this.spawnTimer    = 0;
        this.spawnInterval = 2200;

        // Level / combo
        this.level      = 1;
        this.popped     = 0;
        this.popPerLvl  = 10;
        this.combo      = 0;
        this.comboTimer = 0;
        this.maxCombo   = 0;

        // Effects
        this.effects = {
            rainbow: { on:false, t:0, dur:5000 },
            magnet:  { on:false, t:0, dur:4000 },
            shield:  { on:false, t:0, dur:6000 },
            slow:    { on:false, t:0, dur:5000 }
        };

        // Particles
        this.parts   = [];
        this.pops    = []; // score text popups
        this.rings   = []; // expanding rings
        this.exps    = []; // explosions
        this.banners = []; // level up text

        this.MAX_PARTS = this.isMobile ? 50 : 100;

        // Screen FX
        this.shakeX=0; this.shakeY=0; this.shakeT=0; this.shakeF=0;
        this.flashA=0; this.flashC='#fff';
        this.deathA=0;

        // Timing
        this.time=0; this.bgT=0;

        // BG
        this.stars   = this._mkStars(this.isMobile ? 35 : 55);
        this.hexGrid = this._mkHex();

        // Fullscreen btn
        this.fsRect = { x:0, y:0, w:46, h:46 };

        // Input
        this.mouse = { x:this.W/2, y:this.H/2 };

        this._spawnInit();
        this._bind();

        this.lastTime = 0;
        this.animId = requestAnimationFrame(t => this._loop(t));
    }

    // ─── HD Canvas ───
    _setupHD() {
        const r = this.canvas.getBoundingClientRect();
        const w = r.width  || this.canvas.clientWidth  || 400;
        const h = r.height || this.canvas.clientHeight || 700;
        this.canvas.width  = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
    }

    // ─── Scaled helpers ───
    S(v) { return v * this.dpr; }
    X(v) { return Math.round(v * this.dpr); }

    // ─── Crisp text — ZERO shadowBlur ───
    _txt(text, x, y, opts={}) {
        const ctx = this.ctx;
        const {
            sz=14, wt='bold', col='#fff', al='left', bl='alphabetic',
            ff=null, op=1, stroke=false, sc='rgba(0,0,0,0.6)', sw=3,
            maxW=0
        } = opts;

        ctx.save();
        ctx.globalAlpha  = op;
        ctx.textAlign    = al;
        ctx.textBaseline = bl;
        ctx.font = `${wt} ${Math.round(sz * this.dpr)}px ${ff || (sz > 15 ? this.FT : this.FU)}`;

        const px = this.X(x), py = this.X(y);
        const mw = maxW ? this.S(maxW) : undefined;

        // Stroke outline for readability
        if (stroke) {
            ctx.strokeStyle = sc;
            ctx.lineWidth   = sw * this.dpr;
            ctx.lineJoin    = 'round';
            ctx.miterLimit  = 2;
            ctx.strokeText(text, px, py, mw);
        }

        // Fill — sharp, no shadow
        ctx.shadowBlur  = 0;
        ctx.fillStyle   = col;
        ctx.fillText(text, px, py, mw);
        ctx.restore();
    }

    // ─── Shape helpers ───
    _circle(x, y, r) {
        this.ctx.beginPath();
        this.ctx.arc(this.X(x), this.X(y), this.S(r), 0, Math.PI*2);
    }

    _rrect(x, y, w, h, r) {
        const ctx = this.ctx;
        const dx=this.X(x), dy=this.X(y), dw=this.X(w), dh=this.X(h), dr=this.S(r);
        ctx.beginPath();
        ctx.moveTo(dx+dr, dy);
        ctx.arcTo(dx+dw,dy,   dx+dw,dy+dh, dr);
        ctx.arcTo(dx+dw,dy+dh, dx,  dy+dh, dr);
        ctx.arcTo(dx,   dy+dh, dx,  dy,    dr);
        ctx.arcTo(dx,   dy,    dx+dw,dy,   dr);
        ctx.closePath();
    }

    // ─── BG generators ───
    _mkStars(n) {
        return Array.from({length:n}, () => ({
            x: Math.random()*this.W, y: Math.random()*this.H,
            r: Math.random()*1.3+0.3, ph: Math.random()*6.28,
            sp: Math.random()*0.014+0.004,
            col: Math.random()>0.8 ? '#B94FE3' : Math.random()>0.6 ? '#00D4FF' : '#dde8ff'
        }));
    }

    _mkHex() {
        const out=[]; const sz=42;
        const cols = Math.ceil(this.W/(sz*1.5))+2;
        const rows = Math.ceil(this.H/(sz*1.732))+2;
        for (let r=0;r<rows;r++) for (let c=0;c<cols;c++) {
            out.push({
                x: c*sz*1.5-sz,
                y: r*sz*1.732+(c%2?sz*0.866:0)-sz,
                sz: sz*0.9, a: Math.random()*0.03+0.007
            });
        }
        return out;
    }

    _hexPath(cx, cy, sz) {
        const ctx=this.ctx;
        ctx.beginPath();
        for (let i=0;i<6;i++) {
            const a=Math.PI/3*i;
            const px=cx+sz*Math.cos(a), py=cy+sz*Math.sin(a);
            i===0 ? ctx.moveTo(this.X(px),this.X(py)) : ctx.lineTo(this.X(px),this.X(py));
        }
        ctx.closePath();
    }

    // ─── Spawn ───
    _spawnInit() { for (let i=0;i<12;i++) this._spawnBall(); }

    _spawnBall() {
        const mg=55;
        let x,y;
        do {
            x=mg+Math.random()*(this.W-mg*2);
            y=mg+Math.random()*(this.H-mg*2);
        } while (Math.hypot(x-this.player.x, y-this.player.y) < 110);

        const ci  = Math.floor(Math.random()*this.COLORS.length);
        const r   = Math.random()*10 + (this.isMobile?12:14);
        const spd = (0.8+this.level*0.14)*(Math.random()*0.5+0.75);
        const ang = Math.random()*Math.PI*2;
        const rnd = Math.random();
        const type = rnd<0.08?'bomb' : rnd<0.15?'powerup' : 'normal';
        const puT  = ['rainbow','magnet','shield','slow'];

        this.balls.push({
            x,y,r, ci,
            col: this.COLORS[ci].fill,
            vx: Math.cos(ang)*spd, vy: Math.sin(ang)*spd,
            ph: Math.random()*6.28, sc:0,
            type,
            puType: type==='powerup' ? puT[Math.floor(Math.random()*puT.length)] : null,
            wob: 0, wobSp: Math.random()*0.07+0.04
        });
    }

    // ─── Events ───
    _bind() {
        this._onMM = e => {
            const r=this.canvas.getBoundingClientRect();
            this.mouse.x=(e.clientX-r.left)*(this.W/r.width);
            this.mouse.y=(e.clientY-r.top)*(this.H/r.height);
            if (this.state===this.STATE.PLAYING) {
                this.player.tx=this.mouse.x; this.player.ty=this.mouse.y;
            }
        };
        this._onClick = () => {
            if (this.state===this.STATE.WAITING) { this.state=this.STATE.PLAYING; return; }
            if (this.state===this.STATE.DEAD && this.deathA>0.8) { this._restart(); return; }
            this._changeCol();
        };
        this._onTS = e => {
            e.preventDefault();
            const r=this.canvas.getBoundingClientRect();
            const tx=(e.touches[0].clientX-r.left)*(this.W/r.width);
            const ty=(e.touches[0].clientY-r.top)*(this.H/r.height);

            // FS button check
            const b=this.fsRect;
            if (tx>=b.x && tx<=b.x+b.w && ty>=b.y && ty<=b.y+b.h) { this._toggleFS(); return; }

            if (this.state===this.STATE.WAITING) { this.state=this.STATE.PLAYING; return; }
            if (this.state===this.STATE.DEAD && this.deathA>0.8) { this._restart(); return; }
            this.player.tx=tx; this.player.ty=ty;
        };
        this._onTM = e => {
            e.preventDefault();
            const r=this.canvas.getBoundingClientRect();
            this.player.tx=(e.touches[0].clientX-r.left)*(this.W/r.width);
            this.player.ty=(e.touches[0].clientY-r.top)*(this.H/r.height);
        };
        this._onTE = e => {
            e.preventDefault();
            if (this.state===this.STATE.PLAYING) this._changeCol();
        };

        this.canvas.addEventListener('mousemove', this._onMM);
        this.canvas.addEventListener('click',     this._onClick);
        this.canvas.addEventListener('touchstart', this._onTS, {passive:false});
        this.canvas.addEventListener('touchmove',  this._onTM, {passive:false});
        this.canvas.addEventListener('touchend',   this._onTE, {passive:false});
    }

    _changeCol() {
        if (this.effects.rainbow.on) return;
        this.pci = (this.pci+1) % this.COLORS.length;
        this.player.ccAnim = 1;
        this.player.scale  = 0.82;
        this._burstAt(this.player.x, this.player.y, this.COLORS[this.pci].fill, 8);
        if (window.audioManager) audioManager.play('click');
    }

    _restart() {
        this.score=0; this.onScore(0);
        this.state=this.STATE.WAITING;
        this.gameOver=false; this.level=1; this.popped=0;
        this.combo=0; this.comboTimer=0; this.maxCombo=0;
        this.deathA=0; this.flashA=0;
        this.balls=[]; this.parts=[]; this.pops=[];
        this.rings=[]; this.exps=[]; this.banners=[];
        this.player.x=this.W/2; this.player.y=this.H*0.65;
        this.player.vx=0; this.player.vy=0;
        this.player.inv=0; this.player.trail=[];
        this.player.ccAnim=0; this.player.scale=1;
        Object.values(this.effects).forEach(e=>{e.on=false;e.t=0;});
        this._spawnInit();
    }

    _toggleFS() {
        const el = this.canvas.parentElement || this.canvas;
        const isFS = !!(document.fullscreenElement||document.webkitFullscreenElement);
        if (!isFS) {
            (el.requestFullscreen||el.webkitRequestFullscreen||function(){}).call(el);
            try{screen.orientation?.lock('portrait');}catch(e){}
        } else {
            (document.exitFullscreen||document.webkitExitFullscreen||function(){}).call(document);
        }
        setTimeout(()=>this.resize(),200);
    }

    // ─── Update ───
    update(ts, dt) {
        if (this.paused||this.gameOver) return;
        this.time += dt;
        this.bgT  += dt*0.001;
        this.stars.forEach(s=>s.ph+=s.sp);

        // Shake
        if (this.shakeT>0) {
            const f=this.shakeF*(this.shakeT/16);
            this.shakeX=(Math.random()-.5)*f;
            this.shakeY=(Math.random()-.5)*f*0.5;
            this.shakeT--;
        } else { this.shakeX=0;this.shakeY=0; }

        if (this.flashA>0) this.flashA=Math.max(0,this.flashA-0.038);

        if (this.state===this.STATE.WAITING) { this._updateBalls(dt,true); return; }
        if (this.state===this.STATE.DEAD) {
            this.deathA=Math.min(1,this.deathA+0.015);
            this._updateParts(dt); return;
        }

        // Effects decay
        Object.values(this.effects).forEach(ef=>{
            if (ef.on) { ef.t-=dt; if (ef.t<=0){ef.on=false;ef.t=0;} }
        });
        if (this.effects.rainbow.on) this.pci=Math.floor(ts/150)%this.COLORS.length;

        this._updatePlayer(dt);
        this._updateBalls(dt,false);

        // Spawn
        this.spawnTimer+=dt;
        if (this.spawnTimer>=this.spawnInterval && this.balls.length<20+this.level*3) {
            this._spawnBall(); this.spawnTimer=0;
            this.spawnInterval=Math.max(800,2200-this.level*110);
        }

        // Combo
        if (this.comboTimer>0) { this.comboTimer-=dt; if (this.comboTimer<=0) this.combo=0; }

        // Magnet
        if (this.effects.magnet.on) {
            this.balls.forEach(b=>{
                if (b.ci!==this.pci && !this.effects.rainbow.on) return;
                const dx=this.player.x-b.x, dy=this.player.y-b.y;
                const d=Math.hypot(dx,dy);
                if (d<170 && d>5) { b.vx+=dx/d*0.28; b.vy+=dy/d*0.28; }
            });
        }

        // Rings
        this.rings=this.rings.filter(r=>{ r.r+=2.8; r.a-=0.03; return r.a>0; });

        // Banners
        this.banners=this.banners.filter(b=>{ b.y-=0.5; b.life--; b.op=Math.min(1,b.life/30); return b.life>0; });

        this._updateParts(dt);
        this.pops=this.pops.filter(p=>{ p.y-=1.2; p.life-=dt; p.op=Math.min(1,p.life/500); return p.life>0; });

        const p=this.player;
        if (p.inv>0) p.inv-=dt;
        if (p.scale<1) p.scale=Math.min(1,p.scale+0.055);
        if (p.ccAnim>0) p.ccAnim=Math.max(0,p.ccAnim-0.065);
        p.pulse+=0.05;
    }

    _updatePlayer(dt) {
        const p=this.player;
        const slow=this.effects.slow.on?0.55:1;
        const dx=p.tx-p.x, dy=p.ty-p.y;
        p.vx+=dx*0.085; p.vy+=dy*0.085;
        p.vx*=0.82; p.vy*=0.82;
        p.x+=p.vx*slow; p.y+=p.vy*slow;
        p.x=Math.max(p.r, Math.min(this.W-p.r, p.x));
        p.y=Math.max(p.r, Math.min(this.H-p.r, p.y));

        p.trail.push({x:p.x, y:p.y, col:this.COLORS[this.pci].fill});
        if (p.trail.length>14) p.trail.shift();
    }

    _updateBalls(dt, idle) {
        const slow = this.effects.slow.on?0.5:1;

        for (let i=this.balls.length-1;i>=0;i--) {
            const b=this.balls[i];
            b.sc=Math.min(1,b.sc+0.06);
            b.ph+=b.wobSp;
            b.wob=Math.sin(b.ph)*0.06;

            // Ball-ball collision
            for (let j=i+1;j<this.balls.length;j++) {
                const b2=this.balls[j];
                const dx=b2.x-b.x, dy=b2.y-b.y;
                const d=Math.hypot(dx,dy);
                const md=b.r+b2.r;
                if (d<md && d>0) {
                    const nx=dx/d, ny=dy/d, ov=md-d;
                    b.x-=nx*ov*0.5; b.y-=ny*ov*0.5;
                    b2.x+=nx*ov*0.5; b2.y+=ny*ov*0.5;
                    const rv=b.vx-b2.vx, rvy=b.vy-b2.vy;
                    const dot=rv*nx+rvy*ny;
                    if (dot>0) { b.vx-=dot*nx; b.vy-=dot*ny; b2.vx+=dot*nx; b2.vy+=dot*ny; }
                }
            }

            b.x+=b.vx*slow; b.y+=b.vy*slow;
            if (b.x-b.r<=0)      {b.x=b.r;        b.vx= Math.abs(b.vx);}
            if (b.x+b.r>=this.W) {b.x=this.W-b.r; b.vx=-Math.abs(b.vx);}
            if (b.y-b.r<=0)      {b.y=b.r;        b.vy= Math.abs(b.vy);}
            if (b.y+b.r>=this.H) {b.y=this.H-b.r; b.vy=-Math.abs(b.vy);}

            if (idle) continue;

            // Player collision
            const px=this.player.x-b.x, py=this.player.y-b.y;
            const pd=Math.hypot(px,py);
            if (pd < this.player.r+b.r) {
                const match = this.effects.rainbow.on || b.ci===this.pci;

                if (b.type==='powerup') { this._collectPU(b,i); continue; }
                if (b.type==='bomb') {
                    if (match) { this._triggerBomb(b,i); continue; }
                    if (this.player.inv>0||this.effects.shield.on) continue;
                    this._die(b); return;
                }
                if (match) {
                    this._pop(b,i);
                } else {
                    if (this.player.inv>0||this.effects.shield.on) {
                        if (pd>0){b.vx=-(px/pd)*5; b.vy=-(py/pd)*5;}
                    } else { this._die(b); return; }
                }
            }
        }
    }

    _pop(b, idx) {
        this.combo++; this.comboTimer=2000;
        this.maxCombo=Math.max(this.maxCombo,this.combo);
        const mult=this.effects.rainbow.on?2:1;
        const cb=Math.min(this.combo-1,8)*5;
        const pts=(10+cb)*mult;
        this.score+=pts;
        if (this.score>this.bestScore){this.bestScore=this.score;localStorage.setItem('cb_best',this.bestScore);}
        this.onScore(this.score);
        this._burstAt(b.x,b.y,b.col,12);
        this.rings.push({x:b.x,y:b.y,r:b.r,a:0.7,col:b.col});
        this.pops.push({
            x:b.x, y:b.y-18,
            text: this.combo>1?`+${pts} ×${this.combo}`:`+${pts}`,
            col: this.combo>3?'#FFD700':b.col, life:1100, op:1
        });
        this.balls.splice(idx,1); this.popped++;
        if (this.popped%this.popPerLvl===0) this._lvlUp();
        if (window.audioManager) audioManager.play('pop');
        this.player.scale=1.14;
    }

    _triggerBomb(b, idx) {
        const cx=b.x,cy=b.y,rad=105;
        let killed=0;
        for (let i=this.balls.length-1;i>=0;i--) {
            if (i===idx) continue;
            const b2=this.balls[i];
            if (Math.hypot(b2.x-cx,b2.y-cy)<rad) {
                this._burstAt(b2.x,b2.y,b2.col,6);
                this.balls.splice(i,1); killed++;
                if (idx>i) idx--;
            }
        }
        this.balls.splice(idx,1);
        this._burstAt(cx,cy,'#FFD700',22);
        const pts=(killed+1)*20;
        this.score+=pts; this.onScore(this.score);
        this.exps.push({x:cx,y:cy,r:5,mr:rad,a:1,col:'#FFD700'});
        this.pops.push({x:cx,y:cy-28,text:`💥 BOMB +${pts}`,col:'#FFD700',life:1500,op:1});
        this._shake(16,11);
        this.flashA=0.25; this.flashC='#FFD700';
        if (window.audioManager) audioManager.play('explosion');
    }

    _collectPU(b, idx) {
        const ef=this.effects[b.puType];
        if (ef){ef.on=true;ef.t=ef.dur;}
        const info={rainbow:{t:'RAINBOW!',c:'#FF006E'},magnet:{t:'MAGNET!',c:'#00D4FF'},shield:{t:'SHIELD!',c:'#00FF88'},slow:{t:'SLOW MO!',c:'#B94FE3'}};
        const pi=info[b.puType]||{t:'BONUS!',c:'#FFD700'};
        this._burstAt(b.x,b.y,b.col,16);
        this.pops.push({x:b.x,y:b.y-20,text:pi.t,col:pi.c,life:1500,op:1});
        this.balls.splice(idx,1);
        this.flashA=0.16; this.flashC=b.col;
        this.player.inv=1000;
        if (window.audioManager) audioManager.play('powerup');
    }

    _lvlUp() {
        this.level++;
        this.score+=100*this.level; this.onScore(this.score);
        this.flashA=0.25; this.flashC='#00FF88';
        this._shake(9,6);
        this.banners.push({x:this.W/2,y:this.H/2,text:`⬆ LEVEL ${this.level}`,col:'#00FF88',sz:22,life:90,op:1});
        if (window.audioManager) audioManager.play('levelUp');
    }

    _die(ball) {
        if (this.effects.shield.on) {
            this.effects.shield.on=false; this.effects.shield.t=0;
            this.player.inv=1500;
            this._burstAt(this.player.x,this.player.y,'#00FF88',14);
            this.flashA=0.25; this.flashC='#00FF88';
            if (window.audioManager) audioManager.play('shield');
            return;
        }
        this.gameOver=true; this.state=this.STATE.DEAD;
        this._burstAt(this.player.x,this.player.y,this.COLORS[this.pci].fill,24);
        this.exps.push({x:this.player.x,y:this.player.y,r:5,mr:85,a:1,col:ball.col});
        this._shake(22,15);
        this.flashA=0.6; this.flashC='#FF0044';
        setTimeout(()=>this.onScore(this.score,true),1100);
        if (window.audioManager) audioManager.play('gameOver');
    }

    _burstAt(x,y,col,n) {
        for (let i=0;i<n&&this.parts.length<this.MAX_PARTS;i++) {
            const a=Math.random()*Math.PI*2, sp=Math.random()*5.5+2;
            this.parts.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:Math.random()*5+1.5,life:1,dec:0.035,col,g:0.1});
        }
    }

    _updateParts(dt) {
        this.parts=this.parts.filter(p=>{
            p.x+=p.vx; p.y+=p.vy; p.vy+=p.g||0; p.vx*=0.965;
            p.life-=p.dec; p.r*=0.96;
            return p.life>0 && p.r>0.3;
        });
        this.exps=this.exps.filter(e=>{e.r+=4;e.a-=0.04;return e.a>0&&e.r<e.mr;});
    }

    _shake(t,f) { this.shakeT=t; this.shakeF=f; }

    // ─── Draw ───
    draw(ts) {
        const ctx=this.ctx;
        ctx.fillStyle='#050510';
        ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

        ctx.save();
        if (this.shakeX||this.shakeY) ctx.translate(this.S(this.shakeX),this.S(this.shakeY));

        this._drawBG(ts);
        this._drawRings();
        this._drawExps();
        this._drawBalls(ts);
        this._drawParts();
        this._drawPlayer(ts);
        this._drawPops();
        this._drawBanners();

        if (this.flashA>0) {
            ctx.globalAlpha=this.flashA;
            ctx.fillStyle=this.flashC;
            ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
            ctx.globalAlpha=1;
        }

        // Vignette
        const vg=ctx.createRadialGradient(this.X(this.W/2),this.X(this.H/2),this.S(this.H*0.28),this.X(this.W/2),this.X(this.H/2),this.S(this.H*0.82));
        vg.addColorStop(0,'transparent');
        vg.addColorStop(1,'rgba(0,0,5,0.5)');
        ctx.fillStyle=vg;
        ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

        ctx.restore();

        this._drawHUD(ts);
        this._drawFSBtn(ts);

        if (this.state===this.STATE.WAITING) this._drawWait(ts);
        if (this.state===this.STATE.DEAD)    this._drawDeath(ts);
    }

    _drawBG(ts) {
        const ctx=this.ctx;
        const g=ctx.createRadialGradient(this.X(this.W/2),this.X(this.H/2),0,this.X(this.W/2),this.X(this.H/2),this.S(this.H));
        g.addColorStop(0,'#110825'); g.addColorStop(0.6,'#080518'); g.addColorStop(1,'#030210');
        ctx.fillStyle=g;
        ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

        // Stars
        this.stars.forEach(s=>{
            ctx.globalAlpha=0.1+((Math.sin(s.ph)+1)/2)*0.5;
            ctx.fillStyle=s.col;
            this._circle(s.x,s.y,s.r); ctx.fill();
        });
        ctx.globalAlpha=1;

        // Hex grid
        this.hexGrid.forEach(h=>{
            ctx.globalAlpha=h.a;
            ctx.strokeStyle='rgba(185,79,227,0.25)';
            ctx.lineWidth=this.S(0.5);
            this._hexPath(h.x,h.y,h.sz); ctx.stroke();
        });
        ctx.globalAlpha=1;
    }

    _drawRings() {
        const ctx=this.ctx;
        this.rings.forEach(r=>{
            ctx.save(); ctx.globalAlpha=r.a;
            ctx.strokeStyle=r.col; ctx.lineWidth=this.S(2*r.a);
            this._circle(r.x,r.y,r.r); ctx.stroke();
            ctx.restore();
        });
    }

    _drawExps() {
        const ctx=this.ctx;
        this.exps.forEach(e=>{
            ctx.save(); ctx.globalAlpha=e.a;
            ctx.strokeStyle=e.col; ctx.lineWidth=this.S(3);
            this._circle(e.x,e.y,e.r); ctx.stroke();
            ctx.globalAlpha=e.a*0.25;
            ctx.fillStyle=e.col;
            this._circle(e.x,e.y,e.r); ctx.fill();
            ctx.restore();
        });
    }

    _drawParts() {
        const ctx=this.ctx;
        this.parts.forEach(p=>{
            ctx.save(); ctx.globalAlpha=Math.max(0,p.life);
            ctx.fillStyle=p.col;
            this._circle(p.x,p.y,Math.max(0.3,p.r*p.life)); ctx.fill();
            ctx.restore();
        });
    }

    _drawPops() {
        this.pops.forEach(p=>{
            this._txt(p.text, p.x, p.y, {
                sz:13, wt:'bold', col:p.col, al:'center', op:p.op,
                stroke:true, sc:'rgba(0,0,0,0.55)', sw:2.5, ff:this.FT
            });
        });
    }

    _drawBanners() {
        this.banners.forEach(b=>{
            this._txt(b.text, b.x, b.y, {
                sz:b.sz||20, wt:'bold', col:b.col, al:'center', bl:'middle',
                op:b.op, stroke:true, sc:'rgba(0,0,0,0.5)', sw:3, ff:this.FT
            });
        });
    }

    // ─── Balls ───
    _drawBalls(ts) {
        const ctx=this.ctx;
        for (const b of this.balls) {
            const pulse=1+Math.sin(b.ph)*0.055;
            const r=b.r*b.sc*pulse;

            ctx.save();
            ctx.translate(this.X(b.x),this.X(b.y));
            ctx.scale(1+b.wob, 1-b.wob*0.5);

            if (b.type==='bomb') {
                const bg=ctx.createRadialGradient(this.S(-r*.3),this.S(-r*.3),0,0,0,this.S(r));
                bg.addColorStop(0,'#555'); bg.addColorStop(0.5,'#2a2a2a'); bg.addColorStop(1,'#111');
                ctx.fillStyle=bg;
                this._circle(0,0,r); ctx.fill();
                // Fuse
                ctx.strokeStyle='#FFD700'; ctx.lineWidth=this.S(2); ctx.lineCap='round';
                ctx.beginPath();
                ctx.moveTo(0,this.S(-r));
                ctx.quadraticCurveTo(this.S(r*.3),this.S(-r*1.4),this.S(r*.1),this.S(-r*1.65));
                ctx.stroke();
                // Spark
                if (Math.random()>0.45) {
                    ctx.fillStyle='#FFD700';
                    this._circle(r*.1,-r*1.65,2.5); ctx.fill();
                }
                // X mark
                this._txt('✕', 0, r*0.15, {sz:r*0.65,col:'rgba(255,255,255,0.5)',al:'center',bl:'middle',ff:this.FU});

            } else if (b.type==='powerup') {
                const puC={rainbow:'#FF006E',magnet:'#00D4FF',shield:'#00FF88',slow:'#B94FE3'};
                const c=puC[b.puType]||'#FFD700';
                const pg=ctx.createRadialGradient(this.S(-r*.3),this.S(-r*.3),0,0,0,this.S(r));
                pg.addColorStop(0,this._lt(c,60)); pg.addColorStop(0.6,c); pg.addColorStop(1,this._dk(c,40));
                ctx.fillStyle=pg;
                this._circle(0,0,r); ctx.fill();
                // Ring
                ctx.strokeStyle='rgba(255,255,255,0.35)'; ctx.lineWidth=this.S(1.5);
                this._circle(0,0,r+3+Math.sin(b.ph*2)*2); ctx.stroke();
                // Label
                const lb={rainbow:'R',magnet:'M',shield:'S',slow:'SL'};
                this._txt(lb[b.puType]||'?',0,r*0.12,{sz:r*0.65,wt:'bold',col:'#fff',al:'center',bl:'middle',ff:this.FT});

            } else {
                // Normal ball
                const bg=ctx.createRadialGradient(this.S(-r*.3),this.S(-r*.35),this.S(r*.05),0,0,this.S(r));
                bg.addColorStop(0,this._lt(b.col,70)); bg.addColorStop(0.4,b.col);
                bg.addColorStop(0.8,this._dk(b.col,30)); bg.addColorStop(1,this._dk(b.col,60));
                ctx.fillStyle=bg;
                this._circle(0,0,r); ctx.fill();

                // Outline
                ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=this.S(0.8);
                this._circle(0,0,r); ctx.stroke();

                // Shine
                ctx.fillStyle='rgba(255,255,255,0.46)';
                ctx.beginPath();
                ctx.ellipse(this.S(-r*.28),this.S(-r*.32),this.S(r*.28),this.S(r*.18),-0.5,0,Math.PI*2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    // ─── Player ───
    _drawPlayer(ts) {
        const ctx=this.ctx;
        const p=this.player;
        const cd=this.COLORS[this.pci];
        const rainbow=this.effects.rainbow.on;

        // Trail
        p.trail.forEach((t,i)=>{
            const ratio=i/p.trail.length;
            ctx.save(); ctx.globalAlpha=ratio*0.25;
            ctx.fillStyle=t.col;
            this._circle(t.x,t.y,Math.max(0.5,p.r*ratio*0.7)); ctx.fill();
            ctx.restore();
        });

        if (this.state===this.STATE.DEAD) return;

        const r=p.r*p.scale;
        if (p.inv>0 && Math.floor(p.inv/100)%2===0) return;

        ctx.save();
        ctx.translate(this.X(p.x),this.X(p.y));

        // Shield ring
        if (this.effects.shield.on) {
            const sa=0.5+Math.sin(ts/150)*0.35;
            ctx.save();
            ctx.strokeStyle=`rgba(0,255,136,${sa})`;
            ctx.lineWidth=this.S(2.5);
            ctx.setLineDash([this.S(5),this.S(5)]);
            ctx.lineDashOffset=-ts/50;
            this._circle(0,0,r+12); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Magnet ring
        if (this.effects.magnet.on) {
            const ma=0.25+Math.sin(ts/200)*0.16;
            ctx.save();
            ctx.strokeStyle=`rgba(0,212,255,${ma})`;
            ctx.lineWidth=this.S(1.5);
            ctx.setLineDash([this.S(4),this.S(7)]);
            ctx.lineDashOffset=ts/30;
            this._circle(0,0,170); ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Color change ring
        if (p.ccAnim>0) {
            ctx.save(); ctx.globalAlpha=p.ccAnim*0.7;
            ctx.strokeStyle='#fff'; ctx.lineWidth=this.S(2);
            this._circle(0,0,r+p.ccAnim*18); ctx.stroke();
            ctx.restore();
        }

        // Body
        const col = rainbow ? `hsl(${(ts/10)%360},100%,60%)` : cd.fill;
        const bg=ctx.createRadialGradient(this.S(-r*.3),this.S(-r*.35),this.S(r*.05),0,0,this.S(r));
        bg.addColorStop(0,this._lt(col,80)); bg.addColorStop(0.35,col);
        bg.addColorStop(0.7,this._dk(col,20)); bg.addColorStop(1,this._dk(col,50));
        ctx.fillStyle=bg;
        this._circle(0,0,r); ctx.fill();

        // Outer ring
        ctx.strokeStyle=rainbow?`hsl(${((ts/10)+60)%360},100%,80%)`:'rgba(255,255,255,0.45)';
        ctx.lineWidth=this.S(2.5);
        this._circle(0,0,r); ctx.stroke();

        // Inner pulse
        const pm=0.65+Math.sin(p.pulse)*0.05;
        ctx.strokeStyle='rgba(255,255,255,0.16)'; ctx.lineWidth=this.S(1);
        this._circle(0,0,r*pm); ctx.stroke();

        // Shine
        ctx.fillStyle='rgba(255,255,255,0.46)';
        ctx.beginPath();
        ctx.ellipse(this.S(-r*.28),this.S(-r*.32),this.S(r*.3),this.S(r*.2),-0.5,0,Math.PI*2);
        ctx.fill();

        ctx.restore();
    }

    // ─── HUD ───
    _drawHUD(ts) {
        const ctx=this.ctx;
        const W=this.W;

        // Top bar
        const hg=ctx.createLinearGradient(0,0,0,this.X(46));
        hg.addColorStop(0,'rgba(0,0,0,0.72)'); hg.addColorStop(1,'rgba(0,0,0,0.08)');
        ctx.fillStyle=hg;
        ctx.fillRect(0,0,this.canvas.width,this.X(46));

        // Level
        this._txt(`LVL ${this.level}`, 10, 23, {sz:11,wt:'bold',col:'#c070ff',ff:this.FT});

        // Score
        this._txt(this.score.toLocaleString(), W/2, 22, {sz:18,wt:'bold',col:'#fff',al:'center',ff:this.FT});

        // Best
        if (this.bestScore>0)
            this._txt(`BEST  ${this.bestScore.toLocaleString()}`, W/2, 38, {sz:8,col:'rgba(255,215,0,0.45)',al:'center',ff:this.FU});

        // Color name
        const c=this.COLORS[this.pci];
        this._txt(c.name.toUpperCase(), W-12, 20, {sz:10,wt:'bold',col:c.fill,al:'right',ff:this.FT});
        this._txt('TAP=COLOR', W-12, 34, {sz:7,col:'rgba(255,255,255,0.25)',al:'right',ff:this.FU});

        // Combo
        if (this.combo>1 && this.comboTimer>0) {
            const ca=Math.min(1,this.comboTimer/500);
            this._txt(`×${this.combo} COMBO`, W/2, 55, {sz:12,wt:'bold',col:'#FFD700',al:'center',op:ca,ff:this.FT});
        }

        // Effect bars
        const efI={rainbow:{l:'RAIN',c:'#FF006E'},magnet:{l:'MAG',c:'#00D4FF'},shield:{l:'SHD',c:'#00FF88'},slow:{l:'SLOW',c:'#B94FE3'}};
        let ex=8; const ey=48;
        Object.entries(this.effects).forEach(([k,ef])=>{
            if (!ef.on) return;
            const info=efI[k]; if (!info) return;
            const pct=ef.t/ef.dur, bw=44;

            ctx.fillStyle='rgba(0,0,0,0.45)';
            this._rrect(ex,ey,bw,12,3); ctx.fill();
            ctx.fillStyle=info.c; ctx.globalAlpha=0.35;
            this._rrect(ex,ey,bw*pct,12,3); ctx.fill();
            ctx.globalAlpha=1;
            ctx.strokeStyle=info.c; ctx.lineWidth=this.S(0.8);
            this._rrect(ex,ey,bw,12,3); ctx.stroke();
            this._txt(info.l, ex+bw/2, ey+8, {sz:7,wt:'bold',col:'#fff',al:'center',ff:this.FU});
            ex+=bw+5;
        });
    }

    // ─── FS Button ───
    _drawFSBtn(ts) {
        const ctx=this.ctx;
        const bw=46,bh=46,mg=12;
        const bx=this.W-bw-mg, by=this.H-bh-mg;
        this.fsRect={x:bx,y:by,w:bw,h:bh};
        const isFS=!!(document.fullscreenElement||document.webkitFullscreenElement);
        const pulse=0.48+Math.sin(ts/1300)*0.18;

        ctx.save(); ctx.globalAlpha=pulse;
        ctx.fillStyle='rgba(0,0,10,0.55)';
        ctx.strokeStyle='rgba(255,255,255,0.2)'; ctx.lineWidth=this.S(1.2);
        this._rrect(bx,by,bw,bh,10); ctx.fill(); ctx.stroke();

        const cx=bx+bw/2, cy=by+bh/2, ic=7;
        ctx.strokeStyle='#fff'; ctx.lineWidth=this.S(2);
        ctx.lineCap='round'; ctx.lineJoin='round';

        if (!isFS) {
            [[cx-ic+3,cy-ic,cx-ic,cy-ic,cx-ic,cy-ic+3],
             [cx+ic-3,cy-ic,cx+ic,cy-ic,cx+ic,cy-ic+3],
             [cx-ic+3,cy+ic,cx-ic,cy+ic,cx-ic,cy+ic-3],
             [cx+ic-3,cy+ic,cx+ic,cy+ic,cx+ic,cy+ic-3]
            ].forEach(([x1,y1,x2,y2,x3,y3])=>{
                ctx.beginPath();
                ctx.moveTo(this.X(x1),this.X(y1));
                ctx.lineTo(this.X(x2),this.X(y2));
                ctx.lineTo(this.X(x3),this.X(y3));
                ctx.stroke();
            });
        } else {
            [[cx-ic+4,cy-ic,cx-ic+4,cy-ic+4,cx-ic,cy-ic+4],
             [cx+ic-4,cy-ic,cx+ic-4,cy-ic+4,cx+ic,cy-ic+4],
             [cx-ic+4,cy+ic,cx-ic+4,cy+ic-4,cx-ic,cy+ic-4],
             [cx+ic-4,cy+ic,cx+ic-4,cy+ic-4,cx+ic,cy+ic-4]
            ].forEach(([x1,y1,x2,y2,x3,y3])=>{
                ctx.beginPath();
                ctx.moveTo(this.X(x1),this.X(y1));
                ctx.lineTo(this.X(x2),this.X(y2));
                ctx.lineTo(this.X(x3),this.X(y3));
                ctx.stroke();
            });
        }
        ctx.restore();
    }

    // ─── Waiting ───
    _drawWait(ts) {
        const cx=this.W/2, cy=this.H/2;
        const cw=Math.min(this.W-40,300), ch=105;

        this.ctx.fillStyle='rgba(4,2,14,0.86)';
        this._rrect(cx-cw/2,cy-ch/2,cw,ch,16); this.ctx.fill();
        this.ctx.strokeStyle='rgba(185,79,227,0.35)'; this.ctx.lineWidth=this.S(1.5);
        this._rrect(cx-cw/2,cy-ch/2,cw,ch,16); this.ctx.stroke();

        this._txt('COLOR BUMP', cx, cy-18, {sz:22,wt:'bold',col:'#FF006E',al:'center',ff:this.FT});

        this.ctx.fillStyle='rgba(255,255,255,0.08)'; this.ctx.lineWidth=0;
        this.ctx.fillRect(this.X(cx-cw*0.38),this.X(cy-3),this.X(cw*0.76),this.S(1));

        this._txt('Drag to move · Tap to change color', cx, cy+12, {sz:11,col:'rgba(180,180,200,0.65)',al:'center',ff:this.FU});

        const bob=Math.sin(this.time/440)*4;
        this._txt('Tap anywhere to start', cx, cy+ch/2-10+bob, {
            sz:10,col:`rgba(150,150,180,${0.4+Math.sin(this.time/440)*0.4})`,al:'center',ff:this.FU
        });
    }

    // ─── Death ───
    _drawDeath(ts) {
        const ctx=this.ctx;
        const cx=this.W/2, cy=this.H/2, a=this.deathA;

        ctx.fillStyle=`rgba(0,0,0,${a*0.76})`;
        ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

        if (a<0.5) return;
        const pa=Math.min(1,(a-0.5)/0.5);

        const pw=Math.min(this.W-32,300), ph=270;
        const px=cx-pw/2, py=cy-ph/2;

        ctx.save(); ctx.globalAlpha=pa;

        // Panel
        ctx.fillStyle='rgba(6,2,18,0.97)';
        this._rrect(px,py,pw,ph,18); ctx.fill();
        ctx.strokeStyle='rgba(255,0,90,0.5)'; ctx.lineWidth=this.S(1.5);
        this._rrect(px,py,pw,ph,18); ctx.stroke();

        // Top accent
        ctx.fillStyle='rgba(255,0,90,0.12)';
        ctx.fillRect(this.X(px),this.X(py),this.X(pw),this.S(3));

        ctx.globalAlpha=1;

        this._txt('GAME OVER', cx, py+44, {sz:24,wt:'bold',col:'#FF006E',al:'center',op:pa,ff:this.FT});

        // Divider
        ctx.fillStyle=`rgba(255,255,255,${0.07*pa})`;
        ctx.fillRect(this.X(px+20),this.X(py+60),this.X(pw-40),this.S(1));

        // Stats
        const rows=[
            {l:'SCORE',      v:this.score.toLocaleString(), c:this.score>=this.bestScore?'#00fff5':'#fff'},
            {l:'BEST',       v:this.bestScore.toLocaleString(), c:this.score>=this.bestScore?'#FFD700':'#aaa'},
            {l:'LEVEL',      v:String(this.level), c:'#c070ff'},
            {l:'BEST COMBO', v:`×${this.maxCombo}`, c:'#FFD700'},
            {l:'POPPED',     v:String(this.popped), c:'#00FF88'}
        ];

        rows.forEach((r,i)=>{
            const ry=py+84+i*30;
            this._txt(r.l, px+22, ry, {sz:10,wt:'600',col:`rgba(130,130,160,${pa})`,ff:this.FU});
            this._txt(r.v, px+pw-22, ry, {sz:i===0?16:13,wt:'bold',col:r.c,al:'right',op:pa,ff:this.FT});
        });

        // New best badge
        if (this.score>0 && this.score>=this.bestScore) {
            ctx.fillStyle='rgba(255,215,0,0.1)'; ctx.strokeStyle='rgba(255,215,0,0.4)'; ctx.lineWidth=this.S(1);
            this._rrect(cx-52,py+72,104,18,6); ctx.fill(); ctx.stroke();
            this._txt('✦ NEW BEST ✦', cx, py+83, {sz:9,wt:'bold',col:'#FFD700',al:'center',bl:'middle',op:pa,ff:this.FT});
        }

        // Divider
        ctx.fillStyle=`rgba(255,255,255,${0.07*pa})`;
        ctx.fillRect(this.X(px+20),this.X(py+ph-48),this.X(pw-40),this.S(1));

        // Tap to restart
        const blink=0.4+Math.sin(this.time/380)*0.45;
        this._txt('● TAP TO PLAY AGAIN ●', cx, py+ph-18, {
            sz:11,col:'rgba(190,190,220,0.85)',al:'center',op:blink*pa,ff:this.FU
        });

        ctx.restore();
    }

    // ─── Utils ───
    _lt(c, a) {
        if (!c.startsWith('#')) return c;
        return `rgb(${Math.min(255,parseInt(c.slice(1,3),16)+a)},${Math.min(255,parseInt(c.slice(3,5),16)+a)},${Math.min(255,parseInt(c.slice(5,7),16)+a)})`;
    }
    _dk(c, a) {
        if (!c.startsWith('#')) return c;
        return `rgb(${Math.max(0,parseInt(c.slice(1,3),16)-a)},${Math.max(0,parseInt(c.slice(3,5),16)-a)},${Math.max(0,parseInt(c.slice(5,7),16)-a)})`;
    }

    // ─── Loop ───
    _loop(ts) {
        if (this.destroyed) return;
        const dt=Math.min(ts-(this.lastTime||ts),50);
        this.lastTime=ts;
        this.update(ts,dt);
        this.draw(ts);
        this.animId=requestAnimationFrame(t=>this._loop(t));
    }

    togglePause() {
        this.paused=this.isPaused=!this.paused;
        if (!this.paused) this.lastTime=performance.now();
        return this.paused;
    }

    resize() {
        this._setupHD();
        this.W=this.canvas.width/this.dpr;
        this.H=this.canvas.height/this.dpr;
        this.isMobile=('ontouchstart' in window)||this.W<768;
        this.stars=this._mkStars(this.isMobile?35:55);
        this.hexGrid=this._mkHex();
    }

    destroy() {
        this.destroyed=true;
        cancelAnimationFrame(this.animId);
        this.canvas.removeEventListener('mousemove',  this._onMM);
        this.canvas.removeEventListener('click',      this._onClick);
        this.canvas.removeEventListener('touchstart', this._onTS);
        this.canvas.removeEventListener('touchmove',  this._onTM);
        this.canvas.removeEventListener('touchend',   this._onTE);
    }
}