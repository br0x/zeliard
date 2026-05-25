/**
 * indoor-weapon-shop.js – Weapon & Armour Shop indoor scene.
 *
 * Faithful port of armrpro.asm.  Supports:
 *   • Idle animation  – calm1..calm5 cycling (5 frames, looped)
 *   • Angry animation – angry1..angry4 played once when the player
 *     leaves without buying (50 % chance), then fade-out.
 *   • Buy weapon  – per-town inventory bitmask, trade-in, price check.
 *   • Buy shield  – same mechanics for shields.
 *   • Repair shield – costs ceil((maxHP - hp) / 2).
 *   • Explain goods – shopkeeper describes any item in the combined list.
 *   • Special: Crest of Glory trade (town 5 / index 4) → Knight's Sword.
 *
 * Memory layout mirrors common.inc / armrpro.asm variable names.
 */

import { IndoorSceneBase } from './indoor-base.js';
import { TypewriterText }  from './ui-menu-dialog.js';

// ─── Layout ───────────────────────────────────────────────────────────────────
const SHOP_PANEL_W = 672;
const SHOP_PANEL_H = 432;

const SHOP_IMG_X = 16, SHOP_IMG_Y = 16;
const SHOP_IMG_W = 291, SHOP_IMG_H = 192;

const SHOP_MENU_X = SHOP_IMG_X + SHOP_IMG_W + 16;
const SHOP_MENU_Y = SHOP_IMG_Y;
const SHOP_MENU_W = SHOP_PANEL_W - SHOP_MENU_X - 16;
const SHOP_MENU_H = SHOP_IMG_H;

const SHOP_DLG_X = 16;
const SHOP_DLG_Y = SHOP_IMG_Y + SHOP_IMG_H + 14;
const SHOP_DLG_W = SHOP_PANEL_W - 32;
const SHOP_DLG_H = SHOP_PANEL_H - SHOP_DLG_Y - 16;

const SHOP_SUB_X = SHOP_MENU_X;
const SHOP_SUB_Y = SHOP_MENU_Y + 20;
const SHOP_SUB_W = SHOP_MENU_W;
const SHOP_SUB_H = SHOP_MENU_H - 20;

const SHOP_FONT_MENU   = '13px "Press Start 2P", monospace';
const SHOP_FONT_DLG    = '13px "Press Start 2P", monospace';
const SHOP_LINE_H_MENU = 36;
const SHOP_LINE_H_DLG  = 20;
const SHOP_CHAR_MS     = 28;

const SHOP_MENU_TEXT_X = SHOP_MENU_X + 28;
const SHOP_MENU_TEXT_Y = SHOP_MENU_Y + 30;
const SHOP_CURSOR_X    = SHOP_MENU_X + 6;
const SHOP_SUB_TEXT_X  = SHOP_SUB_X + 8;
const SHOP_SUB_TEXT_Y  = SHOP_SUB_Y + 22;
const SHOP_DLG_TEXT_X  = SHOP_DLG_X + 14;
const SHOP_DLG_TEXT_Y  = SHOP_DLG_Y + 22;

// ─── Animation ────────────────────────────────────────────────────────────────
const CALM_FRAMES = [
    'assets/images/armor/calm1.png',
    'assets/images/armor/calm2.png',
    'assets/images/armor/calm3.png',
    'assets/images/armor/calm4.png',
    'assets/images/armor/calm5.png',
];
const CALM_SEQ = [
    0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 
    2, 
    3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4,
    2,
];  // 0-based indices into CALM_FRAMES
const CALM_FRAME_MS = 250;

const ANGRY_FRAMES = [
    'assets/images/armor/angry1.png',
    'assets/images/armor/angry2.png',
    'assets/images/armor/angry3.png',
    'assets/images/armor/angry4.png',
];
const ANGRY_FRAME_MS      = 160;   // ms per angry frame
const ANGRY_LAST_HOLD_MS  = 600;   // extra hold on last angry frame before fade-out

// ─── Main menu ────────────────────────────────────────────────────────────────
const MENU_ITEMS = [
    'Go outside',
    'Repair shield',
    'Buy weapon',
    'Buy shield',
    'Explain goods',
];
const MENU_GO_OUTSIDE    = 0;
const MENU_REPAIR_SHIELD = 1;
const MENU_BUY_WEAPON    = 2;
const MENU_BUY_SHIELD    = 3;
const MENU_EXPLAIN_GOODS = 4;

// ─── Item tables (armrpro.asm off_AD05 / off_AD11) ───────────────────────────
const SWORD_NAMES = [
    'Training sword',
    "Wise man's sword",
    'Spirit sword',
    "Knight's sword",
    'Illumination sword',
    'Enchantment sword',
];
const SHIELD_NAMES = [
    'Clay shield',
    "Wise man's shield",
    'Stone shield',
    'Honor shield',
    'Light shield',
    'Titanium shield',
];

