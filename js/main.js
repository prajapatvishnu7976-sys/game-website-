// ============================================================
// NEONARCADE - PREMIUM MAIN.JS v9.5
// MOBILE HD FIXED — DPR-aware canvas, sharp rendering
// ============================================================

'use strict';

// ============================================================
// 1. GAMES DATA
// ============================================================

const gamesData = [
    { id: 'bubble-shooter',  name: 'Bubble Shooter',     icon: '🫧', category: 'puzzle', description: 'Pop colorful bubbles by matching 3 or more!',      rating: 4.8, plays: 15420, difficulty: 'Easy',   tags: ['bubble','color','match'],             instructions: 'Aim and shoot bubbles to match 3 or more of the same color.',          color: '#00f5ff' },
    { id: 'liquid-sort',     name: 'Liquid Sort Puzzle',  icon: '🧪', category: 'puzzle', description: 'Sort colored liquids into matching tubes.',         rating: 4.7, plays: 12300, difficulty: 'Medium', tags: ['sort','logic','color'],               instructions: 'Tap a tube to select, tap another to pour. Sort all colors!',          color: '#bc13fe' },
    { id: 'knife-hit',       name: 'Knife Hit',           icon: '🔪', category: 'action', description: 'Throw knives at the spinning target!',              rating: 4.6, plays: 18900, difficulty: 'Hard',   tags: ['knife','aim','reflex'],               instructions: "Tap to throw knives at the target. Don't hit other knives!",           color: '#ff6b35' },
    { id: 'color-bump',      name: 'Color Bump',          icon: '🔴', category: 'action', description: 'Bump balls of your color, avoid others!',          rating: 4.5, plays: 9800,  difficulty: 'Medium', tags: ['bump','color','dodge'],               instructions: 'Drag to move. Tap to change color. Bump same-color balls!',           color: '#fe2254' },
    { id: 'bottle-shooting', name: 'Bottle Shooting',     icon: '🎯', category: 'action', description: 'Test your aim by shooting bottles!',               rating: 4.4, plays: 7600,  difficulty: 'Easy',   tags: ['shoot','aim','target'],               instructions: 'Tap to shoot and break all the bottles!',                             color: '#39ff14' },
    { id: 'color-up',        name: 'Color Up',            icon: '🎨', category: 'puzzle', description: 'Match colors to climb higher!',                   rating: 4.5, plays: 11200, difficulty: 'Medium', tags: ['color','climb','match'],              instructions: 'Drag the ball left/right to land on matching color plates!',          color: '#ffff00' },
    { id: 'flappy-bird',     name: 'Flappy Bird',         icon: '🐦', category: 'arcade', description: 'The classic — fly through the pipes!',            rating: 4.9, plays: 45000, difficulty: 'Hard',   tags: ['fly','classic','pipe'],               instructions: 'Tap to flap. Navigate through the pipes!',                            color: '#00f5ff' },
    { id: 'angry-birds',     name: 'Angry Birds',         icon: '🐦‍🔥', category: 'action', description: 'Slingshot birds to destroy pig fortresses!',   rating: 4.9, plays: 55000, difficulty: 'Medium', tags: ['physics','slingshot','birds','pigs'], instructions: 'Pull back to aim, release to launch! Tap mid-flight for special!',    color: '#FF8C00' },
    { id: 'jewel-legend',    name: 'Jewel Legend',        icon: '💎', category: 'puzzle', description: 'Match 3 or more gems to score big!',              rating: 4.8, plays: 38000, difficulty: 'Medium', tags: ['match3','gems','puzzle','jewel'],     instructions: 'Tap a gem then tap adjacent gem to swap. Match 3+ to score!',        color: '#FFD700' },
    { id: 'block-vs-ball',   name: 'Block vs Ball',       icon: '🧱', category: 'arcade', description: 'Break numbered blocks with bouncing balls!',      rating: 4.7, plays: 29000, difficulty: 'Easy',   tags: ['blocks','ball','bounce','breakout'],  instructions: 'Swipe to aim, release to shoot balls. Break all blocks!',             color: '#00D4FF' }
];

// ============================================================
// 2. LEADERBOARD DATA
// ============================================================

const leaderboardData = {
    all: [
        { name: 'NeonMaster',   game: 'Flappy Bird',     score: 156,   avatar: '🎮', country: '🇺🇸' },
        { name: 'BirdSlinger',  game: 'Angry Birds',     score: 28500, avatar: '🐦', country: '🇬🇧' },
        { name: 'GemCrusher',   game: 'Jewel Legend',    score: 18200, avatar: '💎', country: '🇯🇵' },
        { name: 'BlockBuster',  game: 'Block vs Ball',   score: 15800, avatar: '🧱', country: '🇩🇪' },
        { name: 'PuzzleWiz',    game: 'Liquid Sort',     score: 980,   avatar: '🧩', country: '🇫🇷' },
        { name: 'BubblePro',    game: 'Bubble Shooter',  score: 8750,  avatar: '🫧', country: '🇰🇷' },
        { name: 'KnifeThrower', game: 'Knife Hit',       score: 89,    avatar: '🔪', country: '🇧🇷' },
        { name: 'ColorMaster',  game: 'Color Bump',      score: 4340,  avatar: '🔴', country: '🇨🇦' },
        { name: 'SharpShooter', game: 'Bottle Shooting', score: 2800,  avatar: '🎯', country: '🇦🇺' },
        { name: 'HighFlyer',    game: 'Color Up',        score: 1560,  avatar: '🎨', country: '🇮🇳' }
    ]
};

// ============================================================
// 3. STATE
// ============================================================

