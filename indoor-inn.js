import { IndoorSceneBase } from './indoor-base.js';
import { TypewriterText } from './ui-menu-dialog.js';

const PANEL_W = 672;
const PANEL_H = 432;

const IMG_X = 16;
const IMG_Y = 16;
const IMG_W = 291;
const IMG_H = 192;

const MENU_X = IMG_X + IMG_W + 16;
const MENU_Y = IMG_Y;
const MENU_W = PANEL_W - MENU_X - 16;
const MENU_H = IMG_H;

const DLG_X = 16;
const DLG_Y = IMG_Y + IMG_H + 14;
const DLG_W = PANEL_W - 32;
const DLG_H = PANEL_H - DLG_Y - 16;

const FONT_DLG = '13px "Press Start 2P", monospace';
const LINE_H_DLG = 26;
const CHAR_MS = 28;
const DLG_TEXT_X = DLG_X + 14;
const DLG_TEXT_Y = DLG_Y + 22;

const FONT_MENU = '13px "Press Start 2P", monospace';
const LINE_H_MENU = 36;
const MENU_TEXT_X = MENU_X + 28;
const MENU_TEXT_Y = MENU_Y + 30;
const MENU_CURSOR_X = MENU_X + 6;

const FULL_TICK_MS = 1000 / 236.7;
const SLEEP_FADE_MS = 450;
const SLEEP_HEAL_WAIT_MS = 150 * FULL_TICK_MS;

const ADDR_TOWN_ID = 0xC4;
const ADDR_GOLD_HI = 0x85;
const ADDR_GOLD_LO = 0x86;
const ADDR_HERO_HP = 0x90;
const ADDR_HERO_MAX = 0xB2;
const ADDR_SPELL_ACT = 0x9D; // current_magic_spell
const ADDR_SPELLS_ACT = 0xAB; // spells_espada
const ADDR_SPELLS_INV = 0xB4; // espada_count

const PRICES = [0, 30, 50, 70, 100, 150, 200, 400];

const INN1_MS = 250;
const INN2_MS = 5000;

const MENU_ITEMS = ['Stay the night', 'Leave'];
const MENU_STAY = 0;
const MENU_LEAVE = 1;

const TEXT_WELCOME_P1 =
    "Welcome, sir!\nYou look like you've come a long way.\nOne night of rest in my inn is all you need to recover your strength. You can have the best room in the house for only ";

const TEXT_WELCOME_P2 =
    "golds. Will you stay?";

const TEXT_LEAVE =
    "Oh, I'm sorry to hear that.\nWell, if you should ever need a place to rest, do come back.";

const TEXT_NO_FUNDS =
    "I'm sorry sir, but I can't accommodate you without funds.\nPlease come back when you can afford it.";

const TEXT_THANK_YOU =
    "Thank you, sir. Enjoy your stay.";

const TEXT_MORNING =
    "I trust you had a good night's sleep. We'll be looking forward to seeing you again.";

let hasSleptThisSession = false;

export class InnScene extends IndoorSceneBase {
    constructor(context) {
        super(context);

        this.innImages = [];
        this.animFrameIdx = 0;
        this.lastAnimTime = 0;

        this.scenePhase = 'loading';
        this.menuSel = 0;
        this.townIdx = 0;
        this.price = 0;

        this.typewriter = null;
        this.dlgBuffer = [];
        this._pendingLine = null;
        this._dlgQueue = [];
        this.waitingForContinue = false;
        this.dialogFullAcknowledged = false;

        this.sleepPhase = null;
        this.sleepStartTime = 0;
        this.sleepAlpha = 0;

        this.fadeInMs = 650;
        this.fadeOutMs = 450;
    }

