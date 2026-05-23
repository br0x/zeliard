import { IndoorSceneBase } from './indoor-base.js';
import { TypewriterText } from './ui-menu-dialog.js';

const SAGE_IMAGE_PATH = 'assets/images/kenjya/kenjya.png';
const SAGE_PANEL_W = 672;
const SAGE_PANEL_H = 432;
const SAGE_IMG_X = 16, SAGE_IMG_Y = 16, SAGE_IMG_W = 291, SAGE_IMG_H = 192;
const SAGE_MENU_X = SAGE_IMG_X + SAGE_IMG_W + 16, SAGE_MENU_Y = SAGE_IMG_Y;
const SAGE_MENU_W = SAGE_PANEL_W - SAGE_MENU_X - 16, SAGE_MENU_H = SAGE_IMG_H;
const SAGE_DLG_X = 16, SAGE_DLG_Y = SAGE_IMG_Y + SAGE_IMG_H + 16;
const SAGE_DLG_W = SAGE_PANEL_W - 32, SAGE_DLG_H = SAGE_PANEL_H - SAGE_DLG_Y - 16;
const SAGE_FONT_MENU = '16px "Press Start 2P", monospace';
const SAGE_FONT_DLG = '14px "Press Start 2P", monospace';
const SAGE_LINE_H_MENU = 40, SAGE_LINE_H_DLG = 20;
const SAGE_MENU_TEXT_X = SAGE_MENU_X + 32;
const SAGE_MENU_TEXT_Y = SAGE_MENU_Y + 40;
const SAGE_CURSOR_X = SAGE_MENU_X + 8;
const SAGE_DLG_TEXT_X = SAGE_DLG_X + 14, SAGE_DLG_TEXT_Y = SAGE_DLG_Y + 22;
const SAGE_CHAR_MS = 28;
const SAGE_FADE_IN_MS = 600, SAGE_FADE_OUT_MS = 450;

const SAGE_MENU = ['Go outside', 'See Power', 'Listen Knowledge', 'Record Experience'];
const SAGE_MENU_GO_OUTSIDE = 0, SAGE_MENU_SEE_POWER = 1,
      SAGE_MENU_LISTEN_KNOWLEDGE = 2, SAGE_MENU_RECORD_EXPERIENCE = 3;