// Item descriptions for "Explain goods" (armrpro.asm off_B3DE).
// Indices 0–5 = swords, 6–11 = shields.
const ITEM_DESCRIPTIONS = [
    "Well, I'd say this sword is all right for a beginner. You get what you pay for. It's your standard, maintenance-free sword. If money's a problem, this one's for you.",
    "This one is just a bit better than the Training Sword. Once you get the hang of it, it's an easy one to wield. The price is a bit higher, but you can't lose on this one. Why not take it with you?",
    "You like this one? A wise choice. This is a high grade product. It's one of my biggest sellers.",
    "Oh, I'd be more than happy to tell you about this one. This is a real man's sword. It'll topple monsters in the wink of an eye.",
    "You've got a lot of grit I'd say. This one really packs a punch. A top-of-the-line sword for a top-of-the-line swordsman. Will you take it?",
    "Isn't that the sword you brought in with you?",
    "This shield is small and has limited defense capability. It's not very durable -- unless it's used with great skill, it won't last long. It's better than nothing, I guess.",
    "Well, it's slightly better than the Clay Shield. Long ago, a well-known hero used it for a short time. You could do a lot worse.",
    "This one is more of a general-use shield. It's not the best one I carry. I can't really recommend it, I think it will soon be obsolete.",
    "This shield is in a class by itself. It is strong and light and easy to use. This is a superior shield, the least a brave man should have.",
    "Ho! You've got quite an eye for these things, I see. This shield is not made of common iron. It is made of a magic metal called Magane. Against ordinary weapons, it's unbreakable.",
    "This shield makes the mightiest swords seem like paper. It's light as a feather and hard as a diamond. Used well, this one will last you a lifetime.",
];

// Shield max HP (armrpro.asm word_A6BF)
const SHIELD_MAX_HP = [30, 80, 180, 300, 300, 600];

// ─── Price tables ─────────────────────────────────────────────────────────────
// Source: prices_by_town data (document index 3).
// Each row: [sword0, sword1, sword2, sword3, sword4, sword5,
//            shield0, shield1, shield2, shield3, shield4, shield5]
// Price flag byte = 1 means the item exists in that town's range but is priced
// at an absurdly high value (90000/69800) — it is still "in stock" per the
// bitmask; we store the true numeric price and let the bitmask gate availability.
const PRICES_BY_TOWN = [
    // Muralla (town 0)
    [400, 1500, 6800, 9800, 90000, 4,  50, 150, 2980, 9800, 14800, 39800],
    // Satono (town 1)
    [800, 1500, 6800, 9800, 69800, 4,  50, 150, 2980, 9800, 14800, 39800],
    // Bosque (town 2)
    [800, 1500, 6800, 9800, 69800, 4,   5, 150, 2380, 9800, 14800, 39800],
    // Helada (town 3)
    [400, 3000, 5440, 9800, 69800, 4,   5,  50, 1780, 9800, 14800, 39800],
    // Tumba (town 4)
    [400, 3000, 4760, 4900, 69800, 4,   5,  50, 1780, 7840, 14800, 39800],
    // Dorado (town 5)
    [200, 1500, 3400, 7840, 69800, 4,   5,  20,  890, 5880, 14800, 39800],
    // Llama (town 6)
    [200, 1500, 1360, 5880, 34800, 4,   5,  20,  890, 5880, 10360, 39800],
    // Pureza (town 7)
    [100, 1000, 1360, 3920, 32800, 4,   5,  20,  890, 3920,  7400, 31800],
    // Esco (town 8)
    [ 10,  100,  680, 1960, 29800, 4,   2,  10,  298, 1960,  5920, 23800],
];

// ─── Inventory bitmask defaults (common.inc) ──────────────────────────────────
// Bit 7=item0(Training/Clay), bit 6=item1, …, bit 2=item5.
const DEFAULT_SWORD_BITMASKS  = [0xC0, 0xC0, 0xE0, 0xE0, 0x70, 0x38, 0x38, 0xF8, 0xF8];
const DEFAULT_SHIELD_BITMASKS = [0xC0, 0xE0, 0xE0, 0x70, 0x30, 0x38, 0x1C, 0x1C, 0xFC];

// ─── Memory addresses (common.inc) ───────────────────────────────────────────
const ADDR_TOWN_ID        = 0xC4;
const ADDR_SWORD_TYPE     = 0x92;
const ADDR_SHIELD_TYPE    = 0x93;
const ADDR_SHIELD_HP      = 0x94;  // word (lo, hi)
const ADDR_SHIELD_MAX_HP  = 0x96;  // word
const ADDR_GOLD_HI        = 0x85;
const ADDR_GOLD_LO        = 0x86;  // word (lo, hi)
const ADDR_CEMENTAR_1     = 0x24;  // bit 1 = Returned Crest of Glory
const ADDR_CREST_OF_GLORY = 0x9B;
const ADDR_SWORD_MASKS    = 0xD2;  // one byte per town (9 towns)
const ADDR_SHIELD_MASKS   = 0xDB;  // one byte per town

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bitmaskToItemIndices(bitmask) {
    const out = [];
    for (let i = 0; i < 6; i++) {
        if (bitmask & (0x80 >> i)) out.push(i);
    }
    return out;
}

function itemIndexToBit(i) { return 0x80 >> i; }

// ─── Scene class ──────────────────────────────────────────────────────────────

export class WeaponShopScene extends IndoorSceneBase {

