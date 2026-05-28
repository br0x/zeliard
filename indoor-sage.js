import { IndoorSceneBase } from './indoor-base.js';
import { TypewriterText } from './ui-menu-dialog.js';

const SAGE_IMAGE_PATH = 'assets/images/kenjya/kenjya.png';
const SAGE_PANEL_W = 672;
const SAGE_PANEL_H = 432;
const SAGE_IMG_X = 16, SAGE_IMG_Y = 16, SAGE_IMG_W = 291, SAGE_IMG_H = 192;
const SAGE_MENU_X = SAGE_IMG_X + SAGE_IMG_W + 16, SAGE_MENU_Y = SAGE_IMG_Y;
const SAGE_MENU_W = SAGE_PANEL_W - SAGE_MENU_X - 16, SAGE_MENU_H = SAGE_IMG_H;
const SAGE_DLG_X = 16, SAGE_DLG_Y = SAGE_IMG_Y + SAGE_IMG_H + 16;
const SAGE_DLG_W = SAGE_PANEL_W - 32;
const SAGE_DLG_H = SAGE_PANEL_H - SAGE_DLG_Y - 16;
const SAGE_FONT_MENU = '16px "Press Start 2P", monospace';
const SAGE_FONT_DLG = '14px "Press Start 2P", monospace';
const SAGE_LINE_H_MENU = 40, SAGE_LINE_H_DLG = 20;
const SAGE_MENU_TEXT_X = SAGE_MENU_X + 32;
const SAGE_MENU_TEXT_Y = SAGE_MENU_Y + 40;
const SAGE_CURSOR_X = SAGE_MENU_X + 8;
const SAGE_DLG_TEXT_X = SAGE_DLG_X + 14;
const SAGE_DLG_TEXT_Y = SAGE_DLG_Y + 22;
const SAGE_CHAR_MS = 28;
const SAGE_FADE_IN_MS = 600, SAGE_FADE_OUT_MS = 450;
const POWER_LINE_DELAY_MS = 1200;  // delay between power lines

const SAGE_MENU = ['Go outside', 'See Power', 'Listen Knowledge', 'Record Experience'];
const SAGE_MENU_GO_OUTSIDE = 0, SAGE_MENU_SEE_POWER = 1,
      SAGE_MENU_LISTEN_KNOWLEDGE = 2, SAGE_MENU_RECORD_EXPERIENCE = 3;

