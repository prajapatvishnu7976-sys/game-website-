/* ============================================
   NEONARCADE - AUDIO ENGINE v4.1
   MOBILE HD FIXED — iOS/Android Compatible
   ============================================ */

class AudioManager {
    constructor() {
        this.enabled = true;
        this.audioContext = null;
        this.masterGain = null;
        this.sfxGain = null;
        this.musicGain = null;

        /* ═══ MOBILE VOLUME FIXES ═══
           Music volume kam rakho - mobile speakers pe loud lagta hai */
        this.masterVolume = 0.7;
        this.sfxVolume    = 0.75;
        this.musicVolume  = 0.18; // 0.3 → 0.18 (mobile pe less is more)

        this.currentMusic  = null;
        this.musicNodes    = {};
        this.musicPlaying  = false;
        this.musicLoop     = null;
        this.stopMusicFn   = null;
        this.destroyed     = false;

        this.soundCooldowns = {};
        this.soundCooldownTime = {
            hover: 50, click: 80, bounce: 60,
            score: 100, shoot: 80, hit: 60,
            pop: 50, collect: 80, navigate: 120
        };

        this.reverbNode  = null;
        this.compressor  = null;
        this.convolver   = null;

        this.activeOscillators = [];
        this.activeSources     = [];

        this._initAttempted = false;
        this._resumeAttempts = 0;

        /* ═══ MOBILE DETECTION ═══ */
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
            .test(navigator.userAgent);

        /* ═══ iOS DETECTION ═══ */
        this.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

        /* ═══ REDUCE MUSIC COMPLEXITY ON MOBILE ═══ */
        if (this.isMobile) {
            this.musicVolume = 0.12; // Even lower on mobile
        }
    }

