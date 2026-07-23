/**
 * indoor-magic-shop.js – Witchcraft Implement Shop indoor scene.
 *
 * Faithful port of drugpro.asm.  Supports:
 *   • Idle fire animation   – fire1..fire4 cycling (4 frames, looped)
 *   • Magic entry animation – magic1..magic4 played forward on enter,
 *                             then magic4..magic1 played backward on exit,
 *                             then fade-out.
 *   • Buy item   – per-town inventory bitmask; up to 5 magic item slots.
 *   • Sell item  – sell items from player's magic_items slots at half price.
 *   • Describe   – shopkeeper describes any item in the town's stock.
 *   • Go outside – reverse magic animation then exit.
 *
 * Combined scene image: magic frame (178×192) | fire frame (113×192) = 291×192.
 *
 * Memory layout mirrors common.inc / drugpro.asm variable names.
 */

import { IndoorSceneBase } from './indoor-base.js';
import { TypewriterText }  from './ui-menu-dialog.js';

// ─── Layout ───────────────────────────────────────────────────────────────────
const SHOP_PANEL_W = 672;
const SHOP_PANEL_H = 432;

const SHOP_IMG_X    = 16;
const SHOP_IMG_Y    = 16;
const MAGIC_IMG_W   = 178;   // left part: magic/entry frame
const FIRE_IMG_W    = 113;   // right part: idle fire frame
const SHOP_IMG_W    = MAGIC_IMG_W + FIRE_IMG_W;  // 291
const SHOP_IMG_H    = 192;

const SHOP_MENU_X   = SHOP_IMG_X + SHOP_IMG_W + 16;
const SHOP_MENU_Y   = SHOP_IMG_Y;
const SHOP_MENU_W   = SHOP_PANEL_W - SHOP_MENU_X - 16;
const SHOP_MENU_H   = SHOP_IMG_H;

const SHOP_DLG_X    = 16;
const SHOP_DLG_Y    = SHOP_IMG_Y + SHOP_IMG_H + 14;
const SHOP_DLG_W    = SHOP_PANEL_W - 32;
const SHOP_DLG_H    = SHOP_PANEL_H - SHOP_DLG_Y - 16;

const SHOP_SUB_X    = SHOP_MENU_X;
const SHOP_SUB_Y    = SHOP_MENU_Y + 20;
const SHOP_SUB_W    = SHOP_MENU_W;
const SHOP_SUB_H    = SHOP_MENU_H - 20;

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

// Idle fire animation (right half of scene image): fire1..fire4, looped.
const FIRE_FRAMES = [
    'assets/images/drug/fire1.png',
    'assets/images/drug/fire2.png',
    'assets/images/drug/fire3.png',
    'assets/images/drug/fire4.png',
];
const FIRE_FRAME_MS = 180;   // ~5–6 fps, matches asm tick-20 cadence (sub_A644)

// Entry / exit magic animation (left half of scene image): magic1..magic4.
// Forward (enter): frames 0,1,2,3
// Backward (exit): frames 3,2,1,0
const MAGIC_FRAMES = [
    'assets/images/drug/magic1.png',
    'assets/images/drug/magic2.png',
    'assets/images/drug/magic3.png',
    'assets/images/drug/magic4.png',
];
const MAGIC_FRAME_MS = 400;

// ─── Main menu ────────────────────────────────────────────────────────────────
const MENU_ITEMS = [
    'Go outside',
    'Buy item',
    'Sell item',
    'Description of item',
];
const MENU_GO_OUTSIDE   = 0;
const MENU_BUY_ITEM     = 1;
const MENU_SELL_ITEM    = 2;
const MENU_DESCRIBE     = 3;

// ─── Item tables (drugpro.asm off_B08A) ──────────────────────────────────────
const ITEM_NAMES = [
    "Ken'ko Potion",        // 0
    'Juu-en Fruit',         // 1
    'Elixir of Kashi',      // 2
    'Chikara Powder',       // 3
    'Magia Stone',          // 4
    'Holy Water of Acero',  // 5
    'Sabre Oil',            // 6
    'Kioku Feather',        // 7
];

