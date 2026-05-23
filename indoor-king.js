import { IndoorSceneBase } from './indoor-base.js';

const KING_IMAGE_PATHS = [
    null,
    'assets/images/king/king1.png',
    'assets/images/king/king2.png',
    'assets/images/king/king3.png',
    'assets/images/king/king4.png',
    'assets/images/king/king5.png',
    'assets/images/king/king6.png',
    'assets/images/king/king7.png',
    'assets/images/king/king8.png',
    'assets/images/king/king9.png',
];

const KING_ENTRY_SEQUENCE = [1, 2, 3, 4, 5];
const KING_ENTRY_FRAME_MS = 350;
const KING_DIALOG_CHAR_MS = 30;
const KING_FADE_OUT_MS = 450;
const KING_IMAGE_W = 422;
const KING_IMAGE_H = 282;
const VIEW_WIDTH = 672;

const KING_IMAGE_X = Math.floor((VIEW_WIDTH - KING_IMAGE_W) / 2);
const KING_DIALOG_X = 24;
const KING_DIALOG_Y = 294;
const KING_DIALOG_W = VIEW_WIDTH - KING_DIALOG_X * 2;
const KING_DIALOG_H = 18 * 24 - KING_DIALOG_Y - 14;
const KING_DIALOG_TEXT_X = KING_DIALOG_X + 18;
const KING_DIALOG_TEXT_Y = KING_DIALOG_Y + 12;
const KING_DIALOG_LINE_HEIGHT = 23;
const KING_DIALOG_FONT = '14px "Press Start 2P", monospace';
const KING_DIALOG_MAX_LINES = 4;

const KING_GOLD_GIFT_STEPS = 10;
const KING_GOLD_GIFT_PER_STEP = 100;
const KING_GOLD_GIFT_DELAY_FRAMES = 15;
const KING_GOLD_GIFT_SFX = 19;
const KING_GOLD_GIFT_LINE = 'I hereby bestow upon you 1000 Golds.';

const KING_DIALOG_SCRIPTS = {
    firstAudience: [
        'Brave Duke Garland, you\'ll need money for your journey.',
        KING_GOLD_GIFT_LINE,
        'Go to town and outfit yourself, then make haste to the labyrinth to defeat the forces of Jashiin.',
        'My kingdom and the life of my daughter are at stake.',
    ],
    reminder: [
        'Brave Duke, did you forget something?',
        'The entrance to the labyrinth is at the edge of town.',
        'Please hurry, before it\'s too late!',
    ],
    afterCavern: [
        'Duke Garland, I am in debt to you for your efforts.',
        'Have you not yet succeeded in vanquishing Jashiin?',
        'I pray that the spirits will guide you.',
        'Please don\'t give up, the people of Zeliard are depending on you!',
    ],
    victory: [
        'Duke Garland, you are a brave man.',
        'You have conquered Jashiin and returned the nine Tears of Esmesanti.',
        'Now go quickly to the chamber of Princess Felicia.',
        'The crystals will bring her back to life.',
    ],
};

function selectKingDialogKey(readMemory) {
    const ADDR_SPOKE_TO_KING = 0x05;
    const ADDR_ENTERED_CAVERN_FIRST_TIME = 0x06;
    const ADDR_IS_DEATH_ALREADY_PROCESSED = 0x49;
    if (!readMemory) return 'firstAudience';
    const spoke = readMemory(ADDR_SPOKE_TO_KING, 1)[0] !== 0;
    const entered = readMemory(ADDR_ENTERED_CAVERN_FIRST_TIME, 1)[0] !== 0;
    const death = readMemory(ADDR_IS_DEATH_ALREADY_PROCESSED, 1)[0] !== 0;
    if (!spoke && !entered) return 'firstAudience';
    if (!entered) return 'reminder';
    if (!death) return 'afterCavern';
    return 'victory';
}

function wrapText(ctx, text, maxWidth) {
    ctx.save();
    ctx.font = KING_DIALOG_FONT;
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? line + ' ' + word : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    ctx.restore();
    return lines;
}

function buildDialogPages(ctx, dialogKey) {
    const paragraphs = KING_DIALOG_SCRIPTS[dialogKey] || KING_DIALOG_SCRIPTS.firstAudience;
    const pages = [];
    let goldAwardPage = -1;
    let cur = [];

    for (const para of paragraphs) {
        const wrapped = wrapText(ctx, para, KING_DIALOG_W - 36);
        for (const line of wrapped) {
            cur.push(line);
            if (cur.length === KING_DIALOG_MAX_LINES) {
                pages.push(cur);
                cur = [];
            }
        }
        if (dialogKey === 'firstAudience' && para === KING_GOLD_GIFT_LINE) {
            if (cur.length) {
                pages.push(cur);
                cur = [];
            }
            goldAwardPage = pages.length - 1;
        }
    }
    if (cur.length) pages.push(cur);
    return { pages: pages.length ? pages : [['...']], goldAwardPage };
}