    init() {
        if (this._initAttempted) return;
        this._initAttempted = true;
        try {
            /* ═══ iOS needs webkit prefix ═══ */
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                console.warn('❌ Web Audio API not supported');
                this.enabled = false;
                return;
            }

            this.audioContext = new AudioContextClass();
            this.setupAudioChain();
            this.createReverb();

            /* ═══ iOS: Resume immediately on init ═══ */
            if (this.isIOS && this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }

            console.log(
                `🔊 Audio Engine v4.1 | Mobile:${this.isMobile} | iOS:${this.isIOS} | State:${this.audioContext.state}`
            );
        } catch (e) {
            console.warn('❌ Audio init failed:', e);
            this.enabled = false;
        }
    }

    setupAudioChain() {
        const ctx = this.audioContext;
        if (!ctx) return;

        /* ═══ COMPRESSOR — prevents clipping on mobile speakers ═══ */
        this.compressor = ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -20;
        this.compressor.knee.value      = 10;
        this.compressor.ratio.value     = 5;
        this.compressor.attack.value    = 0.003;
        this.compressor.release.value   = 0.15;

        this.masterGain = ctx.createGain();
        this.masterGain.gain.value = this.masterVolume;

        this.sfxGain = ctx.createGain();
        this.sfxGain.gain.value = this.sfxVolume;

        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = this.musicVolume;

        /* ═══ AUDIO CHAIN: SFX/Music → Master → Compressor → Output ═══ */
        this.sfxGain.connect(this.masterGain);
        this.musicGain.connect(this.masterGain);
        this.masterGain.connect(this.compressor);
        this.compressor.connect(ctx.destination);
    }

    async createReverb() {
        if (!this.audioContext) return;
        /* ═══ Skip reverb on mobile (saves CPU) ═══ */
        if (this.isMobile) return;

        try {
            const ctx = this.audioContext;
            const convolver = ctx.createConvolver();
            const length = ctx.sampleRate * 1.5;
            const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
            for (let ch = 0; ch < 2; ch++) {
                const data = buffer.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
                }
            }
            convolver.buffer = buffer;
            this.reverbNode = ctx.createGain();
            this.reverbNode.gain.value = 0.1; // Lighter reverb
            convolver.connect(this.reverbNode);
            this.reverbNode.connect(this.masterGain);
            this.convolver = convolver;
        } catch (e) {
            console.warn('Reverb creation failed:', e);
        }
    }

    /* ═══ RESUME — Critical for iOS/Mobile ═══ */
    async resume() {
        if (!this.audioContext) return;

        if (this.audioContext.state === 'suspended') {
            try {
                await this.audioContext.resume();
                this._resumeAttempts = 0;
                console.log('🔊 AudioContext resumed');
            } catch(e) {
                this._resumeAttempts++;
                if (this._resumeAttempts < 3) {
                    console.warn('Audio resume failed, attempt:', this._resumeAttempts);
                }
            }
        }

        /* ═══ iOS: Force resume if closed ═══ */
        if (this.audioContext.state === 'closed') {
            this._initAttempted = false;
            this.init();
        }
    }

    /* ═══ TRACK OSCILLATORS FOR MEMORY CLEANUP ═══ */
    _trackOsc(osc) {
        this.activeOscillators.push(osc);
        osc.onended = () => {
            const idx = this.activeOscillators.indexOf(osc);
            if (idx > -1) this.activeOscillators.splice(idx, 1);
        };
        return osc;
    }

    _trackSource(src) {
        this.activeSources.push(src);
        src.onended = () => {
            const idx = this.activeSources.indexOf(src);
            if (idx > -1) this.activeSources.splice(idx, 1);
        };
        return src;
    }

    /* ═══ SAFE OSCILLATOR CREATE — Returns null if context suspended ═══ */
    _safeOsc() {
        if (!this.audioContext || this.destroyed) return null;
        if (this.audioContext.state === 'suspended') {
            this.resume();
            return null; // Skip this sound, don't crash
        }
        try {
            return this._trackOsc(this.audioContext.createOscillator());
        } catch(e) {
            return null;
        }
    }

    _safeGain() {
        if (!this.audioContext || this.destroyed) return null;
        try {
            return this.audioContext.createGain();
        } catch(e) {
            return null;
        }
    }

    /* ═══ MAIN PLAY FUNCTION ═══ */
    play(soundName, options = {}) {
        if (!this.enabled || !this.audioContext || this.destroyed) return;

        /* ═══ Cooldown check ═══ */
        const now = performance.now();
        const cooldown = this.soundCooldownTime[soundName] || 0;
        if (cooldown > 0) {
            if (this.soundCooldowns[soundName] &&
                now - this.soundCooldowns[soundName] < cooldown) return;
            this.soundCooldowns[soundName] = now;
        }

        /* ═══ Resume if suspended (mobile) ═══ */
        if (this.audioContext.state === 'suspended') {
            this.resume();
            return; // Skip this play, next one will work
        }

        try {
            switch (soundName) {
                case 'hover':       this.playHover(options); break;
                case 'click':       this.playClick(options); break;
                case 'navigate':    this.playNavigate(options); break;
                case 'pop':         this.playPop(options); break;
                case 'score':       this.playScore(options); break;
                case 'bounce':      this.playBounce(options); break;
                case 'hit':         this.playHit(options); break;
                case 'collect':     this.playCollect(options); break;
                case 'fail':        this.playFail(options); break;
                case 'shoot':       this.playShoot(options); break;
                case 'knife':       this.playKnife(options); break;
                case 'jump':        this.playJump(options); break;
                case 'splash':      this.playSplash(options); break;
                case 'explosion':   this.playExplosion(options); break;
                case 'success':     this.playSuccess(options); break;
                case 'levelUp':     this.playLevelUp(options); break;
                case 'powerup':     this.playPowerup(options); break;
                case 'combo':       this.playCombo(options); break;
                case 'gameOver':    this.playGameOver(options); break;
                case 'win':         this.playWin(options); break;
                case 'coinCollect': this.playCoinCollect(options); break;
                case 'glitch':      this.playGlitch(options); break;
                case 'laser':       this.playLaser(options); break;
                case 'shield':      this.playShield(options); break;
                case 'recharge':    this.playRecharge(options); break;
                case 'bell':        this.playBell(options); break;
                default: break;
            }
        } catch (e) {
            /* ═══ Silent fail on mobile — don't break gameplay ═══ */
            if (!this.isMobile) console.warn(`Sound error (${soundName}):`, e);
        }
    }

    /* ============================================================
       UI SOUNDS
    ============================================================ */

    playHover() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(1400, t + 0.06);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.04, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t); osc.stop(t + 0.1);
    }

    playClick() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;

        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'square';
        osc.frequency.setValueAtTime(900, t);
        osc.frequency.exponentialRampToValueAtTime(500, t + 0.05);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
        osc.start(t); osc.stop(t + 0.1);

        const osc2 = this._safeOsc();
        const gain2 = this._safeGain();
        if (osc2 && gain2) {
            osc2.connect(gain2); gain2.connect(this.sfxGain);
            osc2.type = 'square'; osc2.frequency.value = 1600;
            gain2.gain.setValueAtTime(0.05, t);
            gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
            osc2.start(t + 0.02); osc2.stop(t + 0.06);
        }
    }

    playNavigate() {
        const ctx = this.audioContext;
        [600, 800, 1000].forEach((f, i) => {
            const t = ctx.currentTime + i * 0.06;
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'sine'; osc.frequency.value = f;
            gain.gain.setValueAtTime(0.07, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            osc.start(t); osc.stop(t + 0.12);
        });
    }

    /* ============================================================
       GAME FEEDBACK
    ============================================================ */

    playPop(options = {}) {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const pitch = options.pitch || 1;

        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;

        const filter = ctx.createBiquadFilter();
        osc.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
        filter.type = 'bandpass';
        filter.frequency.value = 800 * pitch;
        filter.Q.value = 1.5;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(600 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(200 * pitch, t + 0.12);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.18);

        /* Skip noise layer on mobile to save CPU */
        if (!this.isMobile) {
            this.playNoiseShort(0.06, 0.08, 'highpass', 2000);
        }
    }

    playScore() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, t);
        osc.frequency.setValueAtTime(1100, t + 0.05);
        gain.gain.setValueAtTime(0.09, t);
        gain.gain.setValueAtTime(0.07, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.18);
    }

    playBounce(options = {}) {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const pitch = options.pitch || 1;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300 * pitch, t);
        osc.frequency.exponentialRampToValueAtTime(150 * pitch, t + 0.08);
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t); osc.stop(t + 0.12);
    }

    playHit() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        const dist = ctx.createWaveShaper();
        dist.curve = this.makeDistortionCurve(150);
        osc.connect(dist); dist.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.15);

        if (!this.isMobile) {
            this.playNoiseShort(0.06, 0.1, 'lowpass', 800);
        }
    }

    playCollect() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        /* ═══ Mobile: fewer notes = less CPU ═══ */
        const notes = this.isMobile ? [660, 1100] : [660, 880, 1100, 1320];
        notes.forEach((f, i) => {
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'sine'; osc.frequency.value = f;
            const st = t + i * 0.06;
            gain.gain.setValueAtTime(0, st);
            gain.gain.linearRampToValueAtTime(0.09, st + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.1);
            osc.start(st); osc.stop(st + 0.12);
        });
    }

    playFail() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        [400, 300, 220, 180].forEach((f, i) => {
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'sawtooth'; osc.frequency.value = f;
            const st = t + i * 0.08;
            gain.gain.setValueAtTime(0.1, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.1);
            osc.start(st); osc.stop(st + 0.12);
        });
    }

    /* ============================================================
       ACTION SOUNDS
    ============================================================ */

    playShoot() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        const filter = ctx.createBiquadFilter();
        osc.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
        filter.type = 'highpass'; filter.frequency.value = 500;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, t);
        osc.frequency.exponentialRampToValueAtTime(200, t + 0.1);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.start(t); osc.stop(t + 0.15);

        if (!this.isMobile) {
            this.playNoiseShort(0.08, 0.12, 'bandpass', 1500, 0.15);
        }
    }

    playKnife() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        const filter = ctx.createBiquadFilter();
        osc.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(2000, t);
        filter.frequency.exponentialRampToValueAtTime(500, t + 0.12);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.12);
        gain.gain.setValueAtTime(0.07, t);
        gain.gain.setValueAtTime(0.13, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.18);
        this.playMetalTing(t + 0.05);
    }

    playJump() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'square';
        osc.frequency.setValueAtTime(280, t);
        osc.frequency.exponentialRampToValueAtTime(700, t + 0.12);
        gain.gain.setValueAtTime(0.13, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.2);
    }

    playSplash() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        /* ═══ Mobile: shorter buffer ═══ */
        const bufferDuration = this.isMobile ? 0.15 : 0.3;
        const bufferSize = ctx.sampleRate * bufferDuration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this._trackSource(ctx.createBufferSource());
        const filter = ctx.createBiquadFilter();
        const gain = this._safeGain();
        if (!gain) return;
        noise.buffer = buffer;
        filter.type = 'bandpass'; filter.frequency.value = 800; filter.Q.value = 0.8;
        noise.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + bufferDuration);
        filter.frequency.setValueAtTime(1200, t);
        filter.frequency.exponentialRampToValueAtTime(400, t + bufferDuration);
        noise.start(t); noise.stop(t + bufferDuration + 0.05);
    }

    playExplosion(options = {}) {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const intensity = options.intensity || 1;

        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        const dist = ctx.createWaveShaper();
        dist.curve = this.makeDistortionCurve(200);
        osc.connect(dist); dist.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120 * intensity, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
        gain.gain.setValueAtTime(0.35 * intensity, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        osc.start(t); osc.stop(t + 0.45);

        /* ═══ Skip noise layer on mobile ═══ */
        if (!this.isMobile) {
            const bufferSize = ctx.sampleRate * 0.4;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
            const noise = this._trackSource(ctx.createBufferSource());
            const nFilter = ctx.createBiquadFilter();
            const nGain = this._safeGain();
            if (nGain) {
                noise.buffer = buffer;
                nFilter.type = 'lowpass';
                nFilter.frequency.setValueAtTime(3000, t);
                nFilter.frequency.exponentialRampToValueAtTime(200, t + 0.4);
                noise.connect(nFilter); nFilter.connect(nGain); nGain.connect(this.sfxGain);
                nGain.gain.setValueAtTime(0.3 * intensity, t);
                nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
                noise.start(t); noise.stop(t + 0.5);
            }
        }
    }

    /* ============================================================
       ACHIEVEMENT SOUNDS
    ============================================================ */

    playSuccess() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        [523.25, 659.25, 783.99].forEach((f, i) => {
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'square'; osc.frequency.value = f;
            const st = t + i * 0.08;
            gain.gain.setValueAtTime(0.1, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.15);
            osc.start(st); osc.stop(st + 0.18);
        });

        if (!this.isMobile) {
            setTimeout(() => {
                if (!this.audioContext || this.destroyed) return;
                for (let i = 0; i < 3; i++) {
                    setTimeout(() => {
                        if (!this.audioContext || this.destroyed) return;
                        const ct = this.audioContext.currentTime;
                        const o = this._safeOsc();
                        const g = this._safeGain();
                        if (!o || !g) return;
                        o.connect(g); g.connect(this.sfxGain);
                        o.type = 'sine'; o.frequency.value = 2000 + i * 400;
                        g.gain.setValueAtTime(0.04, ct);
                        g.gain.exponentialRampToValueAtTime(0.001, ct + 0.1);
                        o.start(ct); o.stop(ct + 0.12);
                    }, i * 40);
                }
            }, 250);
        }
    }

    playLevelUp() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const melody = [
            { f: 523.25, t: 0, d: 0.12 },
            { f: 659.25, t: 0.1, d: 0.12 },
            { f: 783.99, t: 0.2, d: 0.12 },
            { f: 1046.5, t: 0.3, d: 0.25 }
        ];
        /* ═══ Mobile: only first 3 notes ═══ */
        const notes = this.isMobile ? melody.slice(0, 3) : melody;
        notes.forEach(note => {
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'square'; osc.frequency.value = note.f;
            const st = t + note.t;
            gain.gain.setValueAtTime(0.12, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + note.d);
            osc.start(st); osc.stop(st + note.d + 0.05);
        });

        if (!this.isMobile) {
            const bass = this._safeOsc();
            const bassGain = this._safeGain();
            if (bass && bassGain) {
                bass.connect(bassGain); bassGain.connect(this.sfxGain);
                bass.type = 'sawtooth';
                bass.frequency.setValueAtTime(130, t);
                bass.frequency.exponentialRampToValueAtTime(80, t + 0.3);
                bassGain.gain.setValueAtTime(0.18, t);
                bassGain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                bass.start(t); bass.stop(t + 0.4);
            }
        }
    }

    playPowerup() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        /* ═══ Mobile: 3 notes instead of 5 ═══ */
        const freqs = this.isMobile ? [440, 659, 880] : [440, 554, 659, 880, 1109];
        freqs.forEach((f, i) => {
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'sine';
            const st = t + i * 0.06;
            osc.frequency.setValueAtTime(f, st);
            osc.frequency.exponentialRampToValueAtTime(f * 1.05, st + 0.08);
            gain.gain.setValueAtTime(0.09, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
            osc.start(st); osc.stop(st + 0.15);
        });
    }

    playCombo(options = {}) {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const level = options.level || 1;
        const basePitch = 1 + level * 0.15;
        const notes = [523, 659, 784, 1047].map(f => f * basePitch);
        notes.slice(0, Math.min(level + 1, 4)).forEach((f, i) => {
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'square'; osc.frequency.value = f;
            const st = t + i * 0.06;
            gain.gain.setValueAtTime(0.11, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.12);
            osc.start(st); osc.stop(st + 0.15);
        });
    }

    playGameOver() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const notes = [
            { f: 523.25, t: 0, d: 0.2 },
            { f: 466.16, t: 0.2, d: 0.2 },
            { f: 415.30, t: 0.4, d: 0.2 },
            { f: 349.23, t: 0.6, d: 0.4 }
        ];
        notes.forEach(note => {
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'sawtooth'; osc.frequency.value = note.f;
            const st = t + note.t;
            gain.gain.setValueAtTime(0.15, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + note.d + 0.05);
            osc.start(st); osc.stop(st + note.d + 0.08);
        });

        if (!this.isMobile) {
            const bass = this._safeOsc();
            const bassGain = this._safeGain();
            if (bass && bassGain) {
                const bassDist = ctx.createWaveShaper();
                bassDist.curve = this.makeDistortionCurve(100);
                bass.connect(bassDist); bassDist.connect(bassGain); bassGain.connect(this.sfxGain);
                bass.type = 'sawtooth';
                bass.frequency.setValueAtTime(100, t);
                bass.frequency.exponentialRampToValueAtTime(55, t + 0.8);
                bassGain.gain.setValueAtTime(0.2, t);
                bassGain.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
                bass.start(t); bass.stop(t + 1.05);
            }
        }
    }

    playWin() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const melody = [
            { f: 523.25, t: 0 }, { f: 523.25, t: 0.12 },
            { f: 523.25, t: 0.24 }, { f: 415.30, t: 0.36 },
            { f: 466.16, t: 0.48 }, { f: 523.25, t: 0.68 },
            { f: 466.16, t: 0.8 },  { f: 523.25, t: 0.92 }
        ];
        /* ═══ Mobile: half the notes ═══ */
        const notes = this.isMobile ? melody.filter((_, i) => i % 2 === 0) : melody;
        notes.forEach(note => {
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            osc.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'square'; osc.frequency.value = note.f;
            const st = t + note.t;
            gain.gain.setValueAtTime(0.13, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.18);
            osc.start(st); osc.stop(st + 0.22);
        });
    }

    /* ============================================================
       SPECIAL SOUNDS
    ============================================================ */

    playCoinCollect() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(988, t);
        osc.frequency.setValueAtTime(1319, t + 0.06);
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.setValueAtTime(0.15, t + 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.start(t); osc.stop(t + 0.22);

        if (!this.isMobile) {
            const osc2 = this._safeOsc();
            const gain2 = this._safeGain();
            if (osc2 && gain2) {
                osc2.connect(gain2); gain2.connect(this.sfxGain);
                osc2.type = 'sine'; osc2.frequency.value = 2637;
                gain2.gain.setValueAtTime(0.05, t + 0.08);
                gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
                osc2.start(t + 0.08); osc2.stop(t + 0.2);
            }
        }
    }

    playGlitch() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        /* ═══ Mobile: 2 instead of 4 glitch layers ═══ */
        const layers = this.isMobile ? 2 : 4;
        for (let i = 0; i < layers; i++) {
            const osc = this._safeOsc();
            const gain = this._safeGain();
            if (!osc || !gain) return;
            const dist = ctx.createWaveShaper();
            dist.curve = this.makeDistortionCurve(200);
            osc.connect(dist); dist.connect(gain); gain.connect(this.sfxGain);
            osc.type = 'sawtooth';
            osc.frequency.value = 100 + Math.random() * 2000;
            const st = t + i * 0.04 + Math.random() * 0.02;
            gain.gain.setValueAtTime(0.07, st);
            gain.gain.exponentialRampToValueAtTime(0.001, st + 0.05);
            osc.start(st); osc.stop(st + 0.07);
        }
    }

    playLaser() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        const filter = ctx.createBiquadFilter();
        osc.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
        filter.type = 'highpass'; filter.frequency.value = 1000;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(2000, t);
        osc.frequency.exponentialRampToValueAtTime(400, t + 0.15);
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
        osc.start(t); osc.stop(t + 0.2);
    }

    playShield() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.linearRampToValueAtTime(400, t + 0.2);
        osc.frequency.linearRampToValueAtTime(300, t + 0.4);
        gain.gain.setValueAtTime(0.04, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
        osc.start(t); osc.stop(t + 0.55);
    }

    playRecharge() {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.5);
        gain.gain.setValueAtTime(0.03, t);
        gain.gain.linearRampToValueAtTime(0.1, t + 0.4);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.start(t); osc.stop(t + 0.6);
    }

    playBell(options = {}) {
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const freq = options.freq || 880;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'sine'; osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
        osc.start(t); osc.stop(t + 1.6);

        /* ═══ Mobile: skip harmonics ═══ */
        if (!this.isMobile) {
            [2, 3, 4.2, 5.4].forEach((mult, i) => {
                const ho = this._safeOsc();
                const hg = this._safeGain();
                if (!ho || !hg) return;
                ho.connect(hg); hg.connect(this.sfxGain);
                ho.type = 'sine'; ho.frequency.value = freq * mult;
                hg.gain.setValueAtTime(0.07 / (i + 1), t);
                hg.gain.exponentialRampToValueAtTime(0.001, t + 0.8 / (i + 1));
                ho.start(t); ho.stop(t + 1.0);
            });
        }
    }

    /* ============================================================
       MUSIC — MOBILE LIGHTWEIGHT VERSIONS
    ============================================================ */

    startMusic(type = 'menu') {
        if (!this.enabled || !this.audioContext || this.musicPlaying || this.destroyed) return;
        this.resume();
        switch (type) {
            case 'menu':    this.playMenuMusic(); break;
            case 'game':    this.playGameMusic(); break;
            case 'intense': this.playIntenseMusic(); break;
        }
        this.musicPlaying = true;
    }

    playMenuMusic() {
        const ctx = this.audioContext;
        if (!ctx) return;
        let beatTime = ctx.currentTime;
        const tempo = 0.5;
        const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
        const allNodes = [];

        /* ═══ Mobile: simpler version - 4 notes instead of 8 ═══ */
        const noteCount = this.isMobile ? 4 : 8;

        const schedule = () => {
            if (!this.musicPlaying || this.destroyed) return;
            for (let i = 0; i < noteCount; i++) {
                const osc = this._safeOsc();
                const gain = this._safeGain();
                if (!osc || !gain) continue;
                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass'; filter.frequency.value = 700;
                osc.connect(filter); filter.connect(gain); gain.connect(this.musicGain);
                osc.type = 'sine'; osc.frequency.value = notes[i % notes.length] * 0.5;
                const st = beatTime + i * tempo * 0.5;
                gain.gain.setValueAtTime(0, st);
                gain.gain.linearRampToValueAtTime(0.035, st + 0.2);
                gain.gain.linearRampToValueAtTime(0.015, st + 0.6);
                gain.gain.linearRampToValueAtTime(0, st + tempo * 0.5);
                osc.start(st); osc.stop(st + tempo * 0.6);
                allNodes.push(osc);
            }
            beatTime += tempo * (this.isMobile ? 2 : 4);
            this.musicLoop = setTimeout(schedule, tempo * (this.isMobile ? 2 : 4) * 1000 - 100);
        };
        schedule();
        this.stopMusicFn = () => {
            clearTimeout(this.musicLoop);
            allNodes.forEach(n => { try { n.stop(); } catch(e) {} });
        };
    }

    playGameMusic() {
        const ctx = this.audioContext;
        if (!ctx) return;
        const tempo = 0.25;
        let beatTime = ctx.currentTime;
        const allNodes = [];

        /* ═══ Mobile: simplified beat pattern ═══ */
        const pattern = this.isMobile ? [1, 0, 0, 1] : [1, 0, 0, 1, 0, 1, 0, 0];
        const beats = pattern.length;

        const schedule = () => {
            if (!this.musicPlaying || this.destroyed) return;
            for (let i = 0; i < beats; i++) {
                const st = beatTime + i * tempo;
                if (pattern[i]) {
                    const kick = this.createKickDrum(st);
                    if (kick) allNodes.push(kick);
                }
                /* ═══ Skip hi-hats on mobile ═══ */
                if (!this.isMobile && i % 2 === 1) {
                    this.createHiHat(st);
                }
                /* ═══ Bass line — mobile gets simpler ═══ */
                if (!this.isMobile) {
                    const bassNotes = [55, 55, 65.41, 55];
                    const bo = this._safeOsc();
                    const bg = this._safeGain();
                    if (bo && bg) {
                        bo.connect(bg); bg.connect(this.musicGain);
                        bo.type = 'sawtooth'; bo.frequency.value = bassNotes[i % 4];
                        bg.gain.setValueAtTime(0, st);
                        bg.gain.linearRampToValueAtTime(0.04, st + 0.02);
                        bg.gain.exponentialRampToValueAtTime(0.001, st + tempo * 0.8);
                        bo.start(st); bo.stop(st + tempo);
                        allNodes.push(bo);
                    }
                }
            }
            beatTime += tempo * beats;
            this.musicLoop = setTimeout(schedule, tempo * beats * 1000 - 50);
        };
        schedule();
        this.stopMusicFn = () => {
            clearTimeout(this.musicLoop);
            allNodes.forEach(n => { try { n.stop(); } catch(e) {} });
        };
    }

    playIntenseMusic() {
        /* ═══ Mobile: use game music instead — intense is too heavy ═══ */
        if (this.isMobile) {
            this.playGameMusic();
            return;
        }

        const ctx = this.audioContext;
        if (!ctx) return;
        const tempo = 0.18;
        let beatTime = ctx.currentTime;
        const allNodes = [];

        const schedule = () => {
            if (!this.musicPlaying || this.destroyed) return;
            for (let i = 0; i < 16; i++) {
                const st = beatTime + i * tempo;
                if (i % 4 === 0 || i % 4 === 2) {
                    const kick = this.createKickDrum(st);
                    if (kick) allNodes.push(kick);
                }
                if (i % 8 === 4) this.createSnare(st);
                if (i % 2 === 1) this.createHiHat(st, 0.5);
                const leadFreqs = [220, 246.94, 261.63, 246.94, 220, 196, 174.61, 196];
                const lo = this._safeOsc();
                const lg = this._safeGain();
                if (lo && lg) {
                    const lf = ctx.createBiquadFilter();
                    lf.type = 'lowpass'; lf.frequency.value = 1200;
                    lo.connect(lf); lf.connect(lg); lg.connect(this.musicGain);
                    lo.type = 'square'; lo.frequency.value = leadFreqs[i % 8] * 2;
                    lg.gain.setValueAtTime(0, st);
                    lg.gain.linearRampToValueAtTime(0.035, st + 0.01);
                    lg.gain.exponentialRampToValueAtTime(0.001, st + tempo * 0.9);
                    lo.start(st); lo.stop(st + tempo);
                    allNodes.push(lo);
                }
            }
            beatTime += tempo * 16;
            this.musicLoop = setTimeout(schedule, tempo * 16 * 1000 - 50);
        };
        schedule();
        this.stopMusicFn = () => {
            clearTimeout(this.musicLoop);
            allNodes.forEach(n => { try { n.stop(); } catch(e) {} });
        };
    }

    stopMusic(fadeOut = true) {
        if (!this.musicPlaying) return;
        this.musicPlaying = false;
        clearTimeout(this.musicLoop);
        if (fadeOut && this.musicGain && this.audioContext &&
            this.audioContext.state !== 'closed') {
            const ctx = this.audioContext;
            const t = ctx.currentTime;
            this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, t);
            this.musicGain.gain.linearRampToValueAtTime(0, t + 0.4);
            setTimeout(() => {
                if (this.stopMusicFn) this.stopMusicFn();
                if (this.musicGain && this.audioContext &&
                    this.audioContext.state !== 'closed') {
                    this.musicGain.gain.value = this.musicVolume;
                }
            }, 500);
        } else {
            if (this.stopMusicFn) this.stopMusicFn();
        }
    }

    /* ============================================================
       DRUM HELPERS
    ============================================================ */

    createKickDrum(t) {
        const ctx = this.audioContext;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return null;
        const dist = ctx.createWaveShaper();
        dist.curve = this.makeDistortionCurve(80);
        osc.connect(dist); dist.connect(gain); gain.connect(this.musicGain);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.18);
        return osc;
    }

    createHiHat(t, volume = 1) {
        const ctx = this.audioContext;
        if (!ctx || this.destroyed) return null;
        const bufferSize = ctx.sampleRate * 0.05;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this._trackSource(ctx.createBufferSource());
        const filter = ctx.createBiquadFilter();
        const gain = this._safeGain();
        if (!gain) return null;
        noise.buffer = buffer;
        filter.type = 'highpass'; filter.frequency.value = 7000;
        noise.connect(filter); filter.connect(gain); gain.connect(this.musicGain);
        gain.gain.setValueAtTime(0.03 * volume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        noise.start(t); noise.stop(t + 0.06);
        return noise;
    }

    createSnare(t) {
        const ctx = this.audioContext;
        const osc = this._safeOsc();
        const oscGain = this._safeGain();
        if (!osc || !oscGain) return;
        osc.connect(oscGain); oscGain.connect(this.musicGain);
        osc.type = 'triangle'; osc.frequency.value = 200;
        oscGain.gain.setValueAtTime(0.07, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.start(t); osc.stop(t + 0.12);

        const bufferSize = ctx.sampleRate * 0.1;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this._trackSource(ctx.createBufferSource());
        const filter = ctx.createBiquadFilter();
        const gain = this._safeGain();
        if (!gain) return;
        noise.buffer = buffer;
        filter.type = 'bandpass'; filter.frequency.value = 3000; filter.Q.value = 0.5;
        noise.connect(filter); filter.connect(gain); gain.connect(this.musicGain);
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        noise.start(t); noise.stop(t + 0.15);
    }

    /* ============================================================
       NOISE HELPERS
    ============================================================ */

    playNoiseShort(duration, decayTime, filterType, filterFreq, volume = 0.15) {
        if (!this.audioContext || this.destroyed) return;
        if (this.audioContext.state === 'suspended') return;
        const ctx = this.audioContext;
        const t = ctx.currentTime;
        const bufferSize = ctx.sampleRate * duration;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        try {
            const noise = this._trackSource(ctx.createBufferSource());
            const filter = ctx.createBiquadFilter();
            const gain = this._safeGain();
            if (!gain) return;
            noise.buffer = buffer;
            filter.type = filterType; filter.frequency.value = filterFreq;
            noise.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
            gain.gain.setValueAtTime(volume, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + decayTime);
            noise.start(t); noise.stop(t + decayTime + 0.02);
        } catch(e) {}
    }

    playMetalTing(t) {
        if (!this.audioContext || this.destroyed) return;
        const ctx = this.audioContext;
        const osc = this._safeOsc();
        const gain = this._safeGain();
        if (!osc || !gain) return;
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.type = 'sine'; osc.frequency.value = 2500;
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        osc.start(t); osc.stop(t + 0.35);
    }

    makeDistortionCurve(amount) {
        const samples = 256;
        const curve = new Float32Array(samples);
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
        }
        return curve;
    }

    /* ============================================================
       VOLUME CONTROLS
    ============================================================ */

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            if (this.masterGain) this.masterGain.gain.value = 0;
            this.stopMusic(false);
        } else {
            if (this.masterGain) this.masterGain.gain.value = this.masterVolume;
        }
        return this.enabled;
    }

    setMasterVolume(vol) {
        this.masterVolume = Math.max(0, Math.min(1, vol));
        if (this.masterGain && this.enabled) this.masterGain.gain.value = this.masterVolume;
    }

    setSFXVolume(vol) {
        this.sfxVolume = Math.max(0, Math.min(1, vol));
        if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
    }

    setMusicVolume(vol) {
        this.musicVolume = Math.max(0, Math.min(1, vol));
        if (this.musicGain) this.musicGain.gain.value = this.musicVolume;
    }

    /* ============================================================
       CLEANUP
    ============================================================ */

    stopAll() {
        /* ═══ Safe stop all active nodes ═══ */
        [...this.activeOscillators].forEach(osc => {
            try { osc.stop(0); } catch(e) {}
        });
        this.activeOscillators = [];

        [...this.activeSources].forEach(src => {
            try { src.stop(0); } catch(e) {}
        });
        this.activeSources = [];

        this.stopMusic(false);
    }

    destroy() {
        this.destroyed = true;
        this.enabled   = false;
        this.stopAll();
        if (this.audioContext) {
            try { this.audioContext.close(); } catch(e) {}
            this.audioContext = null;
        }
    }
}