const state = {
    currentPage:   'home',
    currentGame:   null,
    gameInstance:  null,
    soundEnabled:  true,
    activeFilter:  'all',
    searchQuery:   '',
    favorites:     JSON.parse(localStorage.getItem('neonarcade_favorites') || '[]'),
    scores:        JSON.parse(localStorage.getItem('neonarcade_scores')    || '{}'),
    gameStartTime: null
};

const elements = {};

// ============================================================
// 4. DEVICE PIXEL RATIO — HD QUALITY SETUP
// ============================================================

/**
 * Get optimal DPR for canvas rendering
 * Cap at 3 to prevent memory issues on high-end phones
 */
function getDeviceDPR() {
    return Math.min(window.devicePixelRatio || 1, 3);
}

/**
 * Apply DPR-aware sizing to a canvas element
 * This is the KEY function that makes game sharp on mobile
 *
 * @param {HTMLCanvasElement} canvas
 * @param {number} cssWidth - CSS display width in px
 * @param {number} cssHeight - CSS display height in px
 * @param {number} dpr - Device pixel ratio to use
 */
function applyCanvasDPR(canvas, cssWidth, cssHeight, dpr) {
    dpr = dpr || getDeviceDPR();

    // Set actual pixel dimensions (HD)
    canvas.width  = Math.round(cssWidth  * dpr);
    canvas.height = Math.round(cssHeight * dpr);

    // Set CSS display size (how big it looks)
    canvas.style.width  = cssWidth  + 'px';
    canvas.style.height = cssHeight + 'px';

    // Scale context to match DPR - THIS MAKES EVERYTHING SHARP
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
    }

    return ctx;
}

// ============================================================
// 5. GAME CLASS MAP
// ============================================================

function getGameClass(gameId) {
    const map = {
        'bubble-shooter':  typeof BubbleShooter  !== 'undefined' ? BubbleShooter  : null,
        'liquid-sort':     typeof LiquidSort      !== 'undefined' ? LiquidSort      : null,
        'knife-hit':       typeof KnifeHit        !== 'undefined' ? KnifeHit        : null,
        'color-bump':      typeof ColorBump       !== 'undefined' ? ColorBump       : null,
        'bottle-shooting': typeof BottleShooting  !== 'undefined' ? BottleShooting  : null,
        'flappy-bird':     typeof FlappyBird      !== 'undefined' ? FlappyBird      : null,
        'jewel-legend':    typeof JewelLegend     !== 'undefined' ? JewelLegend     : null,
        'block-vs-ball':   typeof BlockVsBall     !== 'undefined' ? BlockVsBall     : null
    };
    return map[gameId] || null;
}

// ============================================================
// 6. INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    cacheElements();
    initViewportFix();
    simulateLoading();
    initNavigation();
    initMobileMenu();
    initSoundToggle();
    initGameControls();
    initSearch();
    initBackButton();
    initBrowserBack();
    renderGames();
    renderLeaderboard();
    initScrollReveal();
    console.log('%c🎮 NeonArcade v9.5 HD Loaded!', 'color:#b347d9;font-size:16px;font-weight:bold;');
    console.log('%c📱 Device DPR: ' + getDeviceDPR(), 'color:#00d4ff;font-size:12px;');
});

// ============================================================
// 7. CACHE ELEMENTS
// ============================================================

function cacheElements() {
    const ids = [
        'loading-screen', 'app', 'hamburger', 'mobile-menu',
        'sound-toggle', 'featured-games', 'games-grid',
        'leaderboard-content', 'game-canvas', 'game-overlay',
        'game-score', 'current-game-title', 'game-instructions',
        'overlay-title', 'overlay-score', 'back-to-games',
        'resume-btn', 'overlay-restart-btn', 'game-search',
        'search-clear', 'game-wrapper', 'fullscreen-btn',
        'instruction-toast', 'game-header', 'game-page'
    ];
    ids.forEach(id => {
        const key = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        elements[key] = document.getElementById(id);
    });
}

// ============================================================
// 8. VIEWPORT FIX
// ============================================================

function initViewportFix() {
    if (typeof setRealVH !== 'function') {
        window.setRealVH = function() {
            var vh = window.innerHeight;
            document.documentElement.style.setProperty('--real-vh', vh + 'px');
        };
        window.setRealVH();
        window.addEventListener('resize', window.setRealVH);
        window.addEventListener('orientationchange', function() {
            setTimeout(window.setRealVH, 100);
            setTimeout(window.setRealVH, 300);
            setTimeout(window.setRealVH, 600);
        });
    }
}

// ============================================================
// 9. LOADING
// ============================================================

function simulateLoading() {
    const fill = document.getElementById('loading-bar-fill');
    const text = document.getElementById('loading-text');
    const tips = [
        'Loading neon lights...',
        'Generating HD thumbnails...',
        'Warming up the arcade...',
        'Calibrating audio engine...',
        'Almost there...'
    ];
    let progress = 0, tipIdx = 0;

    const interval = setInterval(() => {
        progress += Math.random() * 18 + 4;
        if (progress > 100) progress = 100;
        if (fill) fill.style.width = `${progress}%`;

        const newTip = Math.floor((progress / 100) * tips.length);
        if (newTip !== tipIdx && newTip < tips.length) {
            tipIdx = newTip;
            if (text) {
                text.style.opacity = '0';
                setTimeout(() => {
                    if (text) { text.textContent = tips[tipIdx]; text.style.opacity = '1'; }
                }, 200);
            }
        }

        if (progress >= 100) {
            clearInterval(interval);
            setTimeout(() => {
                elements.loadingScreen?.classList.add('fade-out');
                elements.app?.classList.remove('hidden');
                setTimeout(() => {
                    elements.app?.classList.add('visible');
                    if (elements.loadingScreen) elements.loadingScreen.style.display = 'none';
                }, 500);
            }, 300);
        }
    }, 120);
}

