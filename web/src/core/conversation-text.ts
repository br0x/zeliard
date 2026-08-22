/**
 * conversation-text.ts — pure NPC-dialog text engine.
 *
 * Parses the original conversation byte streams into laid-out pages and
 * computes dialog box geometry. Ported verbatim from game.js (Stage 2).
 *
 * Byte-stream format (mirrors the original DOS data):
 *   - printable ASCII text; 0x2F ('/') forces a line break
 *   - 0x5C renders as apostrophe, 0x26 renders as space
 *   - bytes < 0x20 are skipped
 *   - 0xFF / 0x00 terminate the stream
 *   - control codes:
 *       0x81 → offer Yes/No choice after the text
 *       0x83 → citizen gives the Elf Crest        (effect callback)
 *       0x85 → no-op stub (Asbestos cape intro jumps elsewhere)
 *       0x87 → wait for input, then show pattern 5
 *       0x89 → show Take/No-Take purchase choice
 *       0x8B → tear collection                    (effect callback)
 *       ≥ 0x82 (unhandled) terminates parsing
 *
 * Layout mirrors the original: lines wrap at 256 "original pixels" using the
 * original font-width table; pages hold up to 15 lines.
 */

/** Original per-character widths in DOS font pixels (chars 0x20..0x7F). */
const CHAR_WIDTH_TABLE = [
    5,4,4,4,6,8,5,3,4,4,6,6,6,5,6,8,7,5,7,7,7,7,7,7,7,7,3,4,6,6,6,7,
    8,8,8,8,8,8,8,8,8,5,8,8,8,8,8,8,8,8,8,8,7,8,8,8,8,8,7,5,3,5,6,7,
    7,8,8,7,8,7,7,8,8,5,6,8,5,8,7,7,8,8,8,7,6,8,8,8,7,7,7,4,8,4,7,8,
];

export const ORIG_MAX_LINE_PX = 256;
export const TEXT_AREA_WIDTH = 624; // DIALOG_MAX_WIDTH - 2*DIALOG_PADDING_X
export const WIDTH_SCALE = TEXT_AREA_WIDTH / ORIG_MAX_LINE_PX;
export const DIALOG_FONT_SIZE = 18;
export const DIALOG_LINES_PER_PAGE = 15;
export const DIALOG_PADDING_X = 10;
export const DIALOG_MAX_WIDTH = 672 - 24; // VIEW_WIDTH - 24
export const TEXT_FIRST_BASELINE = 32;
export const TEXT_LINE_HEIGHT = 24;
export const TEXT_BOTTOM_PAD = 20;

/** Side-effects triggered by special control codes (wasm writes in game.js). */
export interface DialogEffects {
    /** 0x83: grant Elf Crest (caliente_items bit7, elf_crest=FF, init_c015). */
    onElfCrest?: () => void;
    /** 0x8B: tear collected (byte_4 |= 80h). */
    onTearCollected?: () => void;
}

export interface ParsedDialog {
    /** Pages of laid-out text lines. */
    pages: string[][];
    /** Stream ended with a Yes/No request (0x81). */
    hasYesNo: boolean;
    /** Terminal control code that requires follow-up (0x87 / 0x89), if any. */
    endCode: number | null;
}

export function charOrigWidth(ch: string): number {
    const idx = ch.charCodeAt(0) - 0x20;
    if (idx < 0 || idx >= CHAR_WIDTH_TABLE.length) return 6;
    return CHAR_WIDTH_TABLE[idx];
}

/**
 * Parse raw conversation bytes into paged, wrapped lines.
 *
 * @param bytes   raw NPC conversation stream (already fetched from g_mem)
 * @param effects optional callbacks for wasm-side control codes
 */
export function parseDialogText(bytes: ArrayLike<number>, effects: DialogEffects = {}): ParsedDialog {
    const pages: string[][] = [];
    let lines: string[] = [''];
    let lineW = 0;
    let hasYesNo = false;
    let endCode: number | null = null;
    const MAX_W = ORIG_MAX_LINE_PX;

    const pushLine = () => {
        lines.push('');
        lineW = 0;
        if (lines.length - 1 === DIALOG_LINES_PER_PAGE) {
            pages.push(lines.slice(0, DIALOG_LINES_PER_PAGE));
            lines = [''];
        }
    };

    for (let i = 0; i < bytes.length; i++) {
        let b = bytes[i];
        if (b === 0xff || b === 0x00) break;
        if (b === 0x81) { hasYesNo = true; break; }
        if (b === 0x83) {
            effects.onElfCrest?.();
            break;
        }
        if (b === 0x85) {
            // Asbestos cape intro stub: remainder duplicates pattern 4, so
            // skipping it equals the original re-render of pattern 4.
            continue;
        }
        if (b === 0x87) { endCode = 0x87; break; }
        if (b === 0x89) { endCode = 0x89; break; }
        if (b === 0x8b) {
            effects.onTearCollected?.();
            break;
        }
        if (b >= 0x82) break;
        if (b === 0x2f) { pushLine(); continue; }
        if (b === 0x5c) b = 0x27;
        if (b === 0x26) b = 0x20;
        if (b < 0x20) continue;

        const ch = String.fromCharCode(b);
        const cw = charOrigWidth(ch);
        if (b === 0x20) {
            // Break before a word that would overflow the line.
            let nextW = 0;
            for (let j = i + 1; j < bytes.length; j++) {
                const nb = bytes[j];
                if (nb === 0x20 || nb === 0x2f || (nb >= 0x80 && nb !== 0x81)) break;
                if (nb >= 0x20) nextW += charOrigWidth(String.fromCharCode(nb));
            }
            if (lineW + cw + nextW >= MAX_W) {
                pushLine();
                continue;
            }
        }
        lines[lines.length - 1] += ch;
        lineW += cw;
    }

    const nonEmpty = lines.filter((l) => l.length > 0);
    if (nonEmpty.length > 0) pages.push(nonEmpty);

    return { pages, hasYesNo, endCode };
}

// ── Geometry ────────────────────────────────────────────────────────────────

export interface DialogGeometry {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface GeometryOptions {
    pageLines: string[];
    /** NPC faces left → dialog hugs the right edge of the view. */
    facingLeft: boolean;
    /** Extra rows reserved for Yes/No or Take/No-Take choices. */
    extraLines?: number;
    /** Text measurer (ctx.measureText(line).width in the port's font). */
    measureText: (text: string) => number;
    /** Viewport width in px (default 672). */
    viewWidth?: number;
}

/**
 * Compute the dialog box rectangle. Pure — callers assign the result onto
 * their conversation state.
 */
export function computeDialogGeometry(opts: GeometryOptions): DialogGeometry {
    const {
        pageLines,
        facingLeft,
        extraLines = 0,
        measureText,
        viewWidth = 672,
    } = opts;

    const nLines = Math.max(pageLines.length, 1) + extraLines;
    const bh = TEXT_FIRST_BASELINE + (nLines - 1) * TEXT_LINE_HEIGHT + TEXT_BOTTOM_PAD;

    let maxW = 0;
    for (const line of pageLines) {
        const w = measureText(line);
        if (w > maxW) maxW = w;
    }
    const bw = Math.min(Math.max(maxW + 2 * DIALOG_PADDING_X + 16, 160), DIALOG_MAX_WIDTH);
    const bx = facingLeft ? viewWidth - bw - 12 : 12;
    const by = (13 * 24 - 4) /* DIALOG_BOTTOM_Y */ - bh;

    return { x: bx, y: Math.max(by, 4), w: bw, h: bh };
}