    constructor(context) {
        super(context);

        // ── Animation state ──────────────────────────────────────────────────
        this.calmImages    = [];
        this.angryImages   = [];
        this.calmSeqIdx    = 0;
        this.lastFrameTime = 0;
        // 'calm' | 'angry_wait' | 'angry_play' | 'angry_hold'
        // angry_wait  : dialog is still typing; angry frames haven't started yet
        // angry_play  : cycling through angry1..angry4
        // angry_hold  : on last frame, waiting ANGRY_LAST_HOLD_MS before fade
        this.animPhase     = 'calm';
        this.angryFrameIdx = 0;
        this.lastAngryTime = 0;
        this.angryHoldStart = 0;

        // ── Shop logic state ─────────────────────────────────────────────────
        // 'loading' → 'greeting' → 'menu'
        // from 'menu': 'sub_weapon' | 'sub_shield' | 'sub_explain'
        //              'confirm_repair' | 'confirm_buy' | 'confirm_crest'
        //              'dialog'
        this.shopPhase     = 'loading';
        this.menuSel       = 0;
        this.subSel        = 0;
        this.subItems      = [];    // item indices shown in sub-menu
        this.subKind       = null;  // 'sword' | 'shield' | 'explain'
        this.exitAfterDialog   = false;
        this.angryAfterDialog  = false;  // play angry anim when dialog dismisses
        this.menuDimmed    = false;
        this.boughtSomething = false;

        // ── Pending transaction ──────────────────────────────────────────────
        this._pendingItemIdx  = null;
        this._pendingItemKind = null;
        this._pendingPrice    = 0;
        this._pendingTradeIn  = 0;

        // ── Town / inventory ─────────────────────────────────────────────────
        this.townIdx       = 0;
        this._swordIndices  = [];
        this._shieldIndices = [];

        // ── Dialog typewriter (same pattern as SageScene) ────────────────────
        this.typewriter           = null;
        this.dlgBuffer            = [];
        this._pendingLine         = null;
        this._dlgQueue            = [];
        this._dlgQueueIndex       = 0;
        this._dlgQueueAdvanceAt   = null;

        this.fadeInMs  = 650;
        this.fadeOutMs = 450;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async onEnter(now) {
        const [calms, angrys] = await Promise.all([
            Promise.all(CALM_FRAMES.map(p => this._loadImg(p))),
            Promise.all(ANGRY_FRAMES.map(p => this._loadImg(p))),
        ]).catch(e => {
            console.error('[WeaponShop] image load failed:', e);
            this.finish();
            return [[], []];
        });
        if (!calms.length) return;

        this.calmImages    = calms;
        this.angryImages   = angrys;
        this.lastFrameTime = now;
        this.calmSeqIdx    = 0;

        this.townIdx = this._getTownIdx();
        this._buildInventoryLists();

        if (this._isCrestTradeActive()) {
            this._setDialog(
                "Well I'll be... Sir! Isn't that the crest of honor you bear? " +
                "Please come in... I mean... uh... Might I trade you a knight's sword for it?"
            );
            this.shopPhase = 'crest_trade';
        } else {
            this._setDialog('May I be of service, sir?');
            this.shopPhase = 'greeting';
        }
    }

    _loadImg(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed: ${src}`));
            img.src = src;
        });
    }

    // ── Memory helpers ────────────────────────────────────────────────────────

    _read(addr, len = 1) {
        return this.readMemory ? this.readMemory(addr, len) : new Array(len).fill(0);
    }

    _write(addr, bytes) {
        if (this.writeMemory) this.writeMemory(addr, bytes);
    }

    _getTownIdx() {
        const raw = this._read(ADDR_TOWN_ID, 1)[0] & 0x7F;
        return Math.max(0, Math.min(8, raw - 1));
    }

    _getGold() {
        const hi = this._read(ADDR_GOLD_HI, 1)[0];
        const b  = this._read(ADDR_GOLD_LO, 2);
        return ((hi & 0xFF) * 0x10000) + ((b[0] & 0xFF) | ((b[1] & 0xFF) << 8));
    }

    _setGold(amount) {
        const v  = Math.max(0, Math.floor(amount));
        const hi = (v >>> 16) & 0xFF;
        const lo = v & 0xFFFF;
        this._write(ADDR_GOLD_HI, [hi]);
        this._write(ADDR_GOLD_LO, [lo & 0xFF, (lo >> 8) & 0xFF]);
    }

    _getSwordType()    { return this._read(ADDR_SWORD_TYPE,  1)[0]; }
    _setSwordType(v)   { this._write(ADDR_SWORD_TYPE,  [v]); }
    _getShieldType()   { return this._read(ADDR_SHIELD_TYPE, 1)[0]; }
    _setShieldType(v)  { this._write(ADDR_SHIELD_TYPE, [v]); }

    _getShieldHP()     { const b = this._read(ADDR_SHIELD_HP,     2); return b[0] | (b[1] << 8); }
    _getShieldMaxHP()  { const b = this._read(ADDR_SHIELD_MAX_HP, 2); return b[0] | (b[1] << 8); }
    _setShieldHP(v)    { this._write(ADDR_SHIELD_HP,     [v & 0xFF, (v >> 8) & 0xFF]); }
    _setShieldMaxHP(v) { this._write(ADDR_SHIELD_MAX_HP, [v & 0xFF, (v >> 8) & 0xFF]); }

    _getSwordBitmask()  {
        return this._read(ADDR_SWORD_MASKS  + this.townIdx, 1)[0]
            || DEFAULT_SWORD_BITMASKS[this.townIdx];
    }
    _getShieldBitmask() {
        return this._read(ADDR_SHIELD_MASKS + this.townIdx, 1)[0]
            || DEFAULT_SHIELD_BITMASKS[this.townIdx];
    }
    _orSwordBitmask(bit)  {
        this._write(ADDR_SWORD_MASKS  + this.townIdx, [this._getSwordBitmask()  | bit]);
    }
    _orShieldBitmask(bit) {
        this._write(ADDR_SHIELD_MASKS + this.townIdx, [this._getShieldBitmask() | bit]);
    }

    _isCrestTradeActive() {
        // townIdx 4 = Tumba (town_id 5 in ASM, 1-based).
        if (this.townIdx !== 4) return false;
        const cem1  = this._read(ADDR_CEMENTAR_1, 1)[0];
        if (cem1 & 0x02) return false;    // already traded
        return this._read(ADDR_CREST_OF_GLORY, 1)[0] !== 0;
    }

    _buildInventoryLists() {
        this._swordIndices  = bitmaskToItemIndices(this._getSwordBitmask());
        this._shieldIndices = bitmaskToItemIndices(this._getShieldBitmask());
    }

    _getItemPrice(kind, itemIdx) {
        const t  = Math.min(this.townIdx, 8);
        const row = PRICES_BY_TOWN[t];
        if (kind === 'sword')  return row[itemIdx]     || 0;
        if (kind === 'shield') return row[6 + itemIdx] || 0;
        return 0;
    }

    // ── Dialog machinery (mirrors SageScene) ──────────────────────────────────

    get _dlgMaxLines() {
        return Math.floor((SHOP_DLG_H - 22 - 40) / SHOP_LINE_H_DLG);
    }

    _wrapText(text) {
        this.ctx.save();
        this.ctx.font = SHOP_FONT_DLG;
        const maxW  = SHOP_DLG_W - 28;
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

    _startTypewriterLine(line) {
        this._pendingLine = line;
        this.typewriter   = new TypewriterText(
            line, SHOP_FONT_DLG, SHOP_DLG_W - 28,
            SHOP_CHAR_MS, SHOP_LINE_H_DLG, SHOP_DLG_H, this.ctx
        );
        this.typewriter.start(performance.now());
    }

    _setDialog(text) {
        const lines = this._wrapText(text);
        if (!lines.length) return;
        this.dlgBuffer          = [];
        this._pendingLine       = null;
        this._dlgQueue          = lines;
        this._dlgQueueIndex     = 0;
        this._dlgQueueAdvanceAt = null;
        this._showNextDlgLine();
    }

    _showNextDlgLine() {
        if (this._dlgQueueIndex >= this._dlgQueue.length) return;
        const line   = this._dlgQueue[this._dlgQueueIndex++];
        const isLast = this._dlgQueueIndex >= this._dlgQueue.length;
        if (this._pendingLine !== null) {
            this.dlgBuffer.push(this._pendingLine);
            this._pendingLine = null;
        }
        this._startTypewriterLine(line);
        this._dlgQueueAdvanceAt = isLast ? null : 'pending';
    }

    _tickDlgQueue(now) {
        if (!this._dlgQueue || this._dlgQueueIndex >= this._dlgQueue.length) return;
        if (this._dlgQueueAdvanceAt === 'pending') {
            if (this.typewriter && this.typewriter.isDone(now)) {
                this._dlgQueueAdvanceAt = now;   // advance immediately (0 ms delay)
            }
        } else if (this._dlgQueueAdvanceAt !== null && now >= this._dlgQueueAdvanceAt) {
            this._dlgQueueAdvanceAt = null;
            this._showNextDlgLine();
        }
    }

    _dlgScrollTop() {
        return Math.max(0, this.dlgBuffer.length + 1 - this._dlgMaxLines);
    }

    /** Show the Space-to-continue arrow only when we are genuinely waiting. */
    _dlgArrowVisible() {
        if (this._dlgQueue && this._dlgQueueIndex < this._dlgQueue.length) return false;
        return (
            this.shopPhase === 'greeting'      ||
            this.shopPhase === 'dialog'        ||
            this.shopPhase === 'crest_trade'   ||
            this.shopPhase === 'confirm_repair'||
            this.shopPhase === 'confirm_buy'   ||
            this.shopPhase === 'confirm_crest'
        );
    }

    // ── Main draw ─────────────────────────────────────────────────────────────

    drawContent(now, alpha) {
        this._tickDlgQueue(now);
        this._tickAngryAnim(now);

        this._drawPortraitBox(now);
        if (this.shopPhase !== 'loading') {
            this._drawMainMenu(alpha);
        }
        if (this.shopPhase === 'sub_weapon' ||
            this.shopPhase === 'sub_shield' ||
            this.shopPhase === 'sub_explain') {
            this._drawSubMenu(alpha);
        }
        this._drawDialogBox(now, alpha);
    }

    // ── Portrait & animation ──────────────────────────────────────────────────

    _drawPortraitBox(now) {
        const ctx = this.ctx;
        ctx.strokeStyle = '#993300';
        ctx.lineWidth   = 3;
        ctx.strokeRect(SHOP_IMG_X - 2, SHOP_IMG_Y - 2, SHOP_IMG_W + 4, SHOP_IMG_H + 4);
        // ctx.fillStyle = '#0d0806';
        // ctx.fillRect(SHOP_IMG_X, SHOP_IMG_Y, SHOP_IMG_W, SHOP_IMG_H);

        const frame = this._currentAnimFrame(now);
        if (frame) {
            ctx.drawImage(frame, SHOP_IMG_X, SHOP_IMG_Y, SHOP_IMG_W, SHOP_IMG_H);
        }
    }

    _currentAnimFrame(now) {
        if (this.animPhase === 'angry_play' || this.animPhase === 'angry_hold') {
            return this.angryImages[this.angryFrameIdx] || null;
        }
        // Calm idle cycle (runs during calm AND angry_wait)
        if (now - this.lastFrameTime >= CALM_FRAME_MS) {
            this.lastFrameTime = now;
            this.calmSeqIdx = (this.calmSeqIdx + 1) % CALM_SEQ.length;
        }
        return this.calmImages[CALM_SEQ[this.calmSeqIdx]] || null;
    }

    /**
     * Advance the angry animation state machine each frame.
     *
     * State flow:
     *   calm → (player leaves without buying, 50% roll)
     *   → angry_wait  (dialog plays; calm frames still shown)
     *   → angry_play  (dialog dismissed by Space; cycle angry1..angry4)
     *   → angry_hold  (last angry frame held for ANGRY_LAST_HOLD_MS)
     *   → startFadeOut()
     */
    _tickAngryAnim(now) {
        if (this.animPhase === 'angry_play') {
            if (now - this.lastAngryTime >= ANGRY_FRAME_MS) {
                this.lastAngryTime = now;
                if (this.angryFrameIdx < ANGRY_FRAMES.length - 1) {
                    this.angryFrameIdx++;
                } else {
                    // Reached last frame — switch to hold
                    this.animPhase      = 'angry_hold';
                    this.angryHoldStart = now;
                }
            }
        } else if (this.animPhase === 'angry_hold') {
            if (now - this.angryHoldStart >= ANGRY_LAST_HOLD_MS) {
                this.startFadeOut(now);
            }
        }
    }

    /** Transition from angry_wait → angry_play. Call when dialog is dismissed. */
    _startAngryPlay(now) {
        this.animPhase     = 'angry_play';
        this.angryFrameIdx = 0;
        this.lastAngryTime = now;
    }

    // ── Rendering: main menu ──────────────────────────────────────────────────

    _drawMainMenu(alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = this.menuDimmed ? alpha * 0.25 : alpha;

        ctx.strokeStyle = '#cc8800'; ctx.lineWidth = 2;
        ctx.strokeRect(SHOP_MENU_X - 2, SHOP_MENU_Y - 2, SHOP_MENU_W + 4, SHOP_MENU_H + 4);
        ctx.strokeStyle = '#664400'; ctx.lineWidth = 1;
        ctx.strokeRect(SHOP_MENU_X, SHOP_MENU_Y, SHOP_MENU_W, SHOP_MENU_H);
        ctx.fillStyle = '#0a0502';
        ctx.fillRect(SHOP_MENU_X, SHOP_MENU_Y, SHOP_MENU_W, SHOP_MENU_H);

        ctx.font = SHOP_FONT_MENU;
        for (let i = 0; i < MENU_ITEMS.length; i++) {
            const yi  = SHOP_MENU_TEXT_Y + i * SHOP_LINE_H_MENU;
            const sel = (i === this.menuSel) && (this.shopPhase === 'menu');
            ctx.fillStyle = sel ? '#ffee00' : '#ddcc88';
            ctx.fillText(MENU_ITEMS[i], SHOP_MENU_TEXT_X, yi);
            if (sel) {
                ctx.fillStyle = '#ff2200';
                this._triangle(ctx, SHOP_CURSOR_X, yi - 16, 10, 16, false);
            }
        }
        ctx.restore();
    }

    // ── Rendering: sub-menu ───────────────────────────────────────────────────

    _subItemNames() {
        if (this.shopPhase === 'sub_weapon')  return this.subItems.map(i => SWORD_NAMES[i]);
        if (this.shopPhase === 'sub_shield')  return this.subItems.map(i => SHIELD_NAMES[i]);
        if (this.shopPhase === 'sub_explain') {
            const swordCount = this._swordIndices.length;
            return this.subItems.map((flatIdx, pos) =>
                pos < swordCount
                    ? SWORD_NAMES[flatIdx]
                    : SHIELD_NAMES[flatIdx - 6]
            );
        }
        return [];
    }

    _drawSubMenu(alpha) {
        const ctx   = this.ctx;
        const names = this._subItemNames();
        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.strokeStyle = '#aaaaff'; ctx.lineWidth = 2;
        ctx.strokeRect(SHOP_SUB_X - 2, SHOP_SUB_Y - 2, SHOP_SUB_W + 4, SHOP_SUB_H + 4);
        ctx.fillStyle = '#050510';
        ctx.fillRect(SHOP_SUB_X, SHOP_SUB_Y, SHOP_SUB_W, SHOP_SUB_H);

        ctx.font = SHOP_FONT_MENU;
        for (let i = 0; i < names.length; i++) {
            const yi  = SHOP_SUB_TEXT_Y + i * SHOP_LINE_H_MENU;
            const sel = (i === this.subSel);
            ctx.fillStyle = sel ? '#ffee00' : '#ccccff';
            ctx.fillText(names[i], SHOP_SUB_TEXT_X + 16, yi);
            if (sel) {
                ctx.fillStyle = '#ff2200';
                this._triangle(ctx, SHOP_SUB_X + 2, yi - 16, 10, 16, false);
            }
        }
        ctx.restore();
    }

    // ── Rendering: dialog box ─────────────────────────────────────────────────

    _drawDialogBox(now, alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.strokeStyle = '#aa8833'; ctx.lineWidth = 2;
        ctx.strokeRect(SHOP_DLG_X - 2, SHOP_DLG_Y - 2, SHOP_DLG_W + 4, SHOP_DLG_H + 4);
        ctx.strokeStyle = '#554411'; ctx.lineWidth = 1;
        ctx.strokeRect(SHOP_DLG_X, SHOP_DLG_Y, SHOP_DLG_W, SHOP_DLG_H);
        ctx.fillStyle = '#080400';
        ctx.fillRect(SHOP_DLG_X, SHOP_DLG_Y, SHOP_DLG_W, SHOP_DLG_H);

        ctx.font = SHOP_FONT_DLG;
        const scrollTop = this._dlgScrollTop();
        let row = 0;
        ctx.fillStyle = '#eecc88';
        for (const line of this.dlgBuffer.slice(scrollTop)) {
            ctx.fillText(line, SHOP_DLG_TEXT_X, SHOP_DLG_TEXT_Y + row * SHOP_LINE_H_DLG);
            row++;
        }
        if (this.typewriter) {
            const vis = this.typewriter.getVisibleLines(now);
            if (vis.length) {
                ctx.fillStyle = '#eecc88';
                ctx.fillText(vis[0], SHOP_DLG_TEXT_X, SHOP_DLG_TEXT_Y + row * SHOP_LINE_H_DLG);
            }
            if (this.typewriter.isDone(now) && this._dlgArrowVisible()) {
                // Down-arrow: "press Space to continue"
                ctx.fillStyle = '#ffaa00';
                const ax = SHOP_DLG_X + SHOP_DLG_W / 2 - 12;
                const ay = SHOP_DLG_Y + SHOP_DLG_H - 36;
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

    // ── Input ─────────────────────────────────────────────────────────────────

    handleInput(key) {
        const now = performance.now();
        if (this.phase === 'fadeOut') return;

        // Block all input during and after angry animation
        if (this.animPhase === 'angry_play' || this.animPhase === 'angry_hold') return;

        if (key === 'ArrowUp' || key === 'ArrowDown') {
            const dir = key === 'ArrowUp' ? -1 : 1;
            if (this.shopPhase === 'menu' && !this.menuDimmed) {
                this.menuSel = (this.menuSel + dir + MENU_ITEMS.length) % MENU_ITEMS.length;
            } else if (
                this.shopPhase === 'sub_weapon' ||
                this.shopPhase === 'sub_shield'  ||
                this.shopPhase === 'sub_explain'
            ) {
                const len = this._subItemNames().length;
                if (len) this.subSel = (this.subSel + dir + len) % len;
            }
            return;
        }

        if (key === 'Space' || key === 'Enter') this._onConfirm(now);
        if (key === 'Escape')                   this._onCancel(now);
    }

    _onConfirm(now) {
        // Skip still-typing dialog first; then re-evaluate on the next press.
        if (this.typewriter && !this.typewriter.isDone(now)) {
            this.typewriter.skip(now);
            if (this._dlgQueue && this._dlgQueueIndex < this._dlgQueue.length) return;
            return;
        }

        switch (this.shopPhase) {

            // ─ Opening greeting: just open the menu ─────────────────────────
            case 'greeting':
                this.shopPhase  = 'menu';
                this.menuDimmed = false;
                break;

            // ─ Crest-of-glory trigger dialog ────────────────────────────────
            case 'crest_trade':
                this._setDialog("Might I trade you a knight's sword for it?");
                this.shopPhase = 'confirm_crest';
                break;

            // ─ Main menu ────────────────────────────────────────────────────
            case 'menu':
                if (!this.menuDimmed) this._activateMenuItem(this.menuSel, now);
                break;

            // ─ Sub-menus ────────────────────────────────────────────────────
            case 'sub_weapon':
            case 'sub_shield':
                this._onSelectItem(now);
                break;

            case 'sub_explain':
                this._onExplainItem(now);
                break;

            // ─ Yes/No confirms ───────────────────────────────────────────────
            case 'confirm_repair':
                this._executeRepair(now);
                break;

            case 'confirm_buy':
                this._executeBuy(now);
                break;

            case 'confirm_crest':
                this._executeCrestTrade(now);
                break;

            // ─ Generic dialog (information only) ────────────────────────────
            case 'dialog':
                if (this.angryAfterDialog) {
                    // Dialog was the "waste my time" message — now start angry anim.
                    // Input is blocked once animPhase transitions to angry_play,
                    // so the scene will auto-fade via _tickAngryAnim.
                    this.angryAfterDialog = false;
                    this._startAngryPlay(now);
                } else if (this.exitAfterDialog) {
                    this.startFadeOut(now);
                } else {
                    this.shopPhase  = 'menu';
                    this.menuDimmed = false;
                    this._setDialog('Is there something I can do for you, sir?');
                }
                break;
        }
    }

    _onCancel(now) {
        switch (this.shopPhase) {
            case 'sub_weapon':
            case 'sub_shield':
            case 'sub_explain':
            case 'confirm_repair':
            case 'confirm_buy':
            case 'confirm_crest':
                this._clearPending();
                this.shopPhase  = 'menu';
                this.menuDimmed = false;
                this._setDialog('Is there something I can do for you, sir?');
                break;
        }
    }

    // ── Menu actions ──────────────────────────────────────────────────────────

    _activateMenuItem(sel, now) {
        switch (sel) {
            case MENU_GO_OUTSIDE:    this._doGoOutside(now);    break;
            case MENU_REPAIR_SHIELD: this._doRepairMenu(now);   break;
            case MENU_BUY_WEAPON:    this._doBuyWeaponMenu(now); break;
            case MENU_BUY_SHIELD:    this._doBuyShieldMenu(now); break;
            case MENU_EXPLAIN_GOODS: this._doExplainMenu(now);  break;
        }
    }

    // ── Go outside ────────────────────────────────────────────────────────────

    _doGoOutside(now) {
        this.menuDimmed = true;
        if (this.boughtSomething) {
            // Friendly farewell, then straight fade-out
            this._setDialog('Thank you, please come again.');
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = true;
            this.angryAfterDialog = false;
        } else {
            // 50 % angry (armrpro.asm: get_random & 1)
            if (Math.random() < 0.5) {
                // Show the rude-goodbye dialog; angry anim starts when player
                // presses Space to dismiss it (see 'dialog' case in _onConfirm).
                this._setDialog("If you're going to waste my time, please be on your way.");
                this.shopPhase        = 'dialog';
                this.exitAfterDialog  = false;  // don't fade out on Space — play anim first
                this.angryAfterDialog = true;
            } else {
                this._setDialog('Thank you, please come again.');
                this.shopPhase       = 'dialog';
                this.exitAfterDialog = true;
                this.angryAfterDialog = false;
            }
        }
    }

    // ── Repair shield ─────────────────────────────────────────────────────────

    _doRepairMenu(now) {
        this.menuDimmed = true;
        const shieldType = this._getShieldType();

        if (!shieldType) {
            this._setDialog(
                "Sir, you aren't carrying a shield -- however, I do have a fine " +
                "selection, if you'd like to buy one."
            );
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            return;
        }
        const maxHP = this._getShieldMaxHP();
        const hp    = this._getShieldHP();
        if (hp >= maxHP) {
            this._setDialog("Sir, your shield is not in need of repair. How else can I help you?");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            return;
        }
        // Cost = ceil((maxHP - hp) / 2)  (ASM: shr ax,1; adc ax,0)
        const cost = Math.ceil((maxHP - hp) / 2);
        this._pendingPrice = cost;
        this._setDialog(
            `I'll be glad to repair your shield, sir, for the low price of ${cost} golds. Shall I proceed?`
        );
        this.shopPhase = 'confirm_repair';
    }