// ============================================================
// 10. BACK BUTTON
// ============================================================

function initBackButton() {
    const btn = document.getElementById('back-to-games');
    if (!btn) return;
    btn.addEventListener('click', handleBackAction);
    btn.addEventListener('touchend', function(e) {
        e.preventDefault();
        handleBackAction();
    }, { passive: false });
}

// ============================================================
// 11. BACK ACTION
// ============================================================

function handleBackAction() {
    if (window.NeonFS && window.NeonFS.isActive()) {
        window.NeonFS.exit();
        return;
    }
    exitGamePage();
}

// ============================================================
// 12. BROWSER BACK BUTTON
// ============================================================

function initBrowserBack() {
    window.history.replaceState({ neon: 'home', level: 0 }, '', window.location.href);

    window.addEventListener('popstate', function(e) {
        if (window.NeonFS && window.NeonFS.isActive()) {
            window.NeonFS.exit();
            window.history.pushState({ neon: 'game', level: 2 }, '', window.location.href);
            return;
        }
        if (state.currentPage === 'game') {
            exitGamePage();
            window.history.pushState({ neon: 'games', level: 1 }, '', window.location.href);
            return;
        }
        if (state.currentPage !== 'home') {
            navigateTo('home');
            window.history.pushState({ neon: 'home', level: 0 }, '', window.location.href);
            return;
        }
        window.history.pushState({ neon: 'home', level: 0 }, '', window.location.href);
    });
}

// ============================================================
// 13. EXIT GAME PAGE
// ============================================================

function exitGamePage() {
    if (window.NeonFS && window.NeonFS.isActive()) {
        window.NeonFS.exit();
    }
    destroyCurrentGame();
    navigateTo('games');
}

// ============================================================
// 14. NAVIGATION
// ============================================================

function initNavigation() {
    document.querySelectorAll('[data-page]').forEach(link => {
        link.addEventListener('click', e => {
            e.preventDefault();
            if (window.audioManager) audioManager.play('navigate');
            navigateTo(link.dataset.page);
        });
    });
}

function navigateTo(page) {
    const validPages = ['home', 'games', 'leaderboard', 'about', 'game'];
    if (!validPages.includes(page)) return;

    if (state.currentPage === 'game' && page !== 'game') {
        if (window.NeonFS && window.NeonFS.isActive()) window.NeonFS.exit();
        destroyCurrentGame();
    }

    const gamePage = document.getElementById('game-page');

    if (page === 'game') {
        if (gamePage) gamePage.style.display = 'flex';
        window.scrollTo(0, 0);
        window.history.pushState({ neon: 'game', level: 1 }, '', window.location.href);
        window.history.pushState({ neon: 'game-fs', level: 2 }, '', window.location.href);
    } else {
        if (gamePage) gamePage.style.display = 'none';
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`${page}-page`);
        if (target) target.classList.add('active');
        window.history.pushState({ neon: page, level: 0 }, '', window.location.href);
    }

    document.querySelectorAll('.nav-link').forEach(l =>
        l.classList.toggle('active', l.dataset.page === page));

    elements.mobileMenu?.classList.remove('active');
    elements.hamburger?.classList.remove('active');
    document.body.classList.remove('menu-open');

    state.currentPage = page;

    if (page !== 'game') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (page === 'leaderboard') updateLeaderboardWithScores();
}

// ============================================================
// 15. DESTROY GAME — CANVAS PROPERLY RESET
// ============================================================

function destroyCurrentGame() {
    window._activeGameInstance = null;

    if (state.gameInstance) {
        try {
            if (typeof state.gameInstance.destroy === 'function') {
                state.gameInstance.destroy();
            }
        } catch (e) { console.warn('Game destroy error:', e); }
        state.gameInstance = null;
    }

    const canvas = document.getElementById('game-canvas');
    if (canvas) {
        try {
            // Clear all canvas content
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        } catch (e) {}

        // Create fresh canvas — preserve id and essential styles
        const fresh = document.createElement('canvas');
        fresh.id = 'game-canvas';
        fresh.style.cssText = [
            'position:absolute',
            'top:0',
            'left:0',
            'width:100%',
            'height:100%',
            'display:block',
            'touch-action:none',
            '-webkit-user-select:none',
            'user-select:none',
            'image-rendering:auto',
            '-webkit-backface-visibility:hidden',
            'backface-visibility:hidden',
            'transform:translateZ(0)'
        ].join(';') + ';';

        canvas.parentNode?.replaceChild(fresh, canvas);
        elements.gameCanvas = fresh;
    }

    if (window.audioManager) { try { audioManager.stopAll(); } catch (e) {} }

    const overlay = document.getElementById('game-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (elements.gameScore) elements.gameScore.textContent = '0';

    state.currentGame   = null;
    state.gameInstance  = null;
    state.gameStartTime = null;
}

// ============================================================
// 16. MOBILE MENU
// ============================================================

function initMobileMenu() {
    if (!elements.hamburger || !elements.mobileMenu) return;
    elements.hamburger.addEventListener('click', () => {
        elements.hamburger.classList.toggle('active');
        elements.mobileMenu.classList.toggle('active');
        document.body.classList.toggle('menu-open');
        if (window.audioManager) audioManager.play('click');
    });
    document.querySelectorAll('.mobile-nav-link').forEach(link => {
        link.addEventListener('click', e => { e.preventDefault(); navigateTo(link.dataset.page); });
    });
    document.addEventListener('click', e => {
        if (!e.target.closest('.navbar') && elements.mobileMenu?.classList.contains('active')) {
            elements.mobileMenu.classList.remove('active');
            elements.hamburger?.classList.remove('active');
            document.body.classList.remove('menu-open');
        }
    });
}

// ============================================================
// 17. SOUND TOGGLE
// ============================================================

function initSoundToggle() {
    if (!elements.soundToggle) return;
    elements.soundToggle.addEventListener('click', () => {
        state.soundEnabled = window.audioManager ? audioManager.toggle() : !state.soundEnabled;
        localStorage.setItem('neonarcade_sound', state.soundEnabled);
        const on  = elements.soundToggle.querySelector('.sound-on');
        const off = elements.soundToggle.querySelector('.sound-off');
        if (on)  on.classList.toggle('hidden', !state.soundEnabled);
        if (off) off.classList.toggle('hidden',  state.soundEnabled);
    });
}

// ============================================================
// 18. SEARCH
// ============================================================

function initSearch() {
    if (!elements.gameSearch) return;
    let t;
    elements.gameSearch.addEventListener('input', e => {
        clearTimeout(t);
        t = setTimeout(() => {
            state.searchQuery = e.target.value.toLowerCase().trim();
            filterAndRenderGames();
        }, 300);
    });
    if (elements.searchClear) {
        elements.searchClear.addEventListener('click', () => {
            elements.gameSearch.value = '';
            state.searchQuery = '';
            filterAndRenderGames();
        });
    }
}

// ============================================================
// 19. GAME CONTROLS
// ============================================================

function initGameControls() {
    if (elements.resumeBtn) {
        elements.resumeBtn.addEventListener('click', () => {
            if (state.gameInstance?.togglePause) state.gameInstance.togglePause();
            hideOverlay();
            if (window.audioManager) audioManager.play('click');
        });
    }
    if (elements.overlayRestartBtn) {
        elements.overlayRestartBtn.addEventListener('click', () => {
            if (window.audioManager) audioManager.play('click');
            restartGame();
        });
    }
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && state.currentPage === 'game') {
            if (window.NeonFS && window.NeonFS.isActive()) {
                window.NeonFS.exit();
            } else if (state.gameInstance?.togglePause) {
                const paused = state.gameInstance.togglePause();
                paused ? showOverlay('PAUSED') : hideOverlay();
            }
        }
    });
}

