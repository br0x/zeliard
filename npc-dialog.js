/**
 * npc-dialog.js — NPC conversation system for the Zeliard web port.
 *
 * Design principles:
 *   - WASM handles nothing: all detection, text parsing, and rendering is JS-only.
 *   - While a dialog is open, Space is consumed here and NOT forwarded to WASM.
 *   - The dialog box is drawn directly on the game canvas (ctx), matching the
 *     original CGA aesthetic: black fill, white border, pixel-proportional font.
 *   - Text layout mirrors the original: '/' = newline, 0xFF = end of page/dialog,
 *     0x81–0x8B = control codes (skipped silently for now), word-wrap at 168px.
 *   - The bottom edge of the dialog sits just above the "heads" row so walking
 *     NPCs in the background row are never obscured.
 *
 * Usage (in game.js):
 *
 *   import { NpcDialog } from './npc-dialog.js';
 *
 *   const npcDialog = new NpcDialog({ canvas, ctx, readMemory });
 *
 *   // In the keydown handler, before setting keys.Space:
 *   if (e.code === 'Space' && !e.repeat) {
 *       if (npcDialog.isOpen) {
 *           npcDialog.advance();          // page turn / close
 *           return;                       // do NOT set keys.Space
 *       }
 *       if (engineReady && npcDialog.tryOpen()) {
 *           return;                       // dialog opened; eat the key
 *       }
 *   }
 *
 *   // In draw(), after all game rendering:
 *   npcDialog.draw();
 *
 *   // In onFullTick(), guard townUpdate while dialog is open:
 *   if (!npcDialog.isOpen) { townUpdate?.(); }
 *
 *   // In inputSetKeys, suppress Space while dialog is open:
 *   if (npcDialog.isOpen) keys = { ...keys, Space: false };
 */

// ─── MDT / memory constants (must match town.h / town.c) ──────────────────────
const ADDR_NPC_CONVERSATIONS = 0xC00D;  // word → pointer to conv pointer table
const ADDR_NPC_ARRAY         = 0xC00F;  // word → pointer to NPC array
const ADDR_FACING_DIRECTION  = 0x00C2;  // bit0: 0=right, 1=left
const ADDR_HERO_X_IN_VIEWPORT= 0x0083;  // uint8 — hero viewport column (0-27)
const ADDR_PROX_LEFT         = 0x0080;  // word — leftmost map col in viewport

// NPC struct offsets (8-byte records, 0xFFFF-terminated on n_x)
const NPC_OFF_X      = 0;  // uint16 absolute map column
const NPC_OFF_FACING = 2;  // bit7: face-left
const NPC_OFF_FLAGS  = 6;  // bit6: interactable; bit7: in-conversation
const NPC_OFF_ID     = 7;  // conversation pattern index

// Canvas / layout constants (must match game.js)
const TILE_WIDTH  = 24;
const TILE_HEIGHT = 24;
const VIEW_COLS   = 28;
const VIEW_WIDTH  = VIEW_COLS * TILE_WIDTH;   // 672 px
const TOWN_MAP_START_ROW  = 8;
const TOWN_HEADS_ROW      = TOWN_MAP_START_ROW + 5;   // row 13, y = 312px
const TOWN_VISIBLE_COL_OFFSET = 4;

// Dialog visual constants
const DIALOG_FONT_SIZE    = 10;       // px — base line height
const DIALOG_LINE_HEIGHT  = 13;       // px — line spacing
const DIALOG_PADDING_X    = 10;       // px — inner horizontal padding
const DIALOG_PADDING_Y    = 8;        // px — inner vertical padding
const DIALOG_MAX_WIDTH    = 480;      // px — maximum box width
const DIALOG_LINES_PER_PAGE = 15;      // lines shown before "more" prompt
const DIALOG_CURSOR_CHAR  = '\u25BC'; // ▼ — "more" indicator
// Bottom edge: 4px above the NPCs' head row
const DIALOG_BOTTOM_Y     = TOWN_HEADS_ROW * TILE_HEIGHT - 4;  // 308 px