    _executeRepair(now) {
        const gold = this._getGold();
        if (gold < this._pendingPrice) {
            this._setDialog(
                "I'm sorry sir, you aren't carrying enough gold. Perhaps after you've visited the bank..."
            );
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            this._clearPending();
            return;
        }
        this._setGold(gold - this._pendingPrice);
        this._setShieldHP(this._getShieldMaxHP());
        this.boughtSomething = true;
        this._clearPending();

        // ASM plays a short animation (sub_A706 waits ~150 ticks) then shows the
        // "complete" message.  We replicate the feel with two sequential dialogs.
        this._setDialog("Please wait here, I'll only be a moment.");
        // Chain the completion message after a short delay matching the ASM pause.
        setTimeout(() => {
            this._setDialog('The repairs to your armour are complete. It is now as good as new.');
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
        }, 1600);
        this.shopPhase       = 'dialog';
        this.exitAfterDialog = false;
    }

    // ── Buy weapon ────────────────────────────────────────────────────────────

    _doBuyWeaponMenu(now) {
        this.menuDimmed = true;
        this._buildInventoryLists();
        if (!this._swordIndices.length) {
            this._setDialog("I'm sorry, I have no weapons in stock at the moment.");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            return;
        }
        this.subItems  = [...this._swordIndices];
        this.subSel    = 0;
        this.subKind   = 'sword';
        this.shopPhase = 'sub_weapon';
        this._setDialog('Which weapon would you like?');
    }