// ============================================================
// 20. OVERLAY
// ============================================================

function showOverlay(title, score = null, isHighScore = false) {
    const overlay = document.getElementById('game-overlay');
    if (!overlay) return;

    const titleEl = document.getElementById('overlay-title');
    const scoreEl = document.getElementById('overlay-score');
    if (titleEl) titleEl.textContent = title;

    if (scoreEl) {
        if (score !== null) {
            let html = `
                <div style="margin:6px 0">
                    <span style="color:#8080a8;font-size:.9rem">Score</span><br>
                    <span style="color:#d470ff;font-family:Orbitron,sans-serif;font-size:1.8rem;font-weight:900">
                        ${score.toLocaleString()}
                    </span>`;
            if (isHighScore) html += '<br><span style="color:#39ff14;font-size:.85rem">🏆 NEW BEST!</span>';
            html += '</div>';
            if (state.scores[state.currentGame] && !isHighScore) {
                html += `<div style="color:#6a6a9a;font-size:.8rem">
                             Best: ${state.scores[state.currentGame].toLocaleString()}
                         </div>`;
            }
            scoreEl.innerHTML = html;
        } else {
            scoreEl.innerHTML = '';
        }
    }

    if (elements.resumeBtn) elements.resumeBtn.style.display = title === 'GAME OVER' ? 'none' : '';
    overlay.classList.remove('hidden');
}

function hideOverlay() {
    const o = document.getElementById('game-overlay');
    if (o) o.classList.add('hidden');
}

// ============================================================
// 21. RESTART
// ============================================================

function restartGame() {
    hideOverlay();
    const currentId = state.currentGame;
    destroyCurrentGame();
    state.currentGame = currentId;
    if (elements.gameScore) elements.gameScore.textContent = '0';
    state.gameStartTime = Date.now();
    requestAnimationFrame(() => requestAnimationFrame(() => startGame(currentId)));
}

// ============================================================
// 22. RENDER GAMES — HD THUMBNAILS
// ============================================================

function renderGames() {
    renderFeaturedGames();
    renderGamesGrid();
    initFilterButtons();
}

function renderFeaturedGames() {
    if (!elements.featuredGames) return;
    const featured = [...gamesData].sort((a, b) => b.plays - a.plays).slice(0, 6);
    elements.featuredGames.innerHTML = featured.map(g => createGameCard(g)).join('');
    attachCardEvents(elements.featuredGames);
    // Slight delay to let layout render first
    setTimeout(() => genThumbs(elements.featuredGames), 80);
}

function renderGamesGrid() {
    if (!elements.gamesGrid) return;
    elements.gamesGrid.innerHTML = gamesData.map(g => createGameCard(g)).join('');
    attachCardEvents(elements.gamesGrid);
    setTimeout(() => genThumbs(elements.gamesGrid), 120);
}

function createGameCard(game) {
    const isFav = state.favorites.includes(game.id);
    return `
        <div class="game-card" data-game-id="${game.id}" data-category="${game.category}"
             data-tags="${game.tags.join(',')}" style="--game-color:${game.color}">
            <div class="game-card-thumb">
                <canvas class="game-thumb-canvas" data-game="${game.id}" width="480" height="300"></canvas>
                <span class="game-card-badge badge-${game.category}">${game.category}</span>
                <button class="game-card-fav" data-game-id="${game.id}">${isFav ? '❤️' : '🤍'}</button>
            </div>
            <div class="game-card-info">
                <div class="game-card-name">${game.name}</div>
                <div class="game-card-desc">${game.description}</div>
                <div class="game-card-rating">
                    ⭐ ${game.rating}
                    <span style="margin-left:auto;color:#6a6a9a;font-size:.65rem">${fmtNum(game.plays)} plays</span>
                </div>
            </div>
        </div>`;
}

