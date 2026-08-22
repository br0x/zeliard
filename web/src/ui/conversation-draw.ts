/**
 * conversation-draw.ts — canvas rendering of the NPC conversation dialog box.
 *
 * Owns everything drawn for an active conversation: the black dialog rect,
 * page text, Take/No-Take purchase options, Yes/No choices, and the
 * "more pages" ▼ indicator. Pure drawing: state comes in via the
 * `ConversationDrawState` view interface (satisfied by ConversationManager);
 * no game logic and no memory access.
 *
 * Ported verbatim from game.js (Stage 2).
 */

import {
    computeDialogGeometry,
    DIALOG_FONT_SIZE,
    TEXT_FIRST_BASELINE,
    TEXT_LINE_HEIGHT,
} from '../core/conversation-text.js';

/** The slice of ConversationManager public state needed to draw the box. */
export interface ConversationDrawState {
    active: boolean;
    pages: string[][];
    page: number;
    purchaseMode: boolean;
    purchaseCursor: number;
    yesNoMode: boolean;
    yesNoCursor: number;
    facingLeft: unknown;
    boxX: number;
    boxY: number;
    boxW: number;
    boxH: number;
}

/**
 * Recompute the dialog box rectangle for the current page and store it into
 * state.boxX/Y/W/H. Measures text through the supplied canvas context (the
 * caller's real ctx), inside save/restore so font changes don't leak.
 */
export function layoutConversationBox(
    ctx: CanvasRenderingContext2D,
    state: ConversationDrawState,
    extraLines = 0,
): void {
    const page = state.pages[state.page] ?? [];
    ctx.save();
    ctx.font = `${DIALOG_FONT_SIZE + 2}px 'Courier New', monospace`;
    const geo = computeDialogGeometry({
        pageLines: page,
        facingLeft: !!state.facingLeft,
        extraLines,
        measureText: (line) => ctx.measureText(line).width,
    });
    ctx.restore();
    state.boxX = geo.x;
    state.boxY = geo.y;
    state.boxW = geo.w;
    state.boxH = geo.h;
}

/** Draw the active conversation dialog; no-op when inactive or empty. */
export function drawConversationBox(
    ctx: CanvasRenderingContext2D,
    state: ConversationDrawState,
): void {
    if (!state.active || !state.pages.length) return;
    const pageLines = state.pages[state.page] || [];
    const totalPages = state.pages.length;
    const width = state.boxW || 300;
    const height = state.boxH || 100;
    const x = state.boxX || 10;
    const y = state.boxY || 10;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.99)';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#ccc';
    ctx.strokeRect(x, y, width, height);
    ctx.font = '20px "Courier New", monospace';
    ctx.fillStyle = '#fff';
    for (let i = 0; i < pageLines.length; i++) {
        ctx.fillText(pageLines[i], x + 16, y + 32 + i * TEXT_LINE_HEIGHT);
    }
    if (state.purchaseMode) {
        const options = ['Take', 'No Take'];
        const baseY = y + TEXT_FIRST_BASELINE + pageLines.length * TEXT_LINE_HEIGHT + 8;
        for (let i = 0; i < options.length; i++) {
            const cy = baseY + i * TEXT_LINE_HEIGHT;
            ctx.fillStyle = i === state.purchaseCursor ? '#ffcc00' : '#ccc';
            ctx.fillText(options[i], x + 32, cy);
        }
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('►', x + 12, baseY + state.purchaseCursor * TEXT_LINE_HEIGHT);
    } else if (state.yesNoMode) {
        const options = ['Yes', 'No'];
        const baseY = y + TEXT_FIRST_BASELINE + pageLines.length * TEXT_LINE_HEIGHT + 8;
        for (let i = 0; i < options.length; i++) {
            const cy = baseY + i * TEXT_LINE_HEIGHT;
            ctx.fillStyle = i === state.yesNoCursor ? '#ffcc00' : '#ccc';
            ctx.fillText(options[i], x + 32, cy);
        }
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('►', x + 12, baseY + state.yesNoCursor * TEXT_LINE_HEIGHT);
    } else if (state.page < totalPages - 1) {
        ctx.fillStyle = '#ffcc00';
        ctx.fillText('▼', x + width - 24, y + height - 12);
    }
}
