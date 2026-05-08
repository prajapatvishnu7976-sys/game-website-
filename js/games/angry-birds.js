window.initAngryBirds = function (canvas) {
    'use strict';

    // ═══════════════════════════════════════════
    // ROTATE SCREEN OVERLAY — SCOPED TO THIS GAME ONLY
    // ═══════════════════════════════════════════
    let rotateOverlay = null;
    let gameStarted = false;
    let orientationCheckBound = null;

    function createRotateOverlay() {
        if (rotateOverlay) return;
        rotateOverlay = document.createElement('div');
        rotateOverlay.id = 'ab-rotate-overlay-' + Date.now();
        rotateOverlay.style.cssText = `
            position: fixed;
            top: 0; left: 0;
            width: 100%; height: 100%;
            background: rgba(0,0,0,0.92);
            z-index: 99999;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Rajdhani', Arial, sans-serif;
        `;
        rotateOverlay.innerHTML = `
            <div style="
                background: rgba(20,30,60,0.95);
                border: 2px solid #FFD700;
                border-radius: 20px;
                padding: 40px 30px;
                text-align: center;
                max-width: 320px;
            ">
                <div style="
                    font-size: 72px;
                    margin-bottom: 20px;
                    display: inline-block;
                    animation: abRotateAnim_${rotateOverlay.id} 1.8s ease-in-out infinite;
                ">📱</div>
                <div style="
                    font-size: 22px;
                    font-weight: bold;
                    color: #FFE040;
                    margin-bottom: 10px;
                    letter-spacing: 1px;
                ">ROTATE YOUR PHONE</div>
                <div style="
                    font-size: 14px;
                    color: #AAEEFF;
                    margin-bottom: 8px;
                ">For the best Angry Birds experience</div>
                <div style="
                    font-size: 13px;
                    color: rgba(255,255,255,0.5);
                ">Please rotate to landscape mode 🔄</div>
            </div>
            <style>
                @keyframes abRotateAnim_${rotateOverlay.id} {
                    0%   { transform: rotate(0deg);   }
                    30%  { transform: rotate(0deg);   }
                    60%  { transform: rotate(-90deg); }
                    90%  { transform: rotate(-90deg); }
                    100% { transform: rotate(0deg);   }
                }
            </style>
        `;
        document.body.appendChild(rotateOverlay);
    }

    function removeRotateOverlay() {
        if (rotateOverlay && rotateOverlay.parentNode) {
            rotateOverlay.parentNode.removeChild(rotateOverlay);
        }
        rotateOverlay = null;
    }

    function isPortrait() {
        if (screen.orientation && screen.orientation.type) {
            return screen.orientation.type.includes('portrait');
        }
        return window.innerHeight > window.innerWidth;
    }

    function checkOrientation() {
        // Agar game destroy ho chuka hai toh kuch mat karo
        if (destroyed) {
            removeRotateOverlay();
            return;
        }
        if (isPortrait()) {
            createRotateOverlay();
            gameStarted = false;
        } else {
            removeRotateOverlay();
            if (!gameStarted) {
                gameStarted = true;
                resize();
                loadLevel(1);
            } else {
                resize();
            }
        }
    }

    // Bound function store karo taaki destroy pe remove kar sakein
    orientationCheckBound = () => setTimeout(checkOrientation, 300);

    window.addEventListener('orientationchange', orientationCheckBound);
    window.addEventListener('resize', orientationCheckBound);

    const ctx = canvas.getContext('2d', { alpha: false });
    const isMobile = ('ontouchstart' in window) || window.innerWidth < 768;
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 2.5);

    let W, H, GROUND;
    let destroyed = false;

    const ST = { INTRO: 0, READY: 1, AIM: 2, FLY: 3, SETTLE: 4, WIN: 5, LOSE: 6, LAUNCH_ANIM: 7 };
    let state = ST.INTRO;
    let score = 0;
    let totalScore = 0;
    let level = 1;
    const MAX_LEVEL = 8;

    // ═══════════════════════════════════════════
    // SOUND ENGINE
    // ═══════════════════════════════════════════
    let audioCtx = null;

    function getAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function playTone(freq, type, duration, vol, attack, decay, startFreq) {
        const ac = getAudio(); if (!ac) return;
        try {
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.connect(gain); gain.connect(ac.destination);
            osc.type = type || 'sine';
            const now = ac.currentTime;
            if (startFreq) {
                osc.frequency.setValueAtTime(startFreq, now);
                osc.frequency.exponentialRampToValueAtTime(freq, now + (attack || 0.02));
            } else {
                osc.frequency.setValueAtTime(freq, now);
            }
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(vol || 0.3, now + (attack || 0.02));
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            osc.start(now);
            osc.stop(now + duration + (decay || 0));
        } catch(e) {}
    }

    function playNoise(duration, vol, filterFreq) {
        const ac = getAudio(); if (!ac) return;
        try {
            const bufSize = Math.floor(ac.sampleRate * duration);
            const buf = ac.createBuffer(1, bufSize, ac.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
            const src = ac.createBufferSource();
            src.buffer = buf;
            const gain = ac.createGain();
            const filter = ac.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = filterFreq || 800;
            filter.Q.value = 0.8;
            src.connect(filter); filter.connect(gain); gain.connect(ac.destination);
            const now = ac.currentTime;
            gain.gain.setValueAtTime(vol || 0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            src.start(now); src.stop(now + duration);
        } catch(e) {}
    }

    const SFX = {
        slingPull() { playTone(80 + Math.hypot(pullX, pullY) * 2, 'sawtooth', 0.08, 0.06, 0.01); },
        launch() { playTone(400, 'sine', 0.25, 0.25, 0.01, 0.05, 900); playNoise(0.18, 0.15, 600); },
        whoosh() { playTone(200, 'sine', 0.12, 0.08, 0.01, 0.05, 350); },
        hitWood() { playTone(180, 'sawtooth', 0.18, 0.3, 0.005, 0.02, 280); playNoise(0.15, 0.2, 400); },
        hitStone() { playTone(100, 'square', 0.22, 0.35, 0.005, 0.03, 150); playNoise(0.2, 0.25, 300); },
        hitGlass() { playTone(1200, 'sine', 0.15, 0.2, 0.002, 0.02, 1600); playTone(900, 'sine', 0.12, 0.15, 0.002, 0.02); },
        hitMetal() { playTone(280, 'square', 0.3, 0.4, 0.002, 0.04, 500); playTone(140, 'sawtooth', 0.25, 0.3, 0.005, 0.03); },
        pigHit() { playTone(600, 'sine', 0.2, 0.25, 0.01, 0.05, 400); playTone(500, 'sine', 0.15, 0.15, 0.02, 0.05, 700); },
        pigDie() { playTone(800, 'sine', 0.12, 0.3, 0.005, 0.02, 500); playTone(400, 'sine', 0.25, 0.2, 0.01, 0.05, 600); playNoise(0.2, 0.25, 1000); },
        explosion() { playNoise(0.5, 0.6, 150); playTone(60, 'sawtooth', 0.5, 0.5, 0.005, 0.1, 120); playTone(40, 'sine', 0.6, 0.4, 0.01, 0.15, 80); },
        birdLand() { playNoise(0.12, 0.2, 350); playTone(150, 'sine', 0.1, 0.2, 0.005, 0.02, 200); },
        win() { const notes = [523, 659, 784, 1047]; notes.forEach((f, i) => { setTimeout(() => playTone(f, 'sine', 0.35, 0.3, 0.02, 0.05), i * 120); }); },
        lose() { playTone(400, 'sawtooth', 0.4, 0.3, 0.02, 0.1, 600); setTimeout(() => playTone(250, 'sawtooth', 0.5, 0.3, 0.02, 0.1, 350), 200); setTimeout(() => playTone(150, 'sawtooth', 0.6, 0.3, 0.02, 0.15, 220), 450); },
        levelStart() { playTone(440, 'sine', 0.2, 0.2, 0.02, 0.04); setTimeout(() => playTone(550, 'sine', 0.2, 0.2, 0.02, 0.04), 150); setTimeout(() => playTone(660, 'sine', 0.3, 0.25, 0.02, 0.05), 300); },
        special() { playTone(900, 'sine', 0.2, 0.3, 0.01, 0.04, 600); playTone(1200, 'sine', 0.15, 0.2, 0.02, 0.04, 800); },
        snap() { playTone(300, 'sawtooth', 0.08, 0.2, 0.002, 0.02, 500); }
    };

    let camX = 0, targetCamX = 0;
    let shakeX = 0, shakeY = 0, shakeMag = 0;
    let SX = 0, SY = 0;
    let SF1X = 0, SF1Y = 0;
    let SF2X = 0, SF2Y = 0;
    let SEAT_X = 0, SEAT_Y = 0;

    let pullX = 0, pullY = 0, isPulling = false;
    let lastPullD = 0;
    const MAX_PULL = isMobile ? 85 : 75;
    const POWER = 0.28;
    const GRAVITY = 0.38;
    const BOUNCE  = 0.22;
    const FRIC    = 0.82;
    const AIR     = 0.998;

    let bird = null, birdQueue = [], splitBirds = [];
    let pigs = [], blocks = [];
    let particles = [], popTexts = [];
    let trajectory = [];
    let clouds = [], bgBirds = [];
    let settleTimer = 0, introTimer = 0;
    let winButtons = [], loseButtons = [], confetti = [];

    let launchAnim = {
        active: false, timer: 0, duration: 14,
        startX: 0, startY: 0, targetVX: 0, targetVY: 0,
        elasticPhase: 0, slingSnapBack: 0
    };

    let birdFlightTime = 0;

    const BIRDS = {
        red:    { id:'red',    r:16, body:'#EE3333', shine:'#FF8877', shadow:'#AA1111', type:'normal', feather:true  },
        blue:   { id:'blue',   r:11, body:'#2288FF', shine:'#88CCFF', shadow:'#0044BB', type:'split'                 },
        yellow: { id:'yellow', r:14, body:'#FFCC00', shine:'#FFE866', shadow:'#BB8800', type:'speed',  tri:true      },
        black:  { id:'black',  r:18, body:'#222222', shine:'#555555', shadow:'#000000', type:'bomb'                  },
        white:  { id:'white',  r:15, body:'#EEEEEE', shine:'#FFFFFF', shadow:'#AAAAAA', type:'egg',    feather:true  },
        big:    { id:'big',    r:22, body:'#FF6622', shine:'#FF9966', shadow:'#CC3300', type:'heavy',  feather:true  },
        green:  { id:'green',  r:13, body:'#44CC22', shine:'#88EE55', shadow:'#228811', type:'boomerang'             }
    };

    const MAT = {
        wood:     { top:'#F0C060', mid:'#D4903A', bot:'#8B5A14', edge:'#6B3A08', hp:4,  pts:50,  sfx:'hitWood'  },
        stone:    { top:'#AAAAAA', mid:'#888888', bot:'#555555', edge:'#333333', hp:9,  pts:100, sfx:'hitStone' },
        glass:    { top:'#CCFFFF', mid:'#88DDFF', bot:'#4499BB', edge:'#2277AA', hp:2,  pts:30,  sfx:'hitGlass' },
        ice:      { top:'#DDEEFF', mid:'#99CCEE', bot:'#5588AA', edge:'#336688', hp:3,  pts:40,  sfx:'hitGlass' },
        metal:    { top:'#DDDDDD', mid:'#AAAAAA', bot:'#777777', edge:'#555555', hp:12, pts:150, sfx:'hitMetal' },
        darkwood: { top:'#A07040', mid:'#7A5028', bot:'#4A2C10', edge:'#3A1C05', hp:6,  pts:70,  sfx:'hitWood'  }
    };

    const LEVELS = [
        {
            name: 'FIRST SHOT',
            birds: ['red','red','red'],
            stars: [1500, 4000, 7000],
            theme: { sky1:'#2E8BC0', sky2:'#A8DCF8', ground:'#5CC044', hill:'#8FBC8F' },
            build(gY) {
                const x1 = W * 0.52;
                addBlock(x1, gY, 22, 120, 'wood');
                addBlock(x1, gY - 120, 60, 14, 'wood');
                addPig(x1, gY - 120 - 14, 'small');
                const x2 = x1 + 120;
                addBlock(x2, gY, 18, 80, 'wood');
                addBlock(x2, gY - 80, 50, 13, 'wood');
                addPig(x2, gY - 80 - 13, 'small');
            }
        },
        {
            name: 'GLASS CAGE',
            birds: ['red', 'blue', 'red'],
            stars: [3000, 7000, 13000],
            theme: { sky1:'#1A6090', sky2:'#88C8F0', ground:'#4AAF32', hill:'#7AAF7A' },
            build(gY) {
                const x1 = W * 0.50;
                addBlock(x1 - 22, gY, 10, 100, 'glass');
                addBlock(x1 + 22, gY, 10, 100, 'glass');
                addBlock(x1, gY - 100, 64, 10, 'glass');
                addBlock(x1, gY - 110, 50, 12, 'wood');
                addPig(x1, gY - 100, 'medium');
                const x2 = x1 + 140;
                addBlock(x2, gY, 16, 130, 'wood');
                addBlock(x2, gY - 130, 55, 14, 'wood');
                addPig(x2, gY - 130 - 14, 'small');
                addPig(x2, gY - 130 - 40, 'small');
            }
        },
        {
            name: 'STONE AGE',
            birds: ['red', 'yellow', 'blue', 'red'],
            stars: [6000, 13000, 22000],
            theme: { sky1:'#1A4A7A', sky2:'#6899CC', ground:'#3A9F28', hill:'#5A8F5A' },
            build(gY) {
                const x1 = W * 0.50;
                addBlock(x1 - 25, gY, 14, 140, 'stone');
                addBlock(x1 + 25, gY, 14, 140, 'stone');
                addBlock(x1, gY - 140, 70, 18, 'stone');
                addPig(x1 - 15, gY - 140 - 18, 'small');
                addPig(x1 + 15, gY - 140 - 18, 'small');
                const x2 = x1 + 160;
                addBlock(x2, gY, 20, 90, 'wood');
                addBlock(x2, gY - 90, 60, 13, 'stone');
                addBlock(x2 - 16, gY - 103, 10, 50, 'glass');
                addBlock(x2 + 16, gY - 103, 10, 50, 'glass');
                addBlock(x2, gY - 153, 50, 12, 'wood');
                addPig(x2, gY - 90 - 13, 'medium');
                addPig(x2, gY - 153 - 12, 'small');
            }
        },
        {
            name: 'PIGGY CASTLE',
            birds: ['red', 'blue', 'yellow', 'black', 'red'],
            stars: [10000, 20000, 34000],
            theme: { sky1:'#0A2A50', sky2:'#4477AA', ground:'#2A8A18', hill:'#4A7A4A' },
            build(gY) {
                const cx = W * 0.54;
                addBlock(cx, gY, 170, 18, 'stone');
                [-55, -20, 20, 55].forEach((ox, i) => {
                    const h = [130, 160, 160, 130][i];
                    addBlock(cx + ox, gY - 18, 18, h, i % 2 === 0 ? 'stone' : 'darkwood');
                });
                addBlock(cx, gY - 18 - 130, 170, 16, 'stone');
                addPig(cx - 35, gY - 18 - 130 - 16, 'small');
                addPig(cx + 35, gY - 18 - 130 - 16, 'small');
                addBlock(cx - 22, gY - 18 - 130 - 16, 14, 80, 'darkwood');
                addBlock(cx + 22, gY - 18 - 130 - 16, 14, 80, 'darkwood');
                addBlock(cx, gY - 18 - 130 - 16 - 80, 70, 14, 'stone');
                addPig(cx, gY - 18 - 130 - 16 - 80 - 14, 'king');
                const ox = cx + 155;
                addBlock(ox, gY, 16, 100, 'wood');
                addBlock(ox, gY - 100, 50, 12, 'wood');
                addPig(ox, gY - 100 - 12, 'small');
            }
        },
        {
            name: 'ICE KINGDOM',
            birds: ['red', 'white', 'yellow', 'blue', 'black', 'red'],
            stars: [14000, 28000, 48000],
            theme: { sky1:'#0A1A3A', sky2:'#3A6A9A', ground:'#1A7A10', hill:'#2A6A2A' },
            build(gY) {
                const cx = W * 0.54;
                addBlock(cx - 45, gY, 16, 150, 'ice');
                addBlock(cx, gY, 16, 180, 'ice');
                addBlock(cx + 45, gY, 16, 150, 'ice');
                addBlock(cx - 22, gY - 150, 60, 14, 'ice');
                addBlock(cx + 22, gY - 150, 60, 14, 'ice');
                addBlock(cx, gY - 180, 110, 16, 'stone');
                addPig(cx - 30, gY - 150 - 14, 'small');
                addPig(cx + 30, gY - 150 - 14, 'small');
                addPig(cx, gY - 180 - 16, 'king');
                const lx = cx - 145;
                addBlock(lx, gY, 14, 110, 'stone');
                addBlock(lx, gY - 110, 55, 14, 'ice');
                addPig(lx, gY - 110 - 14, 'medium');
                const rx = cx + 145;
                addBlock(rx, gY, 14, 90, 'stone');
                addBlock(rx, gY - 90, 55, 14, 'ice');
                addPig(rx, gY - 90 - 14, 'small');
            }
        },
        {
            name: 'STEEL TOWER',
            birds: ['red', 'blue', 'black', 'yellow', 'white', 'black', 'red'],
            stars: [20000, 40000, 65000],
            theme: { sky1:'#060818', sky2:'#1A2A5A', ground:'#1A6A10', hill:'#2A5A2A' },
            build(gY) {
                const cx = W * 0.55;
                addBlock(cx, gY, 180, 22, 'metal');
                addBlock(cx - 60, gY - 22, 18, 85, 'metal');
                addBlock(cx - 28, gY - 22, 18, 85, 'stone');
                addBlock(cx - 44, gY - 107, 55, 16, 'metal');
                addPig(cx - 44, gY - 107 - 16, 'medium');
                addBlock(cx + 28, gY - 22, 18, 85, 'stone');
                addBlock(cx + 60, gY - 22, 18, 85, 'metal');
                addBlock(cx + 44, gY - 107, 55, 16, 'metal');
                addPig(cx + 44, gY - 107 - 16, 'medium');
                addBlock(cx, gY - 22, 20, 190, 'metal');
                addBlock(cx, gY - 212, 70, 18, 'stone');
                addPig(cx, gY - 212 - 18, 'king');
                addBlock(cx - 40, gY - 110, 12, 60, 'glass');
                addBlock(cx + 40, gY - 110, 12, 60, 'glass');
                addBlock(cx, gY - 170, 100, 14, 'metal');
                addPig(cx - 30, gY - 170 - 14, 'small');
                addPig(cx + 30, gY - 170 - 14, 'small');
            }
        },
        {
            name: 'ISLAND CHAIN',
            birds: ['red', 'blue', 'yellow', 'black', 'white', 'big', 'red', 'blue'],
            stars: [28000, 55000, 90000],
            theme: { sky1:'#020510', sky2:'#101840', ground:'#0A5808', hill:'#1A4A1A' },
            build(gY) {
                const i1 = W * 0.48;
                addBlock(i1, gY, 18, 110, 'wood');
                addBlock(i1, gY - 110, 58, 14, 'glass');
                addPig(i1, gY - 110 - 14, 'small');
                const i2 = i1 + 135;
                addBlock(i2 - 24, gY, 14, 150, 'stone');
                addBlock(i2 + 24, gY, 14, 150, 'stone');
                addBlock(i2, gY - 150, 72, 16, 'stone');
                addBlock(i2, gY - 166, 58, 14, 'darkwood');
                addPig(i2, gY - 166 - 14, 'king');
                addPig(i2 - 18, gY - 150 - 16, 'small');
                addPig(i2 + 18, gY - 150 - 16, 'small');
                const i3 = i2 + 145;
                addBlock(i3 - 18, gY, 12, 85, 'ice');
                addBlock(i3 + 18, gY, 12, 85, 'ice');
                addBlock(i3, gY - 85, 60, 12, 'ice');
                addBlock(i3 - 14, gY - 97, 10, 50, 'glass');
                addBlock(i3 + 14, gY - 97, 10, 50, 'glass');
                addBlock(i3, gY - 147, 50, 13, 'stone');
                addPig(i3, gY - 85 - 12, 'medium');
                addPig(i3, gY - 147 - 13, 'small');
            }
        },
        {
            name: 'PIG EMPEROR',
            birds: ['red', 'blue', 'yellow', 'black', 'white', 'big', 'black', 'green', 'red', 'blue'],
            stars: [40000, 80000, 130000],
            theme: { sky1:'#020208', sky2:'#0A0A28', ground:'#064404', hill:'#0A2A0A' },
            build(gY) {
                const cx = W * 0.56;
                addBlock(cx, gY, 240, 24, 'metal');
                [-90,-45,0,45,90].forEach((ox, i) => {
                    addBlock(cx + ox, gY - 24, 20, [160,190,210,190,160][i], ['metal','stone','metal','stone','metal'][i]);
                });
                addBlock(cx, gY - 24 - 160, 210, 18, 'metal');
                addPig(cx - 60, gY - 24 - 160 - 18, 'small');
                addPig(cx, gY - 24 - 160 - 18, 'medium');
                addPig(cx + 60, gY - 24 - 160 - 18, 'small');
                addBlock(cx - 40, gY - 24 - 160 - 18, 16, 90, 'stone');
                addBlock(cx + 40, gY - 24 - 160 - 18, 16, 90, 'stone');
                addBlock(cx, gY - 24 - 160 - 18 - 90, 110, 18, 'metal');
                addPig(cx - 28, gY - 24 - 160 - 18 - 90 - 18, 'medium');
                addPig(cx + 28, gY - 24 - 160 - 18 - 90 - 18, 'medium');
                addBlock(cx - 25, gY - 24 - 160 - 18 - 90 - 18, 14, 75, 'glass');
                addBlock(cx + 25, gY - 24 - 160 - 18 - 90 - 18, 14, 75, 'glass');
                addBlock(cx, gY - 24 - 160 - 18 - 90 - 18 - 75, 85, 16, 'stone');
                addPig(cx, gY - 24 - 160 - 18 - 90 - 18 - 75 - 16, 'emperor');
                const lt = cx - 170;
                addBlock(lt, gY, 18, 120, 'darkwood');
                addBlock(lt, gY - 120, 58, 14, 'darkwood');
                addPig(lt, gY - 120 - 14, 'small');
                addPig(lt, gY - 120 - 40, 'small');
                const rt = cx + 170;
                addBlock(rt, gY, 18, 105, 'metal');
                addBlock(rt, gY - 105, 58, 14, 'metal');
                addPig(rt, gY - 105 - 14, 'medium');
            }
        }
    ];

    // ═══════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════
    function addBlock(cx, groundY, w, h, matType) {
        const m = MAT[matType] || MAT.wood;
        blocks.push({ cx, cy: groundY - h/2, w, h, vx:0, vy:0, angle:0, va:0, hp:m.hp, maxHp:m.hp, mat:matType, dead:false, hit:0 });
    }

    function addPig(cx, groundY, type) {
        const S = { small:{r:14,hp:1,pts:500}, medium:{r:17,hp:2,pts:1000}, king:{r:21,hp:3,pts:2000}, emperor:{r:25,hp:5,pts:5000} };
        const s = S[type] || S.small;
        pigs.push({ cx, cy:groundY-s.r, vx:0, vy:0, r:s.r, hp:s.hp, maxHp:s.hp, type, pts:s.pts, dead:false, hit:0, blinkT:0, eyeOpen:true, wobble:0 });
    }

    function rng(a,b)  { return a + Math.random()*(b-a); }
    function rngI(a,b) { return Math.floor(rng(a,b+1)); }
    function lerp(a,b,t) { return a+(b-a)*t; }
    function clamp(v,lo,hi) { return Math.max(lo,Math.min(hi,v)); }
    function easeOutBack(t) { const c1=1.70158,c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }

    // ═══════════════════════════════════════════
    // RESIZE
    // ═══════════════════════════════════════════
    function resize() {
        const wrap = canvas.parentElement;
        if (!wrap) return;
        const r = wrap.getBoundingClientRect();
        W = r.width  || window.innerWidth;
        H = r.height || (window.innerHeight - 56);
        canvas.width  = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width  = W + 'px';
        canvas.style.height = H + 'px';
        GROUND = H * 0.78;
        SX = W * 0.17; SY = GROUND;
        SF1X = SX - 14; SF1Y = SY - 68;
        SF2X = SX + 14; SF2Y = SY - 68;
        SEAT_X = SX; SEAT_Y = SF1Y + 10;
    }

    // ═══════════════════════════════════════════
    // LOAD LEVEL
    // ═══════════════════════════════════════════
    function loadLevel(lvl) {
        level = Math.min(lvl, MAX_LEVEL);
        score = 0;
        bird=null; birdQueue=[]; splitBirds=[];
        pigs=[]; blocks=[];
        particles=[]; popTexts=[];
        trajectory=[];
        winButtons=[]; loseButtons=[]; confetti=[];
        camX=0; targetCamX=0;
        settleTimer=0; isPulling=false;
        pullX=0; pullY=0;
        launchAnim.active=false;
        birdFlightTime=0;
        lastPullD=0;

        const data = LEVELS[level-1];
        if (!data) return;
        data.birds.forEach(id => { if(BIRDS[id]) birdQueue.push({...BIRDS[id]}); });
        data.build(GROUND);

        clouds=[];
        for(let i=0;i<8;i++) clouds.push(makCloud(rng(0,W*1.8),rng(18,H*0.28)));
        bgBirds=[];
        for(let i=0;i<4;i++) bgBirds.push({x:rng(0,W*1.5),y:rng(35,H*0.22),sp:rng(0.15,0.5),wp:0,sz:rng(5,9)});

        state=ST.INTRO; introTimer=0;
        updateUI();
        setTimeout(() => SFX.levelStart(), 500);
    }

    function makCloud(x,y) {
        return {x,y,w:rng(70,160),h:rng(22,42),sp:rng(0.05,0.18),op:rng(0.55,0.88)};
    }

    function spawnBird() {
        if(birdQueue.length===0){bird=null;return;}
        const bd = birdQueue.shift();
        bird = {...bd, cx:SEAT_X, cy:SEAT_Y-bd.r, vx:0,vy:0, launched:false,dead:false, rot:0,specialUsed:false, explodeT:0,trail:[], scale:1,squash:1,stretch:1};
        pullX=0; pullY=0; isPulling=false;
        birdFlightTime=0;
    }

    function calcTrajectory() {
        trajectory=[];
        if(!bird) return;
        const startX=SEAT_X+camX+pullX, startY=SEAT_Y-bird.r+pullY;
        const vx0=-pullX*POWER, vy0=-pullY*POWER;
        let x=startX,y=startY,vx=vx0,vy=vy0;
        for(let i=0;i<55;i++){
            vy+=GRAVITY; x+=vx; y+=vy; vx*=AIR;
            if(y>GROUND+60) break;
            if(x>camX+W*2.8||x<camX-400) break;
            if(i%2===0) trajectory.push({x,y,t:i/55});
        }
    }

    function physicsTick() {
        if(bird && bird.launched && !bird.dead){
            bird.vy+=GRAVITY; bird.vx*=AIR;
            bird.cx+=bird.vx; bird.cy+=bird.vy;
            bird.rot=Math.atan2(bird.vy,bird.vx);
            birdFlightTime++;
            const spd=Math.hypot(bird.vx,bird.vy);
            bird.stretch=clamp(1+spd*0.012,1,1.35);
            bird.squash=clamp(1/bird.stretch,0.7,1);
            if(birdFlightTime%25===0) SFX.whoosh();
            const last=bird.trail[bird.trail.length-1];
            if(!last||Math.hypot(bird.cx-last.x,bird.cy-last.y)>12){
                bird.trail.push({x:bird.cx,y:bird.cy,a:1,sz:bird.r*0.5});
                if(bird.trail.length>40) bird.trail.shift();
            }
            bird.trail.forEach(t=>t.a-=0.025);
            if(bird.explodeT>0){bird.explodeT--;if(bird.explodeT===0){doBomb(bird.cx,bird.cy);bird.dead=true;}}
            if(bird.cy+bird.r>=GROUND){
                bird.cy=GROUND-bird.r;
                bird.vy*=-BOUNCE; bird.vx*=FRIC;
                spawnDust(bird.cx,GROUND,8);
                shakeScreen(4);
                SFX.birdLand();
                bird.squash=0.6; bird.stretch=1.4;
                if(Math.abs(bird.vy)<1.2&&Math.abs(bird.vx)<0.7) bird.dead=true;
            }
            if(bird.cx>camX+W*2.8||bird.cx<camX-400||bird.cy>H+120) bird.dead=true;
            hitWorld(bird);
        }
        splitBirds=splitBirds.filter(b=>!b.dead);
        splitBirds.forEach(b=>{
            if(b.isEgg){b.vy+=GRAVITY;b.cy+=b.vy;if(b.cy+10>=GROUND||b.dead){doBomb(b.cx,b.cy);b.dead=true;}return;}
            b.vy+=GRAVITY;b.vx*=AIR;b.cx+=b.vx;b.cy+=b.vy;
            b.rot=Math.atan2(b.vy,b.vx);
            if(b.cy+b.r>=GROUND){b.cy=GROUND-b.r;b.vy*=-BOUNCE;b.vx*=FRIC;if(Math.abs(b.vy)<1)b.dead=true;}
            if(b.cx>camX+W*2.8||b.cy>H+120) b.dead=true;
            hitWorld(b);
        });
        blocks.forEach(b=>{
            if(b.dead)return;
            b.vy+=GRAVITY*0.55;b.vx*=FRIC;
            b.cx+=b.vx;b.cy+=b.vy;
            b.angle=(b.angle||0)+(b.va||0);b.va=(b.va||0)*0.93;
            if(b.cy+b.h/2>=GROUND){
                b.cy=GROUND-b.h/2;b.vy*=-BOUNCE*0.4;
                b.vx*=FRIC;b.va*=0.5;
                if(Math.abs(b.vy)<0.5)b.vy=0;
            }
            b.hit=Math.max(0,b.hit-0.06);
        });
        for(let i=0;i<blocks.length;i++)
            for(let j=i+1;j<blocks.length;j++)
                settleBlocks(blocks[i],blocks[j]);
        pigs.forEach((p,idx)=>{
            if(p.dead)return;
            p.vy+=GRAVITY*0.5;p.vx*=FRIC;
            p.cx+=p.vx;p.cy+=p.vy;
            p.wobble*=0.90;
            if(p.cy+p.r>=GROUND){
                const spd=Math.abs(p.vy);
                p.cy=GROUND-p.r;p.vy*=-BOUNCE;p.vx*=FRIC;
                if(spd>8){damagePig(idx,Math.floor(spd*0.18));spawnDust(p.cx,GROUND,4);}
            }
            blocks.forEach(b=>{if(!b.dead)pigOnBlock(p,b);});
            p.hit=Math.max(0,p.hit-0.06);
            p.blinkT++;
            if(p.blinkT>95+rng(0,55)){p.eyeOpen=false;p.blinkT=0;}
            if(!p.eyeOpen&&p.blinkT>7)p.eyeOpen=true;
        });
    }

    let lastHitSfx = 0;

    function hitWorld(b) {
        const spd=Math.hypot(b.vx,b.vy);
        pigs.forEach((p,idx)=>{
            if(p.dead)return;
            const d=Math.hypot(b.cx-p.cx,b.cy-p.cy);
            if(d<b.r+p.r){
                const dmg=Math.max(1,Math.floor(spd*0.22));
                damagePig(idx,dmg);
                const nx=(p.cx-b.cx)/(d||1),ny=(p.cy-b.cy)/(d||1);
                p.vx+=nx*spd*0.55;p.vy+=ny*spd*0.55-3;p.wobble=18;
                b.vx*=0.3;b.vy*=0.3;
            }
        });
        blocks.forEach(bl=>{
            if(bl.dead)return;
            const hw=bl.w/2,hh=bl.h/2;
            const dx=b.cx-bl.cx,dy=b.cy-bl.cy;
            const cx2=clamp(dx,-hw,hw),cy2=clamp(dy,-hh,hh);
            const d=Math.hypot(dx-cx2,dy-cy2);
            if(d<b.r){
                const dmg=Math.max(1,Math.floor(spd*0.22));
                bl.hp-=dmg;bl.hit=1;
                bl.vx+=(dx/(d||1))*spd*0.35;
                bl.vy+=(dy/(d||1))*spd*0.35-1;
                bl.va=(bl.va||0)+(Math.random()-0.5)*0.05;
                b.vx*=0.45;b.vy*=0.45;
                burst(bl.cx,bl.cy,MAT[bl.mat].mid,4,1,4);
                shakeScreen(3);
                const now = Date.now();
                if(now-lastHitSfx>80 && spd>3){
                    lastHitSfx=now;
                    const sfxName = MAT[bl.mat]?.sfx || 'hitWood';
                    if(SFX[sfxName]) SFX[sfxName]();
                }
                if(bl.hp<=0) killBlock(bl);
            }
        });
    }

    function settleBlocks(a,b){
        if(a.dead||b.dead)return;
        const ox=(a.w/2+b.w/2)-Math.abs(a.cx-b.cx);
        const oy=(a.h/2+b.h/2)-Math.abs(a.cy-b.cy);
        if(ox>0&&oy>0){
            if(ox<oy){const s=a.cx<b.cx?-1:1;a.cx+=s*ox*0.45;b.cx-=s*ox*0.45;}
            else{if(a.cy<b.cy){a.cy-=oy*0.5;b.cy+=oy*0.5;}else{a.cy+=oy*0.5;b.cy-=oy*0.5;}}
        }
    }

    function pigOnBlock(p,b){
        const hw=b.w/2+p.r,hh=b.h/2+p.r;
        const dx=p.cx-b.cx,dy=p.cy-b.cy;
        if(Math.abs(dx)<hw&&Math.abs(dy)<hh){
            const ox=hw-Math.abs(dx),oy=hh-Math.abs(dy);
            if(ox<oy){p.cx+=(dx>0?1:-1)*ox;p.vx*=-0.3;}
            else{p.cy+=(dy>0?1:-1)*oy;if(dy<0)p.vy=0;}
        }
    }

    function damagePig(idx,dmg){
        const p=pigs[idx];if(!p||p.dead)return;
        p.hp-=dmg;p.hit=1;p.wobble=20;
        SFX.pigHit();
        if(p.hp<=0) killPig(idx);
        else popText(p.cx,p.cy-p.r-12,`HP ${Math.max(0,p.hp)}`,'#FFD700');
    }

    function killPig(idx){
        const p=pigs[idx];if(!p||p.dead)return;
        p.dead=true;score+=p.pts;
        popText(p.cx,p.cy-p.r-20,`+${p.pts}`,'#FFE040');
        burst(p.cx,p.cy,'#88FF44',18,3,7);
        burst(p.cx,p.cy,'#BBFF66',10,1,4);
        SFX.pigDie();
        shakeScreen(8);updateUI();checkWin();
    }

    function killBlock(bl){
        if(bl.dead)return;bl.dead=true;score+=MAT[bl.mat].pts;
        burst(bl.cx,bl.cy,MAT[bl.mat].top,8,2,5);
        shakeScreen(4);updateUI();
        pigs.forEach((p,i)=>{
            if(!p.dead&&Math.abs(p.cx-bl.cx)<bl.w+18&&Math.abs(p.cy-bl.cy)<bl.h+18) damagePig(i,1);
        });
    }

    function doBomb(x,y){
        const R=145;
        burst(x,y,'#FF6600',50,3,9);burst(x,y,'#FFCC00',30,2,6);burst(x,y,'#FF2200',20,1,5);
        shakeScreen(22);
        SFX.explosion();
        pigs.forEach((p,i)=>{if(!p.dead&&Math.hypot(p.cx-x,p.cy-y)<R)damagePig(i,3);});
        blocks.forEach(b=>{
            if(!b.dead&&Math.hypot(b.cx-x,b.cy-y)<R+30){
                b.hp-=4;const ang=Math.atan2(b.cy-y,b.cx-x);
                b.vx+=Math.cos(ang)*12;b.vy+=Math.sin(ang)*12-4;
                b.va=(Math.random()-0.5)*0.15;
                if(b.hp<=0)killBlock(b);
            }
        });
    }

    function useSpecial(){
        if(!bird||bird.specialUsed||bird.dead||!bird.launched)return;
        bird.specialUsed=true;
        SFX.special();
        switch(bird.type){
            case 'split':{
                const a=Math.atan2(bird.vy,bird.vx),sp=Math.hypot(bird.vx,bird.vy);
                [-0.32,0.32].forEach(off=>{
                    const na=a+off;
                    splitBirds.push({...BIRDS.blue,r:10,cx:bird.cx,cy:bird.cy,vx:Math.cos(na)*sp,vy:Math.sin(na)*sp,dead:false,launched:true,specialUsed:true,rot:na,trail:[],explodeT:0,scale:1,squash:1,stretch:1});
                });
                popText(bird.cx,bird.cy-28,'SPLIT! ✨','#66BBFF');
                burst(bird.cx,bird.cy,'#88CCFF',12,2,5);
                break;
            }
            case 'speed':{
                const a=Math.atan2(bird.vy,bird.vx);
                bird.vx=Math.cos(a)*22;bird.vy=Math.sin(a)*2;
                popText(bird.cx,bird.cy-28,'SPEED! ⚡','#FFE040');
                shakeScreen(4);
                for(let i=0;i<8;i++){
                    particles.push({x:bird.cx-bird.vx*2+rng(-15,15),y:bird.cy+rng(-15,15),vx:-bird.vx*0.3+rng(-1,1),vy:rng(-1,1),life:0.6,col:'#FFE040',sz:rng(2,5)});
                }
                break;
            }
            case 'bomb':{
                bird.explodeT=50;
                popText(bird.cx,bird.cy-28,'💣 ARMED!','#FF4400');
                break;
            }
            case 'egg':{
                splitBirds.push({cx:bird.cx,cy:bird.cy+5,vx:bird.vx*0.1,vy:3,r:8,dead:false,isEgg:true,specialUsed:true,type:'normal',trail:[],explodeT:0});
                bird.vy-=7;bird.vx*=0.7;
                popText(bird.cx,bird.cy-28,'EGG DROP! 🥚','#FFFFFF');
                break;
            }
            case 'heavy':{
                bird.vy+=8;bird.vx*=1.3;
                shakeScreen(6);
                popText(bird.cx,bird.cy-28,'SMASH! 💥','#FF6622');
                break;
            }
            case 'boomerang':{
                bird.vx=-Math.abs(bird.vx)*1.5;
                popText(bird.cx,bird.cy-28,'BOOMERANG!','#44CC22');
                break;
            }
        }
    }

    function burst(x,y,col,n,minSp,maxSp){
        for(let i=0;i<n;i++){
            const a=rng(0,Math.PI*2),sp=rng(minSp,maxSp);
            particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-rng(0.5,2),life:1,col,sz:rng(2,7)});
        }
    }
    function spawnDust(x,y,n){
        for(let i=0;i<n;i++)
            particles.push({x:x+rng(-12,12),y,vx:rng(-1.2,1.2),vy:rng(-1.5,-0.3),life:0.7,col:'#C8A870',sz:rng(4,9)});
    }
    function popText(x,y,txt,col){popTexts.push({x,y,txt,col,life:1,sc:1.6,vy:-1.2});}
    function shakeScreen(amt){shakeMag=Math.max(shakeMag,amt);}

    function launchBurst(){
        burst(SEAT_X,SEAT_Y,'#FFD700',12,2,6);
        burst(SEAT_X,SEAT_Y,'#FF8844',8,1,4);
        if(bird){
            const ang=Math.atan2(bird.vy,bird.vx);
            for(let i=0;i<6;i++){
                const a=ang+rng(-0.4,0.4);
                particles.push({x:SEAT_X,y:SEAT_Y,vx:Math.cos(a)*rng(3,8),vy:Math.sin(a)*rng(3,8),life:0.5,col:'#FFFFFF',sz:rng(2,4)});
            }
        }
    }

    function checkWin(){
        if(pigs.every(p=>p.dead)){
            const bonus=birdQueue.length*2000;
            if(bonus>0){score+=bonus;popText(W/2+camX,H/2,`+${bonus} BIRDS!`,'#FFE040');}
            updateUI();
            SFX.win();
            setTimeout(()=>{state=ST.WIN;},1200);
        }
    }

    function nextTurn(){
        if(pigs.every(p=>p.dead)){checkWin();return;}
        if(birdQueue.length>0){
            targetCamX=0;
            setTimeout(()=>{spawnBird();state=ST.READY;},700);
        }else{
            SFX.lose();
            setTimeout(()=>{state=ST.LOSE;},1000);
        }
    }

    function getStars(sc){
        const d=LEVELS[level-1];if(!d)return 0;
        if(sc>=d.stars[2])return 3;
        if(sc>=d.stars[1])return 2;
        if(sc>=d.stars[0])return 1;
        return 0;
    }

    function updateUI(){
        const el=document.getElementById('game-score');
        if(el)el.textContent=score.toLocaleString();
    }

    function getPos(e){
        const rect=canvas.getBoundingClientRect();
        const src=e.touches?e.touches[0]:e;
        return{x:(src.clientX-rect.left)*(W/rect.width),y:(src.clientY-rect.top)*(H/rect.height)};
    }

    function onDown(e){
        getAudio();
        if(state===ST.INTRO){state=ST.READY;spawnBird();return;}
        if(state===ST.WIN||state===ST.LOSE){
            const pos=getPos(e);
            const btns=state===ST.WIN?winButtons:loseButtons;
            btns.forEach(b=>{if(pos.x>=b.x&&pos.x<=b.x+b.w&&pos.y>=b.y&&pos.y<=b.y+b.h)b.action();});
            return;
        }
        if(state===ST.FLY){useSpecial();return;}
        if(state===ST.LAUNCH_ANIM)return;
        if(state!==ST.READY&&state!==ST.AIM)return;
        if(!bird||bird.launched)return;
        const pos=getPos(e);
        const bScreenX=SEAT_X-camX+pullX;
        const bScreenY=SEAT_Y-bird.r+pullY;
        const hitR=isMobile?105:82;
        if(Math.hypot(pos.x-bScreenX,pos.y-bScreenY)<hitR){
            state=ST.AIM;isPulling=true;
        }
    }

    function onMove(e){
        if(!isPulling||!bird||bird.launched)return;
        const pos=getPos(e);
        const slingScreenX=SEAT_X-camX;
        const slingScreenY=SEAT_Y;
        let dx=pos.x-slingScreenX;
        let dy=pos.y-slingScreenY;
        if(dx>12)dx=12;
        const d=Math.hypot(dx,dy);
        if(d>MAX_PULL){dx=dx/d*MAX_PULL;dy=dy/d*MAX_PULL;}
        pullX=dx;pullY=dy;
        bird.cx=SEAT_X+dx;
        bird.cy=SEAT_Y-bird.r+dy;
        calcTrajectory();
        const curD = Math.hypot(pullX, pullY);
        if(Math.abs(curD-lastPullD) > 6){
            lastPullD = curD;
            SFX.slingPull();
        }
    }

    function onUp(){
        if(!isPulling||!bird)return;
        isPulling=false;
        const d=Math.hypot(pullX,pullY);
        if(d<12){
            pullX=0;pullY=0;
            bird.cx=SEAT_X;bird.cy=SEAT_Y-bird.r;
            state=ST.READY;trajectory=[];return;
        }
        SFX.snap();
        launchAnim.active=true;
        launchAnim.timer=0;
        launchAnim.duration=14;
        launchAnim.startX=bird.cx;
        launchAnim.startY=bird.cy;
        launchAnim.targetVX=-pullX*POWER;
        launchAnim.targetVY=-pullY*POWER;
        launchAnim.slingSnapBack=1;
        state=ST.LAUNCH_ANIM;
        trajectory=[];
    }

    canvas.addEventListener('mousedown',  onDown);
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseup',    onUp);
    canvas.addEventListener('touchstart', e=>{e.preventDefault();onDown(e);},{passive:false});
    canvas.addEventListener('touchmove',  e=>{e.preventDefault();onMove(e);},{passive:false});
    canvas.addEventListener('touchend',   e=>{e.preventDefault();onUp();   },{passive:false});

    // ═══════════════════════════════════════════
    // UPDATE
    // ═══════════════════════════════════════════
    function update(){
        if(isPortrait()) return;

        clouds.forEach(c=>{c.x-=c.sp;if(c.x+c.w<-200){c.x=W+camX+rng(0,200);c.y=rng(18,H*0.26);}});
        bgBirds.forEach(b=>{b.x+=b.sp;b.wp+=0.09;if(b.x>W+camX+100){b.x=camX-80;b.y=rng(35,H*0.23);}});

        if(shakeMag>0){
            shakeX=(Math.random()-0.5)*shakeMag*1.4;
            shakeY=(Math.random()-0.5)*shakeMag*0.7;
            shakeMag*=0.86;
            if(shakeMag<0.25){shakeMag=0;shakeX=0;shakeY=0;}
        }

        if(state===ST.INTRO){
            introTimer++;
            const rightEdge=blocks.length>0?Math.max(...blocks.map(b=>b.cx+b.w/2)):W*0.85;
            const maxCam=Math.max(0,rightEdge-W*0.65);
            if(introTimer<65)       targetCamX=maxCam*Math.min(1,introTimer/42);
            else if(introTimer<125) targetCamX=lerp(maxCam,0,(introTimer-65)/60);
            else{targetCamX=0;camX=0;state=ST.READY;spawnBird();}
        }

        if(state===ST.LAUNCH_ANIM&&launchAnim.active&&bird){
            launchAnim.timer++;
            const t=launchAnim.timer/launchAnim.duration;
            if(t<1){
                const elastic=easeOutBack(t);
                bird.cx=lerp(launchAnim.startX,SEAT_X,elastic);
                bird.cy=lerp(launchAnim.startY,SEAT_Y-bird.r,elastic);
                bird.squash=lerp(1.3,0.7,t);
                bird.stretch=lerp(0.7,1.4,t);
                                launchAnim.slingSnapBack=1-elastic;
                pullX=lerp(launchAnim.startX-SEAT_X,0,elastic);
                pullY=lerp(launchAnim.startY-(SEAT_Y-bird.r),0,elastic);
            }else{
                bird.cx=SEAT_X;bird.cy=SEAT_Y-bird.r;
                bird.vx=launchAnim.targetVX;bird.vy=launchAnim.targetVY;
                bird.launched=true;bird.trail=[];
                bird.squash=1;bird.stretch=1;
                pullX=0;pullY=0;
                launchAnim.active=false;
                birdFlightTime=0;
                state=ST.FLY;
                launchBurst();
                SFX.launch();
                shakeScreen(5);
                popText(bird.cx,bird.cy-30,'💨 WHOOSH!','#FFFFFF');
            }
        }

        if(state===ST.FLY||state===ST.SETTLE){
            physicsTick();
            if(bird&&bird.dead&&splitBirds.every(b=>b.dead)){
                settleTimer++;
                if(settleTimer>80){settleTimer=0;nextTurn();}
            }else settleTimer=0;
        }

        if(state===ST.FLY&&bird&&bird.launched&&!bird.dead)
            targetCamX=Math.max(0,bird.cx-W*0.38);
        if(state===ST.READY||state===ST.AIM||state===ST.LAUNCH_ANIM) targetCamX=0;
        camX+=(targetCamX-camX)*0.07;

        particles=particles.filter(p=>{
            p.x+=p.vx;p.y+=p.vy;p.vy+=0.1;p.vx*=0.97;p.life-=0.022;return p.life>0;
        });
        popTexts=popTexts.filter(p=>{p.y+=p.vy;p.sc=lerp(p.sc,1,0.12);p.life-=0.016;return p.life>0;});

        if(bird&&bird.launched&&!bird.dead){
            const spd=Math.hypot(bird.vx,bird.vy);
            const targetStretch=clamp(1+spd*0.01,1,1.25);
            const targetSquash=1/targetStretch;
            bird.stretch=lerp(bird.stretch,targetStretch,0.15);
            bird.squash=lerp(bird.squash,targetSquash,0.15);
        }
    }

    // ═══════════════════════════════════════════
    // DRAW HELPERS
    // ═══════════════════════════════════════════
    function rrect(c,x,y,w,h,r){
        const R=typeof r==='number'?r:8;
        c.beginPath();
        c.moveTo(x+R,y);c.lineTo(x+w-R,y);c.arcTo(x+w,y,x+w,y+R,R);
        c.lineTo(x+w,y+h-R);c.arcTo(x+w,y+h,x+w-R,y+h,R);
        c.lineTo(x+R,y+h);c.arcTo(x,y+h,x,y+h-R,R);
        c.lineTo(x,y+R);c.arcTo(x,y,x+R,y,R);
        c.closePath();
    }

    // ═══════════════════════════════════════════
    // DRAW
    // ═══════════════════════════════════════════
    function draw(){
        // Portrait mein sirf black screen
        if(isPortrait()){
            const c=ctx;
            c.save();c.scale(dpr,dpr);
            c.fillStyle='#000';
            c.fillRect(0,0,W||canvas.width/dpr,H||canvas.height/dpr);
            c.restore();
            return;
        }

        const c=ctx;
        c.save();c.scale(dpr,dpr);
        const th=LEVELS[level-1]?.theme||{};
        const sg=c.createLinearGradient(0,0,0,H);
        sg.addColorStop(0,th.sky1||'#2E8BC0');
        sg.addColorStop(0.5,th.sky2||'#A8DCF8');
        sg.addColorStop(1,'#E8F5FF');
        c.fillStyle=sg;c.fillRect(0,0,W,H);

        drawSun(c);drawClouds(c);drawBgBirds(c);

        c.save();c.translate(-camX+shakeX,shakeY);
        drawHills(c);drawGround(c);
        blocks.forEach(b=>{if(!b.dead)drawBlock(c,b);});
        drawSlingshotBack(c);
        pigs.forEach(p=>{if(!p.dead)drawPig(c,p);});
        birdQueue.forEach((bd,i)=>{
            drawBird(c,SX-42-i*28,GROUND-bd.r-4,bd,false,0,0.85-i*0.08,1,1);
        });
        splitBirds.forEach(b=>{
            if(!b.dead&&!b.isEgg)drawBird(c,b.cx,b.cy,b,true,b.rot||0,1,1,1);
            if(b.isEgg&&!b.dead)drawEgg(c,b.cx,b.cy);
        });
        if(bird&&bird.launched)drawTrail(c,bird);
        if(bird&&!bird.dead)drawBird(c,bird.cx,bird.cy,bird,bird.launched,bird.rot,1,bird.squash||1,bird.stretch||1);
        drawSlingshotFront(c);drawBands(c);drawTrajectory(c);

        particles.forEach(p=>{
            c.save();c.globalAlpha=Math.max(0,p.life);c.fillStyle=p.col;
            c.beginPath();c.arc(p.x,p.y,Math.max(0.3,p.sz*p.life),0,Math.PI*2);c.fill();c.restore();
        });
        popTexts.forEach(p=>{
            c.save();c.globalAlpha=Math.max(0,p.life);
            c.translate(p.x,p.y);c.scale(p.sc,p.sc);
            c.font=`bold ${isMobile?14:16}px 'Rajdhani','Arial',sans-serif`;
            c.textAlign='center';c.textBaseline='middle';
            c.fillStyle='rgba(0,0,0,0.55)';c.fillText(p.txt,1.5,1.5);
            c.fillStyle=p.col;c.fillText(p.txt,0,0);
            c.restore();
        });

        c.restore();
        drawHUD(c);
        if(state===ST.INTRO) drawIntro(c);
        if(state===ST.WIN)   drawWin(c);
        if(state===ST.LOSE)  drawLose(c);
        c.restore();
    }

    function drawSun(c){
        const sx=W*0.80-camX*0.03,sy=H*0.07;
        const sg=c.createRadialGradient(sx,sy,0,sx,sy,105);
        sg.addColorStop(0,'rgba(255,255,210,0.98)');sg.addColorStop(0.38,'rgba(255,250,190,0.28)');sg.addColorStop(1,'rgba(255,245,170,0)');
        c.fillStyle=sg;c.beginPath();c.arc(sx,sy,105,0,Math.PI*2);c.fill();
        c.fillStyle='#FFFDE0';c.beginPath();c.arc(sx,sy,24,0,Math.PI*2);c.fill();
    }

    function drawClouds(c){
        clouds.forEach(cl=>{
            const cx2=cl.x-camX*0.12;
            c.save();c.globalAlpha=cl.op;c.fillStyle='#FFFFFF';
            c.beginPath();c.ellipse(cx2,cl.y,cl.w*0.52,cl.h*0.55,0,0,Math.PI*2);c.fill();
            c.beginPath();c.ellipse(cx2-cl.w*0.22,cl.y+4,cl.w*0.32,cl.h*0.42,0,0,Math.PI*2);c.fill();
            c.beginPath();c.ellipse(cx2+cl.w*0.26,cl.y+2,cl.w*0.28,cl.h*0.36,0,0,Math.PI*2);c.fill();
            c.restore();
        });
    }

    function drawBgBirds(c){
        bgBirds.forEach(b=>{
            const bx=b.x-camX*0.08;
            const wy=Math.sin(b.wp)*b.sz*0.7;
            c.save();c.strokeStyle='rgba(70,90,130,0.45)';c.lineWidth=1.5;c.lineCap='round';
            c.beginPath();c.moveTo(bx-b.sz,b.y+wy);c.quadraticCurveTo(bx,b.y-Math.abs(wy)*0.4,bx+b.sz,b.y+wy);c.stroke();
            c.restore();
        });
    }

    function drawHills(c){
        const th=LEVELS[level-1]?.theme||{};
        const h1=-camX*0.25;
        c.fillStyle=th.hill||'#8FBC8F';
        c.beginPath();c.moveTo(h1-100,GROUND);
        for(let x=-100;x<W+camX+200;x+=35)
            c.lineTo(x+h1,GROUND-30-Math.sin(x*0.009)*26-Math.cos(x*0.021)*13);
        c.lineTo(W+camX+250,GROUND);c.closePath();c.fill();
    }

    function drawGround(c){
        const gg=c.createLinearGradient(0,GROUND,0,H);
        gg.addColorStop(0,'#5CC044');gg.addColorStop(0.04,'#4AAF32');
        gg.addColorStop(0.14,'#8B6840');gg.addColorStop(0.5,'#7A5830');gg.addColorStop(1,'#4A3218');
        c.fillStyle=gg;
        c.fillRect(-500+camX,GROUND,W+camX+1200,H-GROUND+20);
        c.fillStyle='#72D158';c.fillRect(-500+camX,GROUND-2,W+camX+1200,5);
    }

    function drawBlock(c,b){
        c.save();c.translate(b.cx,b.cy);
        if(b.angle)c.rotate(b.angle);
        const hw=b.w/2,hh=b.h/2,m=MAT[b.mat]||MAT.wood;
        c.fillStyle='rgba(0,0,0,0.13)';c.fillRect(-hw+3,-hh+3,b.w,b.h);
        const g=c.createLinearGradient(-hw,-hh,hw,hh);
        g.addColorStop(0,m.top);g.addColorStop(0.5,m.mid);g.addColorStop(1,m.bot);
        c.fillStyle=g;c.fillRect(-hw,-hh,b.w,b.h);
        if(b.mat==='glass'||b.mat==='ice'){
            c.fillStyle='rgba(255,255,255,0.22)';c.beginPath();
            c.moveTo(-hw,-hh);c.lineTo(-hw+b.w*0.42,-hh);c.lineTo(-hw,-hh+b.h*0.42);c.closePath();c.fill();
        }
        if(b.mat==='wood'||b.mat==='darkwood'){
            c.save();c.globalAlpha=0.07;c.strokeStyle=m.bot;c.lineWidth=1;
            for(let gx=-hw+5;gx<hw;gx+=7){c.beginPath();c.moveTo(gx,-hh);c.lineTo(gx+3,hh);c.stroke();}
            c.restore();
        }
        if(b.mat==='metal'){
            c.save();c.globalAlpha=0.08;c.strokeStyle='#888';c.lineWidth=1;
            for(let gy=-hh+8;gy<hh;gy+=10){c.beginPath();c.moveTo(-hw,gy);c.lineTo(hw,gy);c.stroke();}
            c.restore();
        }
        if(b.mat==='stone'){
            c.save();c.globalAlpha=0.06;c.fillStyle='#000';
            for(let gx=-hw+5;gx<hw;gx+=12)
                for(let gy=-hh+5;gy<hh;gy+=12){
                    c.beginPath();c.arc(gx+rng(-2,2),gy+rng(-2,2),2,0,Math.PI*2);c.fill();
                }
            c.restore();
        }
        const dmgR=1-b.hp/b.maxHp;
        if(dmgR>0.28){
            const cs=b.cx*0.01;
            c.save();c.globalAlpha=dmgR*0.75;c.strokeStyle=m.edge;c.lineWidth=1.5;
            c.beginPath();c.moveTo(-hw*0.4+Math.sin(cs)*5,-hh*0.55);c.lineTo(Math.cos(cs)*7,0);c.lineTo(hw*0.3+Math.sin(cs+1)*5,hh*0.5);c.stroke();
            if(dmgR>0.55){c.beginPath();c.moveTo(-hw*0.15,-hh*0.25);c.lineTo(hw*0.45,hh*0.42);c.stroke();}
            c.restore();
        }
        c.strokeStyle=m.edge;c.lineWidth=1.5;c.strokeRect(-hw,-hh,b.w,b.h);
        c.fillStyle='rgba(255,255,255,0.2)';c.fillRect(-hw,-hh,b.w,Math.min(4,b.h*0.14));
        c.fillRect(-hw,-hh,Math.min(3,b.w*0.1),b.h);
        if(b.hit>0.05){c.fillStyle=`rgba(255,255,255,${b.hit*0.5})`;c.fillRect(-hw,-hh,b.w,b.h);}
        c.restore();
    }

    function drawSlingshotBack(c){
        const pg=c.createLinearGradient(SX-8,0,SX+8,0);
        pg.addColorStop(0,'#3E2208');pg.addColorStop(0.45,'#7A4E28');pg.addColorStop(1,'#3E2208');
        c.fillStyle='rgba(0,0,0,0.12)';c.fillRect(SX-5,SY-10,13,GROUND-SY+10);
        c.fillStyle=pg;c.fillRect(SX-8,SY-10,16,GROUND-SY+10);
        c.save();c.strokeStyle='#5A3215';c.lineWidth=9;c.lineCap='round';
        c.beginPath();c.moveTo(SX-3,SY-8);c.quadraticCurveTo(SX-10,SY-35,SF1X,SF1Y);c.stroke();
        c.strokeStyle='rgba(180,110,55,0.28)';c.lineWidth=3.5;
        c.beginPath();c.moveTo(SX-4,SY-14);c.quadraticCurveTo(SX-10,SY-37,SF1X,SF1Y);c.stroke();
        c.restore();
        c.fillStyle='#7B5030';c.beginPath();c.arc(SF1X,SF1Y,5.5,0,Math.PI*2);c.fill();
        c.fillStyle='#A07050';c.beginPath();c.arc(SF1X,SF1Y,2.8,0,Math.PI*2);c.fill();
    }

    function drawSlingshotFront(c){
        c.save();c.strokeStyle='#7A5230';c.lineWidth=9;c.lineCap='round';
        c.beginPath();c.moveTo(SX+3,SY-8);c.quadraticCurveTo(SX+10,SY-35,SF2X,SF2Y);c.stroke();
        c.strokeStyle='rgba(200,145,75,0.28)';c.lineWidth=3.5;
        c.beginPath();c.moveTo(SX+4,SY-14);c.quadraticCurveTo(SX+10,SY-37,SF2X,SF2Y);c.stroke();
        c.restore();
        c.fillStyle='#7B5030';c.beginPath();c.arc(SF2X,SF2Y,5.5,0,Math.PI*2);c.fill();
        c.fillStyle='#A07050';c.beginPath();c.arc(SF2X,SF2Y,2.8,0,Math.PI*2);c.fill();
    }

    function drawBands(c){
        if(!bird||bird.launched)return;
        const bx=bird.cx,by=bird.cy;
        if(state===ST.LAUNCH_ANIM){
            const snap=launchAnim.slingSnapBack||0;
            const bandX=lerp(SEAT_X,bx,snap);
            const bandY=lerp(SEAT_Y-bird.r,by,snap);
            c.save();c.strokeStyle='rgba(70,35,10,0.95)';c.lineWidth=5;c.lineCap='round';
            c.beginPath();c.moveTo(SF1X,SF1Y);c.lineTo(bandX,bandY);c.stroke();
            c.beginPath();c.moveTo(SF2X,SF2Y);c.lineTo(bandX,bandY);c.stroke();
            c.restore();return;
        }
        if(!isPulling){
            c.save();c.strokeStyle='rgba(90,50,18,0.9)';c.lineWidth=4.5;c.lineCap='round';
            c.beginPath();c.moveTo(SF1X,SF1Y);c.lineTo(bx,by);c.stroke();
            c.beginPath();c.moveTo(SF2X,SF2Y);c.lineTo(bx,by);c.stroke();
            c.strokeStyle='rgba(160,100,50,0.4)';c.lineWidth=2;
            c.beginPath();c.moveTo(SF1X,SF1Y);c.lineTo(bx,by);c.stroke();
            c.beginPath();c.moveTo(SF2X,SF2Y);c.lineTo(bx,by);c.stroke();
            c.restore();
        }else{
            c.save();c.strokeStyle='rgba(70,35,10,0.95)';c.lineWidth=5;c.lineCap='round';
            c.beginPath();c.moveTo(SF1X,SF1Y);c.lineTo(bx,by);c.stroke();
            c.strokeStyle='rgba(140,80,30,0.45)';c.lineWidth=2.5;
            c.beginPath();c.moveTo(SF1X,SF1Y);c.lineTo(bx,by);c.stroke();
            c.strokeStyle='rgba(80,42,12,0.95)';c.lineWidth=5;
            c.beginPath();c.moveTo(SF2X,SF2Y);c.lineTo(bx,by);c.stroke();
            c.strokeStyle='rgba(160,100,40,0.45)';c.lineWidth=2.5;
            c.beginPath();c.moveTo(SF2X,SF2Y);c.lineTo(bx,by);c.stroke();
            c.restore();
            const pullRatio=Math.hypot(pullX,pullY)/MAX_PULL;
            const mX=SX-44,mTop=SY-90,mH=66;
            c.save();
            c.fillStyle='rgba(0,0,0,0.48)';
            rrect(c,mX-7,mTop-6,20,mH+12,8);c.fill();
            const fillH=mH*pullRatio;
            const pCol=pullRatio>0.82?'#FF3333':pullRatio>0.52?'#FFaa00':'#44EE44';
            c.fillStyle=pCol;rrect(c,mX-5,mTop+mH-fillH,16,fillH,5);c.fill();
            c.save();c.globalAlpha=0.3;c.fillStyle=pCol;
            rrect(c,mX-9,mTop+mH-fillH-2,24,fillH+4,8);c.fill();c.restore();
            c.strokeStyle='rgba(255,255,255,0.25)';c.lineWidth=1.5;
            rrect(c,mX-7,mTop-6,20,mH+12,8);c.stroke();
            c.font='bold 10px Rajdhani,sans-serif';c.fillStyle='rgba(255,255,255,0.6)';
            c.textAlign='center';c.textBaseline='middle';
            c.fillText('PWR',mX+3,mTop-14);
            c.restore();
        }
    }

    function drawTrajectory(c){
        if(trajectory.length===0||state!==ST.AIM)return;
        trajectory.forEach((t,i)=>{
            const prog=1-t.t,sz=Math.max(0.5,4.5-i*0.08),alpha=prog*0.94;
            c.save();c.globalAlpha=alpha*0.32;c.fillStyle='#00EEFF';
            c.beginPath();c.arc(t.x,t.y,sz*2.4,0,Math.PI*2);c.fill();c.restore();
            c.save();c.globalAlpha=alpha;
            const rv=Math.floor(lerp(0,180,t.t)),gv=Math.floor(lerp(220,230,t.t));
            c.fillStyle=`rgb(${rv},${gv},255)`;
            c.beginPath();c.arc(t.x,t.y,sz,0,Math.PI*2);c.fill();c.restore();
            if(i<10){
                c.save();c.globalAlpha=alpha*0.55;c.fillStyle='#FFFFFF';
                c.beginPath();c.arc(t.x-sz*0.25,t.y-sz*0.25,sz*0.35,0,Math.PI*2);c.fill();c.restore();
            }
        });
        if(trajectory.length>0){
            const last=trajectory[trajectory.length-1];
            c.save();c.globalAlpha=0.6;c.strokeStyle='#00FFFF';c.lineWidth=1.5;
            const cs=10;
            c.beginPath();c.moveTo(last.x-cs,last.y);c.lineTo(last.x+cs,last.y);
            c.moveTo(last.x,last.y-cs);c.lineTo(last.x,last.y+cs);c.stroke();
            c.globalAlpha=0.32;c.beginPath();c.arc(last.x,last.y,cs*0.7,0,Math.PI*2);c.stroke();
            c.restore();
        }
    }

    function drawTrail(c,b){
        if(b.trail.length<2)return;
        c.save();
        for(let i=1;i<b.trail.length;i++){
            const t0=b.trail[i-1],t1=b.trail[i];
            if(t0.a<=0||t1.a<=0)continue;
            c.globalAlpha=t1.a*0.5;
            c.strokeStyle=b.type==='bomb'?'#FF4400':b.type==='speed'?'#FFE040':(b.body||'#FF8888');
            c.lineWidth=Math.max(1,b.r*0.6*t1.a);
            c.lineCap='round';
            c.beginPath();c.moveTo(t0.x,t0.y);c.lineTo(t1.x,t1.y);c.stroke();
        }
        c.restore();
        b.trail.forEach(t=>{
            if(t.a<=0)return;
            const sz=b.r*0.3*t.a;
            c.save();c.globalAlpha=t.a*0.6;c.fillStyle='#FFFFFF';
            c.beginPath();c.arc(t.x,t.y,Math.max(0.5,sz*0.5),0,Math.PI*2);c.fill();c.restore();
        });
        if(b.launched&&!b.dead){
            const spd=Math.hypot(b.vx,b.vy);
            if(spd>5){
                const ang=Math.atan2(b.vy,b.vx)+Math.PI;
                c.save();c.globalAlpha=Math.min(0.5,(spd-5)*0.04);
                c.strokeStyle='rgba(255,255,255,0.6)';c.lineWidth=1.5;c.lineCap='round';
                for(let i=0;i<3;i++){
                    const offset=(i-1)*8;
                    const startX=b.cx+Math.cos(ang)*(b.r+3)+Math.sin(ang)*offset;
                    const startY=b.cy+Math.sin(ang)*(b.r+3)-Math.cos(ang)*offset;
                    const lineLen=rng(12,25)*(spd/15);
                    c.beginPath();c.moveTo(startX,startY);
                    c.lineTo(startX+Math.cos(ang)*lineLen,startY+Math.sin(ang)*lineLen);c.stroke();
                }
                c.restore();
            }
        }
    }

    function drawBird(c,x,y,bd,flying,rot,alpha,squashV,stretchV){
        if(alpha<=0)return;
        const squash=squashV||1,stretch=stretchV||1;
        c.save();c.globalAlpha=alpha;c.translate(x,y);
        if(flying&&rot)c.rotate(rot);
        c.scale(squash,stretch);
        const r=bd.r,body=bd.body||'#FF4444',shine=bd.shine||'#FF8888',shadow=bd.shadow||'#CC0000';
        if(!flying){
            c.fillStyle='rgba(0,0,0,0.18)';
            c.beginPath();c.ellipse(0,r+2,r*0.85,r*0.22,0,0,Math.PI*2);c.fill();
        }
        const bg=c.createRadialGradient(-r*0.28,-r*0.32,r*0.04,0,0,r*1.12);
        bg.addColorStop(0,shine);bg.addColorStop(0.45,body);bg.addColorStop(0.85,shadow);bg.addColorStop(1,'#000');
        c.fillStyle=bg;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();
        c.strokeStyle=shadow;c.lineWidth=1.5;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();
        if(bd.tri){
            const tg=c.createLinearGradient(-r,-r,r,r);
            tg.addColorStop(0,shine);tg.addColorStop(1,shadow);
            c.fillStyle=tg;
            c.beginPath();c.moveTo(0,-r);c.lineTo(r*1.1,r*0.7);c.lineTo(-r*1.1,r*0.7);c.closePath();c.fill();
            c.strokeStyle=shadow;c.lineWidth=1.5;c.stroke();
        }
        c.fillStyle='rgba(255,255,255,0.13)';
        c.beginPath();c.ellipse(0,r*0.32,r*0.62,r*0.38,0,0,Math.PI*2);c.fill();
        const es=r*0.24,eo=r*0.22;
        c.fillStyle='#FFF';
        c.beginPath();c.ellipse(-eo,-r*0.1,es,es*1.05,0,0,Math.PI*2);c.fill();
        c.beginPath();c.ellipse(eo,-r*0.1,es,es*1.05,0,0,Math.PI*2);c.fill();
        if(flying){
            c.fillStyle='#111';
            c.beginPath();c.arc(-eo+r*0.06,-r*0.1,es*0.5,0,Math.PI*2);c.fill();
            c.beginPath();c.arc(eo+r*0.06,-r*0.1,es*0.5,0,Math.PI*2);c.fill();
            c.strokeStyle='#1A0A00';c.lineWidth=3;c.lineCap='round';
            c.beginPath();c.moveTo(-r*0.52,-r*0.42);c.lineTo(-r*0.04,-r*0.28);c.stroke();
            c.beginPath();c.moveTo(r*0.52,-r*0.42);c.lineTo(r*0.04,-r*0.28);c.stroke();
        }else{
            c.fillStyle='#111';
            c.beginPath();c.arc(-eo,-r*0.1,es*0.46,0,Math.PI*2);c.fill();
            c.beginPath();c.arc(eo,-r*0.1,es*0.46,0,Math.PI*2);c.fill();
            c.strokeStyle='#1A0A00';c.lineWidth=2.5;c.lineCap='round';
            c.beginPath();c.moveTo(-r*0.48,-r*0.38);c.lineTo(-r*0.06,-r*0.22);c.stroke();
            c.beginPath();c.moveTo(r*0.48,-r*0.38);c.lineTo(r*0.06,-r*0.22);c.stroke();
        }
        c.fillStyle='rgba(255,255,255,0.65)';
        c.beginPath();c.arc(-eo-es*0.22,-r*0.22,es*0.21,0,Math.PI*2);c.fill();
        c.beginPath();c.arc(eo-es*0.22,-r*0.22,es*0.21,0,Math.PI*2);c.fill();
        const bkG=c.createLinearGradient(r*0.1,0,r*0.9,r*0.4);
        bkG.addColorStop(0,'#FFB800');bkG.addColorStop(1,'#CC7700');
        c.fillStyle=bkG;
        c.beginPath();c.moveTo(r*0.12,r*0.04);c.lineTo(r*0.88,r*0.16);c.lineTo(r*0.12,r*0.38);c.closePath();c.fill();
        if(bd.feather||bd.id==='red'){
            c.strokeStyle=shadow;c.lineWidth=2.5;c.lineCap='round';
            c.beginPath();c.moveTo(-r*0.08,-r*0.95);c.lineTo(-r*0.3,-r*1.42);c.stroke();
            c.beginPath();c.moveTo(r*0.04,-r*0.98);c.lineTo(r*0.22,-r*1.52);c.stroke();
            c.beginPath();c.moveTo(r*0.14,-r*0.88);c.lineTo(r*0.5,-r*1.36);c.stroke();
        }
        if(bd.id==='white'){c.fillStyle='#DDBBCC';c.beginPath();c.ellipse(r*0.05,-r*0.82,r*0.13,r*0.28,0,0,Math.PI*2);c.fill();}
        if(bd.id==='black'){
            c.strokeStyle='#666';c.lineWidth=2.5;
            c.beginPath();c.moveTo(r*0.15,-r);c.quadraticCurveTo(r*0.45,-r*1.3,r*0.3,-r*1.6);c.stroke();
            if(bd.explodeT>0){
                c.fillStyle=Math.sin(Date.now()*0.03)>0?'#FFFF00':'#FF8800';
                c.beginPath();c.arc(r*0.3,-r*1.6,4,0,Math.PI*2);c.fill();
            }
        }
        if(bd.id==='big'){c.fillStyle='#CC4411';c.beginPath();c.ellipse(0,-r*0.7,r*0.65,r*0.4,0,Math.PI,Math.PI*2);c.fill();}
        if(bd.id==='green'){
            c.fillStyle='#228811';
            c.beginPath();c.moveTo(-r*0.5,r*0.1);c.lineTo(-r*1.2,r*0.2);c.lineTo(-r*0.5,r*0.45);c.closePath();c.fill();
        }
        if(flying&&!bd.specialUsed&&bd.type!=='normal'){
            const pulse=0.35+Math.sin(Date.now()*0.012)*0.25;
            c.save();c.globalAlpha=pulse;c.strokeStyle='#FFFFFF';c.lineWidth=2.5;c.setLineDash([4,4]);
            c.beginPath();c.arc(0,0,r+7,0,Math.PI*2);c.stroke();c.setLineDash([]);c.restore();
        }
        c.fillStyle='rgba(255,255,255,0.22)';
        c.beginPath();c.ellipse(-r*0.18,-r*0.5,r*0.24,r*0.14,-0.4,0,Math.PI*2);c.fill();
        c.restore();
    }

    function drawPig(c,p){
        c.save();c.translate(p.cx,p.cy);
        if(p.wobble>0.1)c.rotate(Math.sin(p.wobble)*0.08);
        const r=p.r;
        c.fillStyle='rgba(0,0,0,0.15)';c.beginPath();c.ellipse(1,r+2,r*0.78,r*0.2,0,0,Math.PI*2);c.fill();
        const pg=c.createRadialGradient(-r*0.25,-r*0.28,0,0,0,r*1.1);
        pg.addColorStop(0,'#B5F545');pg.addColorStop(0.4,'#58BE10');pg.addColorStop(0.8,'#2A8A05');pg.addColorStop(1,'#1A6003');
        c.fillStyle=pg;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();
        c.strokeStyle='#1E5C02';c.lineWidth=1.8;c.stroke();
        c.fillStyle='#48A808';
        c.beginPath();c.ellipse(-r*0.68,-r*0.48,r*0.22,r*0.3,-0.25,0,Math.PI*2);c.fill();
        c.beginPath();c.ellipse(r*0.68,-r*0.48,r*0.22,r*0.3,0.25,0,Math.PI*2);c.fill();
        c.fillStyle='#88CC44';
        c.beginPath();c.ellipse(-r*0.68,-r*0.48,r*0.12,r*0.18,-0.25,0,Math.PI*2);c.fill();
        c.beginPath();c.ellipse(r*0.68,-r*0.48,r*0.12,r*0.18,0.25,0,Math.PI*2);c.fill();
        const eo=r*0.26;
        if(p.eyeOpen){
            c.fillStyle='#FFF';
            c.beginPath();c.ellipse(-eo,-r*0.14,r*0.24,r*0.26,0,0,Math.PI*2);c.fill();
            c.beginPath();c.ellipse(eo,-r*0.14,r*0.24,r*0.26,0,0,Math.PI*2);c.fill();
            let lx=0;
            if(bird&&!bird.dead){const ang=Math.atan2(bird.cy-p.cy,bird.cx-p.cx);lx=Math.cos(ang)*r*0.07;}
            c.fillStyle='#111';
            c.beginPath();c.arc(-eo+lx,-r*0.14,r*0.1,0,Math.PI*2);c.fill();
            c.beginPath();c.arc(eo+lx,-r*0.14,r*0.1,0,Math.PI*2);c.fill();
            c.fillStyle='rgba(255,255,255,0.7)';
            c.beginPath();c.arc(-eo+lx-r*0.06,-r*0.22,r*0.06,0,Math.PI*2);c.fill();
            c.beginPath();c.arc(eo+lx-r*0.06,-r*0.22,r*0.06,0,Math.PI*2);c.fill();
        }else{
            c.strokeStyle='#1E5C02';c.lineWidth=2;
            c.beginPath();c.moveTo(-eo-r*0.18,-r*0.14);c.lineTo(-eo+r*0.18,-r*0.14);c.stroke();
            c.beginPath();c.moveTo(eo-r*0.18,-r*0.14);c.lineTo(eo+r*0.18,-r*0.14);c.stroke();
        }
        c.fillStyle='#3A9808';
        c.beginPath();c.ellipse(0,r*0.18,r*0.36,r*0.26,0,0,Math.PI*2);c.fill();
        c.strokeStyle='#1E6A02';c.lineWidth=1;c.stroke();
        c.fillStyle='#1E6A02';
        c.beginPath();c.ellipse(-r*0.13,r*0.18,r*0.07,r*0.055,0,0,Math.PI*2);c.fill();
        c.beginPath();c.ellipse(r*0.13,r*0.18,r*0.07,r*0.055,0,0,Math.PI*2);c.fill();
        const dmgR=1-p.hp/p.maxHp;
        if(dmgR>0.3){
            c.strokeStyle='#1E5C02';c.lineWidth=1.5;
            c.beginPath();c.arc(0,r*0.52,r*0.22,0.2,Math.PI-0.2,true);c.stroke();
            c.fillStyle='rgba(80,0,100,0.18)';c.beginPath();c.arc(r*0.38,r*0.1,r*0.18,0,Math.PI*2);c.fill();
        }
        if(p.type==='king'||p.type==='emperor'){
            const cg=c.createLinearGradient(-r*0.6,-r*1.15,r*0.6,-r*0.5);
            cg.addColorStop(0,'#FFE040');cg.addColorStop(0.5,'#FFD700');cg.addColorStop(1,'#CC9900');
            c.fillStyle=cg;
            c.beginPath();
            c.moveTo(-r*0.58,-r*0.55);c.lineTo(-r*0.42,-r*1.02);c.lineTo(-r*0.18,-r*0.72);
            c.lineTo(r*0.1,-r*1.12);c.lineTo(r*0.38,-r*0.72);c.lineTo(r*0.58,-r*1.05);c.lineTo(r*0.62,-r*0.55);
            c.closePath();c.fill();
            c.strokeStyle='#AA8800';c.lineWidth=1.5;c.stroke();
            if(p.type==='emperor'){
                ['#FF1744','#4FC3F7','#69F0AE'].forEach((col,i)=>{
                    c.fillStyle=col;c.beginPath();c.arc(-r*0.28+i*r*0.28,-r*0.86,r*0.1,0,Math.PI*2);c.fill();
                });
            }else{
                c.fillStyle='#FF1744';c.beginPath();c.arc(r*0.1,-r*0.86,r*0.1,0,Math.PI*2);c.fill();
            }
        }
        if(p.hit>0.05){c.fillStyle=`rgba(255,80,80,${p.hit*0.45})`;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();}
        c.fillStyle='rgba(255,255,255,0.2)';
        c.beginPath();c.ellipse(-r*0.18,-r*0.46,r*0.3,r*0.15,-0.3,0,Math.PI*2);c.fill();
        c.restore();
    }

    function drawEgg(c,x,y){
        c.save();c.translate(x,y);
        c.fillStyle='#FFFDE8';c.strokeStyle='#DDCCAA';c.lineWidth=1.5;
        c.beginPath();c.ellipse(0,0,8,10,0,0,Math.PI*2);c.fill();c.stroke();
        c.fillStyle='rgba(255,255,255,0.5)';c.beginPath();c.ellipse(-3,-4,3,2,-0.4,0,Math.PI*2);c.fill();
        c.restore();
    }

    function drawHUD(c){
        c.save();
        const pad=12;
        c.fillStyle='rgba(0,0,0,0.40)';
        rrect(c,pad,pad,125,36,18);c.fill();
        c.font=`bold ${isMobile?13:15}px 'Rajdhani','Arial',sans-serif`;
        c.fillStyle='#FFE040';c.textAlign='left';c.textBaseline='middle';
        c.fillText(`⭐ ${score.toLocaleString()}`,pad+12,pad+18);
        c.fillStyle='rgba(0,0,0,0.38)';
        rrect(c,pad,pad+44,120,26,13);c.fill();
        c.font=`bold ${isMobile?11:12}px 'Rajdhani','Arial',sans-serif`;
        c.fillStyle='#AAEEFF';
        const ld=LEVELS[level-1];
        c.fillText(`LVL ${level}: ${ld?ld.name:''}`,pad+10,pad+57);
        const rem=birdQueue.length+(bird&&!bird.dead?1:0);
        if(rem>0){
            c.fillStyle='rgba(0,0,0,0.32)';
            rrect(c,pad,pad+79,rem*24+14,26,13);c.fill();
            for(let i=0;i<rem;i++){
                const bd=i===0&&bird&&!bird.dead?bird:birdQueue[i-(bird&&!bird.dead?1:0)];
                c.fillStyle=bd?(bd.body||'#FF4444'):'#FF4444';
                c.beginPath();c.arc(pad+16+i*24,pad+92,9,0,Math.PI*2);c.fill();
                c.strokeStyle='rgba(255,255,255,0.4)';c.lineWidth=1.5;
                c.beginPath();c.arc(pad+16+i*24,pad+92,9,0,Math.PI*2);c.stroke();
            }
        }
        const pigsLeft=pigs.filter(p=>!p.dead).length;
        c.fillStyle='rgba(0,0,0,0.38)';rrect(c,W-pad-88,pad,88,36,18);c.fill();
        c.font=`bold ${isMobile?13:14}px 'Rajdhani','Arial',sans-serif`;
        c.fillStyle='#88FF44';c.textAlign='right';
        c.fillText(`🐷 × ${pigsLeft}`,W-pad-8,pad+18);
        if(state===ST.FLY&&bird&&!bird.specialUsed&&bird.type!=='normal'){
            const hints={split:'TAP → SPLIT ✨',speed:'TAP → BOOST ⚡',bomb:'TAP → ARM 💣',egg:'TAP → EGG 🥚',heavy:'TAP → SMASH 💥',boomerang:'TAP → RETURN 🔄'};
            const hint=hints[bird.type];
            if(hint){
                const hW=isMobile?152:168;
                c.fillStyle='rgba(0,0,0,0.52)';rrect(c,W/2-hW/2,H-54,hW,30,15);c.fill();
                c.font=`bold ${isMobile?12:13}px 'Rajdhani','Arial',sans-serif`;
                c.fillStyle='#FFE040';c.textAlign='center';
                c.fillText(hint,W/2,H-39);
            }
        }
        c.restore();
    }

    function drawIntro(c){
        const a=Math.min(0.52,introTimer*0.012);
        c.fillStyle=`rgba(0,0,0,${a})`;c.fillRect(0,0,W,H);
        const ta=Math.min(1,introTimer*0.026);
        c.save();c.globalAlpha=ta;
        const pw=isMobile?W*0.82:370,ph=148,px=W/2-pw/2,py=H*0.30;
        c.fillStyle='rgba(0,0,0,0.60)';rrect(c,px,py,pw,ph,22);c.fill();
        c.strokeStyle='rgba(255,215,40,0.45)';c.lineWidth=2;rrect(c,px,py,pw,ph,22);c.stroke();
        c.font=`bold ${isMobile?22:28}px 'Orbitron','Arial',sans-serif`;
        c.fillStyle='#FFE040';c.textAlign='center';c.textBaseline='middle';
        c.shadowColor='#FFB800';c.shadowBlur=14;
        c.fillText(`LEVEL ${level}`,W/2,py+32);c.shadowBlur=0;
        const ld=LEVELS[level-1];
        if(ld){
            c.font=`bold ${isMobile?13:15}px 'Rajdhani','Arial',sans-serif`;c.fillStyle='#AAEEFF';
            c.fillText(ld.name,W/2,py+65);
            c.font=`${isMobile?11:12}px 'Rajdhani','Arial',sans-serif`;c.fillStyle='rgba(255,255,255,0.58)';
            c.fillText(`⭐ ${ld.stars[0].toLocaleString()}   ⭐⭐ ${ld.stars[1].toLocaleString()}   ⭐⭐⭐ ${ld.stars[2].toLocaleString()}`,W/2,py+94);
        }
        const pulse=0.5+Math.sin(Date.now()*0.006)*0.4;
        c.globalAlpha=ta*pulse;
        c.font=`bold ${isMobile?12:14}px 'Rajdhani','Arial',sans-serif`;c.fillStyle='#FFFFFF';
        c.fillText('TAP ANYWHERE TO START',W/2,py+126);
        c.restore();
    }

    function drawConfetti(c){
        if(confetti.length<70){
            for(let i=0;i<5;i++) confetti.push({
                x:rng(0,W),y:rng(-20,0),vx:rng(-1,1),vy:rng(1.5,3.5),
                w:rng(8,18),h:rng(5,10),
                col:['#FFD700','#FF4444','#44AAFF','#44FF88','#FF88FF','#FFAA44'][rngI(0,5)],
                rot:rng(0,Math.PI),va:rng(-0.08,0.08)
            });
        }
        confetti.forEach(cf=>{
            cf.x+=cf.vx;cf.y+=cf.vy;cf.rot+=cf.va;
            c.save();c.translate(cf.x,cf.y);c.rotate(cf.rot);c.fillStyle=cf.col;
            c.fillRect(-cf.w/2,-cf.h/2,cf.w,cf.h);c.restore();
        });
        confetti=confetti.filter(cf=>cf.y<H+30);
    }

    function drawBtn(c,x,y,w,h,label,col){
        c.fillStyle='rgba(0,0,0,0.28)';rrect(c,x+2,y+3,w,h,12);c.fill();
        c.fillStyle=col;rrect(c,x,y,w,h,12);c.fill();
        c.fillStyle='rgba(255,255,255,0.2)';
        c.beginPath();c.moveTo(x+12,y);c.lineTo(x+w-12,y);c.arcTo(x+w,y,x+w,y+12,12);c.lineTo(x+w,y+h/2);c.lineTo(x,y+h/2);c.lineTo(x,y+12);c.arcTo(x,y,x+12,y,12);c.fill();
        c.strokeStyle='rgba(255,255,255,0.22)';c.lineWidth=1.5;rrect(c,x,y,w,h,12);c.stroke();
        c.font=`bold ${isMobile?13:15}px 'Rajdhani','Arial',sans-serif`;
        c.fillStyle='#FFF';c.textAlign='center';c.textBaseline='middle';
        c.shadowColor='rgba(0,0,0,0.4)';c.shadowBlur=4;
        c.fillText(label,x+w/2,y+h/2);c.shadowBlur=0;
    }

    function drawWin(c){
        drawConfetti(c);
        c.fillStyle='rgba(0,0,0,0.58)';c.fillRect(0,0,W,H);
        const pw=isMobile?W*0.86:395,ph=isMobile?248:262,px=W/2-pw/2,py=H/2-ph/2;
        c.fillStyle='rgba(8,18,38,0.92)';rrect(c,px,py,pw,ph,24);c.fill();
        c.strokeStyle='#FFD700';c.lineWidth=2.5;rrect(c,px,py,pw,ph,24);c.stroke();
        c.font=`bold ${isMobile?22:30}px 'Orbitron','Arial',sans-serif`;
        c.fillStyle='#FFE040';c.textAlign='center';c.textBaseline='middle';
        c.shadowColor='#FFB800';c.shadowBlur=14;c.fillText('LEVEL COMPLETE!',W/2,py+36);c.shadowBlur=0;
        const stars=getStars(score);
        const ssz=isMobile?28:34;
        for(let i=0;i<3;i++){
            const sx=W/2-ssz*1.5+i*ssz*1.5;
            c.font=`${ssz}px Arial`;c.globalAlpha=i<stars?1:0.22;c.fillText('⭐',sx,py+82);
        }
        c.globalAlpha=1;
        c.font=`bold ${isMobile?15:19}px 'Rajdhani','Arial',sans-serif`;c.fillStyle='#FFF';
        c.fillText(`Score: ${score.toLocaleString()}`,W/2,py+118);
        winButtons=[];
        const bY=py+152,bW=isMobile?pw*0.38:128,bH=isMobile?38:42;
        drawBtn(c,W/2-bW-8,bY,bW,bH,'🔄 RETRY','#E87820');
        winButtons.push({x:W/2-bW-8,y:bY,w:bW,h:bH,action:()=>loadLevel(level)});
        drawBtn(c,W/2+8,bY,bW,bH,level<MAX_LEVEL?'NEXT ▶':'🏆 DONE','#22AA44');
        winButtons.push({x:W/2+8,y:bY,w:bW,h:bH,action:()=>{
            if(level<MAX_LEVEL)loadLevel(level+1);
            else if(typeof window.updateScore==='function')window.updateScore(totalScore+score,true);
        }});
    }

    function drawLose(c){
        c.fillStyle='rgba(0,0,0,0.65)';c.fillRect(0,0,W,H);
        const pw=isMobile?W*0.82:360,ph=isMobile?215:228,px=W/2-pw/2,py=H/2-ph/2;
        c.fillStyle='rgba(20,5,5,0.94)';rrect(c,px,py,pw,ph,22);c.fill();
        c.strokeStyle='#FF4444';c.lineWidth=2.5;rrect(c,px,py,pw,ph,22);c.stroke();
        c.font=`bold ${isMobile?22:30}px 'Orbitron','Arial',sans-serif`;
        c.fillStyle='#FF4444';c.textAlign='center';c.textBaseline='middle';
        c.shadowColor='#FF0000';c.shadowBlur=10;c.fillText('LEVEL FAILED!',W/2,py+36);c.shadowBlur=0;
        c.font=`${isMobile?14:18}px 'Rajdhani','Arial',sans-serif`;c.fillStyle='#CCC';
        c.fillText(`Score: ${score.toLocaleString()}`,W/2,py+78);
        c.font=`${isMobile?12:14}px 'Rajdhani','Arial',sans-serif`;c.fillStyle='#888';
        c.fillText('Some pigs survived! Try again.',W/2,py+106);
        loseButtons=[];
        const bY=py+142,bW=isMobile?pw*0.55:140,bH=isMobile?38:42;
        drawBtn(c,W/2-bW/2,bY,bW,bH,'🔄 TRY AGAIN','#E87820');
        loseButtons.push({x:W/2-bW/2,y:bY,w:bW,h:bH,action:()=>loadLevel(level)});
    }

    // ═══════════════════════════════════════════
    // GAME LOOP
    // ═══════════════════════════════════════════
    let lastTime = performance.now();
    function loop(now){
        if(destroyed)return;
        lastTime=now;
        update();draw();
        requestAnimationFrame(loop);
    }

    // ═══════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════
    resize();

    if(isPortrait()){
        createRotateOverlay();
        gameStarted=false;
        requestAnimationFrame(loop);
    }else{
        gameStarted=true;
        loadLevel(1);
        requestAnimationFrame(loop);
    }

    const titleEl=document.getElementById('current-game-title');
    if(titleEl)titleEl.textContent='Angry Birds';

    const instance={
        resize(){
            resize();
            SX=W*0.17;SY=GROUND;
            SF1X=SX-14;SF1Y=SY-68;
            SF2X=SX+14;SF2Y=SY-68;
            SEAT_X=SX;SEAT_Y=SF1Y+10;
            if(bird&&!bird.launched){bird.cx=SEAT_X;bird.cy=SEAT_Y-bird.r;}
        },
        destroy(){
            // ── IMPORTANT: destroyed flag pehle set karo ──
            destroyed=true;

            // ── Event listeners remove karo ──
            if(orientationCheckBound){
                window.removeEventListener('orientationchange', orientationCheckBound);
                window.removeEventListener('resize', orientationCheckBound);
                orientationCheckBound=null;
            }

            // ── Overlay hata do ──
            removeRotateOverlay();

            // ── Game state clean karo ──
            pigs=[];blocks=[];bird=null;splitBirds=[];particles=[];
            if(audioCtx){try{audioCtx.close();}catch(e){}}
        },
        togglePause(){return false;},
        get isPaused(){return false;}
    };

    window._activeGameInstance=instance;
    return instance;
};