// Item descriptions (drugpro.asm off_AB3A / aWellItSASpecia .. aThisFeatherRem)
const ITEM_DESCRIPTIONS = [
    "Well, it's a special blend of yunkel fruit and ripodi leaf. It's low in price and as a mild health tonic, it's perfect.",
    "This is the fruit of the Juu-en tree which bears only once every ten years. The price is a bit high, but it provides excellent relief from wounds and exhaustion -- it's quite a bit better than the Ken'ko potion.",
    "This potion is made from the broth of mistletoe simmered on the night of a full moon. It restores magical powers. It's very bitter, but the price is low.",
    "This is made from a mixture of the powdered dragon scales and crushed Wise Man's Stone steamed for one hundred days. It will fully restore your magical powers. The price, however... is high.",
    "This stone protects the aura that living beings exude. It surrounds the aura to prevent interference from other auras and acts as a protection against enemy attacks.",
    "This is a liquified metal made from mercury and iron. If you paint it on a shield weakened by battle, the shield will regain its original strength.",
    "Hmm... I don't know much about this one, but I do know that it increases the offensive power of a sword. Don't worry, it hasn't killed anyone yet.",
    "This feather remembers the voice of the last wise man who spoke to you. If you hold it in your right hand and swing it once, you'll return to him. It's never failed anyone I know.",
];

// ─── Price tables (drugpro.asm prices_by_town) ───────────────────────────────
// Each row: [item0_price, item1_price, …, item7_price]  (8 magic items)
// Price records in ASM are 3 bytes each: flag byte (always 0) + word price.
// The flag byte appears to be unused; we store the word price directly.
const PRICES_BY_TOWN = [
    // Muralla  (town 0, 1-based town_id=1)
    [  50,  240,   60,  320, 1000,  100, 1200,  350 ],
    // Satono   (town 1)
    [  50,  240,   60,  320, 1000,  100, 1200,  350 ],
    // Bosque   (town 2)
    [  50,  240,   60,  320, 1500,  100, 1200,  350 ],
    // Helada   (town 3)
    [  50,  300,  120,  320, 1500,  100, 1200,  350 ],
    // Tumba    (town 4)
    [   5,  600,  240,  480, 2000,  200, 2000,  350 ],
    // Dorado   (town 5)
    [   5,  600,  240,  480, 2000,  200, 2000,  350 ],
    // Llama    (town 6)
    [   5,  900,  360,  960, 2500,  400, 2400,  350 ],
    // Pureza   (town 7)
    [   5,  900,  360,  960, 2500,  400, 2400,  350 ],
    // Esco     (town 8)
    [   2,  200,   40,  280,  800,   80, 1000,  150 ],
];

// Sell price = floor(buy_price / 2)  (ASM: shr dl,1; rcr ax,1)

// ─── Default per-town inventory bitmasks (common.inc) ─────────────────────────
// Bit 7 = item 0 (Ken'ko Potion), bit 6 = item 1, …, bit 0 = item 7 (Kioku Feather)
const DEFAULT_MAGIC_BITMASKS = [
    0x8A,  // Muralla  — Ken'ko (7), Elixir (5), Chikara (3) ← ASM default: 8a
    0xA6,  // Satono   — Ken'ko (7), Elixir (5), Holy Water (2), Oil (1)
    0x6B,  // Bosque
    0x75,  // Helada
    0x42,  // Tumba
    0x4C,  // Dorado
    0x4B,  // Llama
    0x01,  // Pureza
    0xFF,  // Esco
];

