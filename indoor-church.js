/**
 * indoor-church.js - The Church indoor scene.
 *
 * Port of asm/churpro.asm. This building has no interactive menu: the bytes
 * returned by render_menu_dialog_proc are scripted actions, and the scene runs
 * them automatically. Player input is only used for the original continuation
 * wait near the end of the dialog.
 */

import { IndoorSceneBase } from './indoor-base.js';
import { TypewriterText } from './ui-menu-dialog.js';

const PANEL_W = 672;
const PANEL_H = 432;

const IMG_X = 190;
const IMG_Y = 16;
const IMG_W = 291;
const IMG_H = 192;

const CANDLE_REL_X = 51;
const CANDLE_REL_Y = 100;
const CANDLE_W = 53;
const CANDLE_H = 64;

const DLG_X = 16;
const DLG_Y = IMG_Y + IMG_H + 14;
const DLG_W = PANEL_W - 32;
const DLG_H = PANEL_H - DLG_Y - 16;

const FONT_DLG = '13px "Press Start 2P", monospace';
const LINE_H_DLG = 20;
const CHAR_MS = 28;

const DLG_TEXT_X = DLG_X + 14;
const DLG_TEXT_Y = DLG_Y + 22;

const FULL_TICK_MS = 1000 / 236.7;
const WAIT_250_MS = 250 * FULL_TICK_MS;
const HEAL_TICK_MS = 20 * FULL_TICK_MS;
const ANIM_32_TICK_MS = 32 * FULL_TICK_MS;

const CHURCH_FRAMES = [
    'assets/images/church/church1.png',
    'assets/images/church/church2.png',
    'assets/images/church/church3.png',
    'assets/images/church/church4.png',
];

const BLESS_STAGE_FRAME = [0, 1, 2, 3, 3];

// sub_A1D7 cycles byte_A3E5 through 0, 1, 2.
const CANDLE_FRAMES = [
    'assets/images/church/candle1.png',
    'assets/images/church/candle2.png',
    'assets/images/church/candle3.png',
];

const ADDR_HERO_HP = 0x90;
const ADDR_HERO_MAX = 0xB2;
const ADDR_SPELL_ACT = 0x9D;
const ADDR_SPELLS_ACT = 0xAB;
const ADDR_SPELLS_INV = 0xB4;

const TEXT_TIRED =
    "Brave Knight, whenever you're tired come to this church.";
const TEXT_WEARY =
    "Brave Knight, whenever you're weary, come here to rest. ";
const TEXT_HOLY =
    'The Holy Spirit will help you to regain your strength.';
const TEXT_FATIGUED =
    'Brave Knight, you look fatigued from battle. Why not rest awhile and let the Spirit heal you. ';
const TEXT_MAY_GOD =
    'May God go with you.';

const OP = {
    CLEAR: 'clear',
    TEXT: 'text',
    WAIT: 'wait',
    HEAL_RESTORE: 'heal_restore',
    RESTORE: 'restore',
    COMMON: 'common',
    BLESS: 'bless',
    CONTINUE: 'continue',
    EXIT: 'exit',
};

const COMMON_SCRIPT = [
    { op: OP.TEXT, text: TEXT_FATIGUED },
    { op: OP.WAIT, ms: WAIT_250_MS },
    { op: OP.TEXT, text: TEXT_MAY_GOD },
    { op: OP.BLESS },
    { op: OP.CONTINUE },
    { op: OP.EXIT },
];

function buildChurchScript(hp, maxHp) {
    if (hp >= maxHp) {
        return [
            { op: OP.CLEAR },
            { op: OP.TEXT, text: TEXT_TIRED },
            { op: OP.RESTORE },
            { op: OP.COMMON },
        ];
    }

    return [
        { op: OP.CLEAR },
        { op: OP.TEXT, text: TEXT_WEARY },
        { op: OP.WAIT, ms: WAIT_250_MS },
        { op: OP.WAIT, ms: WAIT_250_MS },
        { op: OP.TEXT, text: TEXT_HOLY },
        { op: OP.HEAL_RESTORE },
        { op: OP.COMMON },
    ];
}

