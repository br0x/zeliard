/**
 * indoor-church.ts — The Church indoor scene.
 *
 * Port of asm/churpro.asm. This building has no interactive menu: the bytes
 * returned by render_menu_dialog_proc are scripted actions, and the scene runs
 * them automatically. Player input is only used for the original continuation
 * wait near the end of the dialog.
 */

import { IndoorSceneBase } from '../core/indoor-scene-base.js';
import type { IndoorSceneDependencies } from '../core/scene.js';
import { TypewriterText } from '../ui/menu-dialog.js';
import {
    ADDR_HERO_HP, ADDR_HERO_MAX_HP, ADDR_CURR_SPELL_TYPE,
    ADDR_SPELLS_ACTIVE, ADDR_SPELLS_INVENTORY,
} from '../core/memory.js';

const PANEL_W = 672;
const PANEL_H = 432;

const IMG_X = 190;
const IMG_Y = 16;
const IMG_W = 291;
const IMG_H = 192;

const CANDLE_REL_X = 51;
const CANDLE_REL_Y = 100;
const CANDLE_W = 53;
const CANDLE_H = 23;

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
export const WAIT_250_MS = 250 * FULL_TICK_MS;
export const HEAL_TICK_MS = 20 * FULL_TICK_MS;
export const ANIM_32_TICK_MS = 32 * FULL_TICK_MS;

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
    'assets/images/church/candle4.png',
];

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

export type ChurchOp =
    | 'clear'
    | 'text'
    | 'wait'
    | 'heal_restore'
    | 'restore'
    | 'common'
    | 'bless'
    | 'continue'
    | 'exit';

export type ChurchScriptStep =
    | { op: 'clear' }
    | { op: 'text'; text: string }
    | { op: 'wait'; ms: number }
    | { op: 'heal_restore' }
    | { op: 'restore' }
    | { op: 'common' }
    | { op: 'bless' }
    | { op: 'continue' }
    | { op: 'exit' };

export const COMMON_SCRIPT: ChurchScriptStep[] = [
    { op: 'text', text: TEXT_FATIGUED },
    { op: 'wait', ms: WAIT_250_MS },
    { op: 'text', text: TEXT_MAY_GOD },
    { op: 'bless' },
    { op: 'continue' },
    { op: 'exit' },
];

/** Full-heal path when HP already maxed; heal+restore otherwise (asm parity). */
export function buildChurchScript(hp: number, maxHp: number): ChurchScriptStep[] {
    if (hp >= maxHp) {
        return [
            { op: 'clear' },
            { op: 'text', text: TEXT_TIRED },
            { op: 'restore' },
            { op: 'common' },
        ];
    }

    return [
        { op: 'clear' },
        { op: 'text', text: TEXT_WEARY },
        { op: 'wait', ms: WAIT_250_MS },
        { op: 'wait', ms: WAIT_250_MS },
        { op: 'text', text: TEXT_HOLY },
        { op: 'heal_restore' },
        { op: 'common' },
    ];
}

type BlessPhase = 'idle' | 'playing' | 'done';
type HealPhase = 'idle' | 'healing';

export class ChurchScene extends IndoorSceneBase {
    private churchImages: HTMLImageElement[] = [];
    private candleImages: HTMLImageElement[] = [];

    private candleFrameIdx = 0;
    private lastCandleTime = 0;

    private blessPhase: BlessPhase = 'idle';
    private blessStage = 0;
    private lastBlessTime = 0;

    private healPhase: HealPhase = 'idle';
    private lastHealTime = 0;

    private script: ChurchScriptStep[] = [];
    private scriptIndex = 0;
    private scriptWaitUntil: number | null = null;
    private scriptBlockedBy: ChurchOp | null = null;
    private sceneReady = false;

    private typewriter: TypewriterText | null = null;
    private dlgBuffer: string[] = [];
    private _pendingLine: string | null = null;
    private _dlgQueue: string[] = [];
    private waitingForContinue = false;
    private dialogFullAcknowledged = false;