    // ── Buy shield ────────────────────────────────────────────────────────────

    _doBuyShieldMenu(now) {
        this.menuDimmed = true;
        this._buildInventoryLists();
        if (!this._shieldIndices.length) {
            this._setDialog("I'm sorry, I have no shields in stock at the moment.");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            return;
        }
        this.subItems  = [...this._shieldIndices];
        this.subSel    = 0;
        this.subKind   = 'shield';
        this.shopPhase = 'sub_shield';
        this._setDialog('Which shield would you like?');
    }

    // ── Item selection (weapon or shield) ─────────────────────────────────────

    _onSelectItem(now) {
        const kind    = this.subKind;          // 'sword' | 'shield'
        const itemIdx = this.subItems[this.subSel]; // 0-based item index

        // Trying to buy the same item already owned?
        if (kind === 'sword') {
            const cur = this._getSwordType();
            if (cur > 0 && cur - 1 === itemIdx) {
                this._setDialog(ITEM_DESCRIPTIONS[5]);  // "Isn't that the sword you brought in…"
                this.shopPhase       = 'dialog';
                this.exitAfterDialog = false;
                return;
            }
        }

        const price     = this._getItemPrice(kind, itemIdx);
        const tradeIn   = this._calcTradeIn(kind);
        const itemName  = kind === 'sword' ? SWORD_NAMES[itemIdx] : SHIELD_NAMES[itemIdx];

        this._pendingItemIdx  = itemIdx;
        this._pendingItemKind = kind;
        this._pendingPrice    = price;
        this._pendingTradeIn  = tradeIn;

        // Build dialog: "That will be X golds." + optional trade-in line + "Will that be all right?"
        let msg = `That will be ${price} golds.`;
        if (tradeIn > 0) {
            msg += ` I'll give you ${tradeIn} golds on your old ${kind} as a trade-in.`;
        }
        msg += ' Will that be all right?';

        this._setDialog(`Oh, the ${itemName}! ${msg}`);
        this.shopPhase = 'confirm_buy';
    }