const SAGE_XP_TABLE = [50,150,300,420,1000,1500,3000,5000,6000,8000,10000,15000,20000,40000,50000,60000];
const SAGE_MIN_LEVEL_BY_TOWN = [3,6,9,11,13,15,18,0xFF];
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
        this.fadeInMs = SAGE_FADE_IN_MS;
        this.fadeOutMs = SAGE_FADE_OUT_MS;
        this.modalOpen = false;
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
            this.sagePhase = 'greeting';
        }
        this.typewriter.start(now);
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

    _setDialog(text) {
        this.typewriter = new TypewriterText(
            text,
            SAGE_FONT_DLG,
            SAGE_DLG_W - 28,   // original maxWidth
            SAGE_CHAR_MS,
            SAGE_LINE_H_DLG,
            this.ctx
        );
        this.typewriter.start(performance.now());
    }

    drawContent(now, alpha) {
        this._drawPortraitBox();
        this._drawOrbAnimation(now, alpha);
        this._drawMenuBox(now, alpha);
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
        // border
        ctx.strokeStyle = '#eee';
        ctx.lineWidth = 2;
        ctx.strokeRect(SAGE_MENU_X-2, SAGE_MENU_Y-2, SAGE_MENU_W+4, SAGE_MENU_H+4);
        ctx.strokeStyle = '#888';
        ctx.lineWidth = 1;
        ctx.strokeRect(SAGE_MENU_X, SAGE_MENU_Y, SAGE_MENU_W, SAGE_MENU_H);
        ctx.fillStyle = '#000';
        ctx.fillRect(SAGE_MENU_X, SAGE_MENU_Y, SAGE_MENU_W, SAGE_MENU_H);

        if (this.sagePhase === 'menu') {
            ctx.font = SAGE_FONT_MENU;
            for (let i = 0; i < SAGE_MENU.length; i++) {
                const y = SAGE_MENU_TEXT_Y + i * SAGE_LINE_H_MENU;
                const sel = i === this.menuSel;
                ctx.fillStyle = sel ? '#ff0' : '#fff';
                ctx.fillText(SAGE_MENU[i], SAGE_MENU_TEXT_X, y);
                if (sel) {
                    ctx.fillStyle = '#f00';
                    // right-pointing triangle, placed at the same cursor position as original
                    this._triangle(ctx, SAGE_CURSOR_X, y - 18, 10, 18, false);
                }
            }
        }
        ctx.restore();
    }

    _drawDialogBox(now, alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;
        // border
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 2;
        ctx.strokeRect(SAGE_DLG_X-2, SAGE_DLG_Y-2, SAGE_DLG_W+4, SAGE_DLG_H+4);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        ctx.strokeRect(SAGE_DLG_X, SAGE_DLG_Y, SAGE_DLG_W, SAGE_DLG_H);
        ctx.fillStyle = '#000';
        ctx.fillRect(SAGE_DLG_X, SAGE_DLG_Y, SAGE_DLG_W, SAGE_DLG_H);

        if (this.typewriter) {
            this.typewriter.draw(ctx, SAGE_DLG_TEXT_X, SAGE_DLG_TEXT_Y, now, 1);
        }
        ctx.restore();
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

    handleInput(key) {
        if (this.modalOpen) return;
        const now = performance.now();
        if (this.phase === 'fadeOut') return;
        if (key === 'ArrowUp') {
            if (this.sagePhase === 'menu') this.menuSel = (this.menuSel - 1 + SAGE_MENU.length) % SAGE_MENU.length;
        } else if (key === 'ArrowDown') {
            if (this.sagePhase === 'menu') this.menuSel = (this.menuSel + 1) % SAGE_MENU.length;
        } else if (key === 'Space') {
            this._onSpace(now);
        }
    }

    _onSpace(now) {
        if (this.typewriter && !this.typewriter.isDone(now)) {
            if (this.animRun && this.animSuppressed) return;
            this.typewriter.skip(now);
            return;
        }
        switch (this.sagePhase) {
            case 'intro':
                if (this.exitAfterDialog) this.startFadeOut(now);
                else { this._setDialog('How can I help you, Brave One?'); this.sagePhase = 'greeting'; }
                break;
            case 'greeting': this.sagePhase = 'menu'; break;
            case 'menu': this._activateMenuItem(this.menuSel, now); break;
            case 'dialog':
                if (this.exitAfterDialog) this.startFadeOut(now);
                else { this._setDialog('Is there anything else I can do for you?'); this.sagePhase = 'greeting'; }
                break;
            case 'power_anim':
                this.animRun = false;
                this.animSuppressed = false;
                const result = this._checkLevelUp();
                this._showPowerResult(result);
                break;
        }
    }

    _activateMenuItem(sel, now) {
        switch (sel) {
            case SAGE_MENU_GO_OUTSIDE:
                this._setDialog('The Spirits are with you.');
                this.sagePhase = 'dialog'; this.exitAfterDialog = true;
                break;
            case SAGE_MENU_SEE_POWER:
                this._seePower(now);
                break;
            case SAGE_MENU_LISTEN_KNOWLEDGE:
                this._setDialog(SAGE_KNOWLEDGE[this.townIdx] || 'The Spirits guide your path.');
                this.sagePhase = 'dialog'; this.exitAfterDialog = false;
                break;
            case SAGE_MENU_RECORD_EXPERIENCE:
                this._recordExperience(now);
                break;
        }
    }

    _seePower(now) {
        if (!this.hasPower) {
            this.hasPower = true; this.animRun = true; this.animSuppressed = true; this.crystalMode = true;
            const result = this._checkLevelUp();
            this.levelUpReady = (result >= 4);
            this._setDialog('I shall call upon the Spirits and their powers.....');
            this.sagePhase = 'power_anim';
            return;
        }
        if (this.powerExhausted) {
            this._setDialog('I fear the spirits are no longer with you. No matter how many times I try, it comes out the same.');
            this.sagePhase = 'dialog'; this.exitAfterDialog = false;
            return;
        }
        const result = this._checkLevelUp();
        this._showPowerResult(result);
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

    _showPowerResult(result) {
        const texts = [
            'Your experience is lacking. Persevere in your quest.',
            'You must accumulate more experience.',
            'I can see the faint light of the Spirits in you. You must endure a little longer.',
            'The light of the Spirits is bursting forth within you.',
            '',
        ];
        if (result === 4) {
            this.levelUpReady = true;
            this.powerExhausted = true;
            this._applyLevelUp();
            this._setDialog('The light of the Spirits is bursting forth within you. Indeed, your power has grown.');
        } else if (result === 3 && this.levelUpReady) {
            this.powerExhausted = true;
            this._setDialog('I can no longer impart the power of the Spirits to you. Continue on your quest. You will soon find others to help you.');
        } else {
            this._setDialog(texts[result] || texts[0]);
        }
        this.sagePhase = 'dialog'; this.exitAfterDialog = false;
    }

    _recordExperience(now) {
        // Open the global save modal (defined in game.js)
        if (typeof window.openSaveModal === 'function') {
            // Disable further input while modal is open
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
                // Restart typewriter
                if (this.typewriter) this.typewriter.start(performance.now());
            });
        } else {
            // Fallback (should never happen)
            if (this.readMemory && this.saveGame) {
                try { this.saveGame(this.readMemory(0,256)); } catch(e) { console.error(e); }
            }
            this._setDialog('I shall record your experiences.\nPlace is saved. Will you continue your quest?');
            this.sagePhase = 'dialog';
            this.exitAfterDialog = false;
        }
    }

    _getHeroLevel() { return this.readMemory?.(0x8d,1)[0] || 1; }
    _getHeroXp() {
        if (!this.readMemory) return 0;
        const b = this.readMemory(0x8e,2);
        return b[0] | (b[1] << 8);
    }
    _applyLevelUp() {
        if (!this.writeMemory) return;
        let lvl = this._getHeroLevel();
        if (lvl < 0xFE) lvl++;
        this.writeMemory(0x8d, [lvl]);
        this.writeMemory(0x8e, [0,0]);
    }

    getName() {
        return SAGE_NAMES[this.townIdx] || 'The Sage';
    }
}
