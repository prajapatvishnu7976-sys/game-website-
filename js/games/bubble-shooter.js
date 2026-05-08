'use strict';

class BubbleShooter {
    constructor(canvasElement, onScoreCallback) {
        this._onScore  = onScoreCallback || function () {};
        this._destroyed = false;

        this.COLORS = [
            { hex:'#FF2244', light:'#FF6677', dark:'#AA0022', glow:'rgba(255,34,68,0.4)',   name:'Red'     },
            { hex:'#00EE66', light:'#66FFaa', dark:'#007733', glow:'rgba(0,238,102,0.4)',   name:'Green'   },
            { hex:'#1166FF', light:'#66AAFF', dark:'#003399', glow:'rgba(17,102,255,0.4)',  name:'Blue'    },
            { hex:'#FFD700', light:'#FFE866', dark:'#AA8800', glow:'rgba(255,215,0,0.4)',   name:'Yellow'  },
            { hex:'#DD00FF', light:'#EE77FF', dark:'#880099', glow:'rgba(221,0,255,0.4)',   name:'Magenta' },
            { hex:'#00EEFF', light:'#77FFFF', dark:'#007788', glow:'rgba(0,238,255,0.4)',   name:'Cyan'    },
            { hex:'#FF7700', light:'#FFAA44', dark:'#993300', glow:'rgba(255,119,0,0.4)',   name:'Orange'  },
            { hex:'#9900FF', light:'#CC66FF', dark:'#550099', glow:'rgba(153,0,255,0.4)',   name:'Purple'  },
        ];

        this.LEVELS = [
            { colors:3, rows:5, speed:8  },{ colors:4, rows:6, speed:9  },
            { colors:5, rows:6, speed:9  },{ colors:5, rows:7, speed:10 },
            { colors:6, rows:7, speed:10 },{ colors:6, rows:8, speed:11 },
            { colors:7, rows:8, speed:11 },{ colors:7, rows:9, speed:12 },
            { colors:8, rows:9, speed:12 },{ colors:8, rows:10,speed:13 },
        ];

        this.isMobile = window.innerWidth < 768 || ('ontouchstart' in window);

        this.DPR     = this.isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 2);
        this.textDPR = Math.min(window.devicePixelRatio || 1, 3);

        this.grid          = [];
        this.currentLevel  = 0;
        this.score         = 0;
        this.moves         = 0;
        this.combo         = 0;
        this.maxCombo      = 0;
        this.bubblesPopped = 0;
        this.gameWon       = false;
        this.gameOver      = false;
        this.timeElapsed   = 0;
        this.timerInterval = null;
        this.history       = [];

        this.shooterAngle  = -Math.PI / 2;
        this.targetAngle   = -Math.PI / 2;
        this.currentBubble = 0;
        this.nextBubble    = 0;
        this.projectile    = null;
        this.canShoot      = true;
        this.shootCooldown = 0;
        this.colorsInPlay  = [];
        this.aimDots       = [];

        this.colorChangesLeft    = 3;
        this.colorChangeCooldown = 0;
        this.colorChangeAnim     = 0;
        this.colorChangeFlash    = 0;

        this.COLS     = 10;
        this.ROWS     = 14;
        this.BUBBLE_R = 18;
        this.offsetX  = 0;
        this.offsetY  = 0;
        this.shooterX = 0;
        this.shooterY = 0;
        this.HUD_H    = 0;
        this.BOTTOM_H = 0;

        this.particles     = [];
        this.fallingBubbles= [];
        this.popRings      = [];
        this.textPopups    = [];
        this.floatingTexts = [];
        this.MAX_PARTICLES = this.isMobile ? 30 : 100;

        this.globalTime    = 0;
        this.frame         = 0;
        this._lastFrameTime= 0;
        this.shakeX        = 0;
        this.shakeY        = 0;
        this.shakeTimer    = 0;
        this.shakeForce    = 0;
        this.shootRecoil   = 0;
        this.hoverX        = -1;
        this.hoverY        = -1;
        this._bubbleCache  = new Map();
        this._glowCache    = new Map();
        this._gradCache    = new Map();
        this._colorCache   = {};
        this.animationFrameId = null;
        this.swapAnim      = 0;

        this.showLevelComplete  = false;
        this.levelCompleteTimer = 0;
        this.starRating         = 0;

        this.saveKey    = 'neonBubble_v12';
        this.playerData = this._loadPlayerData();

        this.fpsHistory   = [];
        this.adaptiveMode = false;
        this.lastFpsCheck = 0;

        this.audioCtx    = null;
        this.soundEnabled= true;
        this._initAudio();

        this.canvas = canvasElement;
        this.ctx    = this.canvas.getContext('2d', { alpha: false });

        this._handleClick  = this._onHandleClick.bind(this);
        this._handleMove   = this._onHandleMove.bind(this);
        this._handleKey    = this._onKey.bind(this);
        this._handleResize = this._onResize.bind(this);