export class ChurchScene extends IndoorSceneBase {
    constructor(context) {
        super(context);

        this.churchImages = [];
        this.candleImages = [];

        this.candleFrameIdx = 0;
        this.lastCandleTime = 0;

        this.blessPhase = 'idle';
        this.blessStage = 0;
        this.lastBlessTime = 0;

        this.healPhase = 'idle';
        this.lastHealTime = 0;

        this.script = [];
        this.scriptIndex = 0;
        this.scriptWaitUntil = null;
        this.scriptBlockedBy = null;
        this.sceneReady = false;

        this.typewriter = null;
        this.dlgBuffer = [];
        this._pendingLine = null;
        this._dlgQueue = [];
        this.waitingForContinue = false;
        this.dialogFullAcknowledged = false;

        this.fadeInMs = 650;
        this.fadeOutMs = 450;
    }

    async onEnter(now) {
        try {
            const [churches, candles] = await Promise.all([
                Promise.all(CHURCH_FRAMES.map(path => this._loadImg(path))),
                Promise.all(CANDLE_FRAMES.map(path => this._loadImg(path))),
            ]);
            this.churchImages = churches;
            this.candleImages = candles;
        } catch (error) {
            console.error('[ChurchScene] image load failed:', error);
            this.finish();
            return;
        }

        this.lastCandleTime = now;
        this.script = buildChurchScript(this._getHeroHP(), this._getHeroMaxHp());
        this.scriptIndex = 0;
        this.sceneReady = true;
    }