export class KingScene extends IndoorSceneBase {
    constructor(context) {
        super(context);
        this.kingImages = [];
        this.king = null;
        this.fadeInMs = 650;
        this.fadeOutMs = KING_FADE_OUT_MS;
        // renderGoldHud callback is now available from the context
        this.renderGoldHud = context.renderGoldHud;
    }

    async onEnter(now) {
        try {
            this.kingImages = await this._loadKingImages();
        } catch (e) {
            console.error('[King] failed to load images:', e);
            this.finish();
            return;
        }

        const dialogKey = selectKingDialogKey(this.readMemory);
        const { pages, goldAwardPage } = buildDialogPages(this.ctx, dialogKey);
        this.king = {
            images: this.kingImages,
            dialogKey,
            pages,
            goldAwardPage,
            page: 0,
            pageStart: now,
            goldAward: null,
        };

        this.alpha = 1;
        this.phase = 'kingEntering';
        this.startTime = now;
    }

    _loadKingImages() {
        return Promise.all(KING_IMAGE_PATHS.map((path, i) => {
            if (!path) return Promise.resolve(null);
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`Failed to load ${path}`));
                img.src = path;
            }).then(img => { this.kingImages[i] = img; return img; });
        }));
    }

    // ── Drawing ───────────────────────────────────────────────────────────────
    drawContent(now, alpha) {
        if (!this.king) return;
        const king = this.king;
        const ctx = this.ctx;

        if (this.phase === 'kingEntering') {
            this._drawKingEntryAnimation(now);
            return;
        }

        const imgIndex = this.phase === 'kingFadeOut' ? 8 : this._getSpeechImageIndex(now);
        if (king.images[imgIndex]) {
            ctx.drawImage(king.images[imgIndex], KING_IMAGE_X, 0, KING_IMAGE_W, KING_IMAGE_H);
        }

        this._drawKingDialogBox(now, alpha);

        if (this.phase === 'kingGoldAward') {
            this._updateGoldAward(now);
        }
    }

    _drawKingEntryAnimation(now) {
        const elapsed = now - this.startTime;
        const frame = Math.min(KING_ENTRY_SEQUENCE.length - 1, Math.floor(elapsed / KING_ENTRY_FRAME_MS));
        const imgIdx = KING_ENTRY_SEQUENCE[frame];
        if (this.king.images[imgIdx]) {
            this.ctx.drawImage(this.king.images[imgIdx], KING_IMAGE_X, 0, KING_IMAGE_W, KING_IMAGE_H);
        }
        if (frame === KING_ENTRY_SEQUENCE.length - 1 && elapsed >= KING_ENTRY_SEQUENCE.length * KING_ENTRY_FRAME_MS) {
            this.phase = 'kingDialog';
            this.startTime = now;
            this.king.pageStart = now;
        }
    }

    _drawKingDialogBox(now, alpha) {
        const ctx = this.ctx;
        const king = this.king;
        const pageLines = king.pages[king.page] || [];
        const visibleChars = this._getVisibleCharCount(now);
        const visibleLines = this._getVisibleLines(pageLines, visibleChars);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.98)';
        ctx.fillRect(KING_DIALOG_X, KING_DIALOG_Y, KING_DIALOG_W, KING_DIALOG_H);
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 2;
        ctx.strokeRect(KING_DIALOG_X + 1, KING_DIALOG_Y + 1, KING_DIALOG_W - 2, KING_DIALOG_H - 2);
        ctx.strokeStyle = '#26f';
        ctx.strokeRect(KING_DIALOG_X + 3, KING_DIALOG_Y + 3, KING_DIALOG_W - 6, KING_DIALOG_H - 6);

        ctx.font = KING_DIALOG_FONT;
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        for (let i = 0; i < visibleLines.length; i++) {
            ctx.fillText(visibleLines[i], KING_DIALOG_TEXT_X, KING_DIALOG_TEXT_Y + i * KING_DIALOG_LINE_HEIGHT);
        }

        const totalChars = pageLines.join('').length;
        if (visibleChars >= totalChars) {
            ctx.fillStyle = '#0ee';
            ctx.beginPath();
            const x0 = KING_DIALOG_X + KING_DIALOG_W / 2 - 12;
            const y0 = KING_DIALOG_Y + KING_DIALOG_H - 20;
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0 + 20, y0);
            ctx.lineTo(x0 + 10, y0 + 10);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    _getSpeechImageIndex(now) {
        if (this.phase !== 'kingDialog') return 8;
        const pageLines = this.king.pages[this.king.page] || [];
        const visibleChars = this._getVisibleCharCount(now);
        const totalChars = pageLines.join('').length;
        const typing = visibleChars < totalChars;

        let currentChar = '';
        if (totalChars > 0 && visibleChars > 0) {
            const charIndex = Math.max(0, Math.min(visibleChars - 1, totalChars - 1));
            currentChar = pageLines.join('')[charIndex] || '';
        }

        const mouthOpen = typing && currentChar.trim() !== '' && Math.floor(now / 95) % 2 === 0;
        const blinkCycle = now % 3600;
        const eyesClosed = blinkCycle > 3320 && blinkCycle < 3520;

        if (eyesClosed) return mouthOpen ? 7 : 6;
        return mouthOpen ? 9 : 8;
    }

    // ── Typewriter helpers ────────────────────────────────────────────────────
    _getPageCharCount(pageLines) {
        return pageLines.join('').length;
    }

    _getVisibleCharCount(now) {
        const pageLines = this.king.pages[this.king.page] || [];
        const pageCharCount = this._getPageCharCount(pageLines);
        return Math.min(pageCharCount, Math.floor((now - this.king.pageStart) / KING_DIALOG_CHAR_MS));
    }

    _getVisibleLines(pageLines, visibleChars) {
        const lines = [];
        let remaining = visibleChars;
        for (const line of pageLines) {
            if (remaining <= 0) break;
            lines.push(line.slice(0, Math.min(line.length, remaining)));
            remaining -= line.length;
        }
        return lines;
    }

    // ── Input handling ────────────────────────────────────────────────────────
    handleInput(key) {
        if (key !== 'Space') return;
        const now = performance.now();
        if (this.phase === 'fadeOut') return;

        if (this.phase === 'kingDialog' || this.phase === 'kingGoldAward') {
            // Do nothing if gold animation is running (it plays automatically)
            if (this.king.goldAward) return;

            const pageLines = this.king.pages[this.king.page] || [];
            const visibleChars = this._getVisibleCharCount(now);
            const totalChars = this._getPageCharCount(pageLines);

            if (visibleChars < totalChars) {
                this.king.pageStart = now - totalChars * KING_DIALOG_CHAR_MS;
                return;
            }

            this._advanceDialog(now);
        } else if (this.phase === 'shown') {
            this.startFadeOut(now);
        }
    }

    _advanceDialog(now) {
        const king = this.king;

        // Gold award not yet started on the gold-award page? Start it.
        if (king.dialogKey === 'firstAudience' && king.page === king.goldAwardPage && !king.goldAward) {
            this._startGoldAward(now);
            return;
        }

        // Already awarding gold? Do nothing (animation runs automatically)
        if (king.goldAward) return;

        // Next page
        if (king.page < king.pages.length - 1) {
            king.page++;
            king.pageStart = now;
            if (this.phase === 'kingGoldAward') this.phase = 'kingDialog';
        } else {
            this.startFadeOut(now);
        }
    }

    // ── Gold award ────────────────────────────────────────────────────────────
    _startGoldAward(now) {
        if (!this.readMemory) return;
        // Already gave gold?
        if (this.readMemory(0x05, 1)[0] !== 0) return;

        this.king.goldAward = { stepsDone: 0 };
        this.phase = 'kingGoldAward';
        this.startTime = now;
        this._applyGoldStep();
    }

    _applyGoldStep() {
        const g = this.king.goldAward;
        if (!g) return;

        const next = this._getHeroGold() + KING_GOLD_GIFT_PER_STEP;
        this._setHeroGold(next);

        // Update the HUD so the gold counter visibly increases
        if (this.renderGoldHud) this.renderGoldHud();

        this.writeMemory?.(0xFF75, [KING_GOLD_GIFT_SFX]);
        this.writeMemory?.(0xFF1A, [0]);
        g.stepsDone++;
    }

    _updateGoldAward(now) {
        if (!this.king.goldAward || !this.writeMemory) return;

        const frameTimer = this.readMemory?.(0xFF1A, 1)[0] ?? 0;
        if (frameTimer < KING_GOLD_GIFT_DELAY_FRAMES) return;

        if (this.king.goldAward.stepsDone < KING_GOLD_GIFT_STEPS) {
            this._applyGoldStep();
        } else {
            // Animation complete
            this.writeMemory(0x05, [0xFF]);
            this.king.goldAward = null;
            // Advance to next page (or fade out)
            if (this.king.page < this.king.pages.length - 1) {
                this.king.page++;
                this.king.pageStart = now;
                this.phase = 'kingDialog';
            } else {
                this.startFadeOut(now);
            }
        }
    }

    _getHeroGold() {
        if (!this.readMemory) return 0;
        const lo = this.readMemory(0x86, 2);
        const hi = this.readMemory(0x85, 1)[0];
        return (lo[0] | (lo[1] << 8)) + hi * 0x10000;
    }

    _setHeroGold(value) {
        if (!this.writeMemory) return;
        const clamped = Math.max(0, Math.min(0xFFFFFF, value));
        this.writeMemory(0x86, [clamped & 0xFF, (clamped >> 8) & 0xFF]);
        this.writeMemory(0x85, [(clamped >> 16) & 0xFF]);
    }
}