/* ============================================================
   GLOBAL INIT — Mobile Interaction Aware
============================================================ */
window.audioManager = new AudioManager();

let _audioInitDone = false;

function _initAudioOnInteraction(e) {
    if (_audioInitDone) return;
    _audioInitDone = true;

    if (window.audioManager && !window.audioManager._initAttempted) {
        window.audioManager.init();
    }

    if (window.audioManager) {
        /* ═══ Resume AudioContext after user gesture ═══ */
        window.audioManager.resume().then ? 
            window.audioManager.resume().then(() => {
                /* ═══ Only start music if not in game ═══ */
                if (!document.getElementById('game-page')?.classList.contains('active')) {
                    setTimeout(() => {
                        if (window.audioManager && !window.audioManager.musicPlaying) {
                            window.audioManager.startMusic('menu');
                        }
                    }, 100);
                }
            }).catch(() => {}) :
            window.audioManager.startMusic('menu');
    }
}

/* ═══ BOTH click AND touchstart for iOS/Android ═══ */
document.addEventListener('click',      _initAudioOnInteraction);
document.addEventListener('touchstart', _initAudioOnInteraction, { passive: true });
document.addEventListener('touchend',   _initAudioOnInteraction, { passive: true });

/* ═══ iOS: Handle page visibility change ═══ */
document.addEventListener('visibilitychange', () => {
    if (!window.audioManager) return;
    if (document.hidden) {
        /* App backgrounded - pause audio */
        if (window.audioManager.audioContext &&
            window.audioManager.audioContext.state === 'running') {
            window.audioManager.audioContext.suspend().catch(() => {});
        }
    } else {
        /* App foregrounded - resume audio */
        if (window.audioManager.audioContext &&
            window.audioManager.audioContext.state === 'suspended') {
            window.audioManager.audioContext.resume().catch(() => {});
        }
    }
});