/**
 * Generate HD thumbnails for game cards
 * Uses DPR-aware sizes for sharp display on all screens
 */
function genThumbs(container) {
    if (!container || typeof GameThumbnails === 'undefined') return;

    // Get card actual display width for proper size calculation
    const firstCard = container.querySelector('.game-card');
    const cardWidth = firstCard ? firstCard.offsetWidth : 320;

    // Calculate thumbnail size based on card width + aspect ratio
    // 16:10 aspect ratio, generate at 2x for retina
    const thumbW = Math.max(320, cardWidth * 2);   // Minimum 320, 2x for retina
    const thumbH = Math.round(thumbW * (10 / 16)); // 16:10 ratio

    container.querySelectorAll('.game-thumb-canvas').forEach(cv => {
        const gid = cv.dataset.game;
        if (!gid) return;

        // Generate HD thumbnail
        const url = GameThumbnails.generate(gid, thumbW, thumbH);

        // Replace canvas with HD img
        const img = new Image();
        img.src = url;
        img.alt = gid.replace(/-/g, ' ');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.style.cssText = [
            'width:100%',
            'height:100%',
            'object-fit:cover',
            'display:block',
            'border-radius:12px 12px 0 0',
            '-webkit-backface-visibility:hidden',
            'backface-visibility:hidden',
            'transform:translateZ(0)'
        ].join(';') + ';';

        cv.replaceWith(img);
    });
}

function attachCardEvents(container) {
    if (!container) return;
    container.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', e => {
            if (e.target.closest('.game-card-fav')) return;
            if (window.audioManager) audioManager.play('click');
            openGame(card.dataset.gameId);
        });
        // Touch event for better mobile response
        card.addEventListener('touchend', e => {
            if (e.target.closest('.game-card-fav')) return;
        }, { passive: true });
    });
    container.querySelectorAll('.game-card-fav').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            toggleFavorite(btn.dataset.gameId);
        });
    });
}

// ============================================================
// 23. FILTER
// ============================================================

function initFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.activeFilter = btn.dataset.filter;
            if (window.audioManager) audioManager.play('click');
            filterAndRenderGames();
        });
    });
}

function filterAndRenderGames() {
    const cards = document.querySelectorAll('#games-grid .game-card');
    let visible = 0;
    cards.forEach(card => {
        const cat  = card.dataset.category;
        const tags = (card.dataset.tags || '').toLowerCase();
        const name = card.querySelector('.game-card-name')?.textContent.toLowerCase() || '';
        const desc = card.querySelector('.game-card-desc')?.textContent.toLowerCase() || '';
        const gid  = card.dataset.gameId;

        const matchFilter = state.activeFilter === 'all' || cat === state.activeFilter ||
            (state.activeFilter === 'favorites' && state.favorites.includes(gid));
        const matchSearch = !state.searchQuery || name.includes(state.searchQuery) ||
            desc.includes(state.searchQuery) || tags.includes(state.searchQuery) ||
            cat.includes(state.searchQuery);

        const show = matchFilter && matchSearch;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
    });

    const nr = document.getElementById('no-results');
    if (nr) nr.style.display = visible === 0 ? 'block' : 'none';
}

// ============================================================
// 24. FAVORITES
// ============================================================

function toggleFavorite(gameId) {
    if (!gameId) return;
    const idx = state.favorites.indexOf(gameId);
    if (idx === -1) {
        state.favorites.push(gameId);
        showToast('❤️ Added to favorites!', 'success');
        if (window.audioManager) audioManager.play('collect');
    } else {
        state.favorites.splice(idx, 1);
        showToast('💔 Removed from favorites', 'info');
        if (window.audioManager) audioManager.play('click');
    }
    localStorage.setItem('neonarcade_favorites', JSON.stringify(state.favorites));
    document.querySelectorAll(`.game-card-fav[data-game-id="${gameId}"]`).forEach(btn => {
        btn.textContent = state.favorites.includes(gameId) ? '❤️' : '🤍';
    });
}

// ============================================================
// 25. OPEN GAME
// ============================================================

function openGame(gameId) {
    const game = gamesData.find(g => g.id === gameId);
    if (!game) { console.error('Game not found:', gameId); return; }

    destroyCurrentGame();
    state.currentGame = gameId;

    const titleEl = document.getElementById('current-game-title');
    const scoreEl = document.getElementById('game-score');
    if (titleEl) titleEl.textContent = game.name;
    if (scoreEl) scoreEl.textContent = '0';

    if (window.audioManager) {
        audioManager.stopMusic();
        setTimeout(() => audioManager.startMusic('game'), 200);
    }

    navigateTo('game');
    showInstructionToast(game.instructions);
    state.gameStartTime = Date.now();

    if (typeof setRealVH === 'function') setRealVH();

    // Delay for layout settle — angry birds & color up need more time
    const initDelay = (gameId === 'angry-birds' || gameId === 'color-up') ? 180 : 80;

    setTimeout(() => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                startGame(gameId);
            });
        });
    }, initDelay);
}

// Make openGame globally available for hero preview cards
window.openGame = openGame;