    async onEnter(now) {
        try {
            const images = await Promise.all([
                this._loadImg('assets/images/inn/inn1.png'),
                this._loadImg('assets/images/inn/inn2.png'),
            ]);
            this.innImages = images;
        } catch (error) {
            console.error('[InnScene] image load failed:', error);
            this.finish();
            return;
        }

        this.lastAnimTime = performance.now();
        this.townIdx = this._getTownIdx();
        this.price = PRICES[Math.min(this.townIdx, PRICES.length - 1)];

        if (hasSleptThisSession) {
            this._setDialog(TEXT_MORNING);
        } else {
            const priceStr = this.price > 0 ? `${this.price} ` : '';
            this._setDialog(TEXT_WELCOME_P1 + priceStr + TEXT_WELCOME_P2);
        }
        this.scenePhase = 'greeting';

        this.phase = 'shown';
        this.alpha = 1;
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

    _getTownIdx() {
        const raw = this._readByte(ADDR_TOWN_ID);
        const idx = (raw & 0x7F) - 1;
        return Math.max(0, Math.min(7, idx));
    }

    _getGold() {
        const hi = this._readByte(ADDR_GOLD_HI);
        const lo = this._readWord(ADDR_GOLD_LO);
        return (hi * 0x10000) + lo;
    }

    _setGold(amount) {
        const v = Math.max(0, Math.floor(amount));
        const hi = (v >>> 16) & 0xFF;
        const lo = v & 0xFFFF;
        this.writeMemory(ADDR_GOLD_HI, [hi]);
        this.writeMemory(ADDR_GOLD_LO, [lo & 0xFF, (lo >> 8) & 0xFF]);
    }

    _getHeroHP() {
        return this._readWord(ADDR_HERO_HP);
    }

    _getHeroMaxHp() {
        return this._readWord(ADDR_HERO_MAX);
    }

    _setHeroHP(value) {
        this._writeWord(ADDR_HERO_HP, value);
        this._refreshLifeHud();
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
        this.renderMagicHud?.();
    }

    _refreshLifeHud() {
        if (this.drawLifeBar) {
            this.drawLifeBar();
        } else {
            this.setLife?.(this._getHeroHP(), this._getHeroMaxHp());
        }
    }

    drawContent(now, alpha) {
        this._tickAnim(now);
        this._tickSleep(now);
        this._tickDlgQueue(now);

        if (this.scenePhase === 'paid' && !this.waitingForContinue &&
            this._dlgQueue.length === 0 && this._isTypewriterDone(now) &&
            this.sleepPhase === null) {
            this._startSleep();
        }

        if (this.scenePhase === 'greeting' && !this.waitingForContinue &&
            this._dlgQueue.length === 0 && this._isTypewriterDone(now) &&
            this.sleepPhase === null) {
            this.scenePhase = 'menu';
        }

        this._drawSceneImage();
        this._drawDialogBox(now);
        if (this.scenePhase === 'menu') {
            this._drawMenu();
        }
    }

    _tickAnim(now) {
        if (!this.innImages.length) return;
        const duration = this.animFrameIdx === 0 ? INN1_MS : INN2_MS;
        if (now - this.lastAnimTime < duration) return;
        this.lastAnimTime = now;
        this.animFrameIdx = (this.animFrameIdx + 1) % 2;
    }

    _tickSleep(now) {
        if (!this.sleepPhase) return;

        if (this.sleepPhase === 'fade') {
            const t = Math.min(1, (now - this.sleepStartTime) / SLEEP_FADE_MS);
            this.sleepAlpha = t;
            if (t >= 1) {
                this.sleepPhase = 'heal';
                this.sleepStartTime = now;
                this._healHero();
            }
        } else if (this.sleepPhase === 'heal') {
            if (now - this.sleepStartTime >= SLEEP_HEAL_WAIT_MS) {
                this.sleepPhase = null;
                this.sleepAlpha = 0;
                hasSleptThisSession = true;
                this._setDialog(TEXT_MORNING);
                this.scenePhase = 'morning';
            }
        }
    }

    _healHero() {
        const maxHp = this._getHeroMaxHp();
        this._setHeroHP(maxHp);
        this._restoreSpells();
    }

    _drawSceneImage() {
        const ctx = this.ctx;

        ctx.strokeStyle = '#443322';
        ctx.lineWidth = 3;
        ctx.strokeRect(IMG_X - 2, IMG_Y - 2, IMG_W + 4, IMG_H + 4);

        const img = this.innImages[this.animFrameIdx];
        if (img) ctx.drawImage(img, IMG_X, IMG_Y, IMG_W, IMG_H);

        if (this.sleepPhase === 'fade') {
            ctx.fillStyle = '#000';
            ctx.globalAlpha = this.sleepAlpha;
            ctx.fillRect(IMG_X, IMG_Y, IMG_W, IMG_H);
            ctx.globalAlpha = 1;
        } else if (this.sleepPhase === 'heal') {
            ctx.fillStyle = '#000';
            ctx.fillRect(IMG_X, IMG_Y, IMG_W, IMG_H);
        }
    }

    _drawMenu() {
        const ctx = this.ctx;

        ctx.save();

        ctx.strokeStyle = '#443322';
        ctx.lineWidth = 2;
        ctx.strokeRect(MENU_X - 2, MENU_Y - 2, MENU_W + 4, MENU_H + 4);
        ctx.strokeStyle = '#221100';
        ctx.lineWidth = 1;
        ctx.strokeRect(MENU_X, MENU_Y, MENU_W, MENU_H);
        ctx.fillStyle = '#050400';
        ctx.fillRect(MENU_X, MENU_Y, MENU_W, MENU_H);

        ctx.font = FONT_MENU;
        for (let i = 0; i < MENU_ITEMS.length; i++) {
            const y = MENU_TEXT_Y + i * LINE_H_MENU;
            const sel = i === this.menuSel;

            ctx.fillStyle = sel ? '#ddbb88' : '#998866';
            ctx.fillText(MENU_ITEMS[i], MENU_TEXT_X, y);

            if (sel) {
                ctx.fillStyle = '#cc9933';
                ctx.beginPath();
                ctx.moveTo(MENU_CURSOR_X, y - 14);
                ctx.lineTo(MENU_CURSOR_X, y + 4);
                ctx.lineTo(MENU_CURSOR_X + 12, y - 5);
                ctx.closePath();
                ctx.fill();
            }
        }

        ctx.restore();
    }

    _drawDialogBox(now) {
        const ctx = this.ctx;
        ctx.save();

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
        const ay = DLG_Y + DLG_H - 26;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + 24, ay);
        ctx.lineTo(ax + 12, ay + 14);
        ctx.closePath();
        ctx.fill();
    }