// CGA-style palette
const COLOR_BOX_FILL      = 'rgba(0,0,0,0.88)';
const COLOR_BOX_BORDER    = '#FFFFFF';
const COLOR_TEXT          = '#FFFFFF';
const COLOR_CURSOR        = '#FFFF55';   // bright yellow ▼

// Character width table copied verbatim from town.c (index = charCode - 0x20)
// These are the original CGA pixel widths; we scale them for the canvas font.
const CHAR_WIDTH_TABLE = [
    5, 4, 4, 4, 6, 8,  5, 3, 4, 4, 6, 6,
    6, 5, 6, 8, 7, 5,  7, 7, 7, 7, 7, 7,
    7, 7, 3, 4, 6, 6,  6, 7, 8, 8, 8, 8,
    8, 8, 8, 8, 8, 5,  8, 8, 8, 8, 8, 8,
    8, 8, 8, 8, 7, 8,  8, 8, 8, 8, 7, 5,
    3, 5, 6, 7, 7, 8,  8, 7, 8, 7, 7, 8,
    8, 5, 6, 8, 5, 8,  7, 7, 8, 8, 8, 7,
    6, 8, 8, 8, 7, 7,  7, 4, 8, 4, 7, 8,
];

// Scale from original 168px dialog width (chars fit in ≤0xA8 = 168px) to canvas width.
// We want the text area to be DIALOG_MAX_WIDTH - 2*DIALOG_PADDING_X pixels wide.
const ORIG_MAX_LINE_PX   = 168;
const TEXT_AREA_WIDTH    = DIALOG_MAX_WIDTH - 2 * DIALOG_PADDING_X;
const WIDTH_SCALE        = TEXT_AREA_WIDTH / ORIG_MAX_LINE_PX;

function charOrigWidth(ch) {
    const idx = ch.charCodeAt(0) - 0x20;
    if (idx < 0 || idx >= CHAR_WIDTH_TABLE.length) return 6;
    return CHAR_WIDTH_TABLE[idx];
}

// ─── Text tokeniser ───────────────────────────────────────────────────────────

/**
 * Parse raw MDT text bytes into an array of "page" objects.
 * Each page is an array of line strings.
 * Control codes (0x81..0x8F) are treated as end-of-text for now.
 * '/' (0x2F) is a newline.  0xFF is end-of-text.
 *
 * Word-wrap uses the original pixel-width table scaled by WIDTH_SCALE.
 */
function parseDialogText(bytes) {
    const pages = [];
    let lines  = [''];    // current page's lines
    let lineW  = 0;       // current line pixel width (original coords)
    const MAX_W = ORIG_MAX_LINE_PX;

    const pushLine = () => {
        lines.push('');
        lineW = 0;
        if (lines.length - 1 === DIALOG_LINES_PER_PAGE) {
            // commit page (drop trailing empty line)
            const trimmed = lines.slice(0, DIALOG_LINES_PER_PAGE);
            pages.push(trimmed);
            lines = [''];
        }
    };

    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 0xFF || b === 0x00) break;          // end of dialog
        if (b >= 0x81) break;                          // control code → end
        if (b === 0x2F) { pushLine(); continue; }     // explicit newline
        if (b < 0x20) continue;                        // skip other controls

        const ch  = String.fromCharCode(b);
        const cw  = charOrigWidth(ch);

        // Word-wrap: if adding this character would overflow and it's a space,
        // wrap now.  For non-space chars, always emit (original behaviour).
        if (b === 0x20) {
            // Measure next word to decide whether to wrap before the space.
            let nextW = 0;
            for (let j = i + 1; j < bytes.length; j++) {
                const nb = bytes[j];
                if (nb === 0x20 || nb === 0x2F || nb >= 0x80) break;
                if (nb >= 0x20) nextW += charOrigWidth(String.fromCharCode(nb));
            }
            if (lineW + cw + nextW >= MAX_W) {
                pushLine();
                continue; // drop the space at wrap point
            }
        }

        lines[lines.length - 1] += ch;
        lineW += cw;
    }

    // Flush remaining lines as a final page
    const nonEmpty = lines.filter(l => l.length > 0);
    if (nonEmpty.length > 0) pages.push(nonEmpty);

    return pages;
}

// ─── NpcDialog class ──────────────────────────────────────────────────────────