function showInstructionToast(text) {
    const toast = document.getElementById('instruction-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.remove('hide');
    setTimeout(() => toast.classList.add('hide'), 4000);
}

// ============================================================
// 26. GET WRAPPER SIZE — ACCURATE ON MOBILE
// ============================================================

function getWrapperSize() {
    const wrapper = document.getElementById('game-wrapper');
    if (!wrapper) {
        return {
            w: window.innerWidth,
            h: window.innerHeight - getHeaderHeight()
        };
    }

    // Force layout recalculation
    wrapper.offsetHeight; // eslint-disable-line no-unused-expressions

    let w = wrapper.clientWidth;
    let h = wrapper.clientHeight;

    // Fallback calculations
    if (!w || w < 10) {
        w = window.innerWidth;
    }
    if (!h || h < 10) {
        h = window.innerHeight - getHeaderHeight();
        // Make sure it's not the whole screen height
        if (h <= 0) h = window.innerHeight * 0.85;
    }

    // Mobile: make sure we use full available area
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
        // On mobile, ensure canvas uses actual available height
        const gameHeader = document.getElementById('game-header');
        const headerH = gameHeader ? gameHeader.offsetHeight : 48;
        const availH = window.innerHeight - headerH;
        if (h < availH * 0.8) h = availH; // Use more space
    }

    return { w: Math.round(w), h: Math.round(h) };
}

// ============================================================
// 27. START GAME — HD DPR-AWARE CANVAS
// ============================================================

function startGame(gameId) {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) { console.error('game-canvas not found'); return; }
    elements.gameCanvas = canvas;

    // Get wrapper size (accurate mobile calculation)
    const { w: wrapW, h: wrapH } = getWrapperSize();

    // Position canvas absolutely to fill wrapper
    canvas.style.position = 'absolute';
    canvas.style.top      = '0';
    canvas.style.left     = '0';

    const dpr = getDeviceDPR();

    console.log(`🎮 Starting ${gameId} | Size: ${wrapW}x${wrapH} | DPR: ${dpr}`);

    // ── ANGRY BIRDS ──
    if (gameId === 'angry-birds') {
        // Angry Birds handles its own canvas sizing internally
        // Just set the CSS size, let the game handle internal DPR
        canvas.style.width  = wrapW + 'px';
        canvas.style.height = wrapH + 'px';
        canvas.width  = Math.round(wrapW * dpr);
        canvas.height = Math.round(wrapH * dpr);

        // Scale context
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
        }

        if (typeof window.initAngryBirds === 'function') {
            try {
                state.gameInstance = window.initAngryBirds(canvas);
                window._activeGameInstance = state.gameInstance;
                console.log('✅ Angry Birds started | DPR:', dpr);
            } catch (err) {
                console.error('❌ Angry Birds start error:', err);
                showPlaceholder(canvas.getContext('2d'), canvas, gameId, wrapW, wrapH);
            }
        } else {
            console.error('❌ initAngryBirds not found!');
            showPlaceholder(canvas.getContext('2d'), canvas, gameId, wrapW, wrapH);
        }
        return;
    }

    // ── COLOR UP ──
    if (gameId === 'color-up') {
        canvas.style.width  = wrapW + 'px';
        canvas.style.height = wrapH + 'px';
        canvas.width  = Math.round(wrapW * dpr);
        canvas.height = Math.round(wrapH * dpr);

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
        }

        if (typeof window.initColorUp === 'function') {
            try {
                state.gameInstance = window.initColorUp(canvas, updateScore);
                window._activeGameInstance = state.gameInstance;
                console.log('✅ Color Up started | DPR:', dpr);
            } catch (err) {
                console.error('❌ Color Up start error:', err);
                showPlaceholder(canvas.getContext('2d'), canvas, gameId, wrapW, wrapH);
            }
        } else {
            console.error('❌ initColorUp not found!');
            showPlaceholder(canvas.getContext('2d'), canvas, gameId, wrapW, wrapH);
        }
        return;
    }

    // ── ALL OTHER GAMES (class-based) ──
    // Apply DPR-aware canvas sizing
    applyCanvasDPR(canvas, wrapW, wrapH, dpr);

    const ctx = canvas.getContext('2d');

    const GameClass = getGameClass(gameId);
    if (GameClass) {
        try {
            state.gameInstance = new GameClass(canvas, updateScore);
            window._activeGameInstance = state.gameInstance;
            console.log(`✅ ${gameId} started | Size: ${wrapW}x${wrapH} | DPR: ${dpr}`);
        } catch (err) {
            console.error(`❌ Error starting ${gameId}:`, err);
            showPlaceholder(ctx, canvas, gameId, wrapW, wrapH);
        }
    } else {
        console.warn(`⚠️ No initializer found for: ${gameId}`);
        showPlaceholder(ctx, canvas, gameId, wrapW, wrapH);
    }
}

function getHeaderHeight() {
    const header = document.getElementById('game-header');
    if (!header) return 48;
    return header.getBoundingClientRect().height || header.offsetHeight || 48;
}

/**
 * Show placeholder when game fails to load
 * Uses CSS coordinates (not DPR-scaled)
 */
function showPlaceholder(ctx, canvas, gameId, cssW, cssH) {
    if (!ctx) return;
    const game = gamesData.find(g => g.id === gameId);

    // Use CSS dimensions for drawing (context is already DPR-scaled)
    const w = cssW || (canvas.width / getDeviceDPR());
    const h = cssH || (canvas.height / getDeviceDPR());

    ctx.save();
    ctx.setTransform(getDeviceDPR(), 0, 0, getDeviceDPR(), 0, 0);

    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = `bold ${Math.min(w * 0.06, 28)}px Orbitron, sans-serif`;
    ctx.fillStyle = '#d470ff';
    ctx.shadowColor = '#d470ff';
    ctx.shadowBlur = 20;
    ctx.fillText(game ? game.name : 'Game', w / 2, h / 2 - 20);

    ctx.font = `${Math.min(w * 0.04, 16)}px Rajdhani, sans-serif`;
    ctx.fillStyle = '#8080a8';
    ctx.shadowBlur = 0;
    ctx.fillText('Loading... 🎮', w / 2, h / 2 + 15);

    ctx.restore();
    ctx.textAlign = 'left';
}