    /**
     * Trade-in = floor(current item's price / 2).
     * ASM: shr dl,1; rcr ax,1 on the current item's 3-byte price record.
     */
    _calcTradeIn(kind) {
        if (kind === 'sword') {
            const cur = this._getSwordType();
            if (!cur) return 0;
            return Math.floor(this._getItemPrice('sword', cur - 1) / 2);
        } else {
            const cur = this._getShieldType();
            if (!cur) return 0;
            return Math.floor(this._getItemPrice('shield', cur - 1) / 2);
        }
    }

    _executeBuy(now) {
        const gold    = this._getGold();
        const netCost = this._pendingPrice - this._pendingTradeIn;

        if (gold < netCost) {
            this._setDialog(
                "I'm sorry sir, you aren't carrying enough gold. Perhaps after you've visited the bank..."
            );
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            this._clearPending();
            return;
        }

        this._setGold(gold - netCost);
        const kind    = this._pendingItemKind;
        const itemIdx = this._pendingItemIdx;

        if (kind === 'sword') {
            const old = this._getSwordType();
            // Return old sword to shop inventory bitmask
            if (old) this._orSwordBitmask(itemIndexToBit(old - 1));
            this._setSwordType(itemIdx + 1);
        } else {
            const old = this._getShieldType();
            if (old) this._orShieldBitmask(itemIndexToBit(old - 1));
            this._setShieldType(itemIdx + 1);
            const newMax = SHIELD_MAX_HP[itemIdx] || 30;
            this._setShieldMaxHP(newMax);
            this._setShieldHP(newMax);
        }

        this.boughtSomething = true;
        this._clearPending();
        this._buildInventoryLists();

        this._setDialog('Will there be something else for you, sir?');
        this.shopPhase       = 'dialog';
        this.exitAfterDialog = false;
    }