    get _dlgMaxLines() {
        return Math.floor((DLG_H - 16 - 20) / LINE_H_DLG);
    }

    _clearDialog() {
        this.dlgBuffer = [];
        this._pendingLine = null;
        this._dlgQueue = [];
        this.typewriter = null;
        this.waitingForContinue = false;
        this.dialogFullAcknowledged = false;
    }

    _setDialog(text) {
        this._clearDialog();
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

    _isTypewriterDone(now) {
        return !this.typewriter || this.typewriter.isDone(now);
    }

    handleInput(key) {
        const now = performance.now();
        if (this.phase === 'fadeOut') return;
        if (this.sleepPhase) return;

        if (this.scenePhase === 'menu') {
            if (key === 'ArrowUp' || key === 'ArrowDown') {
                const dir = key === 'ArrowUp' ? -1 : 1;
                this.menuSel = (this.menuSel + dir + MENU_ITEMS.length) % MENU_ITEMS.length;
                return;
            }
            if (key === 'Escape') {
                this.startFadeOut(now);
                return;
            }
        }

        if (key === 'Space' || key === 'Enter') {
            if (this.typewriter && !this.typewriter.isDone(now)) {
                this.typewriter.skip(now);
                return;
            }

            if (this.waitingForContinue) {
                this.waitingForContinue = false;
                this.dialogFullAcknowledged = this._dlgQueue.length > 0;
                return;
            }

            this._handleConfirm(now);
        }
    }

    _handleConfirm(now) {
        switch (this.scenePhase) {
            case 'greeting':
                if (!this._isTypewriterDone(now)) return;
                if (this._dlgQueue.length > 0) return;
                this.scenePhase = 'menu';
                break;

            case 'menu':
                this._activateMenuItem(this.menuSel, now);
                break;

            case 'dialog':
                this.scenePhase = 'menu';
                break;

            case 'morning':
                this.startFadeOut(now);
                break;

            case 'leave':
                this.startFadeOut(now);
                break;
        }
    }

    _activateMenuItem(idx, now) {
        switch (idx) {
            case MENU_STAY:
                this._handleStay(now);
                break;
            case MENU_LEAVE:
                this._handleLeave(now);
                break;
        }
    }

    _handleStay(now) {
        const gold = this._getGold();

        if (gold < this.price) {
            this._setDialog(TEXT_NO_FUNDS);
            this.scenePhase = 'dialog';
            return;
        }

        this._setGold(gold - this.price);
        this._refreshLifeHud();

        this._setDialog(TEXT_THANK_YOU);
        this.scenePhase = 'paid';
    }

    _handleLeave(now) {
        this._setDialog(TEXT_LEAVE);
        this.scenePhase = 'leave';
    }

    _startSleep() {
        this._clearDialog();
        this.sleepPhase = 'fade';
        this.sleepStartTime = performance.now();
        this.sleepAlpha = 0;
    }

    getName() {
        return 'The Inn';
    }
}
