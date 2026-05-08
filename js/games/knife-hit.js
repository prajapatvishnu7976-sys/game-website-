'use strict';

class KnifeHit {
    constructor(canvas, onScore, options = {}) {
        this.canvas    = canvas;
        this.onScore   = onScore;
        this.options   = options;
        this.destroyed = false;
        this.paused    = false;
        this.isPaused  = false;
        this.gameOver  = false;

        // ── MOBILE DETECTION ──
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
            || ('ontouchstart' in window) || (window.innerWidth < 768);

        // ═══ HD FIX: Real DPR for everything ═══
        this.dpr     = Math.min(window.devicePixelRatio || 1, 3);
        this.textDpr = this.dpr;

        this.setupCanvas();
        this.ctx = this.canvas.getContext('2d', { alpha: false });
        this.recalcLogicalSize();

        this.isSmallScreen = this.W < 380;
        this.TAU = Math.PI * 2;

        this.MAX_PARTICLES = this.isMobile ? 50 : 120;
        this.MAX_POP_RINGS = this.isMobile ? 8  : 16;
        this.MAX_TRAIL     = this.isMobile ? 8  : 14;

        this.FONT_TITLE = '"Orbitron", monospace';
        this.FONT_UI    = '"Rajdhani", sans-serif';

        this.audioCtx   = null;
        this.masterGain = null;
        this.audioReady = false;

        this.saveKey    = 'neonarcade_knifehit_v8';
        this.playerData = this.loadPlayerData();

        this.score        = 0;
        this.level        = this.playerData.currentLevel || 1;
        this.stage        = 1;
        this.lives        = 3;
        this.maxLives     = 3;
        this.sessionCoins = 0;
        this.sessionDias  = 0;
        this.combo        = 0;
        this.maxCombo     = 0;
        this.streak       = 0;
        this.streakRecord = 0;
        this.closeCallCount = 0;
        this.perfectHits  = 0;
        this.hitPulse     = 0;
        this.hitPulseTimer = 0;
        this.levelStartTime = Date.now();

        this.knivesTotal  = 0;
        this.knivesLeft   = 0;
        this.knivesThrown = 0;

        this.noKnivesLeft         = false;
        this.noKnivesOverlayAlpha = 0;

        this.target = this.createTarget();

        this.knifeSkins = {
            default: { blade:['#aaa','#e8e8e8','#fff'],      handle:['#2a0e04','#5a2a0e','#2a0e04'], guard:'#777',    name:'Classic' },
            neon:    { blade:['#00c4ef','#55e8ff','#fff'],    handle:['#081828','#10305a','#081828'], guard:'#00c4ef', name:'Neon'    },
            fire:    { blade:['#ee3300','#ff7700','#ffbb00'], handle:['#2a0600','#500e00','#2a0600'], guard:'#ee3300', name:'Fire'    },
            gold:    { blade:['#bb8800','#FFD700','#fff8dc'], handle:['#2a1e00','#5a3e00','#2a1e00'], guard:'#FFD700', name:'Gold'    },
            plasma:  { blade:['#8800ff','#bb44ff','#eeccff'], handle:['#1a0030','#330066','#1a0030'], guard:'#9933ff', name:'Plasma'  },
        };
        this.currentSkin = this.playerData.currentSkin || 'default';

        this.stuckKnives   = [];
        this.flyingKnife   = null;
        this.idleKnife     = null;
        this.apples        = [];
        this.orbitCoins    = [];

        this.particles      = [];
        this.explosions     = [];
        this.scorePopups    = [];
        this.floatingTexts  = [];
        this.coinPickups    = [];
        this.breakPieces    = [];
        this.popRings       = [];
        this.trailParticles = [];
        this.shockwaves     = [];

        this.shakeX = 0; this.shakeY = 0;
        this.shakeTimer = 0; this.shakeForce = 0;
        this.flashTimer = 0; this.flashColor = '#ff0055';
        this.vignetteFlash = 0; this.vignetteColor = '#ff0055';

        this.time  = 0;
        this.frame = 0;

        this.stageComplete      = false;
        this.stageCompleteTimer = 0;
        this.hudFlash           = {};
        this.showNewRecord      = false;
        this.newRecordTimer     = 0;

        this.powerUps = {
            extraKnife: { count: this.playerData.powerUps?.extraKnife ?? 2, icon:'🗡', name:'Extra',  color:'#00FF88' },
            slowTarget: { count: this.playerData.powerUps?.slowTarget ?? 1, icon:'🐢', name:'Slow',   color:'#00D4FF' },
            shield:     { count: this.playerData.powerUps?.shield     ?? 1, icon:'🛡', name:'Shield', color:'#b347d9' },
            bomb:       { count: this.playerData.powerUps?.bomb       ?? 0, icon:'💣', name:'Bomb',   color:'#FF8C00' }
        };
        this.activeEffects = { slow:false, slowTimer:0, shield:false };

        this.showDailyReward    = false;
        this.dailyRewardClaimed = false;
        this.dailyRewardAnim    = 0;
        this.checkDailyReward();

        this.milestones        = [5,10,20,30,50,75,100,150,200];
        this.milestonesClaimed = new Set();

        this.stars   = this.makeStars(this.isMobile ? 25 : 70);
        this.nebulae = this.makeNebulae();

        this.setupLevel();
        this.createIdleKnife();
        this.bindEvents();

        this.lastTime = 0;
        this.animId = requestAnimationFrame(t => this.loop(t));
    }

    /* ════════════════════════════════════
       CANVAS SETUP — HD DPR-AWARE
    ════════════════════════════════════ */
    setupCanvas() {
        const wrapper = this.canvas.parentElement;
        let w, h;

        if (wrapper) {
            wrapper.offsetHeight;
            const rect = wrapper.getBoundingClientRect();
            w = rect.width  || wrapper.clientWidth  || window.innerWidth;
            h = rect.height || wrapper.clientHeight || window.innerHeight;
        } else {
            w = window.innerWidth;
            h = window.innerHeight;
        }

        w = Math.max(w, 200);
        h = Math.max(h, 300);

        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
        this.canvas.width  = Math.round(w * this.dpr);
        this.canvas.height = Math.round(h * this.dpr);

        this._cssW = w;
        this._cssH = h;
    }

    recalcLogicalSize() {
        this.W = this._cssW || (this.canvas.width  / this.dpr);
        this.H = this._cssH || (this.canvas.height / this.dpr);
    }

    /* ════════════════════════════════════
       HELPERS
    ════════════════════════════════════ */
    clamp(v,mn,mx){ return Math.max(mn, Math.min(mx, v)); }
    rand(mn,mx)   { return mn + Math.random() * (mx - mn); }

    gX(x) { return (x * this.dpr + 0.5) | 0; }
    gY(y) { return (y * this.dpr + 0.5) | 0; }
    gS(s) { return s * this.dpr; }
    gSr(s){ return (s * this.dpr + 0.5) | 0; }

    /* ════════════════════════════════════
       CRISP TEXT — UNIFIED DPR
    ════════════════════════════════════ */
    drawText(ctx, text, x, y, opts = {}) {
        const {
            size = 14, weight = 'bold', color = '#FFFFFF',
            align = 'left', baseline = 'alphabetic',
            family = null,
            glow = false, glowColor = null, glowBlur = 0,
            stroke = false, strokeColor = 'rgba(0,0,0,0.7)', strokeWidth = 3,
            opacity = 1, maxWidth = 0
        } = opts;

        if (opacity <= 0) return;

        ctx.save();
        ctx.globalAlpha  = Math.min(1, opacity);
        ctx.textAlign    = align;
        ctx.textBaseline = baseline;

        const d   = this.dpr;
        const fam = family || (size > 16 ? this.FONT_TITLE : this.FONT_UI);
        ctx.font  = `${weight} ${Math.round(size * d)}px ${fam}`;

        const px = (x * d + 0.5) | 0;
        const py = (y * d + 0.5) | 0;
        const mw = maxWidth ? maxWidth * d : undefined;

        ctx.imageSmoothingEnabled = true;

        if (stroke) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth   = strokeWidth * d;
            ctx.lineJoin    = 'round';
            ctx.strokeText(text, px, py, mw);
        }

        if (glow && glowBlur > 0 && !this.isMobile) {
            ctx.shadowBlur  = glowBlur * d;
            ctx.shadowColor = glowColor || color;
        }

        ctx.fillStyle = color;
        ctx.fillText(text, px, py, mw);
        ctx.shadowBlur  = 0;
        ctx.shadowColor = 'transparent';