    // ── Explain goods ─────────────────────────────────────────────────────────

    _doExplainMenu(now) {
        this.menuDimmed = true;
        this._buildInventoryLists();

        // Combined list: swords first (using raw item indices 0–5),
        // then shields offset by 6 so we can look up ITEM_DESCRIPTIONS directly.
        this.subItems = [
            ...this._swordIndices,
            ...this._shieldIndices.map(i => i + 6),
        ];
        if (!this.subItems.length) {
            this._setDialog("I'm afraid I have nothing to show you at the moment.");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            return;
        }
        this.subSel    = 0;
        this.subKind   = 'explain';
        this.shopPhase = 'sub_explain';
        this._setDialog(
            "All of my goods are of the highest quality. " +
            "Which item would you like me to tell you about?"
        );
    }

    _onExplainItem(now) {
        const flatIdx = this.subItems[this.subSel];   // 0–5 sword, 6–11 shield
        const name    = flatIdx < 6 ? SWORD_NAMES[flatIdx] : SHIELD_NAMES[flatIdx - 6];
        const desc    = ITEM_DESCRIPTIONS[flatIdx] || 'A fine piece of craftsmanship.';
        this._setDialog(`Oh, the ${name}? ${desc}`);
        // After explain, ask "Is there another item?" (ASM: aIsThereAnother)
        // We return to the explain sub-menu directly (player can press Escape to exit).
        this.shopPhase       = 'dialog';
        this.exitAfterDialog = false;
        // Override: when they press Space on this dialog, re-enter sub_explain
        this._explainReturnPending = true;
    }