export class NpcDialog {
    /**
     * @param {object} opts
     * @param {HTMLCanvasElement} opts.canvas
     * @param {CanvasRenderingContext2D} opts.ctx
     * @param {function(number,number):Uint8Array} opts.readMemory
     *        readMemory(offset, length) — reads from WASM g_mem
     */
    constructor({ canvas, ctx, readMemory }) {
        this._canvas     = canvas;
        this._ctx        = ctx;
        this._readMemory = readMemory;

        this._pages       = [];   // parsed pages (arrays of line strings)
        this._pageIdx     = 0;    // current page
        this.isOpen       = false;

        // Blinking cursor state
        this._cursorVisible  = true;
        this._cursorTimer    = 0;
        this._CURSOR_BLINK_MS = 400;
        this._lastCursorToggle = 0;

        // Box geometry (computed on open)
        this._boxX = 0;
        this._boxY = 0;
        this._boxW = 0;
        this._boxH = 0;
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Attempt to open a dialog for the NPC in front of the hero.
     * Call this when Space is pressed and `engineReady` is true.
     * @returns {boolean} true if a dialog was opened.
     */
    tryOpen() {
        if (this.isOpen) return false;

        const npc = this._findNpcAhead();
        if (!npc) return false;

        const text = this._readConversationText(npc.patternIdx);
        if (!text || text.length === 0) { console.warn('[NpcDialog] no text for patternIdx', npc.patternIdx); return false; }

        const pages = parseDialogText(text);
        if (!pages || pages.length === 0) { console.warn('[NpcDialog] parseDialogText returned empty'); return false; }

        this._pages   = pages;
        this._pageIdx = 0;
        this.isOpen   = true;
        this._cursorVisible    = true;
        this._lastCursorToggle = performance.now();

        this._computeBoxGeometry(npc.facingLeft);
        return true;
    }

    /**
     * Advance dialog (Space / Alt key pressed while dialog is open).
     * Moves to the next page, or closes the dialog on the last page.
     */
    advance() {
        if (!this.isOpen) return;
        this._pageIdx++;
        if (this._pageIdx >= this._pages.length) {
            this.close();
        } else {
            this._computeBoxGeometry(/* reuse last side */ this._boxX < VIEW_WIDTH / 2);
            this._cursorVisible    = true;
            this._lastCursorToggle = performance.now();
        }
    }

    /** Force-close the dialog (e.g. on town transition). */
    close() {
        this.isOpen   = false;
        this._pages   = [];
        this._pageIdx = 0;
    }

    /**
     * Draw the dialog box over the canvas.
     * Call this at the end of your draw() function when isOpen is true.
     */
    draw() {
        if (!this.isOpen) return;

        const page = this._pages[this._pageIdx];
        if (!page) { this.close(); return; }

        // Update blinking cursor
        const now = performance.now();
        if (now - this._lastCursorToggle >= this._CURSOR_BLINK_MS) {
            this._cursorVisible    = !this._cursorVisible;
            this._lastCursorToggle = now;
        }

        const ctx = this._ctx;
        const { _boxX: bx, _boxY: by, _boxW: bw, _boxH: bh } = this;

        // ── Box background ────────────────────────────────────────────────────
        ctx.save();
        ctx.fillStyle = COLOR_BOX_FILL;
        this._roundRect(bx, by, bw, bh, 4);
        ctx.fill();

        // Border — double-line CGA style
        ctx.strokeStyle = COLOR_BOX_BORDER;
        ctx.lineWidth   = 2;
        this._roundRect(bx, by, bw, bh, 4);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth   = 1;
        this._roundRect(bx + 3, by + 3, bw - 6, bh - 6, 2);
        ctx.stroke();

        // ── Text ──────────────────────────────────────────────────────────────
        ctx.fillStyle = COLOR_TEXT;
        ctx.font      = `${DIALOG_FONT_SIZE + 2}px 'Courier New', monospace`;
        ctx.textBaseline = 'top';

        const tx = bx + DIALOG_PADDING_X;
        let   ty = by + DIALOG_PADDING_Y;

        for (const line of page) {
            ctx.fillText(line, tx, ty);
            ty += DIALOG_LINE_HEIGHT;
        }

        // ── "More / end" cursor ───────────────────────────────────────────────
        const hasMore = this._pageIdx < this._pages.length - 1;
        if (this._cursorVisible) {
            ctx.fillStyle = COLOR_CURSOR;
            ctx.font      = `${DIALOG_FONT_SIZE}px 'Courier New', monospace`;
            const cursorX = bx + bw - DIALOG_PADDING_X - 10;
            const cursorY = by + bh - DIALOG_PADDING_Y - DIALOG_FONT_SIZE;
            ctx.fillText(hasMore ? DIALOG_CURSOR_CHAR : '\u25A0', cursorX, cursorY);
        }

        ctx.restore();
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    /**
     * Mirror the C `hero_spacebar_interaction` NPC-detection logic.
     * Returns { patternIdx, facingLeft } or null.
     */
    _findNpcAhead() {
        const mem = this._readMemory;

        const facingByte  = mem(ADDR_FACING_DIRECTION, 1)[0];
        const facingLeft  = (facingByte & 1) !== 0;

        const heroXv      = mem(ADDR_HERO_X_IN_VIEWPORT, 1)[0];
        const proxLeftCol = mem(ADDR_PROX_LEFT, 2);
        const proxLeft    = proxLeftCol[0] | (proxLeftCol[1] << 8);

        // Mirror C exactly:
        //   viewport_col = HERO_XV + 4
        //   bx           = viewport_col * 8 + 5 + PROX_START
        //   abs_x        = viewport_col + PROX_LEFT
        //   PROX_START   = MEM16(0xFF2A)  (= PROX_LEFT * 8 + ADDR_TOWN_TILES)
        //
        // Each ±8 step in `off` moves one tile column in the MDT tile data.
        // Row 5 (+5) is the ground-level row where NPC sentinel tiles (0xFD) sit.
        const proxStartBytes = mem(0xFF2A, 2);
        const bxBase         = proxStartBytes[0] | (proxStartBytes[1] << 8);

        const viewportCol = heroXv + 4;
        const bx          = viewportCol * 8 + 5 + bxBase;
        let   absX        = viewportCol + proxLeft;

        console.log('[NpcDialog] facing', facingLeft ? 'LEFT' : 'RIGHT',
            '| heroXv', heroXv, '| proxLeft', proxLeft,
            '| bxBase(PROX_START)', '0x' + bxBase.toString(16),
            '| viewportCol', viewportCol,
            '| bx', '0x' + bx.toString(16),
            '| absX start', absX);

        let foundAbsX = -1;

        if (facingLeft) {
            absX--;
            for (let off = -8; off >= -24; off -= 8) {
                const tile = mem(bx + off, 1)[0];
                console.log('[NpcDialog]   check bx+off=0x' + (bx+off).toString(16), '→ tile 0x' + tile.toString(16), '| absX', absX);
                if (tile === 0xFD) { foundAbsX = absX; break; }
                absX--;
            }
        } else {
            absX++;
            for (let off = 8; off <= 24; off += 8) {
                const tile = mem(bx + off, 1)[0];
                console.log('[NpcDialog]   check bx+off=0x' + (bx+off).toString(16), '→ tile 0x' + tile.toString(16), '| absX', absX);
                if (tile === 0xFD) { foundAbsX = absX; break; }
                absX++;
            }
        }

        if (foundAbsX < 0) {
            console.log('[NpcDialog] no 0xFD tile found ahead — bailing');
            return null;
        }

        console.log('[NpcDialog] found 0xFD tile at absX', foundAbsX);

        // Walk NPC array looking for n_x == foundAbsX with bit6 of n_flags set
        const npcArrayPtrBytes = mem(ADDR_NPC_ARRAY, 2);
        let   npcPtr = npcArrayPtrBytes[0] | (npcArrayPtrBytes[1] << 8);
        console.log('[NpcDialog] NPC array ptr', '0x' + npcPtr.toString(16));
        if (!npcPtr) return null;

        for (let i = 0; i < 64; i++) {
            const rec = mem(npcPtr, 8);
            const nx  = rec[NPC_OFF_X] | (rec[NPC_OFF_X + 1] << 8);
            if (nx === 0xFFFF) { console.log('[NpcDialog] NPC list end at entry', i); break; }
            console.log('[NpcDialog]   NPC[' + i + '] nx=' + nx + ' flags=0x' + rec[NPC_OFF_FLAGS].toString(16) + ' id=' + rec[NPC_OFF_ID]);
            if (nx === foundAbsX && (rec[NPC_OFF_FLAGS] & 0x40)) {
                if (rec[NPC_OFF_FLAGS] & 0x80) {
                    console.log('[NpcDialog]   → busy (flag 0x80 set), skipping');
                    npcPtr += 8;
                    continue;
                }
                console.log('[NpcDialog]   → MATCH! patternIdx', rec[NPC_OFF_ID]);
                return { patternIdx: rec[NPC_OFF_ID], facingLeft };
            }
            npcPtr += 8;
        }

        console.log('[NpcDialog] no matching NPC found for absX', foundAbsX);
        return null;
    }

    /**
     * Read raw conversation text bytes for a given pattern index.
     * MDT layout:
     *   word at ADDR_NPC_CONVERSATIONS → conv_base (absolute g_mem addr)
     *   conv_base + pattern_idx*2 → word pointer to text (absolute g_mem addr)
     *   text: ASCII with '/' newlines, 0xFF terminator, control codes 0x81+
     */
    _readConversationText(patternIdx) {
        const mem = this._readMemory;

        const convPtrBytes = mem(ADDR_NPC_CONVERSATIONS, 2);
        const convBase     = convPtrBytes[0] | (convPtrBytes[1] << 8);
        if (!convBase) return null;

        const textPtrBytes = mem(convBase + patternIdx * 2, 2);
        const textAddr     = textPtrBytes[0] | (textPtrBytes[1] << 8);
        if (!textAddr) return null;

        // Read up to 512 bytes of text (dialogs are short)
        const raw = mem(textAddr, 512);

        // Find the actual end (0xFF or control code ≥ 0x81 that terminates)
        let endIdx = raw.length;
        for (let i = 0; i < raw.length; i++) {
            const b = raw[i];
            if (b === 0xFF || b === 0x00) { endIdx = i + 1; break; }
            // 0x8B is the last known control code; anything beyond is garbage
            if (b > 0x8B) { endIdx = i; break; }
        }

        return raw.slice(0, endIdx);
    }

    /**
     * Compute the dialog box position and size for the current page.
     * `onRight` true → box on right side of screen (hero faces left);
     * `onRight` false → box on left side (hero faces right).
     * Original: rect_pos 0x0718 = right, 0x0B18 = left.
     */
    _computeBoxGeometry(facingLeft) {
        const page    = this._pages[this._pageIdx] ?? [];
        const nLines  = Math.max(page.length, 1);
        const bh      = nLines * DIALOG_LINE_HEIGHT + 2 * DIALOG_PADDING_Y + DIALOG_FONT_SIZE;

        // Width: fit to longest line
        const ctx = this._ctx;
        ctx.save();
        ctx.font = `${DIALOG_FONT_SIZE + 2}px 'Courier New', monospace`;
        let maxW = 0;
        for (const line of page) {
            const w = ctx.measureText(line).width;
            if (w > maxW) maxW = w;
        }
        ctx.restore();

        const bw = Math.min(
            Math.max(maxW + 2 * DIALOG_PADDING_X + 16, 160),
            DIALOG_MAX_WIDTH
        );

        // Horizontal: hero faces left → NPC is to the right → box on right side;
        // hero faces right → NPC is to the left → box on left side.
        // In original: facing left (bit0=1) → rect_pos 0x0718 (right), else left.
        let bx;
        if (facingLeft) {
            // Box on right side of canvas
            bx = VIEW_WIDTH - bw - 12;
        } else {
            // Box on left side of canvas
            bx = 12;
        }

        // Bottom edge sits just above the heads row
        const by = DIALOG_BOTTOM_Y - bh;

        this._boxX = bx;
        this._boxY = Math.max(by, 4);
        this._boxW = bw;
        this._boxH = bh;
    }

    /** Helper: draw a rounded rectangle path. */
    _roundRect(x, y, w, h, r) {
        const ctx = this._ctx;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }
}