        ctx.imageSmoothingEnabled = false;
        ctx.restore();
    }

    /* ════════════════════════════════════
       SHAPE HELPERS
    ════════════════════════════════════ */
    fillRect(ctx,x,y,w,h) {
        ctx.fillRect(this.gX(x), this.gY(y), this.gSr(w), this.gSr(h));
    }
    drawCircle(ctx,x,y,r) {
        ctx.beginPath();
        ctx.arc(this.gX(x), this.gY(y), Math.max(0.5, this.gS(r)), 0, this.TAU);
    }
    drawRoundRect(ctx,x,y,w,h,r) {
        const dx=this.gX(x), dy=this.gY(y);
        const dw=this.gSr(w), dh=this.gSr(h), dr=this.gS(r);
        ctx.beginPath();
        ctx.moveTo(dx+dr, dy);
        ctx.arcTo(dx+dw, dy,    dx+dw, dy+dh, dr);
        ctx.arcTo(dx+dw, dy+dh, dx,    dy+dh, dr);
        ctx.arcTo(dx,    dy+dh, dx,    dy,    dr);
        ctx.arcTo(dx,    dy,    dx+dw, dy,    dr);
        ctx.closePath();
    }
    drawLine(ctx,x1,y1,x2,y2) {
        ctx.beginPath();
        ctx.moveTo(this.gX(x1), this.gY(y1));
        ctx.lineTo(this.gX(x2), this.gY(y2));
    }

    /* ════════════════════════════════════
       AUDIO
    ════════════════════════════════════ */
    initAudio() {
        if (this.audioCtx) {
            if (this.audioCtx.state === 'suspended') this.audioCtx.resume().then(() => { this.audioReady = true; });
            return;
        }
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.audioCtx   = new AC();
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.value = 0.28;
            this.compressor = this.audioCtx.createDynamicsCompressor();
            this.compressor.connect(this.masterGain);
            this.masterGain.connect(this.audioCtx.destination);
            this.audioCtx.state === 'suspended'
                ? this.audioCtx.resume().then(() => { this.audioReady = true; })
                : (this.audioReady = true);
        } catch(e) {}
    }
    _audioOk() { return this.audioCtx && this.audioReady && this.audioCtx.state === 'running'; }
    _out()     { return this.compressor || this.masterGain; }
    _tone(type,freq,dur,vol,endMul=1,delay=0) {
        if (!this._audioOk()) return;
        try {
            const ctx=this.audioCtx, now=ctx.currentTime+delay;
            const osc=ctx.createOscillator(), g=ctx.createGain();
            osc.type=type;
            osc.frequency.setValueAtTime(Math.max(20,freq), now);
            if (endMul !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(20,freq*endMul), now+dur);
            g.gain.setValueAtTime(0.0001, now);
            g.gain.linearRampToValueAtTime(vol, now+0.005);
            g.gain.exponentialRampToValueAtTime(0.0001, now+Math.max(dur,0.01));
            osc.connect(g); g.connect(this._out());
            osc.start(now); osc.stop(now+dur+0.04);
        } catch(e) {}
    }
    _noise(dur,vol,hp=800,delay=0) {
        if (!this._audioOk()) return;
        try {
            const ctx=this.audioCtx, now=ctx.currentTime+delay;
            const sr=ctx.sampleRate, len=Math.max(1,Math.floor(sr*dur));
            const buf=ctx.createBuffer(1,len,sr), data=buf.getChannelData(0);
            for (let i=0;i<len;i++) data[i]=(Math.random()*2-1)*Math.pow(1-i/len,0.5);
            const src=ctx.createBufferSource(); src.buffer=buf;
            const hpf=ctx.createBiquadFilter(); hpf.type='highpass'; hpf.frequency.value=hp;
            const g=ctx.createGain();
            g.gain.setValueAtTime(vol, now);
            g.gain.exponentialRampToValueAtTime(0.0001, now+Math.max(dur,0.01));
            src.connect(hpf); hpf.connect(g); g.connect(this._out());
            src.start(now); src.stop(now+dur+0.04);
        } catch(e) {}
    }
    playKnifeThrow()     { this._noise(0.08,0.15,1400); this._tone('sine',360,0.06,0.09,2.5); }
    playKnifeHit(c=1)    { const v=Math.min(0.3,0.16+c*0.015); this._tone('sine',75,0.13,v*1.2,0.25); this._noise(0.06,v*0.85,500); }
    playCloseCall()      { this._tone('sine',860,0.07,0.10,1.4); }
    playStreakSound(s)   { const f=[440,523,659,784,880,1047][Math.min(s-1,5)]; this._tone('sine',f,0.14,0.12,1.04); }
    playKnifeCollision() { this._tone('square',1600,0.12,0.15,0.2); this._tone('sine',80,0.18,0.15,0.25); this._noise(0.10,0.22,1000); }
    playAppleHit(t)      { t==='diamond'?this._tone('sine',1800,0.14,0.10,0.5):t==='golden'?this._tone('sine',1000,0.16,0.10,1.0):this._noise(0.10,0.14,1500); }
    playCoinCollect()    { this._tone('sine',880,0.07,0.06,1.4); }
    playCombo(c)         { const f=[523,587,659,784,880][Math.min(c-2,4)]; this._tone('sine',f,0.12,0.09,1); }
    playStageComplete()  { [523,659,784,1047,1319].forEach((f,i)=>this._tone('sine',f,0.22,0.10,1.01,i*0.10)); }
    playGameOverSound()  { [400,320,240,180].forEach((f,i)=>this._tone('sine',f,0.50,0.12,0.6,i*0.20)); }
    playNoKnives()       { this._tone('sine',280,0.18,0.12,0.5); }
    playPowerUp()        { this._tone('sine',600,0.10,0.08,2.0); }
    playBomb()           { this._tone('sine',50,0.25,0.25,0.15); this._noise(0.22,0.28,150); }
    playReward()         { [660,880,1100].forEach((f,i)=>this._tone('sine',f,0.14,0.08,1.01,i*0.07)); }
    playTick()           { this._tone('sine',900,0.03,0.04,1.1); }
    playNewRecord()      { [523,659,784,1047,1319].forEach((f,i)=>this._tone('sine',f,0.18,0.12,1.01,i*0.08)); }

    /* ════════════════════════════════════
       SAVE / LOAD
    ════════════════════════════════════ */
    loadPlayerData() {
        const def = {
            coins:0, diamonds:0, currentLevel:1, highestLevel:1, bestScore:0,
            totalKnivesThrown:0, totalApplesHit:0, gamesPlayed:0,
            totalCoinsEarned:0, totalDiamondsEarned:0,
            dailyStreak:0, lastDailyReward:null,
            levelStars:{}, powerUps:{}, currentSkin:'default'
        };
        try { const s=JSON.parse(localStorage.getItem(this.saveKey)); return s?{...def,...s}:def; }
        catch { return def; }
    }
    savePlayerData() {
        this.playerData.powerUps = {};
        Object.keys(this.powerUps).forEach(k => { this.playerData.powerUps[k] = this.powerUps[k].count; });
        try { localStorage.setItem(this.saveKey, JSON.stringify(this.playerData)); } catch(e) {}
    }

    /* ════════════════════════════════════
       DAILY REWARD
    ════════════════════════════════════ */
    checkDailyReward() {
        const today=new Date().toDateString(), last=this.playerData.lastDailyReward;
        if (last !== today) {
            if (last) { const d=Math.floor((new Date()-new Date(last))/86400000); if (d>1) this.playerData.dailyStreak=0; }
            this.showDailyReward=true; this.dailyRewardClaimed=false; this.dailyRewardAnim=0;
        }
    }
    claimDailyReward() {
        if (this.dailyRewardClaimed) return;
        const streak=this.playerData.dailyStreak, mult=Math.min(1+streak*0.3,4);
        const coins=Math.floor(60*mult), dias=Math.floor(2*Math.max(1,Math.floor(streak/3)));
        this.playerData.coins+=coins; this.playerData.diamonds+=dias;
        this.playerData.lastDailyReward=new Date().toDateString(); this.playerData.dailyStreak++;
        this.dailyRewardClaimed=true; this.showDailyReward=false;
        this.addFloatingText(this.W/2,this.H/2-30,`+${coins} Coins`,'#FFD700',20,140);
        this.addFloatingText(this.W/2,this.H/2+10,`+${dias} Diamonds`,'#00D4FF',18,130);
        this.spawnParticles(this.W/2,this.H/2,'#FFD700',10);
        this.playReward(); this.savePlayerData();
    }

    /* ════════════════════════════════════
       LEVEL CONFIG
    ════════════════════════════════════ */
    getLevelConfig(level) {
        const l = Math.min(level, 30);
        const preStuckTable=[0,1,2,3,4,4,5,5,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,14,15,15,16,16,17,18];
        const speedTable=[0.012,0.014,0.016,0.018,0.022,0.026,0.028,0.032,0.035,0.040,0.038,0.042,0.045,0.048,0.052,0.050,0.054,0.057,0.060,0.065,0.063,0.066,0.069,0.072,0.076,0.074,0.077,0.080,0.083,0.087];
        const patterns=['constant','constant','constant','constant','wobble','wobble','wobble','erratic','erratic','reverse','reverse','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy','crazy'];
        const knivesTable=[7,7,8,8,10,9,10,10,11,12,11,12,12,13,14,12,13,13,14,15,13,14,14,15,16,14,15,15,16,17];
        const applesTable=[0,1,1,1,2,2,2,2,3,2,3,2,3,3,4,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4];
        const bossTable  =[0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
        const nameTable  =['Warm Up','First Knife','Two Knives','Three Knives','BOSS 1','Speed Up','Five Knives','Erratic','Triple Threat','BOSS 2','Fast Spin','Going Crazy','Nonstop','Intense','BOSS 3','Storm','Vortex','Chaos','Mayhem','MEGA BOSS','Legend','Mythic','Divine','Immortal','FINAL BOSS','Endless I','Endless II','Endless III','Endless IV','ENDLESS BOSS'];
        const idx = l-1;
        return {
            knives:   knivesTable[idx]   || Math.min(8+Math.floor(l/3),20),
            speed:    speedTable[idx]    || Math.min(0.015+l*0.004,0.11),
            pattern:  patterns[idx]      || 'crazy',
            apples:   applesTable[idx]   || Math.min(Math.floor(l/4),4),
            bossMode: !!(bossTable[idx]  || (l%5===0 && l>25)),
            preStuck: preStuckTable[idx] || Math.min(Math.floor(l/2),18),
            name:     nameTable[idx]     || `Endless ${l-25}`,
        };
    }

    /* ════════════════════════════════════
       TARGET
    ════════════════════════════════════ */
    createTarget() {
        return {
            x:this.W/2, y:this.H/2-55,
            radius:Math.min(this.W,this.H)*0.155,
            angle:0, speed:0.015, baseSpeed:0.015,
            direction:1, pattern:'constant',
            patternTimer:0, wobbleY:0,
            bossMode:false, bossAngle:0, config:null
        };
    }

    /* ════════════════════════════════════
       SETUP LEVEL
    ════════════════════════════════════ */
    setupLevel() {
        const cfg = this.getLevelConfig(this.level);
        this.levelCfg = cfg;
        this.stuckKnives=[];this.apples=[];this.orbitCoins=[];this.flyingKnife=null;
        this.knivesTotal=cfg.knives;this.knivesLeft=cfg.knives;this.knivesThrown=0;
        this.combo=0;this.streak=0;this.perfectHits=0;
        this.stageComplete=false;this.stageCompleteTimer=0;
        this.noKnivesLeft=false;this.noKnivesOverlayAlpha=0;
        this.breakPieces=[];this.particles=[];this.explosions=[];
        this.scorePopups=[];this.popRings=[];this.trailParticles=[];
        this.shockwaves=[];this.levelStartTime=Date.now();

        const t=this.target;
        t.radius=Math.min(this.W,this.H)*0.155;
        t.angle=0;t.direction=1;t.speed=cfg.speed;t.baseSpeed=cfg.speed;
        t.pattern=cfg.pattern;t.patternTimer=0;t.bossMode=cfg.bossMode;
        t.bossAngle=0;t.wobbleY=0;t.config=cfg;
        t.x=this.W/2;t.y=this.H/2-55;

        if (cfg.preStuck > 0) {
            const angleStep=this.TAU/(cfg.preStuck+2);
            for (let i=0;i<cfg.preStuck;i++) {
                this.stuckKnives.push({ angle:angleStep*i+0.3, skin:this.currentSkin, preStuck:true });
            }
        }
        this.spawnApples(cfg.apples);
        this.spawnOrbitCoins();

        const col=cfg.bossMode?'#FF006E':'#00FF88';
        this.addFloatingText(this.W/2,this.H/2-20,`Level ${this.level}`,col,28,110);
        this.addFloatingText(this.W/2,this.H/2+22,cfg.name,col,15,100);

        if (cfg.preStuck > 0) {
            setTimeout(() => {
                if (!this.destroyed)
                    this.addFloatingText(this.W/2,this.H/2-60,`⚠ ${cfg.preStuck} knives already stuck!`,'#FF8C00',12,90);
            }, 600);
        }
        this.createIdleKnife();
    }

    createIdleKnife() {
        this.idleKnife = {
            x:this.W/2,
            y:this.H-(this.isMobile?72:88),
            wobble:0, bounce:0, readyPulse:0
        };
    }

    spawnApples(count) {
        this.apples=[];
        const used=[];
        for (let i=0;i<count;i++) {
            let angle,tries=0;
            do { angle=Math.random()*this.TAU; tries++; }
            while (used.some(a=>Math.abs(a-angle)<0.9) && tries<60);
            used.push(angle);
            const isDiamond=Math.random()<0.10;
            const isGolden=!isDiamond&&Math.random()<0.22;
            this.apples.push({ angle,hit:false,scale:1,wobble:0,type:isDiamond?'diamond':isGolden?'golden':'red' });
        }
    }

    spawnOrbitCoins() {
        this.orbitCoins=[];
        const count=Math.min(2+Math.floor(this.level/3),4);
        for (let i=0;i<count;i++) {
            this.orbitCoins.push({ angle:(this.TAU*i)/count,orbitR:this.target.radius+28,collected:false,wobble:0 });
        }
    }

    /* ════════════════════════════════════
       EVENTS
    ════════════════════════════════════ */
    bindEvents() {
        this._onClick = (e) => {
            this.initAudio();
            if (this.showDailyReward) { this.claimDailyReward(); return; }
            if (this.noKnivesLeft && this.noKnivesOverlayAlpha > 0.8) {
                const p=this.getLogicalPos(e);
                if (this._isRetryBtnHit(p.x,p.y)) { this._retryLevel(); return; }
                if (this._isNextBtnHit(p.x,p.y))  { this._goGameOver(); return; }
                return;
            }
            if (this.paused || this.gameOver) return;
            const p=this.getLogicalPos(e);
            if (this.handleUIClick(p.x,p.y)) return;
            if (this.stageComplete || this.flyingKnife || this.knivesLeft<=0) return;
            this.throwKnife();
        };
        this._onTouch = (e) => {
            e.preventDefault();
            this.initAudio();
            if (this.showDailyReward) { this.claimDailyReward(); return; }
            if (this.noKnivesLeft && this.noKnivesOverlayAlpha > 0.8) {
                const p=this.getLogicalPos(e);
                if (this._isRetryBtnHit(p.x,p.y)) { this._retryLevel(); return; }
                if (this._isNextBtnHit(p.x,p.y))  { this._goGameOver(); return; }
                return;
            }
            if (this.paused || this.gameOver) return;
            const p=this.getLogicalPos(e);
            if (this.handleUIClick(p.x,p.y)) return;
            if (this.stageComplete || this.flyingKnife || this.knivesLeft<=0) return;
            this.throwKnife();
        };
        this._onKey = (e) => {
            if (this.destroyed) return;
            this.initAudio();
            if (e.code==='Space') { e.preventDefault(); if (!this.noKnivesLeft) this.throwKnife(); }
            if (e.code==='KeyR' && this.noKnivesLeft) this._retryLevel();
            const keys=['extraKnife','slowTarget','shield','bomb'];
            if (e.key>='1' && e.key<='4') this.usePowerUp(keys[+e.key-1]);
        };
        this.canvas.addEventListener('click', this._onClick);
        this.canvas.addEventListener('touchstart', this._onTouch, { passive:false });
        document.addEventListener('keydown', this._onKey);
    }

    _noKnivesPopupDims() {
        const pw=Math.min(this.W-30,310),ph=270;
        return { pw,ph,px:(this.W-pw)/2,py:(this.H-ph)/2 };
    }
    _isRetryBtnHit(mx,my) {
        const{pw,ph,px,py}=this._noKnivesPopupDims();
        const bx=px+pw/2-80,by=py+ph-65,bw=160,bh=42;
        return mx>=bx&&mx<=bx+bw&&my>=by&&my<=by+bh;
    }
    _isNextBtnHit(mx,my) {
        const{pw,ph,px,py}=this._noKnivesPopupDims();
        const bx=px+pw/2-80,by=py+ph-18,bw=160,bh=20;
        return mx>=bx&&mx<=bx+bw&&my>=by&&my<=by+bh;
    }
    _retryLevel()  { this.lives=Math.max(1,this.lives); this.noKnivesLeft=false; this.noKnivesOverlayAlpha=0; this.setupLevel(); }
    _goGameOver()  { this.noKnivesLeft=false; this.lives=0; this.onCollisionDeath(); }

    getLogicalPos(e) {
        const rect=this.canvas.getBoundingClientRect();
        const sx=this.W/rect.width, sy=this.H/rect.height;
        let cx,cy;
        if (e.touches) { cx=(e.touches[0]||e.changedTouches[0]).clientX; cy=(e.touches[0]||e.changedTouches[0]).clientY; }
        else { cx=e.clientX; cy=e.clientY; }
        return { x:(cx-rect.left)*sx, y:(cy-rect.top)*sy };
    }

    handleUIClick(mx,my) {
        const btnS=this.isMobile?40:36;
        const btnY=this.idleKnife?this.idleKnife.y+44:this.H-46;
        let idx=0;
        for (const key of Object.keys(this.powerUps)) {
            const bx=8+idx*(btnS+6);
            if (mx>=bx&&mx<=bx+btnS&&my>=btnY&&my<=btnY+btnS) { this.usePowerUp(key); return true; }
            idx++;
        }
        return false;
    }

    /* ════════════════════════════════════
       POWER-UPS
    ════════════════════════════════════ */
    usePowerUp(type) {
        const pup=this.powerUps[type];
        if (!pup||pup.count<=0||this.gameOver||this.stageComplete) return;
        pup.count--;
        switch(type) {
            case 'extraKnife': this.knivesLeft+=2;this.knivesTotal+=2;this.noKnivesLeft=false;this.noKnivesOverlayAlpha=0;this.addFloatingText(this.W/2,this.H*0.35,'+2 Knives!','#00FF88',18,90); break;
            case 'slowTarget': this.activeEffects.slow=true;this.activeEffects.slowTimer=5000;this.target.speed=this.target.baseSpeed*0.35;this.addFloatingText(this.W/2,this.H*0.35,'Slow Motion!','#00D4FF',18,90); break;
            case 'shield':     this.activeEffects.shield=true;this.addFloatingText(this.W/2,this.H*0.35,'Shield ON!','#b347d9',18,90); break;
            case 'bomb':       this.bombClear(); break;
        }
        this.playPowerUp(); this.savePlayerData();
    }

    bombClear() {
        const count=this.stuckKnives.length;
        if (!count) return;
        this.stuckKnives.forEach(sk => { const pos=this.getKnifeWorldPos(sk); this.spawnParticles(pos.x,pos.y,'#FF8C00',5); });
        this.stuckKnives=[];
        const bonus=count*5; this.score+=bonus; this.onScore(this.score);
        this.addFloatingText(this.W/2,this.H/2,`BOOM! +${bonus}`,'#FF8C00',20,90);
        this.shake(12,8); this.playBomb();
    }

    /* ════════════════════════════════════
       THROW KNIFE
    ════════════════════════════════════ */
    throwKnife() {
        if (this.flyingKnife||this.knivesLeft<=0||this.stageComplete||this.gameOver||this.noKnivesLeft) return;
        this.knivesLeft--;
        this.knivesThrown++;
        this.playerData.totalKnivesThrown++;
        if (this.idleKnife) this.idleKnife.bounce=9;
        const speed=this.isMobile?15:19;
        this.flyingKnife = { x:this.W/2, y:this.idleKnife?this.idleKnife.y:this.H-88, vy:-speed, vx:0, trail:[], skin:this.currentSkin };
        this.playKnifeThrow();
    }

    /* ════════════════════════════════════
       UPDATE
    ════════════════════════════════════ */
    update(dt) {
        if (this.paused || this.gameOver) return;
        this.time+=dt; this.frame++;

        if (this.noKnivesLeft) {
            this.noKnivesOverlayAlpha=Math.min(1,this.noKnivesOverlayAlpha+0.045);
            this.updateParticles(); this.updateFloatingTexts(); this.updatePopRings();
            this.updateExplosions(); this.updateCoinPickups();
            return;
        }

        if (this.showDailyReward) { this.dailyRewardAnim=Math.min(1,this.dailyRewardAnim+0.06); }

        if (this.stageComplete) {
            this.stageCompleteTimer++;
            this.updateBreakPieces(); this.updateParticles(); this.updateFloatingTexts();
            this.updatePopRings(); this.updateShockwaves();
            if (this.stageCompleteTimer>=75) {
                this.level++;this.stage++;
                this.playerData.currentLevel=this.level;
                if (this.level>this.playerData.highestLevel) this.playerData.highestLevel=this.level;
                this.savePlayerData();
                this.setupLevel();
            }
            return;
        }

        if (this.shakeTimer>0) {
            const f=this.shakeForce*(this.shakeTimer/12);
            this.shakeX=(Math.random()-0.5)*f; this.shakeY=(Math.random()-0.5)*f*0.4;
            this.shakeTimer--;
        } else { this.shakeX=0; this.shakeY=0; }

        if (this.flashTimer>0) this.flashTimer--;
        if (this.vignetteFlash>0) this.vignetteFlash--;
        if (this.hitPulseTimer>0) this.hitPulseTimer--;
        if (this.newRecordTimer>0) this.newRecordTimer--;
        Object.keys(this.hudFlash).forEach(k => { if (this.hudFlash[k]>0) this.hudFlash[k]--; });

        if (this.activeEffects.slow) {
            this.activeEffects.slowTimer-=dt;
            if (this.activeEffects.slowTimer<=0) {
                this.activeEffects.slow=false;
                this.target.speed=this.target.baseSpeed;
                this.addFloatingText(this.W/2,this.H*0.35,'Slow Ended','#888',12,55);
            }
        }

        this.updateTargetRotation(dt);
        if (this.target.bossMode) { this.target.bossAngle+=0.04; this.target.wobbleY=Math.sin(this.target.bossAngle)*20; }
        else this.target.wobbleY=0;

        if (this.flyingKnife) this.updateFlyingKnife();

        if (this.idleKnife) {
            this.idleKnife.wobble=Math.sin(this.time/700)*3;
            this.idleKnife.readyPulse=Math.sin(this.time/340)*0.3+0.7;
            if (this.idleKnife.bounce>0) this.idleKnife.bounce=Math.max(0,this.idleKnife.bounce-0.9);
        }

        this.updateOrbitCoins();
        this.apples.forEach(a => {
            if (!a.hit) a.wobble=Math.sin(this.time/320+a.angle)*0.04;
            else a.scale=Math.max(0,a.scale-0.075);
        });
        this.stars.forEach(s => { s.phase+=s.speed; });

        this.updateParticles(); this.updateExplosions(); this.updateScorePopups();
        this.updateFloatingTexts(); this.updateCoinPickups(); this.updatePopRings();
        this.updateTrailParticles(); this.updateShockwaves();
    }

    updateTargetRotation(dt) {
        const t=this.target; t.patternTimer+=dt||16;
        const slow=this.activeEffects.slow?0.35:1;
        switch(t.pattern) {
            case 'constant': t.angle+=t.speed*t.direction*slow; break;
            case 'wobble':   t.angle+=t.speed*t.direction*slow; if(t.patternTimer>1800){t.direction*=-1;t.patternTimer=0;} break;
            case 'reverse':  t.speed=t.baseSpeed*(1+0.5*Math.abs(Math.sin(t.patternTimer/900)));t.angle+=t.speed*t.direction*slow;if(t.patternTimer>1200+Math.random()*600){t.direction*=-1;t.patternTimer=0;} break;
            case 'erratic':  t.speed=t.baseSpeed*(1+0.7*Math.abs(Math.sin(t.patternTimer/600)));t.angle+=t.speed*t.direction*slow;if(t.patternTimer>700+Math.random()*900){t.direction*=-1;t.patternTimer=0;this.shake(2,2);} break;
            case 'crazy':    t.speed=t.baseSpeed*(1+Math.abs(Math.sin(t.patternTimer/380)));t.angle+=t.speed*t.direction*slow;if(Math.random()<0.006){t.direction*=-1;t.patternTimer=0;this.shake(2,3);}if(Math.random()<0.002)t.angle+=t.direction*0.28*slow; break;
        }
    }

    updateFlyingKnife() {
        const k=this.flyingKnife;
        if (!this.isMobile || this.frame%2===0) {
            k.trail.push({x:k.x,y:k.y});
            if (k.trail.length>this.MAX_TRAIL) k.trail.shift();
        }
        if (this.frame%3===0 && this.trailParticles.length<20) {
            this.trailParticles.push({x:k.x,y:k.y+3,life:1,decay:0.12,size:this.rand(1,2.5),color:this.getSkinColor()});
        }
        k.x+=k.vx; k.y+=k.vy;
        const ty=this.target.y+this.target.wobbleY;
        const dx=k.x-this.target.x, dy=k.y-ty;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if (dist<=this.target.radius+10) { this.onKnifeHitTarget(dx,dy,dist); return; }
        if (k.y<-80||k.y>this.H+80) this.flyingKnife=null;
    }

    updateOrbitCoins() {
        this.orbitCoins.forEach(c => {
            c.angle+=0.018; c.wobble+=0.05;
            if (c.collected) return;
            const angle=this.target.angle+c.angle;
            const cx=this.target.x+Math.cos(angle)*c.orbitR;
            const cy=this.target.y+this.target.wobbleY+Math.sin(angle)*c.orbitR;
            if (this.flyingKnife) {
                const dx=this.flyingKnife.x-cx, dy=this.flyingKnife.y-cy;
                if (Math.sqrt(dx*dx+dy*dy)<20) { c.collected=true; this.earnCoins(1+Math.floor(this.level/5),cx,cy); this.spawnParticles(cx,cy,'#FFD700',5); this.playCoinCollect(); }
            }
        });
    }

    updateParticles()    { for(let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=p.grav||0.13;p.vx*=0.97;p.life-=p.decay;p.size*=0.972;if(p.life<=0||p.size<0.3)this.particles.splice(i,1);} }
    updateExplosions()   { for(let i=this.explosions.length-1;i>=0;i--){const e=this.explosions[i];e.radius+=3.8;e.opacity-=0.058;if(e.opacity<=0)this.explosions.splice(i,1);} }
    updateScorePopups()  { for(let i=this.scorePopups.length-1;i>=0;i--){const p=this.scorePopups[i];p.y-=1.2;p.life-=2;p.opacity=p.life/60;if(p.life<=0)this.scorePopups.splice(i,1);} }
    updateFloatingTexts(){ for(let i=this.floatingTexts.length-1;i>=0;i--){const t=this.floatingTexts[i];t.y-=0.65;t.life-=1;t.opacity=Math.min(1,t.life/40);t.scale+=(1-t.scale)*0.14;if(t.life<=0)this.floatingTexts.splice(i,1);} }
    updateCoinPickups()  { for(let i=this.coinPickups.length-1;i>=0;i--){const p=this.coinPickups[i];p.y+=p.vy;p.life-=2;p.opacity=Math.min(1,p.life/40);if(p.life<=0)this.coinPickups.splice(i,1);} }
    updatePopRings()     { for(let i=this.popRings.length-1;i>=0;i--){const r=this.popRings[i];r.radius+=2.8;r.opacity-=0.048;if(r.opacity<=0)this.popRings.splice(i,1);} }
    updateBreakPieces()  { for(let i=this.breakPieces.length-1;i>=0;i--){const p=this.breakPieces[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.28;p.rotation+=p.rotSpeed;p.life--;if(p.life<=0)this.breakPieces.splice(i,1);} }
    updateTrailParticles(){ for(let i=this.trailParticles.length-1;i>=0;i--){const p=this.trailParticles[i];p.life-=p.decay;p.size*=0.92;if(p.life<=0)this.trailParticles.splice(i,1);} }
    updateShockwaves()   { for(let i=this.shockwaves.length-1;i>=0;i--){const s=this.shockwaves[i];s.r+=s.speed;s.opacity-=0.038;s.lineW=Math.max(0.5,s.lineW-0.07);if(s.opacity<=0)this.shockwaves.splice(i,1);} }

    /* ════════════════════════════════════
       HIT TARGET
    ════════════════════════════════════ */
    onKnifeHitTarget(dx,dy,dist) {
        const k=this.flyingKnife;
        const relAngle=Math.atan2(dy,dx)-this.target.angle;
        let closestDiff=Infinity, hitStuck=false;
        for (const sk of this.stuckKnives) {
            let diff=Math.abs(relAngle-sk.angle)%(this.TAU);
            if (diff>Math.PI) diff=this.TAU-diff;
            if (diff<closestDiff) closestDiff=diff;
            if (diff<0.20) { hitStuck=true; break; }
        }
        const isCloseCall=!hitStuck&&closestDiff<0.36&&closestDiff>=0.20&&this.stuckKnives.length>0;
        if (hitStuck) {
            if (this.activeEffects.shield) {
                this.activeEffects.shield=false;
                this.flashTimer=8;this.flashColor='#b347d9';this.shake(7,5);
                this.addFloatingText(this.W/2,this.target.y-50,'SHIELD!','#b347d9',17,80);
                this.flyingKnife=null;this.combo=0;this.streak=0;
                if (this.knivesLeft>0) this.createIdleKnife();
                else this.triggerNoKnivesLeft();
                this.playTick(); return;
            }
            this.onCollision(); return;
        }
        if (isCloseCall) {
            this.closeCallCount++;
            const ccBonus=25+this.level*4;
            this.score+=ccBonus; this.onScore(this.score);
            this.addFloatingText(this.W/2,this.target.y-40,'⚡ CLOSE CALL! +'+ccBonus,'#FF8C00',16,90);
            this.spawnShockwave(this.target.x,this.target.y+this.target.wobbleY,'#FF8C00',this.target.radius);
            this.playCloseCall();this.shake(3,2);
        }
        for (let i=0;i<this.apples.length;i++) {
            const a=this.apples[i];
            if (a.hit) continue;
            let diff=Math.abs(relAngle-a.angle)%this.TAU;
            if (diff>Math.PI) diff=this.TAU-diff;
            if (diff<0.40) { this.hitApple(i,a); break; }
        }
        this.stuckKnives.push({angle:relAngle,skin:k.skin});
        this.streak++;this.streakRecord=Math.max(this.streakRecord,this.streak);
        this.combo++;this.maxCombo=Math.max(this.maxCombo,this.combo);
        this.perfectHits++;this.hitPulse=1;this.hitPulseTimer=20;
        const comboMult=Math.min(this.combo,10);
        const streakBonus=this.streak>=5?Math.floor(this.streak*1.5):0;
        const scoreGain=10*comboMult+this.level*2+streakBonus;
        this.score+=scoreGain; this.onScore(this.score);
        const coinEarn=1+Math.floor(this.combo/3)+Math.floor(this.level/5);
        this.earnCoins(coinEarn,k.x,k.y-18);
        if (this.combo>0&&this.combo%5===0) this.earnDiamonds(1,k.x,k.y-38);
        this.checkMilestones();
        const popCol=this.combo>=8?'#FF006E':this.combo>=5?'#FFD700':this.combo>=3?'#00FF88':'#ffffff';
        this.scorePopups.push({x:k.x+(Math.random()-0.5)*40,y:k.y-24,text:this.combo>1?(this.streak>=5?`🔥x${comboMult}+${scoreGain}`:`x${comboMult}+${scoreGain}`):`+${scoreGain}`,color:popCol,life:65,opacity:1});
        const ty=this.target.y+this.target.wobbleY;
        const ex=this.target.x+Math.cos(this.target.angle+relAngle)*this.target.radius;
        const ey=ty+Math.sin(this.target.angle+relAngle)*this.target.radius;
        this.spawnParticles(ex,ey,this.getSkinColor(),this.isMobile?5:8);
        if (this.popRings.length<this.MAX_POP_RINGS) this.popRings.push({x:ex,y:ey,radius:4,opacity:0.65,color:this.getSkinColor()});
        if (this.streak===3) this.addFloatingText(this.W/2,ty-65,'🎯 3 IN A ROW!','#00FF88',16,90);
        if (this.streak===5) { this.addFloatingText(this.W/2,ty-65,'🔥 5 STREAK!','#FFD700',19,100); this.spawnShockwave(this.target.x,ty,'#FFD700',this.target.radius*0.5); }
        if (this.streak===10) { this.addFloatingText(this.W/2,ty-75,'⚡ 10 STREAK!!','#FF006E',22,120); this.spawnShockwave(this.target.x,ty,'#FF006E',this.target.radius); this.vignetteFlash=25; this.vignetteColor='#FF006E'; }
        if (this.streak>0&&this.streak%5===0) this.playStreakSound(Math.floor(this.streak/5));
        else if (this.combo>=3) this.playCombo(this.combo);
        this.playKnifeHit(this.combo);
        this.shake(this.combo>=5?5:3,this.combo>=5?4:2);
        if (this.combo>=3) { this.flashTimer=4; this.flashColor=popCol; }
        this.flyingKnife=null;
        if (this.knivesLeft===0) { const allApples=this.apples.every(a=>a.hit); setTimeout(()=>this.completeStage(allApples),350); }
        else this.createIdleKnife();
    }

    triggerNoKnivesLeft() {
        if (this.stageComplete||this.gameOver||this.noKnivesLeft) return;
        const allApples=this.apples.every(a=>a.hit);
        if (allApples) { setTimeout(()=>this.completeStage(true),350); return; }
        this.noKnivesLeft=true; this.noKnivesOverlayAlpha=0;
        this.shake(9,5); this.flashTimer=14; this.flashColor='#ff6600';
        this.playNoKnives();
    }

    onCollision() {
        this.lives--;this.combo=0;this.streak=0;
        this.shake(22,12);this.flashTimer=20;this.flashColor='#ff0055';
        this.vignetteFlash=35;this.vignetteColor='#ff0055';
        const k=this.flyingKnife;
        this.explosions.push({x:k.x,y:k.y,radius:5,opacity:1,color:'#ff0055'});
        this.spawnParticles(k.x,k.y,'#ff0055',this.isMobile?14:24);
        this.spawnShockwave(k.x,k.y,'#ff0055',8);
        this.addFloatingText(this.W/2,this.H/2-20,'COLLISION!','#FF0055',20,100);
        this.addFloatingText(this.W/2,this.H/2+10,`Lives: ${this.lives}`,'#FF8888',13,90);
        this.playKnifeCollision();
        this.flyingKnife=null;
        if (this.lives<=0) this.onCollisionDeath();
        else { this.createIdleKnife(); if (this.knivesLeft===0) this.triggerNoKnivesLeft(); }
    }

    onCollisionDeath() {
        this.gameOver=true;
        if (this.score>this.playerData.bestScore) { this.playerData.bestScore=this.score; this.showNewRecord=true; this.newRecordTimer=100; this.playNewRecord(); }
        this.playerData.gamesPlayed++;
        this.savePlayerData();
        this.playGameOverSound();
        setTimeout(()=>this.onScore(this.score,true,{level:this.level,coins:this.sessionCoins,diamonds:this.sessionDias}),900);
    }

    hitApple(idx,apple) {
        apple.hit=true; this.playerData.totalApplesHit++;
        const pos=this.getAppleWorldPos(apple);
        const R={diamond:{score:100,coins:16,dias:3,color:'#00D4FF',text:'DIAMOND!+100'},golden:{score:60,coins:11,dias:1,color:'#FFD700',text:'GOLDEN!+60'},red:{score:30,coins:5,dias:0,color:'#FF4444',text:'APPLE!+30'}};
        const r=R[apple.type]||R.red;
        this.score+=r.score; this.onScore(this.score);
        this.earnCoins(r.coins,pos.x,pos.y);
        if (r.dias>0) this.earnDiamonds(r.dias,pos.x,pos.y-20);
        this.spawnAppleParticles(pos.x,pos.y,apple.type);
        this.explosions.push({x:pos.x,y:pos.y,radius:5,opacity:0.9,color:r.color});
        this.spawnShockwave(pos.x,pos.y,r.color,10);
        this.scorePopups.push({x:pos.x,y:pos.y-28,text:r.text,color:r.color,life:85,opacity:1});
        if (this.popRings.length<this.MAX_POP_RINGS) this.popRings.push({x:pos.x,y:pos.y,radius:7,opacity:0.85,color:r.color});
        this.flashTimer=10;this.flashColor=r.color;this.shake(7,5);this.playAppleHit(apple.type);
    }

    completeStage(allApples=false) {
        this.stageComplete=true; this.stageCompleteTimer=0;
        const elapsed=(Date.now()-this.levelStartTime)/1000;
        const timeBonus=Math.max(0,Math.floor(250-elapsed*4));
        const levelBonus=55+this.level*28;
        const comboBonus=this.maxCombo*10;
        const perfBonus=allApples?120:0;
        const streakBonus=this.streakRecord>=5?this.streakRecord*8:0;
        const totalBonus=levelBonus+comboBonus+perfBonus+timeBonus+streakBonus;
        this.score+=totalBonus; this.onScore(this.score);
        const coins=32+this.level*9+this.maxCombo*3;
        const dias=(this.levelCfg?.bossMode?5:1)+(allApples?2:0)+(this.streakRecord>=5?2:0);
        this.earnCoins(coins,this.W/2,this.H/2-50);
        this.earnDiamonds(dias,this.W/2,this.H/2-20);
        this.spawnBreakPieces();
        this.shake(18,10);this.flashTimer=24;this.flashColor='#00FF88';
        this.vignetteFlash=40;this.vignetteColor='#00FF88';
        this.addFloatingText(this.W/2,this.H/2-35,allApples?'🍎 PERFECT!':'✓ CLEAR!','#00FF88',26,130);
        this.addFloatingText(this.W/2,this.H/2+16,`+${totalBonus}  💰${coins}  💎${dias}`,'#FFD700',12,120);
        this.spawnCelebration(this.W/2,this.H/3,this.isMobile?12:20);
        this.playStageComplete();
        for (let i=0;i<2;i++) setTimeout(()=>this.spawnShockwave(this.W/2,this.target.y+this.target.wobbleY,'#00FF88',this.target.radius*(0.5+i*0.5)),i*180);
    }

    spawnBreakPieces() {
        const tx=this.target.x,ty=this.target.y+this.target.wobbleY;
        const count=this.isMobile?10:16;
        for (let i=0;i<count;i++) {
            const angle=(this.TAU*i)/count+Math.random()*0.4,speed=Math.random()*6+3;
            this.breakPieces.push({x:tx,y:ty,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-2,w:Math.random()*22+10,h:Math.random()*22+10,rotation:Math.random()*this.TAU,rotSpeed:(Math.random()-0.5)*0.22,life:70,color:this.target.bossMode?'#aa2200':'#8B4513'});
        }
        this.stuckKnives.forEach(sk => {
            const angle=this.target.angle+sk.angle;
            this.breakPieces.push({x:tx+Math.cos(angle)*this.target.radius,y:ty+Math.sin(angle)*this.target.radius,vx:Math.cos(angle)*(Math.random()*4+2),vy:Math.sin(angle)*(Math.random()*4+2)-2,w:3.5,h:32,rotation:angle,rotSpeed:(Math.random()-0.5)*0.2,life:55,color:'#cccccc'});
        });
    }

    /* ════════════════════════════════════
       ECONOMY
    ════════════════════════════════════ */
    earnCoins(amount,x,y)    { this.playerData.coins+=amount;this.sessionCoins+=amount;this.hudFlash.coins=18;this.coinPickups.push({x,y,text:`+${amount}C`,color:'#FFD700',life:75,opacity:1,vy:-1.2}); }
    earnDiamonds(amount,x,y) { this.playerData.diamonds+=amount;this.sessionDias+=amount;this.hudFlash.diamonds=18;this.coinPickups.push({x,y,text:`+${amount}D`,color:'#00D4FF',life:90,opacity:1,vy:-1.0});this.playReward(); }
    checkMilestones()        { for(const m of this.milestones){if(this.score>=m*10&&!this.milestonesClaimed.has(m)){this.milestonesClaimed.add(m);this.earnDiamonds(1,this.W/2,this.H*0.3);this.addFloatingText(this.W/2,this.H*0.28,`${m*10}pts!+1💎`,'#00D4FF',14,100);}} }

    /* ════════════════════════════════════
       HELPERS
    ════════════════════════════════════ */
    getAppleWorldPos(a)  { const angle=this.target.angle+a.angle;return{x:this.target.x+Math.cos(angle)*this.target.radius,y:this.target.y+this.target.wobbleY+Math.sin(angle)*this.target.radius}; }
    getKnifeWorldPos(sk) { const angle=this.target.angle+sk.angle;return{x:this.target.x+Math.cos(angle)*this.target.radius,y:this.target.y+this.target.wobbleY+Math.sin(angle)*this.target.radius}; }
    getSkinColor()       { return this.knifeSkins[this.currentSkin]?.blade[1]||'#e8e8e8'; }
    addFloatingText(x,y,text,color,size=16,life=80) { this.floatingTexts.push({x,y,text,color,size,life,opacity:1,scale:0.2}); }

    spawnParticles(x,y,color,count) {
        for (let i=0;i<count&&this.particles.length<this.MAX_PARTICLES;i++) {
            const angle=Math.random()*this.TAU,speed=Math.random()*6+2;
            this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-1,color,size:Math.random()*4.5+2,life:1,decay:Math.random()*0.04+0.022,grav:0.13});
        }
    }
    spawnAppleParticles(x,y,type) {
        const cols={diamond:['#00D4FF','#88eeff','#fff'],golden:['#FFD700','#FFA500','#fff'],red:['#FF4444','#FF8888','#fff']};
        const c=cols[type]||cols.red;
        const count=this.isMobile?14:22;
        for (let i=0;i<count&&this.particles.length<this.MAX_PARTICLES;i++) {
            const angle=Math.random()*this.TAU,speed=Math.random()*8+2.5;
            this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-3,color:c[Math.floor(Math.random()*c.length)],size:Math.random()*5.5+2,life:1,decay:0.022,grav:0.17});
        }
    }
    spawnCelebration(cx,cy,count) {
        for (let i=0;i<count;i++) {
            setTimeout(() => {
                if (this.destroyed) return;
                const x=cx+(Math.random()-0.5)*this.W*0.65;
                const y=cy+(Math.random()-0.5)*this.H*0.25;
                this.spawnParticles(x,y,this.getSkinColor(),5);
                if (this.popRings.length<this.MAX_POP_RINGS) this.popRings.push({x,y,radius:4,opacity:0.6,color:this.getSkinColor()});
            },i*45);
        }
    }
    spawnShockwave(x,y,color,startR) { this.shockwaves.push({x,y,r:startR||4,speed:4,opacity:0.85,color,lineW:3}); }
    shake(timer,force) { this.shakeTimer=Math.max(this.shakeTimer,timer);this.shakeForce=Math.max(this.shakeForce,force); }
    makeStars(count)   { return Array.from({length:count},()=>({x:Math.random()*this.W,y:Math.random()*this.H,size:Math.random()*1.6+0.3,phase:Math.random()*this.TAU,speed:Math.random()*0.016+0.004,color:Math.random()>0.85?'#b347d9':Math.random()>0.6?'#00d4ff':'#ffffff'})); }
    makeNebulae()      { return Array.from({length:this.isMobile?2:3},()=>({x:Math.random()*this.W,y:Math.random()*this.H*0.6,r:this.rand(55,130),color:this.rand(0,1)>0.5?'rgba(179,71,217,':'rgba(0,212,255,',alpha:this.rand(0.025,0.065)})); }
    fmtNum(n)          { if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return''+n; }
    hexToRgba(hex,a)   { if(!hex||!hex.startsWith('#'))return hex;return`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${Math.max(0,Math.min(1,a))})`; }
    hexToRgbParts(hex) { if(!hex||!hex.startsWith('#'))return'255,255,255';return`${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`; }
    darkenHex(hex,amt) { if(!hex||!hex.startsWith('#'))return hex;return`rgb(${Math.max(0,parseInt(hex.slice(1,3),16)-amt)},${Math.max(0,parseInt(hex.slice(3,5),16)-amt)},${Math.max(0,parseInt(hex.slice(5,7),16)-amt)})`; }

    /* ════════════════════════════════════
       DRAW — Main
    ════════════════════════════════════ */
    draw() {
        const ctx=this.ctx;
        ctx.fillStyle='#050510';
        ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

        ctx.save();
        if (this.shakeX||this.shakeY) ctx.translate(this.gS(this.shakeX),this.gS(this.shakeY));

        this.drawBackground(ctx);

        if (this.flashTimer>0) {
            ctx.fillStyle=this.hexToRgba(this.flashColor,(this.flashTimer/22)*0.18);
            ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        }

        if (this.stageComplete) {
            this.drawStageComplete(ctx);
        } else {
            this.drawOrbitCoins(ctx);
            this.drawTarget(ctx);
            this.drawShockwaves(ctx);
            this.drawExplosions(ctx);
            this.drawPopRings(ctx);
            this.drawParticles(ctx);
            this.drawTrailParticles(ctx);
            this.drawScorePopups(ctx);
            this.drawCoinPickups(ctx);
            if (this.flyingKnife) this.drawFlyingKnife(ctx);
            else if (!this.noKnivesLeft) this.drawIdleKnife(ctx);
            this.drawFloatingTexts(ctx);
            this.drawHitPulse(ctx);
            this.drawStreakIndicator(ctx);
        }

        this.drawHUD(ctx);
        if (!this.noKnivesLeft&&!this.stageComplete) this.drawPowerUpBar(ctx);

        if (this.vignetteFlash>0) {
            const va=(this.vignetteFlash/50)*0.40;
            const vg=ctx.createRadialGradient(this.gX(this.W/2),this.gY(this.H/2),this.gS(this.H*0.12),this.gX(this.W/2),this.gY(this.H/2),this.gS(this.H*0.85));
            vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,this.hexToRgba(this.vignetteColor,va));
            ctx.fillStyle=vg;ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        }

        if (this.showNewRecord&&this.newRecordTimer>0) {
            const pulse=0.7+Math.sin(this.time/80)*0.3;
            this.drawText(ctx,'🏆 NEW RECORD!',this.W/2,this.H*0.22,{size:20,weight:'bold',color:'#FFD700',align:'center',family:this.FONT_TITLE,glow:true,glowColor:'#FFD700',glowBlur:14,opacity:pulse,stroke:true,strokeColor:'rgba(0,0,0,0.6)',strokeWidth:2.5});
        }
        ctx.restore();

        if (this.noKnivesLeft)                              this.drawNoKnivesOverlay(ctx);
        if (this.showDailyReward&&!this.dailyRewardClaimed) this.drawDailyReward(ctx);
        if (this.gameOver)                                  this.drawGameOver(ctx);
    }

    /* ════════════════════════════════════
       DRAW: BACKGROUND
    ════════════════════════════════════ */
    drawBackground(ctx) {
        const W=this.W,H=this.H;
        const bg=ctx.createRadialGradient(this.gX(W/2),this.gY(H*0.38),0,this.gX(W/2),this.gY(H/2),this.gS(H));
        bg.addColorStop(0,this.target.bossMode?'#1c0408':'#130924');
        bg.addColorStop(0.5,this.target.bossMode?'#0e0204':'#080518');
        bg.addColorStop(1,'#040210');
        ctx.fillStyle=bg;ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

        for (const n of this.nebulae) {
            const ng=ctx.createRadialGradient(this.gX(n.x),this.gY(n.y),0,this.gX(n.x),this.gY(n.y),this.gS(n.r));
            ng.addColorStop(0,n.color+n.alpha+')');ng.addColorStop(1,n.color+'0)');
            ctx.fillStyle=ng;ctx.fillRect(this.gX(n.x-n.r),this.gY(n.y-n.r),this.gSr(n.r*2),this.gSr(n.r*2));
        }

        const step=this.isMobile?2:1;
        for (let i=0;i<this.stars.length;i+=step) {
            const s=this.stars[i];
            const alpha=0.12+((Math.sin(s.phase)+1)/2)*0.55;
            ctx.globalAlpha=alpha;ctx.fillStyle=s.color;
            this.drawCircle(ctx,s.x,s.y,s.size);ctx.fill();
        }
        ctx.globalAlpha=1;

        const vg=ctx.createRadialGradient(this.gX(W/2),this.gY(H/2),this.gS(H*0.14),this.gX(W/2),this.gY(H/2),this.gS(H*0.88));
        vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.50)');
        ctx.fillStyle=vg;ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
    }

    /* ════════════════════════════════════
       DRAW: TARGET
    ════════════════════════════════════ */
    drawTarget(ctx) {
        const t=this.target;
        const tx=this.gX(t.x),ty=this.gY(t.y+t.wobbleY),tr=this.gS(t.radius);
        ctx.save();ctx.translate(tx,ty);

        const glowPulse=0.28+Math.abs(Math.sin(this.time/220))*0.32;
        if (!this.isMobile) { ctx.shadowBlur=t.bossMode?this.gS(32):this.gS(18); ctx.shadowColor=t.bossMode?'#ff0050':'#ff8c00'; }
        ctx.strokeStyle=t.bossMode?`rgba(255,0,50,${glowPulse})`:`rgba(255,140,60,${glowPulse*0.7})`;
        ctx.lineWidth=this.gS(5);
        ctx.beginPath();ctx.arc(0,0,tr+this.gS(5),0,this.TAU);ctx.stroke();
        ctx.shadowBlur=0;

        ctx.rotate(t.angle);
        const lg=ctx.createRadialGradient(-tr*0.25,-tr*0.25,tr*0.05,0,0,tr);
        if (t.bossMode) { lg.addColorStop(0,'#b83800');lg.addColorStop(0.4,'#8c1200');lg.addColorStop(0.75,'#6e0a00');lg.addColorStop(1,'#3a0000'); }
        else           { lg.addColorStop(0,'#d48438');lg.addColorStop(0.4,'#aa6422');lg.addColorStop(0.75,'#7c4218');lg.addColorStop(1,'#5c2e0c'); }
        ctx.beginPath();ctx.arc(0,0,tr,0,this.TAU);ctx.fillStyle=lg;ctx.fill();

        ctx.save();ctx.beginPath();ctx.arc(0,0,tr,0,this.TAU);ctx.clip();
        const ringA=t.bossMode?[0.16,0.10,0.07,0.04]:[0.13,0.08,0.055,0.035];
        for (let i=1;i<=4;i++) {
            ctx.beginPath();ctx.arc(0,0,tr*(i/4.8),0,this.TAU);
            ctx.strokeStyle=t.bossMode?`rgba(255,90,10,${ringA[i-1]})`:`rgba(255,210,150,${ringA[i-1]})`;
            ctx.lineWidth=i===1?this.gS(2.5):this.gS(1.5);ctx.stroke();
        }
        ctx.restore();

        const cg=ctx.createRadialGradient(0,0,0,0,0,tr*0.13);
        cg.addColorStop(0,t.bossMode?'#ff7700':'#f2b470');cg.addColorStop(1,t.bossMode?'#cc2500':'#b07838');
        ctx.beginPath();ctx.arc(0,0,tr*0.11,0,this.TAU);ctx.fillStyle=cg;ctx.fill();

        this.stuckKnives.forEach(sk => {
            ctx.save();ctx.rotate(sk.angle);
            this.drawStuckKnifeOnLog(ctx,sk.skin||this.currentSkin,t.radius,sk.preStuck);
            ctx.restore();
        });

        this.apples.forEach(a => {
            if (a.hit&&a.scale<=0) return;
            ctx.save();ctx.rotate(a.angle);ctx.translate(tr,0);
            ctx.rotate(-a.angle-t.angle+a.wobble);ctx.scale(a.scale,a.scale);
            this.drawApple(ctx,0,0,a.type);ctx.restore();
        });
        ctx.restore();

        if (t.bossMode) {
            const pulse=0.7+Math.sin(this.time/180)*0.3;
            this.drawText(ctx,'BOSS',t.x,t.y+t.wobbleY-t.radius-15,{size:13,weight:'bold',color:'#ff3355',align:'center',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:'#ff0055',glowBlur:10,opacity:pulse});
        }
    }

    /* ════════════════════════════════════
       KNIFE ON LOG
    ════════════════════════════════════ */
    drawStuckKnifeOnLog(ctx,skinName,logRadius,isPreStuck=false) {
        const skin=this.knifeSkins[skinName]||this.knifeSkins.default;
        ctx.save();
        if (isPreStuck) ctx.globalAlpha=0.72;
        const sc=this.dpr*0.85;
        ctx.scale(sc,sc);
        const rimX=logRadius/sc;
        const tipX=rimX+38,guardX=rimX,handleEnd=rimX-26;
        if (!this.isMobile) { ctx.shadowBlur=isPreStuck?3:5; ctx.shadowColor=skin.blade[1]; }
        const bg=ctx.createLinearGradient(tipX,-2,guardX,2);
        bg.addColorStop(0,skin.blade[2]);bg.addColorStop(0.5,skin.blade[1]);bg.addColorStop(1,skin.blade[0]);
        ctx.fillStyle=bg;
        ctx.beginPath();
        ctx.moveTo(guardX,0);ctx.lineTo(guardX+8,-3.5);ctx.lineTo(tipX-4,-2.2);
        ctx.lineTo(tipX,0);ctx.lineTo(tipX-4,2.2);ctx.lineTo(guardX+8,3.5);
        ctx.closePath();ctx.fill();
        ctx.shadowBlur=0;
        ctx.fillStyle='rgba(255,255,255,0.36)';
        ctx.beginPath();ctx.moveTo(guardX+6,-0.5);ctx.lineTo(tipX-5,-1.7);ctx.lineTo(tipX-5,0.6);ctx.lineTo(guardX+6,1);ctx.closePath();ctx.fill();
        ctx.fillStyle=skin.guard;ctx.fillRect(guardX-5,-7,7,14);
        const hg=ctx.createLinearGradient(guardX-5,-5.5,guardX-5,5.5);
        hg.addColorStop(0,skin.handle[0]);hg.addColorStop(0.5,skin.handle[1]);hg.addColorStop(1,skin.handle[2]);
        ctx.fillStyle=hg;ctx.fillRect(handleEnd,-5.5,guardX-5-handleEnd,11);
        ctx.strokeStyle='rgba(255,200,100,0.25)';ctx.lineWidth=1;
        for (let gx=handleEnd+2;gx<guardX-8;gx+=4.5){ctx.beginPath();ctx.moveTo(gx,-5);ctx.lineTo(gx,5);ctx.stroke();}
        if (isPreStuck){ctx.fillStyle='#FF8C00';ctx.beginPath();ctx.arc(handleEnd+2,0,2.5,0,this.TAU);ctx.fill();}
        ctx.fillStyle=skin.handle[0];
        ctx.beginPath();ctx.ellipse(handleEnd,0,3,5.5,0,0,this.TAU);ctx.fill();
        ctx.restore();
    }

    /* ════════════════════════════════════
       KNIFE SHAPE
    ════════════════════════════════════ */
    drawKnifeAtShooter(ctx,skinName='default',scale=1) {
        const skin=this.knifeSkins[skinName]||this.knifeSkins.default;
        ctx.save();ctx.scale(this.dpr*scale,this.dpr*scale);
        if (!this.isMobile) { ctx.shadowBlur=7;ctx.shadowColor=skin.blade[1]; }
        const bg=ctx.createLinearGradient(-3,-38,3,0);
        bg.addColorStop(0,skin.blade[2]);bg.addColorStop(0.4,skin.blade[1]);bg.addColorStop(1,skin.blade[0]);
        ctx.fillStyle=bg;
        ctx.beginPath();
        ctx.moveTo(0,0);ctx.lineTo(-3.5,-10);ctx.lineTo(-2,-34);ctx.lineTo(0,-38);ctx.lineTo(2,-34);ctx.lineTo(3.5,-10);
        ctx.closePath();ctx.fill();
        ctx.shadowBlur=0;
        ctx.fillStyle='rgba(255,255,255,0.38)';
        ctx.beginPath();ctx.moveTo(0.5,-6);ctx.lineTo(-0.3,-30);ctx.lineTo(1.8,-30);ctx.lineTo(1.8,-6);ctx.closePath();ctx.fill();
        ctx.fillStyle=skin.guard;ctx.fillRect(-7,-5,14,6);
        const hg=ctx.createLinearGradient(-5.5,0,5.5,0);
        hg.addColorStop(0,skin.handle[0]);hg.addColorStop(0.5,skin.handle[1]);hg.addColorStop(1,skin.handle[2]);
        ctx.fillStyle=hg;ctx.fillRect(-5.5,1,11,24);
        ctx.strokeStyle='rgba(255,200,100,0.26)';ctx.lineWidth=1;
        for (let i=5;i<22;i+=4.5){ctx.beginPath();ctx.moveTo(-5,i);ctx.lineTo(5,i);ctx.stroke();}
        ctx.fillStyle=skin.handle[0];
        ctx.beginPath();ctx.ellipse(0,25,5,3,0,0,this.TAU);ctx.fill();
        ctx.restore();
    }

    /* ════════════════════════════════════
       DRAW: FLYING KNIFE
    ════════════════════════════════════ */
    drawFlyingKnife(ctx) {
        const k=this.flyingKnife;
        const trailStep=this.isMobile?2:1;
        for (let i=0;i<k.trail.length;i+=trailStep) {
            const t=k.trail[i];const ratio=i/k.trail.length;
            ctx.save();ctx.globalAlpha=ratio*0.22;
            ctx.translate(this.gX(t.x),this.gY(t.y));
            this.drawKnifeAtShooter(ctx,k.skin,ratio*0.65);
            ctx.restore();
        }
        ctx.globalAlpha=1;
        ctx.save();ctx.translate(this.gX(k.x),this.gY(k.y));
        this.drawKnifeAtShooter(ctx,k.skin,1);ctx.restore();
    }

    /* ════════════════════════════════════
       DRAW: IDLE KNIFE
    ════════════════════════════════════ */
    drawIdleKnife(ctx) {
        if (!this.idleKnife||this.knivesLeft<=0) return;
        const k=this.idleKnife;
        const bY=k.bounce>0?k.bounce*-1.5:k.wobble;

        const pulseA=(k.readyPulse||0.7)*0.16;
        const pg=ctx.createRadialGradient(this.gX(k.x),this.gY(k.y+28),this.gS(6),this.gX(k.x),this.gY(k.y+28),this.gS(50));
        pg.addColorStop(0,`rgba(179,71,217,${pulseA})`);pg.addColorStop(1,'rgba(0,0,0,0)');
        ctx.fillStyle=pg;
        ctx.beginPath();ctx.ellipse(this.gX(k.x),this.gY(k.y+30),this.gS(52),this.gS(11),0,0,this.TAU);ctx.fill();

        ctx.save();ctx.translate(this.gX(k.x),this.gY(k.y+bY));
        this.drawKnifeAtShooter(ctx,this.currentSkin,1);ctx.restore();

        const total=this.knivesTotal,left=this.knivesLeft;
        const dsp=Math.min(total,20),dotSp=13,dotsW=dsp*dotSp,startX=k.x-dotsW/2;
        for (let i=0;i<dsp;i++) {
            const alive=i<left;
            ctx.save();
            if (alive) { if (!this.isMobile){ctx.shadowBlur=this.gS(5);ctx.shadowColor='#b347d9';} ctx.fillStyle='#b347d9'; }
            else ctx.fillStyle='rgba(90,90,110,0.22)';
            this.fillRect(ctx,startX+i*dotSp-1.6,k.y+50,3.2,16);
            ctx.restore();
        }

        if (this.knivesThrown===0) {
            const pulse=0.4+Math.sin(this.time/360)*0.5;
            this.drawText(ctx,this.isMobile?'TAP TO THROW':'TAP or SPACE',k.x,k.y+74,{size:9.5,color:'#fff',align:'center',opacity:pulse*0.72,family:this.FONT_UI});
        }
    }

    /* ════════════════════════════════════
       DRAW: APPLE
    ════════════════════════════════════ */
    drawApple(ctx,x,y,type) {
        const S={diamond:{body:'#00D4FF',shine:'#aaeeff',stem:'#2a5a8a',leaf:'#1a4a6a',glow:'#00D4FF'},golden:{body:'#FFD700',shine:'#FFF8C0',stem:'#5a3a10',leaf:'#2a8a2a',glow:'#FFD700'},red:{body:'#FF3333',shine:'#FF9999',stem:'#5a3010',leaf:'#2a8a2a',glow:'#FF3333'}};
        const s=S[type]||S.red;
        ctx.save();
        if (!this.isMobile){ctx.shadowBlur=this.gS(10);ctx.shadowColor=s.glow;}
        const ag=ctx.createRadialGradient(-this.gS(3),-this.gS(3),this.gS(1),0,this.gS(1),this.gS(11));
        ag.addColorStop(0,s.shine);ag.addColorStop(0.5,s.body);ag.addColorStop(1,this.darkenHex(s.body,30));
        ctx.fillStyle=ag;ctx.beginPath();ctx.ellipse(0,this.gS(2),this.gS(9),this.gS(10),0,0,this.TAU);ctx.fill();
        ctx.shadowBlur=0;
        ctx.globalAlpha=0.38;ctx.fillStyle=s.shine;ctx.beginPath();ctx.ellipse(this.gS(-3),this.gS(-2),this.gS(3),this.gS(4),-0.5,0,this.TAU);ctx.fill();ctx.globalAlpha=1;
        ctx.strokeStyle=s.stem;ctx.lineWidth=this.gS(1.8);ctx.beginPath();ctx.moveTo(0,this.gS(-8));ctx.quadraticCurveTo(this.gS(5),this.gS(-14),this.gS(2),this.gS(-17));ctx.stroke();
        ctx.fillStyle=s.leaf;ctx.beginPath();ctx.ellipse(this.gS(3.5),this.gS(-13),this.gS(5.5),this.gS(3),0.5,0,this.TAU);ctx.fill();
        if (type==='diamond'){ctx.fillStyle='rgba(255,255,255,0.65)';[[0,-5],[6,2],[-5,4]].forEach(([sx,sy])=>{ctx.beginPath();ctx.arc(this.gS(sx),this.gS(sy),this.gS(1.5),0,this.TAU);ctx.fill();});}
        ctx.restore();
    }

    /* ════════════════════════════════════
       DRAW: ORBIT COINS
    ════════════════════════════════════ */
    drawOrbitCoins(ctx) {
        const t=this.target;
        this.orbitCoins.forEach(c => {
            if (c.collected) return;
            const angle=t.angle+c.angle;
            const cx=t.x+Math.cos(angle)*c.orbitR,cy=t.y+t.wobbleY+Math.sin(angle)*c.orbitR;
            const pulse=0.84+Math.sin(c.wobble)*0.16;
            ctx.save();ctx.translate(this.gX(cx),this.gY(cy));ctx.scale(pulse,pulse);
            if (!this.isMobile){ctx.shadowBlur=this.gS(8);ctx.shadowColor='#FFD700';}
            ctx.fillStyle='#FFD700';ctx.beginPath();ctx.arc(0,0,this.gS(7),0,this.TAU);ctx.fill();
            ctx.shadowBlur=0;ctx.fillStyle='#FFF8C0';ctx.beginPath();ctx.arc(this.gS(-2),this.gS(-2),this.gS(2.5),0,this.TAU);ctx.fill();
            ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`bold ${this.gSr(8)}px Arial`;ctx.fillStyle='#AA7700';ctx.fillText('$',0,this.gS(1));
            ctx.restore();
        });
    }

    drawHitPulse(ctx) {
        if (this.hitPulseTimer<=0) return;
        const t=this.hitPulseTimer/20;
        const r=this.target.radius*(1.15+(1-t)*0.45);
        const col=this.getSkinColor();
        ctx.save();ctx.globalAlpha=t*0.20;
        if (!this.isMobile){ctx.shadowBlur=this.gS(16);ctx.shadowColor=col;}
        ctx.strokeStyle=col;ctx.lineWidth=this.gS(2.5*t);
        ctx.beginPath();ctx.arc(this.gX(this.target.x),this.gY(this.target.y+this.target.wobbleY),this.gS(r),0,this.TAU);ctx.stroke();
        ctx.restore();
    }

    drawStreakIndicator(ctx) {
        if (this.streak<3) return;
        const colors=['#00FF88','#00FF88','#FFD700','#FFD700','#FF8C00','#FF006E','#FF006E','#b347d9'];
        const col=colors[Math.min(this.streak-3,colors.length-1)];
        const pulse=0.8+Math.sin(this.time/95)*0.2;
        const x=this.W-12,baseY=this.H/2;
        const barH=Math.min(this.streak*16,140);
        const grad=ctx.createLinearGradient(0,this.gY(baseY),0,this.gY(baseY-barH));
        grad.addColorStop(0,'rgba(0,0,0,0)');grad.addColorStop(1,this.hexToRgba(col,0.55));
        ctx.fillStyle=grad;ctx.fillRect(this.gX(x-5),this.gY(baseY-barH),this.gSr(10),this.gSr(barH));
        this.drawText(ctx,`🔥${this.streak}`,x,baseY-barH-11,{size:13,weight:'bold',color:col,align:'center',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:col,glowBlur:8,opacity:pulse});
    }

    drawShockwaves(ctx) {
        ctx.save();
        this.shockwaves.forEach(s => {
            ctx.globalAlpha=Math.max(0,s.opacity);
            if (!this.isMobile){ctx.shadowBlur=this.gS(6);ctx.shadowColor=s.color;}
            ctx.strokeStyle=s.color;ctx.lineWidth=this.gS(s.lineW);
            ctx.beginPath();ctx.arc(this.gX(s.x),this.gY(s.y),this.gS(s.r),0,this.TAU);ctx.stroke();
            ctx.shadowBlur=0;
        });
        ctx.restore();
    }

    drawExplosions(ctx) {
        ctx.save();
        this.explosions.forEach(e => {
            ctx.globalAlpha=e.opacity;
            if (!this.isMobile){ctx.shadowBlur=this.gS(12);ctx.shadowColor=e.color;}
            ctx.strokeStyle=e.color;ctx.lineWidth=this.gS(3.2);
            ctx.beginPath();ctx.arc(this.gX(e.x),this.gY(e.y),this.gS(e.radius),0,this.TAU);ctx.stroke();
            ctx.globalAlpha=e.opacity*0.18;ctx.fillStyle=e.color;
            ctx.beginPath();ctx.arc(this.gX(e.x),this.gY(e.y),this.gS(e.radius*0.45),0,this.TAU);ctx.fill();
            ctx.shadowBlur=0;
        });
        ctx.restore();
    }

    drawPopRings(ctx) {
        ctx.save();
        this.popRings.forEach(r => {
            ctx.globalAlpha=r.opacity;ctx.strokeStyle=r.color;ctx.lineWidth=this.gS(2*r.opacity);
            ctx.beginPath();ctx.arc(this.gX(r.x),this.gY(r.y),this.gS(r.radius),0,this.TAU);ctx.stroke();
        });
        ctx.restore();
    }

    drawParticles(ctx) {
        ctx.save();
        this.particles.forEach(p => {
            ctx.globalAlpha=Math.min(1,p.life);ctx.fillStyle=p.color;
            this.drawCircle(ctx,p.x,p.y,Math.max(0.4,p.size*p.life));ctx.fill();
        });
        ctx.restore();
    }

    drawTrailParticles(ctx) {
        ctx.save();
        this.trailParticles.forEach(p => {
            ctx.globalAlpha=p.life*0.4;ctx.fillStyle=p.color;
            this.drawCircle(ctx,p.x,p.y,Math.max(0.3,p.size*p.life));ctx.fill();
        });
        ctx.globalAlpha=1;ctx.restore();
    }

    drawScorePopups(ctx)  {
        this.scorePopups.forEach(p => {
            this.drawText(ctx,p.text,p.x,p.y,{size:13,weight:'bold',color:p.color,align:'center',opacity:p.opacity,stroke:true,strokeColor:'rgba(0,0,0,0.6)',strokeWidth:2.2,glow:!this.isMobile,glowColor:p.color,glowBlur:6,family:this.FONT_TITLE});
        });
    }
    drawCoinPickups(ctx)  {
        this.coinPickups.forEach(p => {
            this.drawText(ctx,p.text,p.x,p.y,{size:11,weight:'bold',color:p.color,align:'center',opacity:p.opacity,family:this.FONT_TITLE});
        });
    }
    drawFloatingTexts(ctx){
        this.floatingTexts.forEach(t => {
            const sc=t.scale||1;
            this.drawText(ctx,t.text,t.x,t.y,{size:(t.size||16)*Math.min(1,sc),weight:'bold',color:t.color,align:'center',opacity:t.opacity,stroke:true,strokeColor:'rgba(0,0,0,0.5)',strokeWidth:2.5,glow:!this.isMobile,glowColor:t.color,glowBlur:8,family:this.FONT_TITLE});
        });
    }

    drawStageComplete(ctx) {
        this.drawBackground(ctx);
        this.breakPieces.forEach(p => {
            ctx.save();ctx.globalAlpha=Math.max(0,p.life/75);
            ctx.translate(this.gX(p.x),this.gY(p.y));ctx.rotate(p.rotation);
            ctx.fillStyle=p.color;this.fillRect(ctx,-p.w/2,-p.h/2,p.w,p.h);
            ctx.restore();
        });
        this.drawShockwaves(ctx);this.drawParticles(ctx);
        this.drawPopRings(ctx);this.drawFloatingTexts(ctx);this.drawCoinPickups(ctx);
    }

    /* ════════════════════════════════════
       DRAW: NO KNIVES OVERLAY
    ════════════════════════════════════ */
    drawNoKnivesOverlay(ctx) {
        const a=this.noKnivesOverlayAlpha;
        if (a<=0) return;
        ctx.fillStyle=`rgba(0,0,0,${a*0.82})`;ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        if (a<0.4) return;
        const pa=Math.min(1,(a-0.4)/0.6);
        const{pw,ph,px,py}=this._noKnivesPopupDims();
        ctx.globalAlpha=pa;
        ctx.fillStyle='rgba(6,3,18,0.97)';this.drawRoundRect(ctx,px,py,pw,ph,16);ctx.fill();
        if (!this.isMobile){ctx.shadowBlur=this.gS(12);ctx.shadowColor='#ff6600';}
        ctx.strokeStyle='rgba(255,102,0,0.55)';ctx.lineWidth=this.gS(1.6);
        this.drawRoundRect(ctx,px,py,pw,ph,16);ctx.stroke();ctx.shadowBlur=0;
        this.drawText(ctx,'NO KNIVES LEFT!',this.W/2,py+48,{size:21,weight:'bold',color:'#ff7733',align:'center',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:'#ff5500',glowBlur:11,opacity:pa});
        this.drawText(ctx,'Ran out of knives this round',this.W/2,py+70,{size:10,color:'rgba(200,160,120,0.68)',align:'center',family:this.FONT_UI,opacity:pa});
        ctx.globalAlpha=pa*0.07;ctx.fillStyle='#fff';this.fillRect(ctx,px+20,py+82,pw-40,1);ctx.globalAlpha=pa;
        const nextLevel=this.getLevelConfig(this.level+1);
        const rows=[
            ['Level',  `${this.level} · ${this.levelCfg?.name||''}`, '#ccaaff'],
            ['Score',  this.score.toLocaleString(),                    '#ffffff'],
            ['Knives', `${this.knivesThrown} / ${this.knivesTotal}`,   '#ffcc88'],
            ['Streak', `🔥 x${this.streakRecord}`,                     '#FFD700'],
            ['Next Lv',`${nextLevel.preStuck} pre-stuck, ${nextLevel.name}`,'#00D4FF'],
        ];
        rows.forEach((row,i) => {
            const ry=py+100+i*22;
            this.drawText(ctx,row[0],px+18,ry,{size:9,color:'rgba(140,140,180,0.7)',family:this.FONT_UI,opacity:pa});
            this.drawText(ctx,row[1],px+pw-18,ry,{size:10,weight:'bold',color:row[2],align:'right',family:this.FONT_TITLE,opacity:pa});
        });
        ctx.globalAlpha=pa*0.07;ctx.fillStyle='#fff';this.fillRect(ctx,px+20,py+ph-74,pw-40,1);ctx.globalAlpha=pa;
        const rbX=px+pw/2-76,rbY=py+ph-66,rbW=152,rbH=42;
        const rg=ctx.createLinearGradient(this.gX(rbX),0,this.gX(rbX+rbW),0);
        rg.addColorStop(0,'#b347d9');rg.addColorStop(1,'#7722bb');
        ctx.fillStyle=rg;this.drawRoundRect(ctx,rbX,rbY,rbW,rbH,rbH/2);ctx.fill();
        this.drawText(ctx,'↺  RETRY LEVEL',this.W/2,rbY+rbH/2,{size:13,weight:'bold',color:'#ffffff',align:'center',baseline:'middle',family:this.FONT_TITLE,opacity:pa,glow:!this.isMobile,glowColor:'#cc66ff',glowBlur:7});
        const blink=0.3+Math.sin(this.time/340)*0.35;
        this.drawText(ctx,'or tap here to end run',this.W/2,py+ph-13,{size:9,color:'rgba(150,130,160,1)',align:'center',family:this.FONT_UI,opacity:pa*blink});
        if (this.powerUps.extraKnife.count>0) {
            const hint=0.55+Math.sin(this.time/200)*0.4;
            this.drawText(ctx,`💡 ${this.powerUps.extraKnife.count}× Extra Knife! Press [1]`,this.W/2,py-18,{size:9.5,color:'#00FF88',align:'center',family:this.FONT_UI,opacity:pa*hint});
        }
        ctx.globalAlpha=1;
    }

    /* ════════════════════════════════════
       DRAW: HUD
    ════════════════════════════════════ */
    drawHUD(ctx) {
        const W=this.W;
        const hudGrad=ctx.createLinearGradient(0,0,0,this.gY(44));
        hudGrad.addColorStop(0,'rgba(0,0,0,0.78)');hudGrad.addColorStop(1,'rgba(0,0,0,0.06)');
        ctx.fillStyle=hudGrad;ctx.fillRect(0,0,this.canvas.width,this.gY(44));
        ctx.strokeStyle='rgba(179,71,217,0.16)';ctx.lineWidth=this.gS(0.6);
        this.drawLine(ctx,0,44,W,44);ctx.stroke();

        this.drawText(ctx,`LV.${this.level}`,10,18,{size:13,weight:'bold',color:'#cc66ff',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:'#b347d9',glowBlur:5});
        this.drawText(ctx,this.levelCfg?.name||'',10,33,{size:8.5,color:'rgba(200,200,255,0.36)',family:this.FONT_UI});

        const pN={constant:'STEADY',wobble:'WOBBLE',reverse:'REVERSE',erratic:'ERRATIC',crazy:'CRAZY'};
        this.drawText(ctx,`STAGE ${this.stage}`,W/2,18,{size:12,weight:'600',color:'#44ddff',align:'center',family:this.FONT_UI});
        this.drawText(ctx,pN[this.target.pattern]||'',W/2,33,{size:8,color:'rgba(255,200,0,0.44)',align:'center',family:this.FONT_TITLE});

        if (this.levelCfg?.preStuck>0) {
            this.drawText(ctx,`⚠ ${this.levelCfg.preStuck} pre-stuck`,W/2,this.H-10,{size:9,color:'rgba(255,140,0,0.55)',align:'center',family:this.FONT_UI});
        }

        const cF=this.hudFlash.coins>0, dF=this.hudFlash.diamonds>0;
        ctx.fillStyle='rgba(0,0,0,0.36)';this.drawRoundRect(ctx,W-96,4,88,36,7);ctx.fill();
        this.drawText(ctx,`C ${this.fmtNum(this.playerData.coins)}`,W-10,18,{size:cF?12:10,weight:'bold',color:cF?'#fff':'#FFD700',align:'right',family:this.FONT_TITLE,glow:cF&&!this.isMobile,glowColor:'#FFD700',glowBlur:5});
        this.drawText(ctx,`D ${this.fmtNum(this.playerData.diamonds)}`,W-10,33,{size:dF?12:10,weight:'bold',color:dF?'#fff':'#00D4FF',align:'right',family:this.FONT_TITLE,glow:dF&&!this.isMobile,glowColor:'#00D4FF',glowBlur:5});

        // ═══ HD FIX: Hearts using unified dpr ═══
        for (let i=0;i<this.maxLives;i++) {
            const alive=i<this.lives;
            ctx.save();
            if (alive&&!this.isMobile){ctx.shadowBlur=this.gS(6);ctx.shadowColor='#ff0055';}
            ctx.font=`${Math.round(17*this.dpr)}px serif`;
            ctx.textAlign='right';ctx.textBaseline='alphabetic';
            ctx.globalAlpha=alive?1:0.16;ctx.fillStyle='#ff0055';
            ctx.fillText('\u2665',(W-98-i*22)*this.dpr,24*this.dpr);
            ctx.restore();
        }

        if (this.activeEffects.slow) {
            const pct=this.activeEffects.slowTimer/5000;
            ctx.fillStyle='rgba(0,0,0,0.35)';this.fillRect(ctx,8,46,86,7);
            const slg=ctx.createLinearGradient(this.gX(8),0,this.gX(8+86*pct),0);
            slg.addColorStop(0,'#00D4FF');slg.addColorStop(1,'#00FF88');
            ctx.fillStyle=slg;this.fillRect(ctx,8,46,86*pct,7);
            this.drawText(ctx,'SLOW',10,60,{size:8,color:'#00D4FF',family:this.FONT_TITLE});
        }

        if (this.activeEffects.shield) {
            const sp=0.6+Math.sin(this.time/160)*0.4;
            this.drawText(ctx,'🛡 SHIELD',W/2,54,{size:11,weight:'bold',color:'#cc77ff',align:'center',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:'#b347d9',glowBlur:6,opacity:sp});
        }

        if (this.combo>1) {
            const ca=0.75+Math.sin(this.time/110)*0.25;
            const cc=this.combo>=8?'#FF006E':this.combo>=5?'#FFD700':'#00FF88';
            this.drawText(ctx,`×${this.combo} COMBO`,W/2,this.H-14,{size:16,weight:'bold',color:cc,align:'center',opacity:ca,glow:!this.isMobile,glowColor:cc,glowBlur:9,family:this.FONT_TITLE});
        }

        if (this.target.bossMode&&!this.stageComplete) {
            const ba=0.65+Math.sin(this.time/190)*0.35;
            this.drawText(ctx,'👹 BOSS!',W/2,62,{size:13,weight:'bold',color:'#ff3366',align:'center',opacity:ba,glow:!this.isMobile,glowColor:'#ff0055',glowBlur:10,family:this.FONT_TITLE});
        }
    }

    /* ════════════════════════════════════
       DRAW: POWER-UP BAR
    ════════════════════════════════════ */
    drawPowerUpBar(ctx) {
        const btnS=this.isMobile?40:36;
        const btnY=this.idleKnife?this.idleKnife.y+44:this.H-46;
        let idx=0;
        for (const[key,pup]of Object.entries(this.powerUps)) {
            const bx=8+idx*(btnS+6),canUse=pup.count>0;
            ctx.fillStyle=canUse?`rgba(${this.hexToRgbParts(pup.color)},0.11)`:'rgba(16,16,20,0.28)';
            this.drawRoundRect(ctx,bx,btnY,btnS,btnS,8);ctx.fill();
            ctx.strokeStyle=canUse?`rgba(${this.hexToRgbParts(pup.color)},0.45)`:'rgba(55,55,65,0.20)';
            ctx.lineWidth=this.gS(1.2);this.drawRoundRect(ctx,bx,btnY,btnS,btnS,8);ctx.stroke();
            ctx.save();ctx.globalAlpha=canUse?1:0.22;
            ctx.textAlign='center';ctx.textBaseline='middle';
            ctx.font=`${this.gSr(this.isMobile?16:14)}px Arial`;
            ctx.fillStyle='#fff';ctx.fillText(pup.icon,this.gX(bx+btnS/2),this.gY(btnY+btnS/2-4));
            ctx.restore();
            if (canUse) {
                ctx.fillStyle='rgba(0,0,0,0.68)';
                ctx.beginPath();ctx.arc(this.gX(bx+btnS-4),this.gY(btnY+btnS-5),this.gS(7),0,this.TAU);ctx.fill();
                this.drawText(ctx,`${pup.count}`,bx+btnS-4,btnY+btnS-5,{size:7.5,weight:'bold',color:'#00FF88',align:'center',baseline:'middle',family:this.FONT_TITLE});
            }
            this.drawText(ctx,`${idx+1}`,bx+4,btnY+10,{size:7.5,color:'rgba(255,255,255,0.26)',family:this.FONT_UI});
            idx++;
        }
    }

    /* ════════════════════════════════════
       DRAW: DAILY REWARD
    ════════════════════════════════════ */
    drawDailyReward(ctx) {
        const a=this.dailyRewardAnim;
        ctx.fillStyle=`rgba(0,0,0,${0.88*a})`;ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        if (a<0.3) return;
        const W=this.W,H=this.H,cw=Math.min(282,W-28),ch=248,cx=(W-cw)/2,cy=(H-ch)/2;
        this.drawCardBG(ctx,cx,cy,cw,ch,'#FFD700');
        const streak=this.playerData.dailyStreak,mult=Math.min(1+streak*0.3,4);
        const coins=Math.floor(60*mult),dias=Math.floor(2*Math.max(1,Math.floor(streak/3)));
        this.drawText(ctx,'🎁 Daily Reward!',W/2,cy+38,{size:19,weight:'bold',color:'#FFD700',align:'center',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:'#FFD700',glowBlur:7});
        this.drawText(ctx,`Day ${streak+1} Streak!`,W/2,cy+60,{size:12,color:'#00D4FF',align:'center',family:this.FONT_UI});
        ctx.fillStyle='rgba(255,255,255,0.07)';this.fillRect(ctx,cx+16,cy+70,cw-32,1);
        this.drawText(ctx,`${coins} Coins`,W/2,cy+106,{size:24,weight:'bold',color:'#FFD700',align:'center',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:'#FFD700',glowBlur:5});
        this.drawText(ctx,`${dias} Diamonds`,W/2,cy+138,{size:20,weight:'bold',color:'#00D4FF',align:'center',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:'#00D4FF',glowBlur:5});
        this.drawBtn(ctx,W/2,cy+ch-42,148,38,'CLAIM!','#B94FE3','#FF006E');
    }

    /* ════════════════════════════════════
       DRAW: GAME OVER
    ════════════════════════════════════ */
    drawGameOver(ctx) {
        const W=this.W,H=this.H;
        ctx.fillStyle='rgba(0,0,0,0.88)';ctx.fillRect(0,0,this.canvas.width,this.canvas.height);
        const pw=Math.min(W-28,300),ph=300,px=(W-pw)/2,py=(H-ph)/2;
        this.drawCardBG(ctx,px,py,pw,ph,'#b347d9');
        this.drawText(ctx,'GAME OVER',W/2,py+46,{size:26,weight:'bold',color:'#FF006E',align:'center',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:'#FF006E',glowBlur:14,stroke:true,strokeColor:'rgba(0,0,0,0.5)',strokeWidth:2.5});
        this.drawText(ctx,`Level ${this.level} · ${this.levelCfg?.name||''}`,W/2,py+70,{size:11,color:'#556677',align:'center',family:this.FONT_UI});
        ctx.fillStyle='rgba(255,255,255,0.07)';this.fillRect(ctx,px+16,py+80,pw-32,1);
        const isNewBest=this.score>=this.playerData.bestScore&&this.score>0;
        const rows=[
            ['SCORE',        this.score.toLocaleString(),  isNewBest?'#FFD700':'#ffffff'],
            ['BEST',         this.playerData.bestScore.toLocaleString(), isNewBest?'#FFD700':'#888'],
            ['LEVEL REACHED',String(this.level),           '#cc88ff'],
            ['BEST STREAK',  `🔥 x${this.streakRecord}`,  '#FFD700'],
            ['CLOSE CALLS',  `⚡ ${this.closeCallCount}`,  '#FF8C00'],
            ['COINS EARNED', `+${this.sessionCoins}`,      '#FFD700'],
        ];
        rows.forEach((row,i) => {
            const ry=py+100+i*28;
            this.drawText(ctx,row[0],px+18,ry,{size:9.5,color:'#445566',family:this.FONT_TITLE});
            this.drawText(ctx,row[1],px+pw-18,ry,{size:i<=1?14:11,weight:'bold',color:row[2],align:'right',family:this.FONT_TITLE});
        });
        if (isNewBest) {
            const pulse=0.7+Math.sin(this.time/120)*0.3;
            this.drawText(ctx,'🏆 NEW HIGH SCORE!',W/2,py+280,{size:13,weight:'bold',color:'#FFD700',align:'center',family:this.FONT_TITLE,glow:!this.isMobile,glowColor:'#FFD700',glowBlur:7,opacity:pulse});
        }
        ctx.fillStyle='rgba(255,255,255,0.07)';this.fillRect(ctx,px+16,py+ph-46,pw-32,1);
        const blink=0.4+Math.sin(this.time/380)*0.45;
        this.drawText(ctx,'Tap restart to play again',W/2,py+ph-14,{size:11,color:'#8888aa',align:'center',opacity:blink,family:this.FONT_UI});
    }

    /* ════════════════════════════════════
       UI HELPERS
    ════════════════════════════════════ */
    drawCardBG(ctx,x,y,w,h,borderColor) {
        ctx.fillStyle='rgba(5,2,14,0.97)';this.drawRoundRect(ctx,x,y,w,h,14);ctx.fill();
        ctx.strokeStyle=borderColor+'48';ctx.lineWidth=this.gS(1.6);this.drawRoundRect(ctx,x,y,w,h,14);ctx.stroke();
    }
    drawBtn(ctx,cx,cy,w,h,text,c1,c2) {
        const bx=cx-w/2,by=cy-h/2;
        const g=ctx.createLinearGradient(this.gX(bx),0,this.gX(bx+w),0);
        g.addColorStop(0,c1);g.addColorStop(1,c2);
        ctx.fillStyle=g;this.drawRoundRect(ctx,bx,by,w,h,h/2);ctx.fill();
        this.drawText(ctx,text,cx,cy+1,{size:13,weight:'bold',color:'#fff',align:'center',baseline:'middle',family:this.FONT_TITLE});
    }

    /* ════════════════════════════════════
       GAME LOOP
    ════════════════════════════════════ */
    loop(timestamp) {
        if (this.destroyed) return;
        const dt=Math.min(timestamp-(this.lastTime||timestamp),50);
        this.lastTime=timestamp;
        if (!this.paused) this.update(dt);
        this.draw();
        this.animId=requestAnimationFrame(t=>this.loop(t));
    }

    togglePause() { this.paused=!this.paused; this.isPaused=this.paused; return this.paused; }

    /* ════════════════════════════════════
       RESIZE — HD FIX
    ════════════════════════════════════ */
    resize() {
        // Recalculate DPR
        this.dpr = Math.min(window.devicePixelRatio || 1, 3);
        this.textDpr = this.dpr;

        this.setupCanvas();
        this.recalcLogicalSize();

        this.isMobile = this.W < 768 || ('ontouchstart' in window);
        this.isSmallScreen = this.W < 380;

        this.target.x = this.W / 2;
        this.target.y = this.H / 2 - 55;
        this.target.radius = Math.min(this.W, this.H) * 0.155;

        if (this.idleKnife) {
            this.idleKnife.x = this.W / 2;
            this.idleKnife.y = this.H - (this.isMobile ? 72 : 88);
        }

        this.MAX_PARTICLES = this.isMobile ? 50 : 120;
        this.MAX_POP_RINGS = this.isMobile ? 8  : 16;
        this.MAX_TRAIL     = this.isMobile ? 8  : 14;

        this.stars   = this.makeStars(this.isMobile ? 25 : 70);
        this.nebulae = this.makeNebulae();
    }

    destroy() {
        this.destroyed=true;
        cancelAnimationFrame(this.animId);
        this.canvas.removeEventListener('click',this._onClick);
        this.canvas.removeEventListener('touchstart',this._onTouch);
        document.removeEventListener('keydown',this._onKey);
        if (this.audioCtx){try{this.audioCtx.close();}catch(e){}}
        this.savePlayerData();
    }
}