    // ── Crest of Glory trade ──────────────────────────────────────────────────

    _executeCrestTrade(now) {
        // Permanently mark crest traded; give Knight's Sword; remove from inventory
        const cem1 = this._read(ADDR_CEMENTAR_1, 1)[0];
        this._write(ADDR_CEMENTAR_1, [(cem1 | 0x02) & 0xFF]);
        this._write(ADDR_CREST_OF_GLORY, [0x00]);

        const old = this._getSwordType();
        if (old) this._orSwordBitmask(itemIndexToBit(old - 1));
        this._setSwordType(4);  // SWORD_KNIGHT = 4

        // Remove Knight's Sword bit from town's sword bitmask (bit 4 = index 3)
        const mask = this._getSwordBitmask();
        this._write(ADDR_SWORD_MASKS + this.townIdx, [mask & ~itemIndexToBit(3)]);
        this._buildInventoryLists();

        this.boughtSomething = true;
        this._setDialog(
            "Oh, thank you, sir! As promised, here is your knight's sword. " +
            "Thank you, and please come back soon."
        );
        this.shopPhase       = 'dialog';
        this.exitAfterDialog = true;
        this.angryAfterDialog = false;
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    _clearPending() {
        this._pendingItemIdx  = null;
        this._pendingItemKind = null;
        this._pendingPrice    = 0;
        this._pendingTradeIn  = 0;
    }

    _triangle(ctx, x, y, w, h, down) {
        ctx.beginPath();
        if (down) {
            ctx.moveTo(x, y);         ctx.lineTo(x + w, y);
            ctx.lineTo(x + w / 2, y + h);
        } else {
            ctx.moveTo(x, y);         ctx.lineTo(x + w, y + h / 2);
            ctx.lineTo(x, y + h);
        }
        ctx.closePath();
        ctx.fill();
    }

    getName() {
        const TOWN_NAMES = [
            'Muralla','Satono','Bosque','Helada',
            'Tumba','Dorado','Llama','Pureza','Esco',
        ];
        return `Weapon & Armour Shop (${TOWN_NAMES[this.townIdx] || '?'})`;
    }
}