const SAGE_XP_TABLE = [50,150,300,420,1000,1500,3000,5000,6000,8000,10000,15000,20000,40000,50000,60000];
const SAGE_MIN_LEVEL_BY_TOWN = [3,6,9,11,13,15,18,0xFF];
const ADDR_HERO_LEVEL = 0x8d;
const ADDR_HERO_XP = 0x8e;
const ADDR_HERO_HP = 0x90;
const ADDR_CURRENT_MAGIC_SPELL = 0x9d;
const ADDR_SPELLS_ACTIVE = 0xab;
const ADDR_HERO_MAX_HP = 0xb2;
const ADDR_SPELLS_INVENTORY = 0xb4;
const SAGE_LEVEL_REWARDS = [
    { hp: 0x0078, spells: [0x0c, 0x06, 0x08, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x00a0, spells: [0x0c, 0x06, 0x08, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x00c8, spells: [0x0c, 0x06, 0x08, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x00f0, spells: [0x0c, 0x06, 0x08, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x0118, spells: [0x10, 0x06, 0x08, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x0140, spells: [0x14, 0x06, 0x08, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x017c, spells: [0x18, 0x06, 0x08, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x01cc, spells: [0x1c, 0x0c, 0x08, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x021c, spells: [0x20, 0x12, 0x0c, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x0258, spells: [0x24, 0x18, 0x10, 0x08, 0x03, 0x04, 0x03] },
    { hp: 0x0280, spells: [0x28, 0x1e, 0x14, 0x10, 0x03, 0x04, 0x03] },
    { hp: 0x02a8, spells: [0x2c, 0x24, 0x18, 0x18, 0x03, 0x04, 0x03] },
    { hp: 0x02d0, spells: [0x30, 0x2a, 0x1c, 0x20, 0x03, 0x04, 0x03] },
    { hp: 0x02f8, spells: [0x34, 0x30, 0x24, 0x30, 0x09, 0x08, 0x06] },
    { hp: 0x030c, spells: [0x38, 0x36, 0x2c, 0x36, 0x0f, 0x0c, 0x09] },
    { hp: 0x0320, spells: [0x3c, 0x3c, 0x3c, 0x48, 0x15, 0x10, 0x0c] },
];
const SAGE_NAMES = [
    'The Sage Marid','The Sage Yasmin','The Sage Hajjar','The Sage Chiriga',
    'The Sage Hisham','The Sage Maryam','The Sage Saied','The Sage Indihar',
];
const SAGE_INTROS = [
    { bit:0x80, text:'I am the Sage Marid.\nYou are very brave to embark on such a dangerous journey. I shall assist you in your travels.' },
    { bit:0x40, text:'I am the Sage Yasmin.\nI have been expecting you. I shall teach you the Magic Spell of Throwing Swords: Espada.' },
    { bit:0x20, text:'I am the Sage Hajjar.\nI am happy to see you\'ve made it this far. I shall teach you the Magic Spell of Arrows: Saeta.' },
    { bit:0x10, text:'I am the Sage Chiriga.\nYou have come far, and you must be cold. I shall teach you the Magic Spell of Fire: Fuego.' },
    { bit:0x08, text:'I am the Sage Hisham.\nYou are doing well to stand before me. I shall teach you the Magic Spell of Flame: Lanzar.' },
    { bit:0x04, text:'I am the Sage Maryam.\nYou have made the Spirits proud with your bravery. I shall teach you the Magic Spell of Falling Rocks: Rascar.' },
    { bit:0x02, text:'I am the Sage Saied.\nYou have lived through much, but your journey is not over. You must be hot. I shall teach you the Magic Spell of Water: Agua.' },
    { bit:0x01, text:'I am the Sage of All Sages, Indihar.\nBrave lad, you\'ve done well to get this far.\nI shall teach you the Magic Spell of Lightning: Guerra.' },
];
const SAGE_KNOWLEDGE = [
    'My master, the Sage Yasmin, resides in the underground town. She is a person you can turn to if you are in need.',
    'When you leave the city, climb to the plateau on the left. You\'ll see a door that looks like the exit from this world.',
    'The exit from this world is very near the exit from the village. However, before you go there you must have the Hero\'s Crest.',
    'This is a message from the Spirits: Bend when you walk a low road. Walk not on the steep path with the needles of ice, choose another path instead. Heed well these words.',
    'You can\'t defeat the demons at the edge of the badlands without the Knight\'s Sword. Until you get that sword, do not open the door of the demons.',
    'Once you leave this world, get the Silkarn shoes made by the spirits at the behest of Percel. If you do not get those, you cannot travel far from this world.',
    'That world is controlled by dragons. To get there, you have to open three closed doors.',
    'At the edge of this world is the final foe, Jashiin.\nTo fight Jashiin, you must have the Sword of the Fairy Flame. And to get there, you must topple the invincible monster Alguien.',
];

function getTownIdx(readMemory) {
    if (!readMemory) return 0;
    return Math.max(0, Math.min(7, (readMemory(0xC4, 1)[0] & 0x7F) - 1));
}

export class SageScene extends IndoorSceneBase {
    constructor(context) {
        super(context);
        this.image = null;
        this.menuSel = 0;
        this.hasPower = false;
        this.powerExhausted = false;
        this.levelUpReady = false;
        this.animRun = false;
        this.animSuppressed = false;
        this.crystalMode = false;
        this.sagePhase = 'loading';
        this.exitAfterDialog = false;
        this.townIdx = 0;
        this.typewriter = null;
        this.dlgBuffer = [];       // committed wrapped lines (fully typed)
        this._pendingLine = null;  // line currently being typed
        this._dlgQueue = [];       // pending lines for sequential _setDialog typing
        this._dlgQueueIndex = 0;
        this._dlgQueueAdvanceAt = null;
        this.fadeInMs = SAGE_FADE_IN_MS;
        this.fadeOutMs = SAGE_FADE_OUT_MS;
        this.modalOpen = false;

        // For power sequence auto-advance
        this.powerQueue = null;
        this.powerQueueIndex = 0;
        this.powerQueueSentenceEnds = new Set();
        this.powerLineAdvanceAt = null;
        this._powerWaitingScroll = false;
        this._powerScrollNextLine = null;

        // Whether the menu should be drawn dimmed (interactive actions in progress)
        this.menuDimmed = false;
    }

    async onEnter(now) {
        try {
            this.image = await this._loadImage();
        } catch (e) {
            console.error('[Sage] image load failed:', e);
            this.finish();
            return;
        }
        this.townIdx = getTownIdx(this.readMemory);
        const deathEntry = this.readMemory ? this.readMemory(0x49,1)[0] : 0;
        const intro = SAGE_INTROS[this.townIdx];
        const spoken = this._getSpokenBits();
        const isFirst = intro && !(spoken & intro.bit);
        if (deathEntry) {
            this._setDialog('While you were unconscious, the spirits brought you here.\nBe careful not to exhaust yourself in battle.\nNow be on your way. The spirits are looking after you.');
            this.sagePhase = 'intro';
            this.exitAfterDialog = true;
        } else if (isFirst) {
            this._setSpokenBit(intro.bit);
            this._setDialog(intro.text);
            this.sagePhase = 'intro';
        } else {
            this._setDialog('How can I help you, Brave One?');
            this.sagePhase = 'menu';   // go directly to menu; no Space needed
        }
        // _setDialog already calls typewriter.start(); no extra call needed
    }

    _loadImage() {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Sage image load error'));
            img.src = SAGE_IMAGE_PATH;
        });
    }

    _getSpokenBits() { return this.readMemory?.(0xe5,1)[0] || 0; }
    _setSpokenBit(bit) { if (this.writeMemory) this.writeMemory(0xe5, [this._getSpokenBits() | bit]); }

    // ── Dialog line buffer ────────────────────────────────────────────────────
    // dlgBuffer: string[]  – fully-committed wrapped lines (already typed out)
    // typewriter           – animates the single line currently being typed in
    // _pendingLine: string – the raw line currently being typed (not yet in buffer)
    //
    // Max lines that fit, leaving 40px for the arrow indicator.
    get _dlgMaxLines() {
        return Math.floor((SAGE_DLG_H - 22 - 40) / SAGE_LINE_H_DLG);
    }

    /**
     * Replace the entire dialog with new text. Clears the buffer and starts a
     * sequential typewriter sequence through every wrapped line of `text`.
     * Uses the same power-queue machinery so each line types in fully before
     * the next begins (with no inter-line pause).
     */
    _setDialog(text) {
        const wrappedLines = this._wrapText(text);
        if (wrappedLines.length === 0) return;
        // Clear buffer completely
        this.dlgBuffer = [];
        this._pendingLine = null;
        this._powerWaitingScroll = false;
        this._powerScrollNextLine = null;
        // Start typing the first line immediately; remaining lines auto-advance
        // with zero delay (they are dialog, not power-anim, so no POWER_LINE_DELAY)
        this._dlgQueue = wrappedLines;
        this._dlgQueueIndex = 0;
        this._dlgQueueAdvanceAt = null;
        this._showNextDlgLine();
    }

    /** Advance to next line in the _setDialog sequential queue (zero-delay). */
    _showNextDlgLine() {
        if (this._dlgQueueIndex >= this._dlgQueue.length) return;
        const line = this._dlgQueue[this._dlgQueueIndex];
        this._dlgQueueIndex++;
        const isLast = this._dlgQueueIndex >= this._dlgQueue.length;
        // Commit whatever was typing before
        if (this._pendingLine !== null) {
            this.dlgBuffer.push(this._pendingLine);
            this._pendingLine = null;
        }
        this._startTypewriterLine(line);
        this._dlgQueueAdvanceAt = isLast ? null : 'pending'; // pending = wait for done, then 0ms
    }

    /**
     * Append one new line to the dialog (power-queue path).
     * Commits the previously-typing line into dlgBuffer, then types the new one.
     */
    _appendDialogLine(line) {
        if (this._pendingLine !== null) {
            this.dlgBuffer.push(this._pendingLine);
            this._pendingLine = null;
        }
        this._startTypewriterLine(line);
    }

    /** Wrap raw text into display lines (no animation). */
    _wrapText(text) {
        this.ctx.save();
        this.ctx.font = SAGE_FONT_DLG;
        const maxW = SAGE_DLG_W - 28;
        const lines = [];
        for (const para of text.split('\n')) {
            const words = para.split(' ');
            let line = '';
            for (const word of words) {
                const candidate = line ? line + ' ' + word : word;
                if (line && this.ctx.measureText(candidate).width > maxW) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            }
            if (line) lines.push(line);
        }
        this.ctx.restore();
        return lines;
    }

    /** Begin animating a single plain line string. */
    _startTypewriterLine(line) {
        this._pendingLine = line;
        this.typewriter = new TypewriterText(
            line,
            SAGE_FONT_DLG,
            SAGE_DLG_W - 28,
            SAGE_CHAR_MS,
            SAGE_LINE_H_DLG,
            SAGE_DLG_H,
            this.ctx
        );
        this.typewriter.start(performance.now());
    }

    /**
     * Scroll info: which committed lines are visible given current buffer size.
     * Returns { scrollTop } — first dlgBuffer index to display.
     */
    _dlgScrollTop() {
        const max = this._dlgMaxLines;
        const total = this.dlgBuffer.length + 1; // +1 for the typing line
        return Math.max(0, total - max);
    }

    /** True when adding another line would overflow the box. */
    _dlgBoxFull() {
        return (this.dlgBuffer.length + 1) >= this._dlgMaxLines;
    }

    drawContent(now, alpha) {
        this._tickDlgQueue(now);
        this._tickPowerQueue(now);
        this._drawPortraitBox();
        this._drawOrbAnimation(now, alpha);
        // Hide menu during loading and intro. During dialog/power_anim show it dimmed.
        if (this.sagePhase !== 'loading' && this.sagePhase !== 'intro') {
            const menuAlpha = this.menuDimmed ? 0.25 : 1;
            this._drawMenuBox(now, alpha * menuAlpha);
        }
        this._drawDialogBox(now, alpha);
    }

    _drawPortraitBox() {
        const ctx = this.ctx;
        ctx.strokeStyle = '#cc0';
        ctx.lineWidth = 2;
        ctx.strokeRect(SAGE_IMG_X-2, SAGE_IMG_Y-2, SAGE_IMG_W+4, SAGE_IMG_H+4);
        ctx.fillStyle = '#0a0a18';
        ctx.fillRect(SAGE_IMG_X, SAGE_IMG_Y, SAGE_IMG_W, SAGE_IMG_H);
        if (this.image) ctx.drawImage(this.image, SAGE_IMG_X, SAGE_IMG_Y, SAGE_IMG_W, SAGE_IMG_H);
    }

    _drawOrbAnimation(now, parentAlpha) {
        const orbX = SAGE_IMG_X + SAGE_IMG_W * 0.508;
        const orbY = SAGE_IMG_Y + SAGE_IMG_H * 0.604;
        const ctx = this.ctx;
        let glowColor, glowR, glowAlpha;
        if (this.animRun) {
            const blinkOn = Math.floor(now/150)%2 === 0;
            glowColor = blinkOn ? '#fff' : '#88f';
            glowR = 28; glowAlpha = 0.65;
        } else {
            const pulse = 0.18 + 0.12 * Math.sin(now/1000*2.1);
            glowColor = this.crystalMode ? '#aaf' : '#8ff';
            glowR = 20; glowAlpha = pulse;
        }
        ctx.save();
        ctx.globalAlpha = glowAlpha * parentAlpha;
        const grad = ctx.createRadialGradient(orbX, orbY, 2, orbX, orbY, glowR);
        grad.addColorStop(0, glowColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(orbX, orbY, glowR, 0, Math.PI*2);
        ctx.fill();
        ctx.restore();
    }

    _drawMenuBox(now, alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 2;
        ctx.strokeRect(SAGE_MENU_X-2, SAGE_MENU_Y-2, SAGE_MENU_W+4, SAGE_MENU_H+4);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.strokeRect(SAGE_MENU_X, SAGE_MENU_Y, SAGE_MENU_W, SAGE_MENU_H);
        ctx.fillStyle = '#000';
        ctx.fillRect(SAGE_MENU_X, SAGE_MENU_Y, SAGE_MENU_W, SAGE_MENU_H);

        ctx.font = SAGE_FONT_MENU;
        for (let i = 0; i < SAGE_MENU.length; i++) {
            const y = SAGE_MENU_TEXT_Y + i * SAGE_LINE_H_MENU;
            const sel = i === this.menuSel;
            ctx.fillStyle = sel ? '#ff0' : '#fff';
            ctx.fillText(SAGE_MENU[i], SAGE_MENU_TEXT_X, y);
            if (sel) {
                ctx.fillStyle = '#f00';
                this._triangle(ctx, SAGE_CURSOR_X, y - 18, 10, 18, false);
            }
        }
        ctx.restore();
    }

    _drawDialogBox(now, alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;
        // border + background
        ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2;
        ctx.strokeRect(SAGE_DLG_X-2, SAGE_DLG_Y-2, SAGE_DLG_W+4, SAGE_DLG_H+4);
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
        ctx.strokeRect(SAGE_DLG_X, SAGE_DLG_Y, SAGE_DLG_W, SAGE_DLG_H);
        ctx.fillStyle = '#000';
        ctx.fillRect(SAGE_DLG_X, SAGE_DLG_Y, SAGE_DLG_W, SAGE_DLG_H);

        ctx.font = SAGE_FONT_DLG;
        const scrollTop = this._dlgScrollTop();
        const visibleCommitted = this.dlgBuffer.slice(scrollTop);
        let row = 0;

        // Draw committed lines
        ctx.fillStyle = '#fff';
        for (const line of visibleCommitted) {
            ctx.fillText(line, SAGE_DLG_TEXT_X, SAGE_DLG_TEXT_Y + row * SAGE_LINE_H_DLG);
            row++;
        }

        // Draw the currently-typing line
        if (this.typewriter) {
            const visLines = this.typewriter.getVisibleLines(now);
            if (visLines.length > 0) {
                ctx.fillStyle = '#fff';
                ctx.fillText(visLines[0], SAGE_DLG_TEXT_X, SAGE_DLG_TEXT_Y + row * SAGE_LINE_H_DLG);
            }
            // Show down-arrow when typing is done and a Space press is expected
            const needsSpace = this.typewriter.isDone(now) && this._dlgArrowVisible();
            if (needsSpace) {
                ctx.fillStyle = '#0ee';
                const ax = SAGE_DLG_X + SAGE_DLG_W / 2 - 12;
                const ay = SAGE_DLG_Y + SAGE_DLG_H - 40;
                ctx.beginPath();
                ctx.moveTo(ax, ay);
                ctx.lineTo(ax + 24, ay);
                ctx.lineTo(ax + 12, ay + 14);
                ctx.closePath();
                ctx.fill();
            }
        }
        ctx.restore();
    }

    /**
     * Whether the down-arrow (Space prompt) should be visible.
     * Only shown when typing is fully done AND we are genuinely waiting for Space —
     * not during automatic mid-sequence line advances.
     */
    _dlgArrowVisible() {
        // Suppress arrow while a _setDialog multi-line queue is still advancing
        if (this._dlgQueue && this._dlgQueueIndex < this._dlgQueue.length) return false;
        if (this.sagePhase === 'intro') return true;
        if (this.sagePhase === 'dialog') return true;
        if (this.sagePhase === 'power_anim') {
            if (this._powerWaitingScroll) return true;
            return this.powerQueue !== null &&
                   this.powerQueueIndex >= this.powerQueue.length;
        }
        return false;
    }

    _triangle(ctx, x, y, w, h, down) {
        ctx.beginPath();
        if (down) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w/2, y + h);
        } else {
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y + h/2);
            ctx.lineTo(x, y + h);
        }
        ctx.closePath();
        ctx.fill();
    }

    /** Called every frame to auto-advance sequential dialog lines (from _setDialog). */
    _tickDlgQueue(now) {
        if (!this._dlgQueue || this._dlgQueueIndex >= this._dlgQueue.length) return;
        if (this._dlgQueueAdvanceAt === 'pending') {
            if (this.typewriter && this.typewriter.isDone(now)) {
                this._dlgQueueAdvanceAt = now; // advance immediately (0ms delay)
            }
        } else if (this._dlgQueueAdvanceAt !== null && now >= this._dlgQueueAdvanceAt) {
            this._dlgQueueAdvanceAt = null;
            this._showNextDlgLine();
        }
    }



    _startPowerQueue(queue) {
        // Pre-wrap every sentence into display-width lines and flatten,
        // but record which flat-line indices are the LAST line of their sentence.
        // The inter-sentence pause only fires at those boundary lines.
        const flatLines = [];
        const sentenceEnds = new Set(); // flat indices that end a sentence
        for (const sentence of queue) {
            const wrapped = this._wrapText(sentence);
            for (const line of wrapped) flatLines.push(line);
            sentenceEnds.add(flatLines.length - 1); // last wrapped line of this sentence
        }
        // Clear existing dialog before power sequence begins
        this.dlgBuffer = [];
        this._pendingLine = null;
        this._dlgQueue = [];
        this._dlgQueueIndex = 0;
        this._dlgQueueAdvanceAt = null;

        this.powerQueue = flatLines;
        this.powerQueueSentenceEnds = sentenceEnds;
        this.powerQueueIndex = 0;
        this.powerLineAdvanceAt = null;
        this._powerWaitingScroll = false;
        this._powerScrollNextLine = null;
        this._showNextPowerLine();
    }

    _showNextPowerLine() {
        if (this.powerQueueIndex >= this.powerQueue.length) return;

        const line = this.powerQueue[this.powerQueueIndex];
        const currentIndex = this.powerQueueIndex;
        this.powerQueueIndex++;
        const isLast = this.powerQueueIndex >= this.powerQueue.length;
        const isSentenceEnd = this.powerQueueSentenceEnds.has(currentIndex);

        // Commit pending line into buffer
        if (this._pendingLine !== null) {
            this.dlgBuffer.push(this._pendingLine);
            this._pendingLine = null;
        }

        if (!isLast && this._dlgBoxFull()) {
            this._powerScrollNextLine = line;
            this._powerWaitingScroll = true;
            return;
        }

        this._powerScrollNextLine = null;
        this._powerWaitingScroll = false;
        this._appendDialogLine(line);

        if (isLast) {
            this.powerLineAdvanceAt = null;           // last line: wait for Space
        } else if (isSentenceEnd) {
            this.powerLineAdvanceAt = 'pending';      // pause after sentence completes
        } else {
            this.powerLineAdvanceAt = 'immediate';    // mid-sentence wrap: no pause
        }
    }

    /** Called from drawContent each frame to auto-advance power queue mid-lines. */
    _tickPowerQueue(now) {
        if (this.sagePhase !== 'power_anim') return;
        if (this.powerQueue === null) return;
        if (this._powerWaitingScroll) return;
        if (this.powerQueueIndex >= this.powerQueue.length) return;

        if (this.powerLineAdvanceAt === 'immediate') {
            // Mid-sentence wrap: advance as soon as current line finishes typing
            if (this.typewriter && this.typewriter.isDone(now)) {
                this.powerLineAdvanceAt = null;
                this._showNextPowerLine();
            }
        } else if (this.powerLineAdvanceAt === 'pending') {
            // Sentence end: wait for typing to finish, then start the delay
            if (this.typewriter && this.typewriter.isDone(now)) {
                this.powerLineAdvanceAt = now + POWER_LINE_DELAY_MS;
            }
        } else if (this.powerLineAdvanceAt !== null && now >= this.powerLineAdvanceAt) {
            this.powerLineAdvanceAt = null;
            this._showNextPowerLine();
        }
    }

    handleInput(key) {
        if (this.modalOpen) return;
        const now = performance.now();
        if (this.phase === 'fadeOut') return;

        // Arrow keys navigate the menu
        if (this.sagePhase === 'menu' && !this.menuDimmed && (key === 'ArrowUp' || key === 'ArrowDown')) {
            if (key === 'ArrowUp') this.menuSel = (this.menuSel - 1 + SAGE_MENU.length) % SAGE_MENU.length;
            else if (key === 'ArrowDown') this.menuSel = (this.menuSel + 1) % SAGE_MENU.length;
            return;
        }

        if (key === 'Space') {
            this._onSpace(now);
        }
    }

    _onSpace(now) {
        // If typewriter is still typing, skip to end — unless we're waiting for
        // the player to scroll (box full), in which case fall through to the switch.
        if (!this._powerWaitingScroll && this.typewriter && !this.typewriter.isDone(now)) {
            this.typewriter.skip(now);
            return;
        }

        switch (this.sagePhase) {
            case 'intro':
                if (this.exitAfterDialog) {
                    this.startFadeOut(now);
                } else {
                    // Intro done: show menu. Dialog text stays; do NOT overwrite it.
                    this.sagePhase = 'menu';
                    this.menuDimmed = false;
                    this._setDialog('How can I help you, Brave One?');
                }
                break;
            case 'menu':
                this._activateMenuItem(this.menuSel, now);
                break;
            case 'dialog':
                if (this.exitAfterDialog) {
                    this.startFadeOut(now);
                } else {
                    // Return to menu; show prompt, undim menu
                    this.sagePhase = 'menu';
                    this.menuDimmed = false;
                    this._setDialog('Is there anything else I can do for you?');
                }
                break;
            case 'power_anim':
                if (this._powerWaitingScroll) {
                    // Box was full; Space scrolls oldest line away, then continues
                    this._powerWaitingScroll = false;
                    const line = this._powerScrollNextLine;
                    this._powerScrollNextLine = null;
                    const isLast = this.powerQueueIndex >= this.powerQueue.length;
                    this._appendDialogLine(line);
                    if (!isLast) {
                        this.powerLineAdvanceAt = 'pending';
                    } else {
                        this.powerLineAdvanceAt = null; // last line: wait for Space again
                    }
                } else if (this.powerQueue !== null &&
                           this.powerQueueIndex >= this.powerQueue.length &&
                           this.typewriter && this.typewriter.isDone(now)) {
                    // Last line fully typed — commit it and return to menu
                    if (this._pendingLine !== null) {
                        this.dlgBuffer.push(this._pendingLine);
                        this._pendingLine = null;
                    }
                    this.powerQueue = null;
                    this.powerLineAdvanceAt = null;
                    this.animRun = false;
                    this.animSuppressed = false;
                    this.sagePhase = 'menu';
                    this.menuDimmed = false;
                    this._setDialog('Is there anything else I can do for you?');
                }
                break;
        }
    }

    _activateMenuItem(sel, now) {
        switch (sel) {
            case SAGE_MENU_GO_OUTSIDE:
                this._setDialog('The Spirits are with you.');
                this.sagePhase = 'dialog';
                this.exitAfterDialog = true;
                this.menuDimmed = true;
                break;
            case SAGE_MENU_SEE_POWER:
                this.menuDimmed = true;
                this._seePower(now);
                break;
            case SAGE_MENU_LISTEN_KNOWLEDGE:
                this._setDialog(SAGE_KNOWLEDGE[this.townIdx] || 'The Spirits guide your path.');
                this.sagePhase = 'dialog';
                this.exitAfterDialog = false;
                this.menuDimmed = true;
                break;
            case SAGE_MENU_RECORD_EXPERIENCE:
                this.menuDimmed = true;
                this._recordExperience(now);
                break;
        }
    }

    _seePower(now) {
        if (!this.hasPower) {
            this.hasPower = true;
            this.animRun = true;
            this.animSuppressed = true;
            this.crystalMode = true;
            const result = this._checkLevelUp();
            this.levelUpReady = (result >= 4);

            // Build the three lines for power sequence
            const line1 = 'I shall call upon the Spirits and their powers.....';
            const line2 = 'Oh, Holy Spirits, purify my thoughts and grant me strength.';
            let resultLine = '';
            if (result === 4) {
                this.powerExhausted = true;
                this._applyLevelUp();
                resultLine = 'The light of the Spirits is bursting forth within you. Indeed, your power has grown.';
            } else if (result === 3 && this.levelUpReady) {
                this.powerExhausted = true;
                resultLine = 'I can no longer impart the power of the Spirits to you. Continue on your quest. You will soon find others to help you.';
            } else {
                const texts = [
                    'Your experience is lacking. Persevere in your quest.',
                    'You must accumulate more experience.',
                    'I can see the faint light of the Spirits in you. You must endure a little longer.',
                    'The light of the Spirits is bursting forth within you.',
                ];
                resultLine = texts[result] || texts[0];
            }
            const queue = [line1, line2, resultLine];
            this.sagePhase = 'power_anim';  // keep animation running
            this._startPowerQueue(queue);
            return;
        }
        if (this.powerExhausted) {
            this._setDialog('I fear the spirits are no longer with you. No matter how many times I try, it comes out the same.');
            this.sagePhase = 'dialog';
            this.exitAfterDialog = false;
            return;
        }
        const result = this._checkLevelUp();
        let resultLine = '';
        if (result === 4) {
            this.powerExhausted = true;
            this._applyLevelUp();
            resultLine = 'The light of the Spirits is bursting forth within you. Indeed, your power has grown.';
        } else if (result === 3 && this.levelUpReady) {
            this.powerExhausted = true;
            resultLine = 'I can no longer impart the power of the Spirits to you. Continue on your quest. You will soon find others to help you.';
        } else {
            const texts = [
                'Your experience is lacking. Persevere in your quest.',
                'You must accumulate more experience.',
                'I can see the faint light of the Spirits in you. You must endure a little longer.',
                'The light of the Spirits is bursting forth within you.',
            ];
            resultLine = texts[result] || texts[0];
        }
        // Single line case (already seen power before)
        this._setDialog(resultLine);
        this.sagePhase = 'dialog';
        this.exitAfterDialog = false;
    }

    _recordExperience(now) {
        if (typeof window.openSaveModal === 'function') {
            this.modalOpen = true;
            window.openSaveModal((success) => {
                this.modalOpen = false;
                if (success) {
                    this._setDialog('I shall record your experiences.\nPlace is saved. Will you continue your quest?');
                } else {
                    this._setDialog('Save cancelled.');
                }
                this.sagePhase = 'dialog';
                this.exitAfterDialog = false;
                // menuDimmed stays true; _onSpace will undim when Space pressed
            });
        } else {
            if (this.readMemory && this.saveGame) {
                try { this.saveGame(this.readMemory(0,256)); } catch(e) { console.error(e); }
            }
            this._setDialog('I shall record your experiences.\nPlace is saved. Will you continue your quest?');
            this.sagePhase = 'dialog';
            this.exitAfterDialog = false;
        }
    }

    _checkLevelUp() {
        const lvl = Math.min(this._getHeroLevel(), 15);
        const threshold = SAGE_XP_TABLE[lvl] || 60000;
        const xp = this._getHeroXp();
        const q1 = Math.floor(threshold/4), q2 = Math.floor(threshold/2), q3 = threshold - q1;
        if (xp < q1) return 0;
        if (xp < q2) return 1;
        if (xp < q3) return 2;
        const minLvl = SAGE_MIN_LEVEL_BY_TOWN[this.townIdx] || 0xFF;
        if (lvl < minLvl) return 3;
        return 4;
    }

    _getHeroLevel() { return this.readMemory?.(ADDR_HERO_LEVEL,1)[0] || 1; }
    _getHeroXp() {
        if (!this.readMemory) return 0;
        const b = this.readMemory(ADDR_HERO_XP,2);
        return b[0] | (b[1] << 8);
    }
    _applyLevelUp() {
        if (!this.writeMemory) return;
        const oldLevel = this._getHeroLevel();
        const nextLevel = oldLevel === 0xFF ? 0xFF : Math.min(0xFF, oldLevel + 1);
        const reward = this._getLevelReward(oldLevel);

        this.writeMemory(ADDR_HERO_LEVEL, [nextLevel]);
        this.writeMemory(ADDR_HERO_XP, [0,0]);
        this._writeWord(ADDR_HERO_MAX_HP, reward.hp);
        this._writeWord(ADDR_HERO_HP, reward.hp);
        this.writeMemory(ADDR_SPELLS_INVENTORY, reward.spells);
        this.writeMemory(ADDR_SPELLS_ACTIVE, reward.spells);

        this.drawLifeBar?.();
        this.renderMagicHud?.();
        this._refreshMagicCounter();
    }

    _getLevelReward(level) {
        if (level >= 16) {
            const spells = this.readMemory ? Array.from(this.readMemory(ADDR_SPELLS_INVENTORY, 7)) : [0,0,0,0,0,0,0];
            return {
                hp: 800,
                spells: spells.map(count => Math.min(0xFF, count + 2)),
            };
        }
        return SAGE_LEVEL_REWARDS[Math.max(0, Math.min(SAGE_LEVEL_REWARDS.length - 1, level))];
    }

    _writeWord(addr, value) {
        if (!this.writeMemory) return;
        const v = Math.max(0, Math.min(0xFFFF, Math.floor(value)));
        this.writeMemory(addr, [v & 0xFF, (v >> 8) & 0xFF]);
    }

    _refreshMagicCounter() {
        if (typeof document === 'undefined' || !this.readMemory) return;
        const spell = this.readMemory(ADDR_CURRENT_MAGIC_SPELL, 1)[0] & 0xFF;
        if (!spell) return;
        const counter = document.getElementById('spellCounter');
        if (counter) counter.textContent = this.readMemory(ADDR_SPELLS_ACTIVE + spell - 1, 1)[0] & 0xFF;
    }

    getName() {
        return SAGE_NAMES[this.townIdx] || 'The Sage';
    }
}