// ============================================================
// 28. SCORE UPDATE
// ============================================================

function updateScore(score, gameOver = false) {
    const scoreEl = document.getElementById('game-score');
    if (scoreEl) {
        scoreEl.textContent = typeof score === 'number' ? score.toLocaleString() : score;
        scoreEl.style.transform = 'scale(1.3)';
        setTimeout(() => { if (scoreEl) scoreEl.style.transform = 'scale(1)'; }, 200);
    }

    if (gameOver) {
        const gid      = state.currentGame;
        const numScore = typeof score === 'number' ? score : parseInt(score) || 0;
        const prev     = state.scores[gid] || 0;
        const isNew    = numScore > prev;

        if (isNew && numScore > 0) {
            state.scores[gid] = numScore;
            localStorage.setItem('neonarcade_scores', JSON.stringify(state.scores));
            setTimeout(() => showToast(`🏆 New High Score: ${numScore.toLocaleString()}!`, 'success'), 500);
            updateLeaderboardWithScores();
        }

        if (window.audioManager) {
            try { audioManager.play('gameOver'); } catch (e) {}
            audioManager.stopMusic();
            setTimeout(() => audioManager.startMusic('menu'), 1000);
        }

        // Angry Birds & Color Up handle their own game over screens
        if (gid !== 'angry-birds' && gid !== 'color-up') {
            showOverlay('GAME OVER', numScore, isNew);
        }
    }
}

// ============================================================
// 29. LEADERBOARD
// ============================================================

function renderLeaderboard() { updateLeaderboardWithScores(); }

function updateLeaderboardWithScores() {
    if (!elements.leaderboardContent) return;

    const entries = leaderboardData.all.map(e => ({ ...e }));
    const pName   = localStorage.getItem('neonarcade_username') || 'You';

    Object.entries(state.scores).forEach(([gid, score]) => {
        if (!score || score <= 0) return;
        const game = gamesData.find(g => g.id === gid);
        if (!game) return;
        const existing = entries.findIndex(e => e.name === pName && e.game === game.name);
        if (existing !== -1) {
            if (score > entries[existing].score) entries[existing].score = score;
        } else {
            entries.push({ name: pName, game: game.name, score, avatar: '🎮', country: '🏳️', isPlayer: true });
        }
    });

    entries.sort((a, b) => b.score - a.score);
    const top        = entries.slice(0, 15);
    const totalScore = top.reduce((s, e) => s + e.score, 0);

    elements.leaderboardContent.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;padding:0 4px;">
            ${[
                { label:'Players',    val: top.length,               icon:'👥', col:'#00f5ff' },
                { label:'Total Score',val: fmtNum(totalScore),        icon:'⭐', col:'#FFD700' },
                { label:'Top Score',  val: fmtNum(top[0]?.score||0), icon:'🏆', col:'#b347d9' }
            ].map(s => `
                <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(${s.col==='#00f5ff'?'0,245,255':s.col==='#FFD700'?'255,215,0':'179,71,217'},.2);border-radius:12px;padding:14px 8px;text-align:center;">
                    <div style="font-size:1.4rem;margin-bottom:4px">${s.icon}</div>
                    <div style="font-family:Orbitron,sans-serif;font-size:clamp(.75rem,2.5vw,.95rem);font-weight:700;color:${s.col}">${s.val}</div>
                    <div style="font-size:.65rem;color:#6a6a9a;margin-top:2px;font-family:Rajdhani,sans-serif;letter-spacing:1px;text-transform:uppercase">${s.label}</div>
                </div>
            `).join('')}
        </div>
        <div style="display:grid;grid-template-columns:36px 32px 1fr auto;gap:6px;padding:8px 12px;margin-bottom:6px;border-radius:8px;background:rgba(179,71,217,.08);border:1px solid rgba(179,71,217,.15);">
            <span style="font-family:Rajdhani,sans-serif;font-size:.62rem;color:#6a6a9a;letter-spacing:1px;text-transform:uppercase">RANK</span>
            <span></span>
            <span style="font-family:Rajdhani,sans-serif;font-size:.62rem;color:#6a6a9a;letter-spacing:1px;text-transform:uppercase">PLAYER</span>
            <span style="font-family:Rajdhani,sans-serif;font-size:.62rem;color:#6a6a9a;letter-spacing:1px;text-transform:uppercase;text-align:right">SCORE</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;padding:0 4px;">
            ${top.map((entry, i) => {
                const rankMedal = i===0?'🥇':i===1?'🥈':i===2?'🥉':null;
                const rankColor = i===0?'#FFD700':i===1?'#C0C0C0':i===2?'#CD7F32':'#6a6a9a';
                const rowBg     = entry.isPlayer?'rgba(0,245,255,0.06)':i<3?'rgba(179,71,217,0.06)':'rgba(255,255,255,0.025)';
                const rowBorder = entry.isPlayer?'1px solid rgba(0,245,255,.28)':i<3?'1px solid rgba(179,71,217,.14)':'1px solid rgba(255,255,255,.05)';
                return `
                <div style="display:grid;grid-template-columns:36px 32px 1fr auto;gap:6px;align-items:center;padding:9px 12px;border-radius:10px;background:${rowBg};border:${rowBorder};animation:fadeInUp .3s ease both;animation-delay:${i*0.04}s;">
                    <div style="text-align:center;">${rankMedal
                        ? `<span style="font-size:1rem">${rankMedal}</span>`
                        : `<span style="font-family:Orbitron,sans-serif;font-size:.68rem;font-weight:700;color:${rankColor};">#${i+1}</span>`
                    }</div>
                    <div style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-size:.9rem;">${entry.avatar||'🎮'}</div>
                    <div style="min-width:0;">
                        <div style="font-family:Rajdhani,sans-serif;font-size:.85rem;font-weight:700;color:${entry.isPlayer?'#00f5ff':'#e0e0f0'};display:flex;align-items:center;gap:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${entry.name}${entry.isPlayer?'<span style="font-size:.55rem;background:rgba(0,245,255,.15);color:#00f5ff;border:1px solid rgba(0,245,255,.3);border-radius:4px;padding:1px 4px;flex-shrink:0;">YOU</span>':''}
                        </div>
                        <div style="font-size:.6rem;color:#6a6a9a;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${entry.country||''} ${entry.game}</div>
                    </div>
                    <div style="font-family:Orbitron,sans-serif;font-size:.8rem;font-weight:700;color:${i<3?rankColor:entry.isPlayer?'#00f5ff':'#d470ff'};text-align:right;white-space:nowrap;">${entry.score.toLocaleString()}</div>
                </div>`;
            }).join('')}
        </div>
        <div style="text-align:center;padding:16px 0 4px;font-family:Rajdhani,sans-serif;font-size:.72rem;color:#3a3a5a;">Play games to appear on the leaderboard!</div>
    `;
}

// ============================================================
// 30. TOAST
// ============================================================

function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = [
            'position:fixed',
            'top:70px',
            'right:16px',
            'z-index:999999',
            'display:flex',
            'flex-direction:column',
            'gap:8px',
            'pointer-events:none',
            // Mobile: full width toast
            'max-width:min(300px,calc(100vw - 32px))'
        ].join(';') + ';';
        document.body.appendChild(container);
    }
    const colors = { success:'#39ff14', error:'#fe2254', info:'#00f5ff', warning:'#ffff00' };
    const color  = colors[type] || colors.info;
    const toast  = document.createElement('div');
    toast.style.cssText = [
        'background:rgba(10,10,20,.95)',
        `border:1px solid ${color}`,
        `border-left:4px solid ${color}`,
        'border-radius:8px',
        'padding:10px 16px',
        'color:#fff',
        'font-family:Rajdhani,sans-serif',
        'font-size:13px',
        'font-weight:600',
        `box-shadow:0 4px 20px ${color}33`,
        'transform:translateX(120%)',
        'transition:transform .3s cubic-bezier(.175,.885,.32,1.275)',
        'pointer-events:auto',
        'cursor:pointer',
        'backdrop-filter:blur(8px)',
        '-webkit-font-smoothing:antialiased',
        'word-break:break-word'
    ].join(';') + ';';
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; });
    const dismiss = () => {
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 300);
    };
    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, duration);
}