    _loadImg(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load: ${src}`));
            img.src = src;
        });
    }

    _readWord(addr) {
        if (!this.readMemory) return 0;
        const bytes = this.readMemory(addr, 2);
        return (bytes[0] & 0xFF) | ((bytes[1] & 0xFF) << 8);
    }

    _writeWord(addr, value) {
        if (!this.writeMemory) return;
        const v = Math.max(0, Math.min(0xFFFF, Math.floor(value)));
        this.writeMemory(addr, [v & 0xFF, (v >> 8) & 0xFF]);
    }

    _readByte(addr) {
        if (!this.readMemory) return 0;
        return this.readMemory(addr, 1)[0] & 0xFF;
    }

    _getHeroHP() {
        return this._readWord(ADDR_HERO_HP);
    }

    _getHeroMaxHp() {
        return this._readWord(ADDR_HERO_MAX);
    }

    _setHeroHP(value) {
        this._writeWord(ADDR_HERO_HP, value);
    }

    _restoreSpells() {
        if (!this.readMemory || !this.writeMemory) return;
        this.writeMemory(ADDR_SPELLS_ACT, this.readMemory(ADDR_SPELLS_INV, 7));
        this._refreshMagicHud();
    }

    _refreshMagicHud() {
        if (typeof document === 'undefined') return;
        const activeSpell = this._readByte(ADDR_SPELL_ACT);
        if (!activeSpell) return;
        const counter = document.getElementById('spellCounter');
        if (counter) counter.textContent = this._readByte(ADDR_SPELLS_ACT + activeSpell - 1);
    }

    drawContent(now, alpha) {
        this._tickCandleAnim(now);
        this._tickBlessingAnim(now);
        this._tickHealing(now);
        this._tickDlgQueue(now);
        this._tickScript(now);

        this._drawSceneImage(alpha);
        this._drawDialogBox(now, alpha);
    }

    _drawSceneImage(alpha) {
        const ctx = this.ctx;

        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.strokeStyle = '#443322';
        ctx.lineWidth = 3;
        ctx.strokeRect(IMG_X - 2, IMG_Y - 2, IMG_W + 4, IMG_H + 4);

        let frameIdx = 0;
        if (this.blessPhase === 'playing') {
            frameIdx = BLESS_STAGE_FRAME[this.blessStage] ?? 3;
        } else if (this.blessPhase === 'done') {
            frameIdx = 3;
        }

        const mainImg = this.churchImages[frameIdx];
        if (mainImg) ctx.drawImage(mainImg, IMG_X, IMG_Y, IMG_W, IMG_H);

        const candleImg = this.candleImages[this.candleFrameIdx];
        if (candleImg) {
            ctx.drawImage(
                candleImg,
                IMG_X + CANDLE_REL_X,
                IMG_Y + CANDLE_REL_Y,
                CANDLE_W,
                CANDLE_H
            );
        }

        ctx.restore();
    }

    _tickCandleAnim(now) {
        if (!this.candleImages.length) return;
        if (now - this.lastCandleTime < ANIM_32_TICK_MS) return;
        this.lastCandleTime = now;
        this.candleFrameIdx = (this.candleFrameIdx + 1) % this.candleImages.length;
    }

    _tickBlessingAnim(now) {
        if (this.blessPhase !== 'playing') return;
        if (now - this.lastBlessTime < ANIM_32_TICK_MS) return;

        this.lastBlessTime = now;
        this.blessStage++;

        if (this.blessStage >= BLESS_STAGE_FRAME.length) {
            this.blessPhase = 'done';
            this.blessStage = BLESS_STAGE_FRAME.length - 1;
            if (this.scriptBlockedBy === OP.BLESS) this.scriptBlockedBy = null;
        }
    }

    _tickHealing(now) {
        if (this.healPhase !== 'healing') return;
        if (now - this.lastHealTime < HEAL_TICK_MS) return;

        this.lastHealTime = now;
        const hp = this._getHeroHP();
        const maxHp = this._getHeroMaxHp();
        const nextHp = hp + 8;

        if (nextHp >= maxHp) {
            this._setHeroHP(maxHp);
            this._restoreSpells();
            this.healPhase = 'idle';
            if (this.scriptBlockedBy === OP.HEAL_RESTORE) this.scriptBlockedBy = null;
        } else {
            this._setHeroHP(nextHp);
        }
    }

    _tickScript(now) {
        if (!this.sceneReady || this.phase === 'fadeOut') return;
        if (this.waitingForContinue || this.scriptBlockedBy) return;
        if (!this._dialogIdle(now)) return;

        if (this.scriptWaitUntil !== null) {
            if (now < this.scriptWaitUntil) return;
            this.scriptWaitUntil = null;
        }

        while (this.scriptIndex < this.script.length) {
            const step = this.script[this.scriptIndex++];

            switch (step.op) {
                case OP.CLEAR:
                    this._clearDialog();
                    break;
                case OP.TEXT:
                    this._queueText(step.text);
                    return;
                case OP.WAIT:
                    this.scriptWaitUntil = now + step.ms;
                    return;
                case OP.HEAL_RESTORE:
                    this._startHealing(now);
                    return;
                case OP.RESTORE:
                    this._restoreSpells();
                    break;
                case OP.COMMON:
                    this.script.splice(this.scriptIndex, 0, ...COMMON_SCRIPT);
                    break;
                case OP.BLESS:
                    this._startBlessing(now);
                    return;
                case OP.CONTINUE:
                    this.waitingForContinue = true;
                    this.dialogFullAcknowledged = false;
                    return;
                case OP.EXIT:
                    this.startFadeOut(now);
                    return;
            }
        }
    }

    _startHealing(now) {
        this.healPhase = 'healing';
        this.lastHealTime = now;
        this.scriptBlockedBy = OP.HEAL_RESTORE;
    }

    _startBlessing(now) {
        this.blessPhase = 'playing';
        this.blessStage = 0;
        this.lastBlessTime = now;
        this.scriptBlockedBy = OP.BLESS;
    }

    _dialogIdle(now) {
        if (this._dlgQueue.length > 0) return false;
        if (this.typewriter && !this.typewriter.isDone(now)) return false;
        if (this.typewriter && this._pendingLine !== null) {
            this.dlgBuffer.push(this._pendingLine);
            this._pendingLine = null;
            this.typewriter = null;
        }
        return true;
    }

    get _dlgMaxLines() {
        return Math.floor((DLG_H - 22 - 40) / LINE_H_DLG);
    }

    _clearDialog() {
        this.dlgBuffer = [];
        this._pendingLine = null;
        this._dlgQueue = [];
        this.typewriter = null;
        this.waitingForContinue = false;
        this.dialogFullAcknowledged = false;
    }

    _queueText(text) {
        this._dlgQueue.push(...this._wrapText(text));
    }

    _wrapText(text) {
        this.ctx.save();
        this.ctx.font = FONT_DLG;

        const maxW = DLG_W - 28;
        const lines = [];
        for (const para of text.split('\n')) {
            const words = para.split(' ');
            let line = '';
            for (const word of words) {
                if (word === '' && line === '') continue;
                const candidate = line ? `${line} ${word}` : word;
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

    _startTypewriterLine(line, now) {
        this._pendingLine = line;
        this.typewriter = new TypewriterText(
            line,
            FONT_DLG,
            DLG_W - 28,
            CHAR_MS,
            LINE_H_DLG,
            DLG_H,
            this.ctx
        );
        this.typewriter.start(now);
    }

    _tickDlgQueue(now) {
        if (this.waitingForContinue) return;

        if (this.typewriter) {
            if (!this.typewriter.isDone(now)) return;
            if (this._pendingLine !== null) {
                this.dlgBuffer.push(this._pendingLine);
                this._pendingLine = null;
            }
            this.typewriter = null;
        }

        if (!this._dlgQueue.length) return;
        if (this.dlgBuffer.length >= this._dlgMaxLines && !this.dialogFullAcknowledged) {
            this.waitingForContinue = true;
            return;
        }

        this.dialogFullAcknowledged = false;
        this._startTypewriterLine(this._dlgQueue.shift(), now);
    }

    _drawDialogBox(now, alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.strokeStyle = '#887755';
        ctx.lineWidth = 2;
        ctx.strokeRect(DLG_X - 2, DLG_Y - 2, DLG_W + 4, DLG_H + 4);
        ctx.strokeStyle = '#443322';
        ctx.lineWidth = 1;
        ctx.strokeRect(DLG_X, DLG_Y, DLG_W, DLG_H);
        ctx.fillStyle = '#050400';
        ctx.fillRect(DLG_X, DLG_Y, DLG_W, DLG_H);

        const maxBufferLines = this.typewriter ? this._dlgMaxLines - 1 : this._dlgMaxLines;
        const visibleBuffer = this.dlgBuffer.slice(-maxBufferLines);
        ctx.font = FONT_DLG;
        ctx.fillStyle = '#ddbb88';

        let row = 0;
        for (const line of visibleBuffer) {
            ctx.fillText(line, DLG_TEXT_X, DLG_TEXT_Y + row * LINE_H_DLG);
            row++;
        }

        if (this.typewriter && row < this._dlgMaxLines) {
            const vis = this.typewriter.getVisibleLines(now);
            if (vis.length) {
                ctx.fillText(vis[0], DLG_TEXT_X, DLG_TEXT_Y + row * LINE_H_DLG);
            }
        }

        if (this.waitingForContinue) {
            this._drawContinueArrow(ctx);
        }

        ctx.restore();
    }

    _drawContinueArrow(ctx) {
        ctx.fillStyle = '#cc9933';
        const ax = DLG_X + DLG_W / 2 - 12;
        const ay = DLG_Y + DLG_H - 36;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + 24, ay);
        ctx.lineTo(ax + 12, ay + 14);
        ctx.closePath();
        ctx.fill();
    }

    handleInput(key) {
        if (key !== 'Space' || !this.waitingForContinue) return;

        this.waitingForContinue = false;
        this.dialogFullAcknowledged = this._dlgQueue.length > 0;
    }

    getName() {
        return 'The Church';
    }
}