    constructor(context: IndoorSceneDependencies) {
        super(context);

        this.fadeInMs = 650;
        this.fadeOutMs = 450;
    }

    protected override onEnter(now: number): void {
        Promise.all([
            Promise.all(CHURCH_FRAMES.map(path => this._loadImg(path))),
            Promise.all(CANDLE_FRAMES.map(path => this._loadImg(path))),
        ])
            .then(([churches, candles]) => {
                this.churchImages = churches;
                this.candleImages = candles;
            })
            .catch((error: unknown) => {
                console.error('[ChurchScene] image load failed:', error);
                this.finish();
                return;
            })
            .then(() => {
                if (this.sceneReady || this.phase !== 'fadeIn') return;
                this.lastCandleTime = now;
                this.script = buildChurchScript(this._getHeroHP(), this._getHeroMaxHp());
                this.scriptIndex = 0;
                this.sceneReady = true;
            });
    }

    private _loadImg(src: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load: ${src}`));
            img.src = src;
        });
    }

    private _readWord(addr: number): number {
        if (!this.readMemory) return 0;
        const bytes = this.readMemory(addr, 2);
        if (!bytes) return 0;
        return ((bytes[0] ?? 0) & 0xFF) | ((bytes[1] ?? 0) & 0xFF) << 8;
    }

    private _writeWord(addr: number, value: number): void {
        if (!this.writeMemory) return;
        const v = Math.max(0, Math.min(0xFFFF, Math.floor(value)));
        this.writeMemory(addr, Uint8Array.of(v & 0xFF, (v >> 8) & 0xFF));
    }

    private _readByte(addr: number): number {
        if (!this.readMemory) return 0;
        return (this.readMemory(addr, 1)?.[0] ?? 0) & 0xFF;
    }

    private _getHeroHP(): number {
        return this._readWord(ADDR_HERO_HP);
    }

    private _getHeroMaxHp(): number {
        return this._readWord(ADDR_HERO_MAX_HP);
    }

    private _setHeroHP(value: number): void {
        this._writeWord(ADDR_HERO_HP, value);
        this._refreshLifeHud();
    }

    private _restoreSpells(): void {
        if (!this.readMemory || !this.writeMemory) return;
        const inv = this.readMemory(ADDR_SPELLS_INVENTORY, 7);
        if (!inv) return;
        this.writeMemory(ADDR_SPELLS_ACTIVE, inv);
        this._refreshMagicHud();
    }

    private _refreshMagicHud(): void {
        if (typeof document === 'undefined') return;
        const activeSpell = this._readByte(ADDR_CURR_SPELL_TYPE);
        if (!activeSpell) return;
        const counter = document.getElementById('spellCounter');
        if (counter) counter.textContent = String(this._readByte(ADDR_SPELLS_ACTIVE + activeSpell - 1));
        this.renderMagicHud();
    }

    private _refreshLifeHud(): void {
        if (this.drawLifeBar) {
            this.drawLifeBar();
        } else {
            this.setLife?.(this._getHeroHP(), this._getHeroMaxHp());
        }
    }

    protected override drawContent(now: number, alpha: number): void {
        this._tickCandleAnim(now);
        this._tickBlessingAnim(now);
        this._tickHealing(now);
        this._tickDlgQueue(now);
        this._tickScript(now);

        this._drawSceneImage(alpha);
        this._drawDialogBox(now, alpha);
    }

    private _drawSceneImage(alpha: number): void {
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

    private _tickCandleAnim(now: number): void {
        if (!this.candleImages.length) return;
        if (now - this.lastCandleTime < ANIM_32_TICK_MS) return;
        this.lastCandleTime = now;
        this.candleFrameIdx = (this.candleFrameIdx + 1) % this.candleImages.length;
    }

    private _tickBlessingAnim(now: number): void {
        if (this.blessPhase !== 'playing') return;
        if (now - this.lastBlessTime < ANIM_32_TICK_MS) return;

        this.lastBlessTime = now;
        this.blessStage++;

        if (this.blessStage >= BLESS_STAGE_FRAME.length) {
            this.blessPhase = 'done';
            this.blessStage = BLESS_STAGE_FRAME.length - 1;
            if (this.scriptBlockedBy === 'bless') this.scriptBlockedBy = null;
        }
    }

    private _tickHealing(now: number): void {
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
            if (this.scriptBlockedBy === 'heal_restore') this.scriptBlockedBy = null;
        } else {
            this._setHeroHP(nextHp);
        }
    }

    private _tickScript(now: number): void {
        if (!this.sceneReady || this.phase === 'fadeOut') return;
        if (this.waitingForContinue || this.scriptBlockedBy) return;
        if (!this._dialogIdle(now)) return;

        if (this.scriptWaitUntil !== null) {
            if (now < this.scriptWaitUntil) return;
            this.scriptWaitUntil = null;
        }

        while (this.scriptIndex < this.script.length) {
            const step = this.script[this.scriptIndex++]!;

            switch (step.op) {
                case 'clear':
                    this._clearDialog();
                    break;
                case 'text':
                    this._queueText(step.text);
                    return;
                case 'wait':
                    this.scriptWaitUntil = now + step.ms;
                    return;
                case 'heal_restore':
                    this._startHealing(now);
                    return;
                case 'restore':
                    this._restoreSpells();
                    break;
                case 'common':
                    this.script.splice(this.scriptIndex, 0, ...COMMON_SCRIPT);
                    break;
                case 'bless':
                    this._startBlessing(now);
                    return;
                case 'continue':
                    this.waitingForContinue = true;
                    this.dialogFullAcknowledged = false;
                    return;
                case 'exit':
                    this.startFadeOut(now);
                    return;
            }
        }
    }

    /** Exposed for tests: current script-blocking animation op, if any. */
    get blockedBy(): ChurchOp | null {
        return this.scriptBlockedBy;
    }

    private _startHealing(_now: number): void {
        this.healPhase = 'healing';
        this.lastHealTime = _now;
        this.scriptBlockedBy = 'heal_restore';
    }

    private _startBlessing(now: number): void {
        this.blessPhase = 'playing';
        this.blessStage = 0;
        this.lastBlessTime = now;
        this.scriptBlockedBy = 'bless';
    }

    private _dialogIdle(now: number): boolean {
        if (this._dlgQueue.length > 0) return false;
        if (this.typewriter && !this.typewriter.isDone(now)) return false;
        if (this.typewriter && this._pendingLine !== null) {
            this.dlgBuffer.push(this._pendingLine);
            this._pendingLine = null;
            this.typewriter = null;
        }
        return true;
    }

    private get _dlgMaxLines(): number {
        return Math.floor((DLG_H - 22 - 40) / LINE_H_DLG);
    }

    private _clearDialog(): void {
        this.dlgBuffer = [];
        this._pendingLine = null;
        this._dlgQueue = [];
        this.typewriter = null;
        this.waitingForContinue = false;
        this.dialogFullAcknowledged = false;
    }

    private _queueText(text: string): void {
        this._dlgQueue.push(...this._wrapText(text));
    }

    private _wrapText(text: string): string[] {
        this.ctx.save();
        this.ctx.font = FONT_DLG;

        const maxW = DLG_W - 28;
        const lines: string[] = [];
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

    private _startTypewriterLine(line: string, now: number): void {
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

    private _tickDlgQueue(now: number): void {
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
        this._startTypewriterLine(this._dlgQueue.shift() as string, now);
    }

    private _drawDialogBox(now: number, alpha: number): void {
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
                ctx.fillText(vis[0]!, DLG_TEXT_X, DLG_TEXT_Y + row * LINE_H_DLG);
            }
        }

        if (this.waitingForContinue) {
            this._drawContinueArrow(ctx);
        }

        ctx.restore();
    }

    private _drawContinueArrow(ctx: CanvasRenderingContext2D): void {
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

    handleInput(key: string): void {
        if (key !== 'Space' || !this.waitingForContinue) return;

        this.waitingForContinue = false;
        this.dialogFullAcknowledged = this._dlgQueue.length > 0;
    }

    getName(): string {
        return 'The Church';
    }
}