// ─── Memory addresses (common.inc) ───────────────────────────────────────────
const ADDR_TOWN_ID        = 0xC4;   // place_map_id; 0x81=Muralla..0x89=Esco
const ADDR_GOLD_HI        = 0x85;
const ADDR_GOLD_LO        = 0x86;   // word (lo byte, then hi byte)
const ADDR_MAGIC_ITEMS    = 0xA6;   // 5 slots, each 0=empty or 1..8 = item id
const ADDR_MAGIC_MASKS    = 0xC9;   // one byte per town (9 towns), Muralla..Esco

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a bitmask to an array of 0-based item indices that are set. */
function bitmaskToItemIndices(bitmask) {
    const out = [];
    for (let i = 0; i < 8; i++) {
        if (bitmask & (0x80 >> i)) out.push(i);
    }
    return out;
}

function itemIndexToBit(i) { return 0x80 >> i; }

// ─── Scene class ──────────────────────────────────────────────────────────────

export class WitchcraftShopScene extends IndoorSceneBase {

    constructor(context) {
        super(context);

        // ── Animation state ──────────────────────────────────────────────────
        this.fireImages      = [];
        this.magicImages     = [];
        this.fireFrameIdx    = 0;
        this.lastFireTime    = 0;

        // Magic entry/exit animation state:
        // 'idle'     – not playing; left half shows magic4 (fully entered)
        // 'enter'    – playing magic1→magic4 forward
        // 'exit'     – playing magic4→magic1 backward, then fade
        this.magicAnimPhase  = 'idle';
        this.magicFrameIdx   = 0;     // index into MAGIC_FRAMES
        this.lastMagicTime   = 0;
        this.magicDirection  = 1;     // +1 forward, -1 backward

        // ── Shop logic state ──────────────────────────────────────────────────
        // 'loading' → 'greeting' → 'menu'
        // from 'menu': 'sub_buy' | 'sub_sell' | 'sub_describe'
        //              'confirm_buy' | 'confirm_sell' | 'dialog'
        this.shopPhase       = 'loading';
        this.menuSel         = 0;
        this.subSel          = 0;
        this.subItems        = [];    // array of 0-based item indices
        this.subKind         = null;  // 'buy' | 'sell' | 'describe'
        this.exitAfterDialog = false;
        this.menuDimmed      = false;

        // ── Pending transaction ──────────────────────────────────────────────
        this._pendingItemIdx  = null;   // 0-based item index
        this._pendingPrice    = 0;

        // ── Town / inventory ─────────────────────────────────────────────────
        this.townIdx          = 0;      // 0 = Muralla, 8 = Esco
        this._shopItemIndices = [];     // items available to buy in this town
        this._playerItemIds   = [];     // item IDs currently in player slots

        // ── Dialog typewriter ────────────────────────────────────────────────
        this.typewriter            = null;
        this.dlgBuffer             = [];
        this._pendingLine          = null;
        this._dlgQueue             = [];
        this._dlgQueueIndex        = 0;
        this._dlgQueueAdvanceAt    = null;

        this.fadeInMs  = 650;
        this.fadeOutMs = 450;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────────

    async onEnter(now) {
        const [fires, magics] = await Promise.all([
            Promise.all(FIRE_FRAMES.map(p  => this._loadImg(p))),
            Promise.all(MAGIC_FRAMES.map(p => this._loadImg(p))),
        ]).catch(e => {
            console.error('[WitchcraftShop] image load failed:', e);
            this.finish();
            return [[], []];
        });
        if (!fires.length) return;

        this.fireImages   = fires;
        this.magicImages  = magics;
        this.lastFireTime = now;

        // Start entry animation: forward magic1→magic4
        this.magicAnimPhase = 'enter';
        this.magicFrameIdx  = 0;
        this.magicDirection = 1;
        this.lastMagicTime  = now;

        this.townIdx = this._getTownIdx();
        this._buildInventoryLists();

        // Show greeting dialog while entry animation plays
        this._setDialog('Oh... hello, can I help you?');
        this.shopPhase = 'greeting';
    }

    _loadImg(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed: ${src}`));
            img.src = src;
        });
    }

    // ── Memory helpers ─────────────────────────────────────────────────────────

    _read(addr, len = 1) {
        return this.readMemory ? this.readMemory(addr, len) : new Array(len).fill(0);
    }

    _write(addr, bytes) {
        if (this.writeMemory) this.writeMemory(addr, bytes);
    }

    _getTownIdx() {
        // place_map_id: 0x81=Muralla..0x89=Esco → index 0..8
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

    _getMagicBitmask() {
        return this._read(ADDR_MAGIC_MASKS + this.townIdx, 1)[0]
            || DEFAULT_MAGIC_BITMASKS[this.townIdx];
    }

    _andMagicBitmask(bit) {
        // Remove bit from shop's stock (player bought it)
        const cur = this._getMagicBitmask();
        this._write(ADDR_MAGIC_MASKS + this.townIdx, [(cur & ~bit) & 0xFF]);
    }

    _orMagicBitmask(bit) {
        // Return bit to shop's stock (player sold it)
        const cur = this._getMagicBitmask();
        this._write(ADDR_MAGIC_MASKS + this.townIdx, [(cur | bit) & 0xFF]);
    }

    /** Return player's magic item IDs (1-based) currently held (up to 5 slots). */
    _getPlayerMagicItems() {
        return Array.from(this._read(ADDR_MAGIC_ITEMS, 5));
    }

    _setPlayerMagicSlot(slotIdx, itemId) {
        this._write(ADDR_MAGIC_ITEMS + slotIdx, [itemId]);
    }

    _findEmptyMagicSlot() {
        const items = this._getPlayerMagicItems();
        const idx   = items.indexOf(0);
        return idx;  // -1 if full
    }

    _findMagicSlotByItemId(itemId1based) {
        const items = this._getPlayerMagicItems();
        return items.indexOf(itemId1based);
    }

    _buildInventoryLists() {
        // Items the shop has in stock
        this._shopItemIndices = bitmaskToItemIndices(this._getMagicBitmask());
        // Items the player is currently carrying
        this._playerItemIds   = this._getPlayerMagicItems();
    }

    _getItemPrice(itemIdx) {
        return PRICES_BY_TOWN[Math.min(this.townIdx, 8)][itemIdx] || 0;
    }

    // ── Dialog machinery ───────────────────────────────────────────────────────

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
                this._dlgQueueAdvanceAt = now;
            }
        } else if (this._dlgQueueAdvanceAt !== null && now >= this._dlgQueueAdvanceAt) {
            this._dlgQueueAdvanceAt = null;
            this._showNextDlgLine();
        }
    }

    _dlgScrollTop() {
        return Math.max(0, this.dlgBuffer.length + 1 - this._dlgMaxLines);
    }

    _dlgArrowVisible() {
        if (this._dlgQueue && this._dlgQueueIndex < this._dlgQueue.length) return false;
        return (
            this.shopPhase === 'greeting'    ||
            this.shopPhase === 'dialog'      ||
            this.shopPhase === 'confirm_buy' ||
            this.shopPhase === 'confirm_sell'
        );
    }

    // ── Main draw ──────────────────────────────────────────────────────────────

    drawContent(now, alpha) {
        this._tickDlgQueue(now);
        this._tickMagicAnim(now);
        this._tickFireAnim(now);

        // Greeting ends → open main menu
        if (this.shopPhase === 'greeting' &&
            (!this.typewriter || this.typewriter.isDone(now)) &&
            (!this._dlgQueue || this._dlgQueueIndex >= this._dlgQueue.length) &&
            this.magicAnimPhase === 'idle') {   // also wait for entry anim

            if (this._pendingLine !== null) {
                this.dlgBuffer.push(this._pendingLine);
                this._pendingLine = null;
            }
            this.typewriter = null;
            this.shopPhase  = 'menu';
            this.menuDimmed = false;
        }

        this._drawSceneImage(now);
        if (this.shopPhase !== 'loading') {
            this._drawMainMenu(alpha);
        }
        if (this.shopPhase === 'sub_buy'      ||
            this.shopPhase === 'sub_sell'     ||
            this.shopPhase === 'sub_describe') {
            this._drawSubMenu(alpha);
        }
        this._drawDialogBox(now, alpha);
    }

    // ── Scene image ────────────────────────────────────────────────────────────

    /**
     * The combined 291×192 scene image is drawn as two side-by-side pieces:
     *   Left  (178 px wide): current magic frame (entry/exit animation or last frame)
     *   Right (113 px wide): current fire frame  (idle loop)
     */
    _drawSceneImage(now) {
        const ctx = this.ctx;

        // Border
        ctx.strokeStyle = '#305';
        ctx.lineWidth   = 3;
        ctx.strokeRect(SHOP_IMG_X - 2, SHOP_IMG_Y - 2, SHOP_IMG_W + 4, SHOP_IMG_H + 4);

        // Left half: magic frame
        const magicImg = this.magicImages[this.magicFrameIdx];
        if (magicImg) {
            ctx.drawImage(magicImg, SHOP_IMG_X, SHOP_IMG_Y, MAGIC_IMG_W, SHOP_IMG_H);
        }

        // Right half: fire frame
        const fireImg = this.fireImages[this.fireFrameIdx];
        if (fireImg) {
            ctx.drawImage(fireImg, SHOP_IMG_X + MAGIC_IMG_W, SHOP_IMG_Y, FIRE_IMG_W, SHOP_IMG_H);
        }
    }

    // ── Animation tickers ──────────────────────────────────────────────────────

    _tickFireAnim(now) {
        if (now - this.lastFireTime >= FIRE_FRAME_MS) {
            this.lastFireTime = now;
            this.fireFrameIdx = (this.fireFrameIdx + 1) % FIRE_FRAMES.length;
        }
    }

    /**
     * Entry animation: magic1→magic4 forward.
     * Exit  animation: magic4→magic1 backward, then startFadeOut().
     *
     * ASM sub_A708: each frame is shown for ~40 ticks (~160 ms at 4 ticks/frame).
     * The sequences are:
     *   loc_A0D5 (case 0 – greeting/wait): calls sub_A644 loop, then plays byte_A745
     *     byte_A745: 69h,A7h (magic1), 85h,A7h (magic2), A1h,A7h (magic3), BDh,A7h (magic4), FFFF → forward
     *   When player leaves (go-outside), loc_A0EB plays byte_A74F
     *     byte_A74F: BDh,A7h (magic4), A1h,A7h (magic3), 85h,A7h (magic2), 69h,A7h (magic1), FFFF → backward
     */
    _tickMagicAnim(now) {
        if (this.magicAnimPhase === 'idle') return;

        if (now - this.lastMagicTime < MAGIC_FRAME_MS) return;
        this.lastMagicTime = now;

        const nextIdx = this.magicFrameIdx + this.magicDirection;

        if (nextIdx < 0 || nextIdx >= MAGIC_FRAMES.length) {
            // Animation finished
            if (this.magicAnimPhase === 'exit') {
                // Reverse done → fade to black and exit
                this.magicAnimPhase = 'idle';
                this.startFadeOut(now);
            } else {
                // Enter done → hold on last frame (magic4)
                this.magicAnimPhase = 'idle';
                this.magicFrameIdx  = MAGIC_FRAMES.length - 1;
            }
        } else {
            this.magicFrameIdx = nextIdx;
        }
    }

    /** Begin exit sequence: play magic frames backward, then fade out. */
    _startExitAnim(now) {
        if (this.magicAnimPhase === 'exit') return;
        this.magicAnimPhase = 'exit';
        this.magicFrameIdx  = MAGIC_FRAMES.length - 1;
        this.magicDirection = -1;
        this.lastMagicTime  = now;
    }

    // ── Rendering: main menu ───────────────────────────────────────────────────

    _drawMainMenu(alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = this.menuDimmed ? alpha * 0.25 : alpha;

        ctx.strokeStyle = '#609'; ctx.lineWidth = 2;
        ctx.strokeRect(SHOP_MENU_X - 2, SHOP_MENU_Y - 2, SHOP_MENU_W + 4, SHOP_MENU_H + 4);
        ctx.strokeStyle = '#305'; ctx.lineWidth = 1;
        ctx.strokeRect(SHOP_MENU_X, SHOP_MENU_Y, SHOP_MENU_W, SHOP_MENU_H);
        ctx.fillStyle = '#0a0010';
        ctx.fillRect(SHOP_MENU_X, SHOP_MENU_Y, SHOP_MENU_W, SHOP_MENU_H);

        ctx.font = SHOP_FONT_MENU;
        for (let i = 0; i < MENU_ITEMS.length; i++) {
            const yi  = SHOP_MENU_TEXT_Y + i * SHOP_LINE_H_MENU;
            const sel = (i === this.menuSel) && (this.shopPhase === 'menu');
            ctx.fillStyle = sel ? '#e9f' : '#b0e';
            ctx.fillText(MENU_ITEMS[i], SHOP_MENU_TEXT_X, yi);
            if (sel) {
                ctx.fillStyle = '#f20';
                this._triangle(ctx, SHOP_CURSOR_X, yi - 16, 10, 16, false);
            }
        }
        ctx.restore();
    }

    // ── Rendering: sub-menu ────────────────────────────────────────────────────

    _subItemNames() {
        if (this.shopPhase === 'sub_buy' || this.shopPhase === 'sub_describe') {
            return this.subItems.map(i => ITEM_NAMES[i]);
        }
        if (this.shopPhase === 'sub_sell') {
            // subItems holds 0-based item indices derived from player slots
            return this.subItems.map(i => ITEM_NAMES[i]);
        }
        return [];
    }

    _drawSubMenu(alpha) {
        const ctx   = this.ctx;
        const names = this._subItemNames();
        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.strokeStyle = '#a4f'; ctx.lineWidth = 2;
        ctx.strokeRect(SHOP_SUB_X - 2, SHOP_SUB_Y - 2, SHOP_SUB_W + 4, SHOP_SUB_H + 4);
        ctx.fillStyle = '#080015';
        ctx.fillRect(SHOP_SUB_X, SHOP_SUB_Y, SHOP_SUB_W, SHOP_SUB_H);

        ctx.font = SHOP_FONT_MENU;
        for (let i = 0; i < names.length; i++) {
            const yi  = SHOP_SUB_TEXT_Y + i * SHOP_LINE_H_MENU;
            const sel = (i === this.subSel);
            ctx.fillStyle = sel ? '#dbf' : '#e3f';
            ctx.fillText(names[i], SHOP_SUB_TEXT_X + 16, yi);
            if (sel) {
                ctx.fillStyle = '#f20';
                this._triangle(ctx, SHOP_SUB_X + 2, yi - 16, 10, 16, false);
            }
        }
        ctx.restore();
    }

    // ── Rendering: dialog box ──────────────────────────────────────────────────

    _drawDialogBox(now, alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.strokeStyle = '#885522'; ctx.lineWidth = 2;
        ctx.strokeRect(SHOP_DLG_X - 2, SHOP_DLG_Y - 2, SHOP_DLG_W + 4, SHOP_DLG_H + 4);
        ctx.strokeStyle = '#441100'; ctx.lineWidth = 1;
        ctx.strokeRect(SHOP_DLG_X, SHOP_DLG_Y, SHOP_DLG_W, SHOP_DLG_H);
        ctx.fillStyle = '#080400';
        ctx.fillRect(SHOP_DLG_X, SHOP_DLG_Y, SHOP_DLG_W, SHOP_DLG_H);

        const scrollTop = this._dlgScrollTop();
        let row = 0;
        ctx.font      = SHOP_FONT_DLG;
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

    // ── Input ──────────────────────────────────────────────────────────────────

    handleInput(key) {
        const now = performance.now();
        if (this.phase === 'fadeOut') return;
        if (this.magicAnimPhase === 'exit')  return;  // block during exit anim

        if (key === 'ArrowUp' || key === 'ArrowDown') {
            const dir = key === 'ArrowUp' ? -1 : 1;
            if (this.shopPhase === 'menu' && !this.menuDimmed) {
                this.menuSel = (this.menuSel + dir + MENU_ITEMS.length) % MENU_ITEMS.length;
            } else if (
                this.shopPhase === 'sub_buy'      ||
                this.shopPhase === 'sub_sell'     ||
                this.shopPhase === 'sub_describe'
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
        // Skip still-typing dialog first
        if (this.typewriter && !this.typewriter.isDone(now)) {
            this.typewriter.skip(now);
            if (this._dlgQueue && this._dlgQueueIndex < this._dlgQueue.length) return;
            return;
        }

        switch (this.shopPhase) {

            case 'greeting':
                // Wait for both dialog and entry animation before opening menu
                if (this.magicAnimPhase !== 'idle') return;
                this.shopPhase  = 'menu';
                this.menuDimmed = false;
                break;

            case 'menu':
                if (!this.menuDimmed) this._activateMenuItem(this.menuSel, now);
                break;

            case 'sub_buy':
                this._onBuyItemSelected(now);
                break;

            case 'sub_sell':
                this._onSellItemSelected(now);
                break;

            case 'sub_describe':
                this._onDescribeItemSelected(now);
                break;

            case 'confirm_buy':
                this._executeBuy(now);
                break;

            case 'confirm_sell':
                this._executeSell(now);
                break;

            case 'dialog':
                if (this.exitAfterDialog) {
                    this._startExitAnim(now);
                } else {
                    this.shopPhase  = 'menu';
                    this.menuDimmed = false;
                }
                break;
        }
    }

    _onCancel(now) {
        if (this.shopPhase === 'sub_buy'      ||
            this.shopPhase === 'sub_sell'     ||
            this.shopPhase === 'sub_describe' ||
            this.shopPhase === 'confirm_buy'  ||
            this.shopPhase === 'confirm_sell') {
            this._setDialog("Is there something I can do for you?");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
        } else if (this.shopPhase === 'menu') {
            this._doGoOutside(now);
        }
    }

    // ── Menu dispatch ──────────────────────────────────────────────────────────

    _activateMenuItem(idx, now) {
        switch (idx) {
            case MENU_GO_OUTSIDE:   this._doGoOutside(now);      break;
            case MENU_BUY_ITEM:     this._doBuyMenu(now);         break;
            case MENU_SELL_ITEM:    this._doSellMenu(now);        break;
            case MENU_DESCRIBE:     this._doDescribeMenu(now);    break;
        }
    }

    // ── Go outside ─────────────────────────────────────────────────────────────

    _doGoOutside(now) {
        // ASM: unk_AB0E dialog ("Thank you, sir. Please come again."), then exit
        this._setDialog("Thank you, sir. Please come again.");
        this.shopPhase       = 'dialog';
        this.exitAfterDialog = true;
    }

    // ── Buy item ───────────────────────────────────────────────────────────────

    _doBuyMenu(now) {
        this._buildInventoryLists();

        if (!this._shopItemIndices.length) {
            this._setDialog("What are you looking for?");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            return;
        }

        this.subItems      = [...this._shopItemIndices];
        this.subSel        = 0;
        this.subKind       = 'buy';
        this.shopPhase     = 'sub_buy';
        this.menuDimmed    = true;
        this._setDialog("What are you looking for?");
    }

    _onBuyItemSelected(now) {
        const itemIdx = this.subItems[this.subSel];
        const price   = this._getItemPrice(itemIdx);
        const name    = ITEM_NAMES[itemIdx];

        this._pendingItemIdx = itemIdx;
        this._pendingPrice   = price;

        this._setDialog(`You'd like a ${name}. That will be ${price} golds. Will there be something else?`);
        this.shopPhase = 'confirm_buy';
    }

    _executeBuy(now) {
        const gold = this._getGold();

        if (gold < this._pendingPrice) {
            this._setDialog("You have no money, sir.");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            this._pendingItemIdx = null;
            this._pendingPrice   = 0;
            return;
        }

        // Check if player has a free magic item slot
        const freeSlot = this._findEmptyMagicSlot();
        if (freeSlot === -1) {
            this._setDialog("You can't possibly carry any more.");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            this._pendingItemIdx = null;
            this._pendingPrice   = 0;
            return;
        }

        // Deduct gold
        this._setGold(gold - this._pendingPrice);

        // Place item in player slot (item id = 1-based index)
        this._setPlayerMagicSlot(freeSlot, this._pendingItemIdx + 1);

        this._buildInventoryLists();

        this._pendingItemIdx = null;
        this._pendingPrice   = 0;

        this._setDialog(`That will be... Will there be something else?`);
        this.shopPhase       = 'dialog';
        this.exitAfterDialog = false;
    }

    // ── Sell item ──────────────────────────────────────────────────────────────

    _doSellMenu(now) {
        this._buildInventoryLists();

        // Build list of items the player is carrying (using their 0-based item indices)
        const playerCarrying = [];
        for (const id of this._playerItemIds) {
            if (id > 0 && id <= 8) playerCarrying.push(id - 1);  // convert to 0-based
        }

        if (!playerCarrying.length) {
            this._setDialog("You aren't carrying any magic items, sir.");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            return;
        }

        this.subItems      = playerCarrying;
        this.subSel        = 0;
        this.subKind       = 'sell';
        this.shopPhase     = 'sub_sell';
        this.menuDimmed    = true;
        this._setDialog("What would you like to sell?");
    }

    _onSellItemSelected(now) {
        const itemIdx   = this.subItems[this.subSel];
        const buyPrice  = this._getItemPrice(itemIdx);
        // Sell price = floor(buy_price / 2) — mirrors ASM shr/rcr
        const sellPrice = Math.floor(buyPrice / 2);
        const name      = ITEM_NAMES[itemIdx];

        this._pendingItemIdx = itemIdx;
        this._pendingPrice   = sellPrice;

        this._setDialog(`You'd like to sell a ${name}. I'll give you ${sellPrice} golds for that. Will that be all right?`);
        this.shopPhase = 'confirm_sell';
    }

    _executeSell(now) {
        const itemIdx   = this._pendingItemIdx;
        const sellPrice = this._pendingPrice;

        // Find and clear the player's slot for this item
        const itemId1 = itemIdx + 1;
        const slot    = this._findMagicSlotByItemId(itemId1);
        if (slot !== -1) {
            this._setPlayerMagicSlot(slot, 0);
        }

        // Return item to shop stock
        this._orMagicBitmask(itemIndexToBit(itemIdx));

        // Add gold to player
        this._setGold(this._getGold() + sellPrice);

        this._buildInventoryLists();

        this._pendingItemIdx = null;
        this._pendingPrice   = 0;

        this._setDialog("Thank you very much.");
        this.shopPhase       = 'dialog';
        this.exitAfterDialog = false;
    }

    // ── Describe item ──────────────────────────────────────────────────────────

    _doDescribeMenu(now) {
        this._buildInventoryLists();

        if (!this._shopItemIndices.length) {
            this._setDialog("Which item can I tell you about?");
            this.shopPhase       = 'dialog';
            this.exitAfterDialog = false;
            return;
        }

        this.subItems   = [...this._shopItemIndices];
        this.subSel     = 0;
        this.subKind    = 'describe';
        this.shopPhase  = 'sub_describe';
        this.menuDimmed = true;
        this._setDialog("Which item can I tell you about?");
    }

    _onDescribeItemSelected(now) {
        const itemIdx = this.subItems[this.subSel];
        const name    = ITEM_NAMES[itemIdx];
        const desc    = ITEM_DESCRIPTIONS[itemIdx] || 'A very special item.';
        this._setDialog(`You're interested in the ${name}. ${desc}`);
        this.shopPhase       = 'dialog';
        this.exitAfterDialog = false;
    }

    // ── Utility ────────────────────────────────────────────────────────────────

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
        return 'Witchcraft Implement Shop';
    }
}