// ============================================================
// 31. SCROLL REVEAL
// ============================================================

function initScrollReveal() {
    if (!window.IntersectionObserver) return; // Fallback for old browsers
    const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('visible');
                obs.unobserve(e.target);
            }
        });
    }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });
    document.querySelectorAll('.scroll-fade-in').forEach(el => obs.observe(el));
}

// ============================================================
// 32. WINDOW EVENTS — MOBILE RESIZE HD FIX
// ============================================================

window.addEventListener('scroll', () => {
    const nav = document.querySelector('.navbar');
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 50);
}, { passive: true });

window.addEventListener('resize', debounce(() => {
    if (typeof setRealVH === 'function') setRealVH();

    if (state.currentPage === 'game' && state.gameInstance) {
        const canvas  = document.getElementById('game-canvas');
        const wrapper = document.getElementById('game-wrapper');
        if (!canvas || !wrapper) return;

        const { w, h } = getWrapperSize();
        const dpr = getDeviceDPR();

        // Update CSS size
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';

        // Update actual pixel size for HD
        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);

        // Re-apply DPR transform
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
        }

        // Tell game to resize itself
        if (state.gameInstance.resize) {
            try { state.gameInstance.resize(); } catch(e) {}
        }
    }
}, 150));

window.addEventListener('orientationchange', () => {
    // Multiple timeouts to handle different devices
    [350, 600, 900].forEach(delay => {
        setTimeout(() => {
            if (typeof setRealVH === 'function') setRealVH();

            if (state.currentPage === 'game' && state.gameInstance) {
                const canvas  = document.getElementById('game-canvas');
                const wrapper = document.getElementById('game-wrapper');
                if (!canvas || !wrapper) return;

                const { w, h } = getWrapperSize();
                const dpr = getDeviceDPR();

                canvas.style.width  = w + 'px';
                canvas.style.height = h + 'px';
                canvas.width  = Math.round(w * dpr);
                canvas.height = Math.round(h * dpr);

                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                }

                if (state.gameInstance.resize) {
                    try { state.gameInstance.resize(); } catch(e) {}
                }
            }
        }, delay);
    });
});

document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.currentPage === 'game' && state.gameInstance) {
        if (state.currentGame === 'angry-birds' || state.currentGame === 'color-up') return;
        if (state.gameInstance.togglePause && !state.gameInstance.isPaused) {
            state.gameInstance.togglePause();
            showOverlay('PAUSED');
        }
    }
});

window.addEventListener('beforeunload', () => destroyCurrentGame());

// ============================================================
// 33. UTILS
// ============================================================

function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function fmtNum(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(n);
}

const formatNumber = fmtNum;

// ============================================================
// 34. EXPOSE GLOBAL API
// ============================================================

window.NeonArcade = {
    openGame,
    navigateTo,
    updateScore,
    showToast,
    showOverlay,
    hideOverlay,
    getDeviceDPR,
    applyCanvasDPR,
    version: '9.5-HD'
};

console.log('%c📱 Mobile HD Mode: DPR=' + getDeviceDPR(), 'color:#39ff14;font-size:11px;');