        this._init();
    }

    // ══════════════════ INIT ══════════════════

    _init() {
        this._setupCanvas();
        const savedLevel = this.playerData.currentLevel || 0;
        this._startLevel(savedLevel);

        this.canvas.addEventListener('click',     this._handleClick, { passive:false });
        this.canvas.addEventListener('touchend',  this._handleClick, { passive:false });
        this.canvas.addEventListener('mousemove', this._handleMove);
        this.canvas.addEventListener('touchmove', this._handleMove, { passive:false });
        this.canvas.addEventListener('touchstart', e => e.preventDefault(), { passive:false });
        window.addEventListener('keydown',  this._handleKey);
        window.addEventListener('resize',   this._handleResize);

        this._resumeAudioHandler = () => {
            if (this.audioCtx?.state === 'suspended') this.audioCtx.resume();
            document.removeEventListener('click',      this._resumeAudioHandler);
            document.removeEventListener('touchstart', this._resumeAudioHandler);
        };
        document.addEventListener('click',      this._resumeAudioHandler);
        document.addEventListener('touchstart', this._resumeAudioHandler);

        this._mainLoop();
    }

    destroy() {
        this._destroyed = true;
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this._stopTimer();
        this.canvas.removeEventListener('click',     this._handleClick);
        this.canvas.removeEventListener('touchend',  this._handleClick);
        this.canvas.removeEventListener('mousemove', this._handleMove);
        this.canvas.removeEventListener('touchmove', this._handleMove);
        window.removeEventListener('keydown',  this._handleKey);
        window.removeEventListener('resize',   this._handleResize);
        if (this._resumeAudioHandler) {
            document.removeEventListener('click',      this._resumeAudioHandler);
            document.removeEventListener('touchstart', this._resumeAudioHandler);
        }
        try { this.audioCtx?.close(); } catch(e) {}
        this._bubbleCache.clear(); this._glowCache.clear(); this._gradCache.clear();
        this._colorCache = {};
        this._savePlayerData();
    }

    resize() { this._setupCanvas(); }
    togglePause() { return false; }
    toggleSound() { this.soundEnabled = !this.soundEnabled; return this.soundEnabled; }

    // ══════════════════ AUDIO ══════════════════

    _initAudio() {
        try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch(e) { this.audioCtx = null; }
    }
    _playTone(freq,dur,type='sine',vol=0.1) {
        if (!this.soundEnabled||!this.audioCtx) return;
        try {
            const t=this.audioCtx.currentTime;
            const osc=this.audioCtx.createOscillator(), gain=this.audioCtx.createGain();
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            osc.frequency.setValueAtTime(freq,t); osc.type=type;
            gain.gain.setValueAtTime(vol,t); gain.gain.exponentialRampToValueAtTime(0.001,t+dur);
            osc.start(t); osc.stop(t+dur);
        } catch(e) {}
    }
    _playShoot() {
        if (!this.soundEnabled||!this.audioCtx) return;
        try {
            const ctx=this.audioCtx,t=ctx.currentTime;
            const osc=ctx.createOscillator(),gain=ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type='sine'; osc.frequency.setValueAtTime(600,t); osc.frequency.exponentialRampToValueAtTime(320,t+0.1);
            gain.gain.setValueAtTime(0.15,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.14);
            osc.start(t); osc.stop(t+0.15);
        } catch(e) {}
    }
    _playPop(pitch=1) {
        if (!this.soundEnabled||!this.audioCtx) return;
        try {
            const ctx=this.audioCtx,t=ctx.currentTime;
            const osc=ctx.createOscillator(),gain=ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type='sine'; osc.frequency.setValueAtTime(880*pitch,t); osc.frequency.exponentialRampToValueAtTime(440*pitch,t+0.08);
            gain.gain.setValueAtTime(0.16,t); gain.gain.exponentialRampToValueAtTime(0.001,t+0.12);
            osc.start(t); osc.stop(t+0.13);
        } catch(e) {}
    }
    _playSwap()        { this._playTone(500,0.08,'triangle',0.1); }
    _playError()       { this._playTone(150,0.2,'square',0.06); }
    _playBounce()      { this._playTone(300,0.05,'sine',0.06); }
    _playColorChange() {
        if (!this.soundEnabled||!this.audioCtx) return;
        try {
            const ctx=this.audioCtx,t=ctx.currentTime;
            [400,600,900,1200].forEach((freq,i) => {
                const osc=ctx.createOscillator(),gain=ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type='sine'; osc.frequency.setValueAtTime(freq,t+i*0.04);
                gain.gain.setValueAtTime(0,t+i*0.04); gain.gain.linearRampToValueAtTime(0.12,t+i*0.04+0.01);
                gain.gain.exponentialRampToValueAtTime(0.001,t+i*0.04+0.12);
                osc.start(t+i*0.04); osc.stop(t+i*0.04+0.13);
            });
        } catch(e) {}
    }
    _playCombo(level) {
        if (!this.soundEnabled||!this.audioCtx) return;
        const notes=[523,659,784,1047];
        const ctx=this.audioCtx,t=ctx.currentTime;
        for (let i=0;i<Math.min(level+1,notes.length);i++) {
            try {
                const osc=ctx.createOscillator(),gain=ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type='sine'; osc.frequency.setValueAtTime(notes[i],t+i*0.07);
                gain.gain.setValueAtTime(0,t+i*0.07); gain.gain.linearRampToValueAtTime(0.12,t+i*0.07+0.02);
                gain.gain.exponentialRampToValueAtTime(0.001,t+i*0.07+0.18);
                osc.start(t+i*0.07); osc.stop(t+i*0.07+0.2);
            } catch(e) {}
        }
    }
    _playWin() {
        if (!this.soundEnabled||!this.audioCtx) return;
        [523,659,784,1047,1318].forEach((freq,i) => {
            try {
                const ctx=this.audioCtx,t=ctx.currentTime;
                const osc=ctx.createOscillator(),gain=ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type='sine'; osc.frequency.setValueAtTime(freq,t+i*0.12);
                gain.gain.setValueAtTime(0,t+i*0.12); gain.gain.linearRampToValueAtTime(0.15,t+i*0.12+0.03);
                gain.gain.exponentialRampToValueAtTime(0.001,t+i*0.12+0.4);
                osc.start(t+i*0.12); osc.stop(t+i*0.12+0.42);
            } catch(e) {}
        });
    }
    _playGameOver() {
        if (!this.soundEnabled||!this.audioCtx) return;
        [400,350,300,200].forEach((freq,i) => {
            try {
                const ctx=this.audioCtx,t=ctx.currentTime;
                const osc=ctx.createOscillator(),gain=ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type='triangle'; osc.frequency.setValueAtTime(freq,t+i*0.15);
                gain.gain.setValueAtTime(0.1,t+i*0.15); gain.gain.exponentialRampToValueAtTime(0.001,t+i*0.15+0.3);
                osc.start(t+i*0.15); osc.stop(t+i*0.15+0.32);
            } catch(e) {}
        });
    }

    // ══════════════════ CANVAS SETUP ══════════════════

    _setupCanvas() {
        const parent = this.canvas.parentElement;
        let w, h;
        if (parent) {
            const rect = parent.getBoundingClientRect();
            w = rect.width  || parent.clientWidth  || window.innerWidth;
            h = rect.height || parent.clientHeight || window.innerHeight;
        } else {
            w = window.innerWidth;
            h = window.innerHeight;
        }
        w = Math.max(w, 200);
        h = Math.max(h, 300);

        const dpr = this.DPR;
        this.canvas.style.width  = w + 'px';
        this.canvas.style.height = h + 'px';
        this.canvas.width  = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);

        this.W  = w;
        this.H  = h;
        this.cW = this.canvas.width;
        this.cH = this.canvas.height;

        this.HUD_H    = this.isMobile ? 52 : 62;
        this.BOTTOM_H = this.isMobile ? 95 : 105;

        const playAreaH = this.H - this.HUD_H - this.BOTTOM_H;
        const playAreaW = this.W;
        const maxR_w    = playAreaW / (this.COLS * 2 + 1);
        const maxR_h    = playAreaH / (this.ROWS * 1.8 + 2);
        this.BUBBLE_R   = Math.floor(Math.min(maxR_w, maxR_h, this.isMobile ? 16 : 22));
        if (this.BUBBLE_R < 10) this.BUBBLE_R = 10;

        const gridW  = this.COLS * this.BUBBLE_R * 2;
        this.offsetX = (this.W - gridW) / 2 + this.BUBBLE_R;
        this.offsetY = this.HUD_H + this.BUBBLE_R + 5;

        this.shooterX  = this.W / 2;
        this.shooterY  = this.H - this.BOTTOM_H / 2;
        this.ceilingY  = this.HUD_H;
        this.deadlineY = this.shooterY - this.BUBBLE_R * 3;

        this._bubbleCache.clear();
        this._glowCache.clear();
        this._gradCache.clear();
    }

    // ══════════════════ PLAYER DATA ══════════════════

    _loadPlayerData() {
        try { const d=JSON.parse(localStorage.getItem(this.saveKey)); if (d) return d; }
        catch(e) {}
        return { currentLevel:0, highScore:0, totalPopped:0 };
    }
    _savePlayerData() {
        try {
            this.playerData.currentLevel = this.currentLevel;
            this.playerData.highScore    = Math.max(this.playerData.highScore||0, this.score);
            localStorage.setItem(this.saveKey, JSON.stringify(this.playerData));
        } catch(e) {}
    }

    // ══════════════════ LEVEL MANAGEMENT ══════════════════

    _startLevel(levelIdx) {
        this.currentLevel  = Math.min(levelIdx, this.LEVELS.length-1);
        const lvl          = this.LEVELS[this.currentLevel];
        this.colorsInPlay  = this.COLORS.slice(0, lvl.colors);
        this.grid          = [];
        this.score         = 0; this.moves=0; this.combo=0; this.maxCombo=0;
        this.bubblesPopped = 0; this.gameWon=false; this.gameOver=false;
        this.showLevelComplete=false; this.projectile=null; this.canShoot=true;
        this.shootCooldown = 0; this.particles=[]; this.fallingBubbles=[];
        this.popRings=[]; this.textPopups=[]; this.floatingTexts=[];
        this.history=[]; this.shakeTimer=0; this.shootRecoil=0;
        this.colorChangesLeft=3; this.colorChangeCooldown=0;
        this.colorChangeAnim=0; this.colorChangeFlash=0;

        for (let row=0;row<this.ROWS;row++) {
            this.grid[row] = [];
            for (let col=0;col<this.COLS;col++) {
                if (row < lvl.rows) {
                    if (row%2===1 && col>=this.COLS-1) { this.grid[row][col]=-1; }
                    else { this.grid[row][col]=Math.floor(Math.random()*lvl.colors); }
                } else { this.grid[row][col]=-1; }
            }
        }
        this._pickNextBubbles();
        this._startTimer();
        this._updateColorsInPlay();
    }

    _pickNextBubbles() {
        const avail=this._getAvailableColors();
        if (avail.length===0){this.currentBubble=0;this.nextBubble=0;return;}
        this.currentBubble=avail[Math.floor(Math.random()*avail.length)];
        this.nextBubble   =avail[Math.floor(Math.random()*avail.length)];
    }
    _getAvailableColors() {
        const set=new Set();
        for (let r=0;r<this.ROWS;r++) for (let c=0;c<this.COLS;c++) if (this.grid[r][c]>=0) set.add(this.grid[r][c]);
        return Array.from(set);
    }
    _updateColorsInPlay() {
        const avail=this._getAvailableColors();
        if (avail.length>0){
            if (!avail.includes(this.currentBubble)) this.currentBubble=avail[Math.floor(Math.random()*avail.length)];
            if (!avail.includes(this.nextBubble))    this.nextBubble   =avail[Math.floor(Math.random()*avail.length)];
        }
    }
    _startTimer() { this._stopTimer(); this.timeElapsed=0; this.timerInterval=setInterval(()=>{if(!this.gameWon&&!this.gameOver)this.timeElapsed++;},1000); }
    _stopTimer()  { if (this.timerInterval){clearInterval(this.timerInterval);this.timerInterval=null;} }

    // ══════════════════ COLOR CHANGE ══════════════════

    _changeCurrentBubbleColor() {
        if (this.colorChangesLeft<=0) {
            this._playError(); this.colorChangeFlash=15;
            this._addTextPopup(this.shooterX,this.shooterY-40,'No Changes Left!','#FF4444'); return;
        }
        if (this.colorChangeCooldown>0){this._playError();return;}
        if (this.projectile) return;
        const avail=this._getAvailableColors();
        if (avail.length<=1) return;
        let newColor,attempts=0;
        do { newColor=avail[Math.floor(Math.random()*avail.length)]; attempts++; }
        while (newColor===this.currentBubble && attempts<10);
        this.currentBubble=newColor;
        this.colorChangesLeft--;
        this.colorChangeCooldown=30;
        this.colorChangeAnim=1;
        this.colorChangeFlash=20;
        this._playColorChange();
        this._addTextPopup(this.shooterX,this.shooterY-50,`🎨 Changed! (${this.colorChangesLeft} left)`,this.COLORS[this.currentBubble].hex);
        const color=this.COLORS[newColor];
        for (let i=0;i<(this.isMobile?8:16);i++) {
            const angle=(Math.PI*2/(this.isMobile?8:16))*i,speed=2+Math.random()*3;
            this.particles.push({x:this.shooterX,y:this.shooterY,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1,decay:0.025+Math.random()*0.02,color:color.hex,r:3+Math.random()*3});
        }
    }

    // ══════════════════ GRID HELPERS ══════════════════

    _getBubblePos(row,col) {
        const r=this.BUBBLE_R,d=r*2;
        let x=this.offsetX+col*d;
        if (row%2===1) x+=r;
        const y=this.offsetY+row*(d*0.866);
        return{x,y};
    }
    _pixelToGrid(px,py) {
        let bestR=-1,bestC=-1,bestDist=Infinity;
        for (let r=0;r<this.ROWS;r++) {
            const maxC=(r%2===1)?this.COLS-1:this.COLS;
            for (let c=0;c<maxC;c++) {
                const pos=this._getBubblePos(r,c);
                const dx=px-pos.x,dy=py-pos.y,dist=dx*dx+dy*dy;
                if (dist<bestDist){bestDist=dist;bestR=r;bestC=c;}
            }
        }
        return{row:bestR,col:bestC};
    }
    _getNeighbors(row,col) {
        const even=row%2===0;
        const dirs=even?[[-1,-1],[-1,0],[0,-1],[0,1],[1,-1],[1,0]]:[[-1,0],[-1,1],[0,-1],[0,1],[1,0],[1,1]];
        const neighbors=[];
        for (const[dr,dc]of dirs) {
            const nr=row+dr,nc=col+dc;
            const maxC=(nr%2===1)?this.COLS-1:this.COLS;
            if (nr>=0&&nr<this.ROWS&&nc>=0&&nc<maxC) neighbors.push({row:nr,col:nc});
        }
        return neighbors;
    }
    _findCluster(row,col,color) {
        if (this.grid[row]?.[col]!==color||color<0) return[];
        const visited=new Set(),cluster=[],stack=[{row,col}];
        while (stack.length>0) {
            const{row:r,col:c}=stack.pop();
            const key=r*100+c;
            if (visited.has(key)) continue;
            visited.add(key);
            if (this.grid[r]?.[c]!==color) continue;
            cluster.push({row:r,col:c});
            for (const n of this._getNeighbors(r,c)) { const nk=n.row*100+n.col; if (!visited.has(nk)&&this.grid[n.row]?.[n.col]===color) stack.push(n); }
        }
        return cluster;
    }
    _findFloating() {
        const visited=new Set(),queue=[];
        for (let c=0;c<this.COLS;c++) { if (this.grid[0][c]>=0){queue.push({row:0,col:c});visited.add(c);} }
        while (queue.length>0) {
            const{row:r,col:c}=queue.shift();
            for (const n of this._getNeighbors(r,c)) { const key=n.row*100+n.col; if (!visited.has(key)&&this.grid[n.row]?.[n.col]>=0){visited.add(key);queue.push(n);} }
        }
        const floating=[];
        for (let r=0;r<this.ROWS;r++) {
            const maxC=(r%2===1)?this.COLS-1:this.COLS;
            for (let c=0;c<maxC;c++) { if (this.grid[r][c]>=0&&!visited.has(r*100+c)) floating.push({row:r,col:c,color:this.grid[r][c]}); }
        }
        return floating;
    }
    _checkGameOver() {
        for (let r=0;r<this.ROWS;r++) for (let c=0;c<this.COLS;c++) if (this.grid[r][c]>=0){const pos=this._getBubblePos(r,c);if (pos.y+this.BUBBLE_R>=this.deadlineY) return true;}
        return false;
    }
    _checkWin() {
        for (let r=0;r<this.ROWS;r++) for (let c=0;c<this.COLS;c++) if (this.grid[r][c]>=0) return false;
        return true;
    }

    // ══════════════════ SHOOTING ══════════════════

    _shoot() {
        if (!this.canShoot||this.projectile||this.gameWon||this.gameOver) return;
        this.canShoot=false; this.shootCooldown=15; this.shootRecoil=1;
        const speed=(this.LEVELS[this.currentLevel]?.speed||10)*(this.isMobile?1.2:1);
        const vx=Math.cos(this.shooterAngle)*speed, vy=Math.sin(this.shooterAngle)*speed;
        this.projectile={x:this.shooterX,y:this.shooterY,vx,vy,color:this.currentBubble,r:this.BUBBLE_R,trail:[]};
        this.moves++;
        this._playShoot();
    }
    _swapBubbles() {
        if (!this.canShoot||this.projectile) return;
        const tmp=this.currentBubble; this.currentBubble=this.nextBubble; this.nextBubble=tmp;
        this.swapAnim=1; this._playSwap();
    }
    _updateProjectile() {
        const p=this.projectile;
        if (!p) return;
        p.x+=p.vx; p.y+=p.vy;
        if (this.frame%2===0){p.trail.push({x:p.x,y:p.y});if(p.trail.length>8)p.trail.shift();}
        if (p.x-p.r<0){p.x=p.r;p.vx=-p.vx;this._playBounce();}
        if (p.x+p.r>this.W){p.x=this.W-p.r;p.vx=-p.vx;this._playBounce();}
        if (p.y-p.r<=this.ceilingY){p.y=this.ceilingY+p.r;this._snapProjectile(p);return;}
        for (let r=0;r<this.ROWS;r++) {
            const maxC=(r%2===1)?this.COLS-1:this.COLS;
            for (let c=0;c<maxC;c++) {
                if (this.grid[r][c]<0) continue;
                const pos=this._getBubblePos(r,c);
                const ddx=p.x-pos.x,ddy=p.y-pos.y;
                if (ddx*ddx+ddy*ddy<(p.r*1.8)**2){this._snapProjectile(p);return;}
            }
        }
        if (p.y>this.H+50){this.projectile=null;this.canShoot=true;}
    }
    _snapProjectile(p) {
        const{row,col}=this._pixelToGrid(p.x,p.y);
        if (row<0||row>=this.ROWS||col<0){this.projectile=null;this.canShoot=true;return;}
        const maxC=(row%2===1)?this.COLS-1:this.COLS;
        const clampedCol=Math.min(col,maxC-1);
        if (this.grid[row][clampedCol]>=0) {
            const neighbors=this._getNeighbors(row,clampedCol);
            let bestN=null,bestDist=Infinity;
            for (const n of neighbors) {
                if ((this.grid[n.row]?.[n.col]===-1||this.grid[n.row]?.[n.col]===undefined)) {
                    const nmaxC=(n.row%2===1)?this.COLS-1:this.COLS;
                    if (n.col>=0&&n.col<nmaxC&&n.row>=0&&n.row<this.ROWS) {
                        const pos=this._getBubblePos(n.row,n.col);
                        const dx=p.x-pos.x,dy=p.y-pos.y,dist=dx*dx+dy*dy;
                        if (dist<bestDist){bestDist=dist;bestN=n;}
                    }
                }
            }
            if (bestN) this._placeBubble(bestN.row,bestN.col,p.color);
            else{this.projectile=null;this.canShoot=true;return;}
        } else {
            this._placeBubble(row,clampedCol,p.color);
        }
        this.projectile=null;
    }
    _placeBubble(row,col,color) {
        if (row<0||row>=this.ROWS){this.canShoot=true;return;}
        this.grid[row][col]=color;
        const cluster=this._findCluster(row,col,color);
        if (cluster.length>=3) {
            this.combo++; if (this.combo>this.maxCombo) this.maxCombo=this.combo;
            const points=cluster.length*10*this.combo;
            this.score+=points; this.bubblesPopped+=cluster.length;
            for (const cell of cluster) {
                const pos=this._getBubblePos(cell.row,cell.col);
                this._spawnPopEffect(pos.x,pos.y,this.COLORS[color]);
                this.grid[cell.row][cell.col]=-1;
            }
            this._playPop(1+this.combo*0.15);
            if (this.combo>=2) this._playCombo(this.combo);
            const floating=this._findFloating();
            if (floating.length>0) {
                const floatPoints=floating.length*15*this.combo;
                this.score+=floatPoints; this.bubblesPopped+=floating.length;
                for (const f of floating) {
                    const pos=this._getBubblePos(f.row,f.col);
                    this._spawnFallingBubble(pos.x,pos.y,this.COLORS[f.color]);
                    this.grid[f.row][f.col]=-1;
                }
            }
            const popPos=this._getBubblePos(row,col);
            this._addTextPopup(popPos.x,popPos.y,`+${points}`,this.COLORS[color].hex);
            if (this.combo>=2) this._addTextPopup(popPos.x,popPos.y-25,`${this.combo}x COMBO!`,'#FFD700');
            this.shakeForce=Math.min(3+cluster.length,8); this.shakeTimer=10;
            this._onScore(this.score);
            if (this._checkWin()){
                this.gameWon=true; this._stopTimer(); this._playWin();
                this.showLevelComplete=true; this.levelCompleteTimer=0;
                this.starRating=this._calcStars();
                this.playerData.currentLevel=Math.min(this.currentLevel+1,this.LEVELS.length-1);
                this.playerData.totalPopped=(this.playerData.totalPopped||0)+this.bubblesPopped;
                this._savePlayerData();
            }
        } else {
            this.combo=0; this._playTone(200,0.05,'sine',0.05);
            if (this._checkGameOver()){this.gameOver=true;this._stopTimer();this._playGameOver();}
        }
        this._updateColorsInPlay();
        this.canShoot=true;
        if (!this.gameWon&&!this.gameOver) {
            this.currentBubble=this.nextBubble;
            const avail=this._getAvailableColors();
            this.nextBubble=avail.length>0?avail[Math.floor(Math.random()*avail.length)]:0;
        }
    }
    _calcStars() { if (this.moves<=15) return 3; if (this.moves<=25) return 2; return 1; }

    // ══════════════════ AIM LINE — FULL FIX ══════════════════
    // Traces complete path with wall bounces all the way to ceiling or bubble hit

    _updateAimDots() {
        this.aimDots = [];
        if (this.projectile || this.gameWon || this.gameOver) return;

        // Use small steps for smooth accurate tracing
        const stepSize  = this.BUBBLE_R * 0.6;
        const maxSteps  = this.isMobile ? 180 : 300;
        const dotSpacing= this.BUBBLE_R * 1.4; // place a dot every N pixels

        let x  = this.shooterX;
        let y  = this.shooterY;
        let dx = Math.cos(this.shooterAngle) * stepSize;
        let dy = Math.sin(this.shooterAngle) * stepSize;

        let distSinceLastDot = 0;
        let totalDots        = 0;
        const maxDots        = this.isMobile ? 18 : 32;

        for (let step = 0; step < maxSteps; step++) {
            x += dx;
            y += dy;

            // Wall bounces
            if (x - this.BUBBLE_R < 0) {
                x  = this.BUBBLE_R;
                dx = -dx;
            }
            if (x + this.BUBBLE_R > this.W) {
                x  = this.W - this.BUBBLE_R;
                dx = -dx;
            }

            // Hit ceiling — stop here
            if (y - this.BUBBLE_R <= this.ceilingY) {
                // Add final dot at ceiling
                const alpha = Math.max(0.1, 1 - totalDots / maxDots);
                this.aimDots.push({ x, y: this.ceilingY + this.BUBBLE_R, alpha, isFinal: true });
                break;
            }

            // Check collision with existing bubbles
            let hitBubble = false;
            for (let r = 0; r < this.ROWS && !hitBubble; r++) {
                const maxC = (r % 2 === 1) ? this.COLS - 1 : this.COLS;
                for (let c = 0; c < maxC && !hitBubble; c++) {
                    if (this.grid[r][c] < 0) continue;
                    const pos = this._getBubblePos(r, c);
                    const ddx = x - pos.x, ddy = y - pos.y;
                    if (ddx * ddx + ddy * ddy < (this.BUBBLE_R * 1.85) ** 2) {
                        hitBubble = true;
                        // Add final dot at collision point
                        const alpha = Math.max(0.1, 1 - totalDots / maxDots);
                        this.aimDots.push({ x, y, alpha, isFinal: true });
                    }
                }
            }
            if (hitBubble) break;

            // Place dots at even intervals
            distSinceLastDot += stepSize;
            if (distSinceLastDot >= dotSpacing) {
                distSinceLastDot = 0;
                const alpha = Math.max(0.12, 1 - totalDots / maxDots);
                this.aimDots.push({ x, y, alpha, isFinal: false });
                totalDots++;
                if (totalDots >= maxDots) break;
            }
        }
    }

    // ══════════════════ FX ══════════════════

    _spawnPopEffect(x,y,color) {
        const count=this.isMobile?4:8;
        for (let i=0;i<count&&this.particles.length<this.MAX_PARTICLES;i++) {
            const angle=(Math.PI*2/count)*i+Math.random()*0.5,speed=2+Math.random()*3;
            this.particles.push({x,y,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1,decay:0.02+Math.random()*0.02,color:color.hex,r:2+Math.random()*3});
        }
        this.popRings.push({x,y,r:this.BUBBLE_R*0.5,maxR:this.BUBBLE_R*2.5,life:1,color:color.hex});
    }
    _spawnFallingBubble(x,y,color) {
        this.fallingBubbles.push({x,y,vx:(Math.random()-0.5)*3,vy:-2-Math.random()*2,color,r:this.BUBBLE_R,life:1,gravity:0.15,rotation:Math.random()*Math.PI*2,rotSpeed:(Math.random()-0.5)*0.2});
    }
    _addTextPopup(x,y,text,color) { this.textPopups.push({x,y,text,color,life:1,vy:-1.5}); }
    _updateParticles() {
        for (let i=this.particles.length-1;i>=0;i--){const p=this.particles[i];p.x+=p.vx;p.y+=p.vy;p.vy+=0.05;p.vx*=0.98;p.life-=p.decay;if(p.life<=0)this.particles.splice(i,1);}
        for (let i=this.popRings.length-1;i>=0;i--){const ring=this.popRings[i];ring.r+=(ring.maxR-ring.r)*0.15;ring.life-=0.05;if(ring.life<=0)this.popRings.splice(i,1);}
        for (let i=this.fallingBubbles.length-1;i>=0;i--){const fb=this.fallingBubbles[i];fb.x+=fb.vx;fb.vy+=fb.gravity;fb.y+=fb.vy;fb.rotation+=fb.rotSpeed;fb.life-=0.015;if(fb.life<=0||fb.y>this.H+50)this.fallingBubbles.splice(i,1);}
        for (let i=this.textPopups.length-1;i>=0;i--){const tp=this.textPopups[i];tp.y+=tp.vy;tp.life-=0.02;if(tp.life<=0)this.textPopups.splice(i,1);}
    }

    // ══════════════════ CRISP TEXT ══════════════════

    _drawCrispText(ctx, text, x, y, opts = {}) {
        const {
            size     = 14, weight    = 'normal', color = '#fff',
            align    = 'center', baseline = 'middle',
            glow     = false, glowColor = null, glowBlur = 0,
            stroke   = false, strokeColor = 'rgba(0,0,0,0.8)', strokeWidth = 3,
            opacity  = 1, maxWidth = 0,
        } = opts;

        if (opacity <= 0) return;
        ctx.save();
        ctx.globalAlpha  = Math.min(1, opacity);
        ctx.textAlign    = align;
        ctx.textBaseline = baseline;

        const td = this.textDPR;
        ctx.font = `${weight} ${Math.round(size * td)}px 'Segoe UI', Rajdhani, Arial, sans-serif`;

        const px = (x * td + 0.5) | 0;
        const py = (y * td + 0.5) | 0;
        const mw = maxWidth ? maxWidth * td : undefined;

        ctx.imageSmoothingEnabled = true;

        if (stroke) {
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth   = strokeWidth * td;
            ctx.lineJoin    = 'round';
            ctx.strokeText(text, px, py, mw);
        }
        if (glow && glowBlur > 0 && !this.isMobile) {
            ctx.shadowBlur  = glowBlur * td;
            ctx.shadowColor = glowColor || color;
        }
        ctx.fillStyle = color;
        ctx.fillText(text, px, py, mw);
        ctx.shadowBlur  = 0;
        ctx.shadowColor = 'transparent';
        ctx.imageSmoothingEnabled = false;
        ctx.restore();
    }

    // ══════════════════ RENDERING ══════════════════

    _drawBackground(ctx) {
        const w=this.cW, h=this.cH;
        const grad=ctx.createLinearGradient(0,0,0,h);
        grad.addColorStop(0,'#0a0a1a'); grad.addColorStop(0.5,'#0d1025'); grad.addColorStop(1,'#060612');
        ctx.fillStyle=grad; ctx.fillRect(0,0,w,h);
        if (!this.isMobile) {
            ctx.strokeStyle='rgba(50,50,100,0.08)'; ctx.lineWidth=this.DPR;
            const spacing=40*this.DPR;
            for (let x=0;x<w;x+=spacing){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
            for (let y=0;y<h;y+=spacing){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
        }
    }

    _getCachedBubble(colorIdx,r) {
        const key=`${colorIdx}_${r}`;
        if (this._bubbleCache.has(key)) return this._bubbleCache.get(key);
        const size=(r*2+4)*this.DPR;
        const off=document.createElement('canvas');
        off.width=size; off.height=size;
        const oc=off.getContext('2d');
        const cx=size/2,cy=size/2,rr=r*this.DPR;
        const color=this.COLORS[colorIdx]||this.COLORS[0];
        const glow=oc.createRadialGradient(cx,cy,rr*0.3,cx,cy,rr*1.3);
        glow.addColorStop(0,color.glow); glow.addColorStop(1,'transparent');
        oc.fillStyle=glow; oc.fillRect(0,0,size,size);
        const grad=oc.createRadialGradient(cx-rr*0.25,cy-rr*0.25,rr*0.1,cx,cy,rr);
        grad.addColorStop(0,color.light); grad.addColorStop(0.6,color.hex); grad.addColorStop(1,color.dark);
        oc.beginPath(); oc.arc(cx,cy,rr,0,Math.PI*2); oc.fillStyle=grad; oc.fill();
        oc.beginPath(); oc.ellipse(cx-rr*0.2,cy-rr*0.25,rr*0.35,rr*0.2,-0.3,0,Math.PI*2);
        oc.fillStyle='rgba(255,255,255,0.35)'; oc.fill();
        oc.beginPath(); oc.arc(cx-rr*0.15,cy-rr*0.15,rr*0.12,0,Math.PI*2);
        oc.fillStyle='rgba(255,255,255,0.5)'; oc.fill();
        oc.beginPath(); oc.arc(cx,cy,rr-this.DPR*0.5,0,Math.PI*2);
        oc.strokeStyle='rgba(255,255,255,0.15)'; oc.lineWidth=this.DPR; oc.stroke();
        this._bubbleCache.set(key,off);
        return off;
    }

    _drawBubble(ctx,x,y,colorIdx,r,alpha=1) {
        if (colorIdx<0) return;
        const cached=this._getCachedBubble(colorIdx,r);
        const dpr=this.DPR;
        const w=cached.width/dpr,h=cached.height/dpr;
        if (alpha<1) ctx.globalAlpha=alpha;
        ctx.drawImage(cached,(x-w/2)*dpr,(y-h/2)*dpr,cached.width,cached.height);
        if (alpha<1) ctx.globalAlpha=1;
    }

    _drawGrid(ctx) {
        const time=this.globalTime;
        for (let row=0;row<this.ROWS;row++) {
            const maxC=(row%2===1)?this.COLS-1:this.COLS;
            for (let col=0;col<maxC;col++) {
                const ci=this.grid[row][col];
                if (ci<0) continue;
                const pos=this._getBubblePos(row,col);
                const wobble=Math.sin(time*2+row*0.3+col*0.5)*0.5;
                this._drawBubble(ctx,pos.x,pos.y+wobble,ci,this.BUBBLE_R);
            }
        }
    }

    _drawShooter(ctx) {
        const dpr=this.DPR;
        const sx=this.shooterX*dpr, sy=this.shooterY*dpr;
        const r=this.BUBBLE_R*dpr;
        const recoilOffset=this.shootRecoil*5*dpr;

        ctx.beginPath(); ctx.arc(sx,sy,r*1.8,Math.PI,0);
        const baseGrad=ctx.createLinearGradient(sx-r*2,sy,sx+r*2,sy);
        baseGrad.addColorStop(0,'#1a1a3a'); baseGrad.addColorStop(0.5,'#2a2a5a'); baseGrad.addColorStop(1,'#1a1a3a');
        ctx.fillStyle=baseGrad; ctx.fill();
        ctx.strokeStyle='rgba(100,100,200,0.3)'; ctx.lineWidth=dpr; ctx.stroke();

        const angle=this.shooterAngle,cannonLen=r*2.5-recoilOffset;
        const cx2=sx+Math.cos(angle)*cannonLen*0.3,cy2=sy+Math.sin(angle)*cannonLen*0.3;
        const ex=sx+Math.cos(angle)*cannonLen,ey=sy+Math.sin(angle)*cannonLen;
        ctx.beginPath();
        ctx.moveTo(cx2+Math.cos(angle+Math.PI/2)*r*0.4,cy2+Math.sin(angle+Math.PI/2)*r*0.4);
        ctx.lineTo(ex+Math.cos(angle+Math.PI/2)*r*0.25,ey+Math.sin(angle+Math.PI/2)*r*0.25);
        ctx.lineTo(ex+Math.cos(angle-Math.PI/2)*r*0.25,ey+Math.sin(angle-Math.PI/2)*r*0.25);
        ctx.lineTo(cx2+Math.cos(angle-Math.PI/2)*r*0.4,cy2+Math.sin(angle-Math.PI/2)*r*0.4);
        ctx.closePath(); ctx.fillStyle='#3a3a6a'; ctx.fill();
        ctx.strokeStyle='rgba(150,150,255,0.3)'; ctx.lineWidth=dpr; ctx.stroke();

        const color=this.COLORS[this.currentBubble];
        if (color) {
            if (this.colorChangeFlash>0) {
                const flashAlpha=this.colorChangeFlash/20;
                const flashR=r*(1.0+(1-flashAlpha)*0.8);
                ctx.beginPath(); ctx.arc(sx,sy,flashR,0,Math.PI*2);
                ctx.strokeStyle=color.hex; ctx.globalAlpha=flashAlpha*0.8;
                ctx.lineWidth=4*dpr; ctx.stroke(); ctx.globalAlpha=1;
                this.colorChangeFlash--;
            }
            const spinScale=this.colorChangeAnim>0.1?0.8+0.2*(1-this.colorChangeAnim):1;
            ctx.save(); ctx.translate(sx,sy); ctx.scale(spinScale,spinScale); ctx.translate(-sx,-sy);
            ctx.beginPath(); ctx.arc(sx,sy,r*0.9,0,Math.PI*2);
            const bGrad=ctx.createRadialGradient(sx-r*0.2,sy-r*0.2,r*0.1,sx,sy,r*0.9);
            bGrad.addColorStop(0,color.light); bGrad.addColorStop(0.6,color.hex); bGrad.addColorStop(1,color.dark);
            ctx.fillStyle=bGrad; ctx.fill();
            ctx.beginPath(); ctx.arc(sx-r*0.2,sy-r*0.3,r*0.25,0,Math.PI*2);
            ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.fill();
            ctx.restore();
        }

        this._drawColorChangeButton(ctx,sx,sy,r);

        const nextColor=this.COLORS[this.nextBubble];
        if (nextColor) {
            const nx=sx-r*2.8,ny=sy,nr=r*0.55;
            ctx.beginPath(); ctx.arc(nx,ny,nr,0,Math.PI*2);
            const nGrad=ctx.createRadialGradient(nx-nr*0.2,ny-nr*0.2,nr*0.1,nx,ny,nr);
            nGrad.addColorStop(0,nextColor.light); nGrad.addColorStop(1,nextColor.dark);
            ctx.fillStyle=nGrad; ctx.fill();
            this._drawCrispText(ctx,'NEXT',this.shooterX-this.BUBBLE_R*2.8,this.shooterY-this.BUBBLE_R*0.55-4,{size:9,color:'rgba(255,255,255,0.5)'});
            this._drawCrispText(ctx,'SWAP',this.shooterX-this.BUBBLE_R*2.8,this.shooterY+this.BUBBLE_R*0.55+10,{size:7,color:'rgba(255,255,255,0.25)'});
        }
    }

    _drawColorChangeButton(ctx,sx,sy,r) {
        const dpr=this.DPR;
        const btnX=sx+r*2.8,btnY=sy,btnR=r*0.65;
        const hasCharges=this.colorChangesLeft>0,onCooldown=this.colorChangeCooldown>0;
        this._colorChangeBtnX=btnX/dpr; this._colorChangeBtnY=btnY/dpr; this._colorChangeBtnR=btnR/dpr;

        if (hasCharges&&!onCooldown) {
            const pulse=0.5+0.5*Math.sin(this.globalTime*4);
            ctx.beginPath(); ctx.arc(btnX,btnY,btnR*1.4,0,Math.PI*2);
            ctx.fillStyle=`rgba(212,112,255,${0.08+pulse*0.1})`; ctx.fill();
        }
        const btnAlpha=hasCharges&&!onCooldown?1:0.4;
        ctx.globalAlpha=btnAlpha;
        ctx.beginPath(); ctx.arc(btnX,btnY,btnR,0,Math.PI*2);
        const btnGrad=ctx.createRadialGradient(btnX-btnR*0.2,btnY-btnR*0.2,0,btnX,btnY,btnR);
        if (hasCharges&&!onCooldown){btnGrad.addColorStop(0,'#cc44ff');btnGrad.addColorStop(1,'#7700aa');}
        else{btnGrad.addColorStop(0,'#444');btnGrad.addColorStop(1,'#222');}
        ctx.fillStyle=btnGrad; ctx.fill();
        ctx.strokeStyle=hasCharges&&!onCooldown?'rgba(212,112,255,0.8)':'rgba(100,100,100,0.4)';
        ctx.lineWidth=1.5*dpr; ctx.stroke();
        ctx.globalAlpha=1;

        if (onCooldown&&hasCharges) {
            const progress=this.colorChangeCooldown/30;
            ctx.beginPath(); ctx.arc(btnX,btnY,btnR*0.85,-Math.PI/2,-Math.PI/2+(1-progress)*Math.PI*2);
            ctx.strokeStyle='rgba(212,112,255,0.5)'; ctx.lineWidth=3*dpr; ctx.stroke();
        }
        ctx.font=`${Math.round(btnR*0.8)}px sans-serif`;
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.globalAlpha=btnAlpha; ctx.fillStyle='#fff';
        ctx.fillText('🎨',btnX,btnY+btnR*0.05);
        ctx.globalAlpha=1; ctx.textBaseline='alphabetic';

        ctx.globalAlpha=1;
        this._drawCrispText(ctx,`${this.colorChangesLeft}`,this._colorChangeBtnX,this._colorChangeBtnY-this._colorChangeBtnR-4,{size:9,weight:'bold',color:hasCharges?'#FFD700':'#888'});
        this._drawCrispText(ctx,'CHANGE',this._colorChangeBtnX,this._colorChangeBtnY+this._colorChangeBtnR+10,{size:7,color:hasCharges?'rgba(212,112,255,0.7)':'rgba(100,100,100,0.5)'});
    }

    // ══════════════════ AIM LINE DRAW — FULL FIX ══════════════════
    // Draws complete dotted aim line with bounce reflection

    _drawAimLine(ctx) {
        if (this.aimDots.length === 0) return;
        const dpr = this.DPR;
        const color = this.COLORS[this.currentBubble];
        const baseColor = color ? color.hex : '#ffffff';

        // Draw connecting lines between dots for clarity
        ctx.save();
        ctx.setLineDash([4 * dpr, 8 * dpr]);
        ctx.lineWidth   = 1.5 * dpr;
        ctx.strokeStyle = `rgba(255,255,255,0.18)`;
        ctx.beginPath();
        ctx.moveTo(this.shooterX * dpr, this.shooterY * dpr);
        for (const dot of this.aimDots) {
            ctx.lineTo(dot.x * dpr, dot.y * dpr);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Draw individual dots on top
        for (let i = 0; i < this.aimDots.length; i++) {
            const dot   = this.aimDots[i];
            const pulse = 0.6 + 0.4 * Math.sin(this.globalTime * 5 + i * 0.6);
            const alpha = dot.alpha * pulse;

            if (dot.isFinal) {
                // Draw crosshair / target at final landing point
                const cr = 5 * dpr;
                ctx.save();
                ctx.globalAlpha  = Math.min(1, alpha * 1.4);
                ctx.strokeStyle  = baseColor;
                ctx.lineWidth    = 2 * dpr;
                // Outer circle
                ctx.beginPath();
                ctx.arc(dot.x * dpr, dot.y * dpr, cr, 0, Math.PI * 2);
                ctx.stroke();
                // Cross lines
                ctx.beginPath();
                ctx.moveTo((dot.x - cr * 1.5) * dpr, dot.y * dpr);
                ctx.lineTo((dot.x + cr * 1.5) * dpr, dot.y * dpr);
                ctx.moveTo(dot.x * dpr, (dot.y - cr * 1.5) * dpr);
                ctx.lineTo(dot.x * dpr, (dot.y + cr * 1.5) * dpr);
                ctx.stroke();
                ctx.restore();
            } else {
                // Regular dot
                const dotR = (2.5 + i * 0.08) * dpr;
                ctx.save();
                ctx.globalAlpha = alpha * 0.75;
                // Colored glow dot
                ctx.shadowColor = baseColor;
                ctx.shadowBlur  = this.isMobile ? 0 : 6 * dpr;
                ctx.fillStyle   = baseColor;
                ctx.beginPath();
                ctx.arc(dot.x * dpr, dot.y * dpr, dotR, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur  = 0;
                // White center
                ctx.globalAlpha = alpha * 0.5;
                ctx.fillStyle   = '#ffffff';
                ctx.beginPath();
                ctx.arc(dot.x * dpr, dot.y * dpr, dotR * 0.45, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
    }

    _drawProjectile(ctx) {
        const p=this.projectile;
        if (!p) return;
        const dpr=this.DPR;
        for (let i=0;i<p.trail.length;i++) {
            const t=p.trail[i],alpha=(i/p.trail.length)*0.25;
            const color=this.COLORS[p.color];
            ctx.globalAlpha=alpha;
            ctx.beginPath(); ctx.arc(t.x*dpr,t.y*dpr,p.r*0.5*dpr*(i/p.trail.length),0,Math.PI*2);
            ctx.fillStyle=color?color.hex:'#fff'; ctx.fill();
            ctx.globalAlpha=1;
        }
                this._drawBubble(ctx,p.x,p.y,p.color,p.r);
    }

    _drawParticles(ctx) {
        const dpr=this.DPR;
        for (const ring of this.popRings) {
            ctx.beginPath(); ctx.arc(ring.x*dpr,ring.y*dpr,ring.r*dpr,0,Math.PI*2);
            ctx.strokeStyle=ring.color; ctx.globalAlpha=ring.life*0.5;
            ctx.lineWidth=2*dpr*ring.life; ctx.stroke(); ctx.globalAlpha=1;
        }
        for (const p of this.particles) {
            ctx.beginPath(); ctx.arc(p.x*dpr,p.y*dpr,p.r*dpr*p.life,0,Math.PI*2);
            ctx.fillStyle=p.color; ctx.globalAlpha=p.life; ctx.fill(); ctx.globalAlpha=1;
        }
        for (const fb of this.fallingBubbles) {
            ctx.globalAlpha=fb.life;
            ctx.beginPath(); ctx.arc(fb.x*dpr,fb.y*dpr,fb.r*dpr*fb.life,0,Math.PI*2);
            const fGrad=ctx.createRadialGradient(fb.x*dpr,fb.y*dpr,0,fb.x*dpr,fb.y*dpr,fb.r*dpr*fb.life);
            fGrad.addColorStop(0,fb.color.light); fGrad.addColorStop(1,fb.color.dark);
            ctx.fillStyle=fGrad; ctx.fill(); ctx.globalAlpha=1;
        }
        for (const tp of this.textPopups) {
            ctx.globalAlpha=tp.life;
            ctx.shadowColor=tp.color;
            if (!this.isMobile) ctx.shadowBlur=8*this.textDPR;
            this._drawCrispText(ctx,tp.text,tp.x,tp.y,{size:16,weight:'bold',color:tp.color,opacity:tp.life});
            ctx.shadowBlur=0; ctx.globalAlpha=1;
        }
    }

    _drawHUD(ctx) {
        const w=this.cW,hudH=this.HUD_H*this.DPR;
        const hudGrad=ctx.createLinearGradient(0,0,0,hudH);
        hudGrad.addColorStop(0,'rgba(10,10,30,0.97)'); hudGrad.addColorStop(1,'rgba(10,10,30,0.8)');
        ctx.fillStyle=hudGrad; ctx.fillRect(0,0,w,hudH);
        ctx.strokeStyle='rgba(100,100,200,0.3)'; ctx.lineWidth=this.DPR;
        ctx.beginPath(); ctx.moveTo(0,hudH); ctx.lineTo(w,hudH); ctx.stroke();

        this._drawCrispText(ctx,`LVL ${this.currentLevel+1}`,10,this.HUD_H*0.62,{size:13,weight:'bold',color:'#FFD700',align:'left',baseline:'middle'});
        this._drawCrispText(ctx,`${this.score}`,this.W/2,this.HUD_H*0.62,{size:16,weight:'bold',color:'#fff',align:'center',baseline:'middle'});
        this._drawCrispText(ctx,'SCORE',this.W/2,this.HUD_H*0.25,{size:9,color:'rgba(255,255,255,0.4)',align:'center',baseline:'middle'});
        this._drawCrispText(ctx,`Moves: ${this.moves}`,this.W-10,this.HUD_H*0.45,{size:12,weight:'bold',color:'#00EEFF',align:'right',baseline:'middle'});
        const mins=Math.floor(this.timeElapsed/60),secs=this.timeElapsed%60;
        this._drawCrispText(ctx,`${mins}:${secs.toString().padStart(2,'0')}`,this.W-10,this.HUD_H*0.78,{size:10,color:'rgba(255,255,255,0.5)',align:'right',baseline:'middle'});

        if (this.combo>=2) {
            const comboAlpha=0.6+0.4*Math.sin(this.globalTime*6);
            this._drawCrispText(ctx,`🔥 ${this.combo}x COMBO`,10,this.HUD_H*0.88,{size:11,weight:'bold',color:`rgba(255,215,0,${comboAlpha})`,align:'left',baseline:'middle'});
        }
    }

    _roundRect(ctx,x,y,w,h,r,fill,stroke) {
        ctx.beginPath();
        ctx.moveTo(x+r,y);
        ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
        ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
        ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
        ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    _drawGameOver(ctx) {
        const w=this.cW,h=this.cH;
        ctx.fillStyle='rgba(0,0,0,0.72)'; ctx.fillRect(0,0,w,h);
        const cx=w/2,cy=h/2,dpr=this.DPR;
        const boxW=Math.min(300*dpr,w*0.85),boxH=230*dpr;
        const bx=cx-boxW/2,by=cy-boxH/2;
        ctx.fillStyle='#1a1a3a'; ctx.strokeStyle='#FF2244'; ctx.lineWidth=2*dpr;
        this._roundRect(ctx,bx,by,boxW,boxH,15*dpr,true,true);

        this._drawCrispText(ctx,'GAME OVER',this.W/2,this.H/2-boxH/(2*dpr)+50,{size:26,weight:'bold',color:'#FF2244',glow:!this.isMobile,glowColor:'#FF2244',glowBlur:15,stroke:true,strokeColor:'rgba(0,0,0,0.6)',strokeWidth:3});
        this._drawCrispText(ctx,`Score: ${this.score}`,this.W/2,this.H/2-boxH/(2*dpr)+92,{size:15,color:'#fff'});
        this._drawCrispText(ctx,`Moves: ${this.moves}  |  Popped: ${this.bubblesPopped}`,this.W/2,this.H/2-boxH/(2*dpr)+120,{size:12,color:'#aaa'});

        const btnW=140*dpr,btnH=40*dpr;
        const btnX=cx-btnW/2,btnY=by+155*dpr;
        this._retryBtn={x:btnX/dpr,y:btnY/dpr,w:btnW/dpr,h:btnH/dpr};
        ctx.fillStyle='#FF2244';
        this._roundRect(ctx,btnX,btnY,btnW,btnH,8*dpr,true,false);
        this._drawCrispText(ctx,'RETRY',this.W/2,btnY/dpr+btnH/(2*dpr),{size:15,weight:'bold',color:'#fff',baseline:'middle'});
    }

    _drawLevelComplete(ctx) {
        const dpr=this.DPR,w=this.cW,h=this.cH;
        this.levelCompleteTimer+=0.016;
        const t=Math.min(this.levelCompleteTimer/0.5,1);
        ctx.fillStyle=`rgba(0,0,0,${0.72*t})`; ctx.fillRect(0,0,w,h);
        if (t<0.3) return;
        const cx=w/2,cy=h/2,scale=Math.min(t*1.5,1);
        ctx.save(); ctx.translate(cx,cy); ctx.scale(scale,scale); ctx.translate(-cx,-cy);
        const boxW=Math.min(320*dpr,w*0.88),boxH=285*dpr;
        const bx=cx-boxW/2,by=cy-boxH/2;
        const boxGrad=ctx.createLinearGradient(bx,by,bx,by+boxH);
        boxGrad.addColorStop(0,'#1a1a4a'); boxGrad.addColorStop(1,'#0a0a2a');
        ctx.fillStyle=boxGrad; ctx.strokeStyle='#FFD700'; ctx.lineWidth=2*dpr;
        this._roundRect(ctx,bx,by,boxW,boxH,15*dpr,true,true);

                this._drawCrispText(ctx,'LEVEL COMPLETE!',this.W/2,by/dpr+44,{size:24,weight:'bold',color:'#FFD700',glow:!this.isMobile,glowColor:'#FFD700',glowBlur:15});
        const starY=by/dpr+82;
        for (let i=0;i<3;i++) {
            const starX=this.W/2+(i-1)*44;
            this._drawCrispText(ctx,'★',starX,starY,{size:28,color:i<this.starRating?'#FFD700':'#333'});
        }
        this._drawCrispText(ctx,`Score: ${this.score}`,this.W/2,by/dpr+130,{size:14,color:'#fff'});
        this._drawCrispText(ctx,`Moves: ${this.moves}  |  Popped: ${this.bubblesPopped}`,this.W/2,by/dpr+155,{size:11,color:'#aaa'});
        this._drawCrispText(ctx,`Max Combo: ${this.maxCombo}x`,this.W/2,by/dpr+174,{size:11,color:'#aaa'});

        const btnW=160*dpr,btnH=42*dpr;
        const btnX=cx-btnW/2,btnY=by+210*dpr;
        const btnGrad=ctx.createLinearGradient(btnX,btnY,btnX,btnY+btnH);
        btnGrad.addColorStop(0,'#00CC55'); btnGrad.addColorStop(1,'#008833');
        ctx.fillStyle=btnGrad;
        this._roundRect(ctx,btnX,btnY,btnW,btnH,8*dpr,true,false);
        this._drawCrispText(ctx,'NEXT LEVEL ▶',this.W/2,(by+210*dpr)/dpr+btnH/(2*dpr),{size:15,weight:'bold',color:'#fff',baseline:'middle'});
        ctx.restore();
        this._nextLevelBtn={x:(cx-btnW/2)/dpr,y:(by+210*dpr)/dpr,w:btnW/dpr,h:btnH/dpr};
    }

    // ══════════════════ MAIN LOOP ══════════════════

    _mainLoop(timestamp=0) {
        if (this._destroyed) return;
        const dt=timestamp-this._lastFrameTime;
        this._lastFrameTime=timestamp;
        if (dt>0){
            this.fpsHistory.push(1000/dt);
            if (this.fpsHistory.length>30) this.fpsHistory.shift();
        }
        if (timestamp-this.lastFpsCheck>2000) {
            this.lastFpsCheck=timestamp;
            if (this.fpsHistory.length>10) {
                const avgFps=this.fpsHistory.reduce((a,b)=>a+b,0)/this.fpsHistory.length;
                this.adaptiveMode=avgFps<35;
            }
        }
        this.globalTime+=0.016;
        this.frame++;
        this._update();
        this._render();
        this.animationFrameId=requestAnimationFrame(t=>this._mainLoop(t));
    }

    _update() {
        const angleDiff=this.targetAngle-this.shooterAngle;
        this.shooterAngle+=angleDiff*0.2;
        this._updateAimDots();
        this._updateProjectile();
        if (this.shootCooldown>0)       this.shootCooldown--;
        if (this.colorChangeCooldown>0) this.colorChangeCooldown--;
        if (this.shootRecoil>0)  { this.shootRecoil*=0.85;  if (this.shootRecoil<0.01)  this.shootRecoil=0;  }
        if (this.swapAnim>0)     { this.swapAnim*=0.9;      if (this.swapAnim<0.01)      this.swapAnim=0;     }
        if (this.colorChangeAnim>0) { this.colorChangeAnim*=0.85; if (this.colorChangeAnim<0.01) this.colorChangeAnim=0; }
        if (this.shakeTimer>0) {
            this.shakeTimer--;
            this.shakeX=(Math.random()-0.5)*this.shakeForce;
            this.shakeY=(Math.random()-0.5)*this.shakeForce;
            this.shakeForce*=0.85;
        } else {
            this.shakeX=0;
            this.shakeY=0;
        }
        this._updateParticles();
    }

    _render() {
        const ctx=this.ctx, dpr=this.DPR;
        ctx.save();
        if (this.shakeX||this.shakeY) ctx.translate(this.shakeX*dpr, this.shakeY*dpr);
        this._drawBackground(ctx);

        // Deadline danger line
        ctx.save();
        ctx.setLineDash([8*dpr, 6*dpr]);
        ctx.strokeStyle='rgba(255,50,50,0.22)';
        ctx.lineWidth=dpr;
        ctx.beginPath();
        ctx.moveTo(0, this.deadlineY*dpr);
        ctx.lineTo(this.cW, this.deadlineY*dpr);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        this._drawGrid(ctx);
        this._drawAimLine(ctx);
        this._drawProjectile(ctx);
        this._drawParticles(ctx);
        this._drawShooter(ctx);
        this._drawHUD(ctx);
        ctx.restore();

        if (this.gameOver)          this._drawGameOver(ctx);
        if (this.showLevelComplete) this._drawLevelComplete(ctx);
    }

    // ══════════════════ INPUT ══════════════════

    _getCanvasPos(e) {
        const rect=this.canvas.getBoundingClientRect();
        let clientX, clientY;
        if (e.changedTouches&&e.changedTouches.length>0) {
            clientX=e.changedTouches[0].clientX;
            clientY=e.changedTouches[0].clientY;
        } else if (e.touches&&e.touches.length>0) {
            clientX=e.touches[0].clientX;
            clientY=e.touches[0].clientY;
        } else {
            clientX=e.clientX;
            clientY=e.clientY;
        }
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    _onHandleClick(e) {
        e.preventDefault();
        const pos=this._getCanvasPos(e);
        const x=pos.x, y=pos.y;

        // Game over retry button
        if (this.gameOver && this._retryBtn) {
            const b=this._retryBtn;
            if (x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h) {
                this._startLevel(this.currentLevel);
                return;
            }
        }

        // Level complete next button
        if (this.showLevelComplete && this._nextLevelBtn) {
            const b=this._nextLevelBtn;
            if (x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h) {
                this._startLevel(this.currentLevel+1);
                return;
            }
        }

        if (this.gameOver || this.gameWon) return;

        // Color change button
        if (this._colorChangeBtnX !== undefined) {
            const dx=x-this._colorChangeBtnX, dy=y-this._colorChangeBtnY;
            if (Math.sqrt(dx*dx+dy*dy) <= this._colorChangeBtnR*1.3) {
                this._changeCurrentBubbleColor();
                return;
            }
        }

        // Tap shooter bubble = color change
        const shooterDx=x-this.shooterX, shooterDy=y-this.shooterY;
        if (Math.sqrt(shooterDx*shooterDx+shooterDy*shooterDy) <= this.BUBBLE_R*1.2) {
            this._changeCurrentBubbleColor();
            return;
        }

        // Tap next bubble = swap
        const nxDist=Math.abs(x-(this.shooterX-this.BUBBLE_R*2.8));
        const nyDist=Math.abs(y-this.shooterY);
        if (nxDist < this.BUBBLE_R*1.5 && nyDist < this.BUBBLE_R*1.5) {
            this._swapBubbles();
            return;
        }

        // Tap play area = aim + shoot
        if (y > this.HUD_H && y < this.shooterY - this.BUBBLE_R*0.5) {
            const dx=x-this.shooterX, dy=y-this.shooterY;
            let angle=Math.atan2(dy, dx);
            if (angle > -0.15)           angle = -0.15;
            if (angle < -Math.PI + 0.15) angle = -Math.PI + 0.15;
            this.shooterAngle = angle;
            this.targetAngle  = angle;
            this._updateAimDots();
            this._shoot();
        }
    }

    _onHandleMove(e) {
        e.preventDefault();
        if (this.gameOver || this.gameWon) return;
        const pos=this._getCanvasPos(e);
        const x=pos.x, y=pos.y;
        if (y < this.shooterY - 10) {
            const dx=x-this.shooterX, dy=y-this.shooterY;
            let angle=Math.atan2(dy, dx);
            if (angle > -0.15)           angle = -0.15;
            if (angle < -Math.PI + 0.15) angle = -Math.PI + 0.15;
            this.targetAngle = angle;
        }
        this.hoverX = x;
        this.hoverY = y;
    }

    _onKey(e) {
        if (this.gameOver || this.gameWon) {
            if (e.key==='Enter' || e.key===' ') {
                if (this.gameOver) this._startLevel(this.currentLevel);
                if (this.gameWon)  this._startLevel(this.currentLevel+1);
            }
            return;
        }
        switch(e.key) {
            case 'ArrowLeft':
                this.targetAngle = Math.max(this.targetAngle - 0.05, -Math.PI + 0.15);
                break;
            case 'ArrowRight':
                this.targetAngle = Math.min(this.targetAngle + 0.05, -0.15);
                break;
            case ' ':
            case 'ArrowUp':
                e.preventDefault();
                this._shoot();
                break;
            case 's':
            case 'S':
                this._swapBubbles();
                break;
            case 'c':
            case 'C':
                this._changeCurrentBubbleColor();
                break;
            case 'r':
            case 'R':
                this._startLevel(this.currentLevel);
                break;
        }
    }

    _onResize() {
        this._setupCanvas();
        this._bubbleCache.clear();
        this._glowCache.clear();
    }
}