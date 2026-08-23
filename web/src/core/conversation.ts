/**
 * conversation.ts — NPC conversation state machine.
 *
 * Owns the dialog state (pages, paging, Yes/No choice, Asbestos Cape
 * purchase) and the tick-driven transitions. All wasm/game side-effects
 * (memory reads/writes, almas deduction, item insertion, finish callbacks)
 * go through the injected deps; drawing stays with the caller, which reads
 * the public fields (boxX/Y/W/H etc.) exactly like the legacy code did.
 *
 * Ported verbatim from game.js (Stage 2).
 */

import {
    ADDR_CALIENTE_ITEMS,
    ADDR_HERO_CREST,
    ADDR_NPC_CONVERSATIONS,
    ADDR_PLACE_MAP_ID,
    ADDR_SPACEBAR_LATCH,
} from '../wasm/memory.js';
import { LLAMA_TOWN_ID } from '../data/assets.js';
import { parseDialogText, type DialogEffects, type ParsedDialog } from './conversation-text.js';

export const ASBESTOS_CAPE_ITEM_ID = 5;
export const ASBESTOS_CAPE_PRICE = 2500;

/** First writable inventory slot scanned when inserting the cape. */
const ITEM_SLOT_SCAN_START = 0xa1;
/** Exclusive end of the item-slot scan (legacy loop condition slot < 0xFF). */
const ITEM_SLOT_SCAN_END = 0xff;

/** g_mem word holding the interacting NPC's struct address during talk. */
const ADDR_NPC_ADDR_LATCH = 0xfff6;

// Yes/No response conversation patterns (kept / refused).
const PATTERN_YES_RESPONSE = 0x0c;
const PATTERN_NO_RESPONSE = 0x0d;
// Asbestos Cape follow-up patterns.
const PATTERN_NOT_FREE = 5; // "It's not free though..."
export const PATTERN_REFUSED = 6;
export const PATTERN_NO_ALMAS = 7;
export const PATTERN_BOUGHT = 8;
const PATTERN_CAPE_ONLY_TALK = 9;
const PATTERN_CREST_TEXT = 14;

/**
 * Walk the wasm NPC conversation pointer table: `ADDR_NPC_CONVERSATIONS`
 * points at a per-NPC array of text addresses; each text runs until 0xFF
 * (or an early 0x00 terminator). Returns null when the table, the entry,
 * or the text address is empty.
 */
export function readNpcConversationBytes(
    readMemory: (offset: number, length: number) => Uint8Array | null,
    npcId: number,
): Uint8Array | null {
    const ptr = readMemory(ADDR_NPC_CONVERSATIONS, 2) ?? new Uint8Array(2);
    const convTablePtr = (ptr[0] ?? 0) | ((ptr[1] ?? 0) << 8);
    if (!convTablePtr) return null;
    const textPtr = readMemory(convTablePtr + npcId * 2, 2) ?? new Uint8Array(2);
    const textAddr = (textPtr[0] ?? 0) | ((textPtr[1] ?? 0) << 8);
    if (!textAddr) return null;
    const bytes: number[] = [];
    let b: number;
    while ((b = (readMemory(textAddr + bytes.length, 1) ?? new Uint8Array(1))[0] ?? 0xff) !== 0xff) {
        if (b === 0) break;
        bytes.push(b);
    }
    return new Uint8Array(bytes);
}

export interface ConversationDeps {
    readMemory(offset: number, length: number): Uint8Array | null;
    writeMemory(offset: number, data: ArrayLike<number>): void;
    /** Fetch raw conversation bytes for a pattern id (null when absent). */
    getNpcConversationRaw(npcId: number): Uint8Array | null;
    /** Clear the wasm-side conversation-active latch. */
    townFinishConversation(): void;
    getHeroAlmasValue(): number;
    setHeroAlmasValue(value: number): void;
    renderAlmasHud(): void;
    /**
     * Recompute the dialog box rectangle for the current page and store the
     * result into boxX/Y/W/H (game.js measures text via its canvas context).
     */
    layout(facingLeft: unknown, extraLines?: number): void;
    /**
     * Control-code side effects applied while parsing dialog bytes
     * (0x83 Elf Crest grant, 0x8B tear collection). Without these the
     * engine state mutations behind those codes never happen.
     */
    effects?: DialogEffects;
}

export class ConversationManager {
    // Public state — read by game.js's draw function and scene guards,
    // field names identical to the legacy object for a drop-in swap.
    active = false;
    pages: string[][] = [];
    page = 0;
    pageSize = 6;
    hasYesNo = false;
    yesNoMode = false;
    yesNoCursor = 0;
    purchaseMode = false;
    purchaseCursor = 0;
    endCode: number | null = null;
    facingLeft: unknown = false;
    savedBackground: unknown = null;
    onComplete: (() => void) | null = null;

    boxX = 0;
    boxY = 0;
    boxW = 0;
    boxH = 0;

    private readonly deps: ConversationDeps;

    constructor(deps: ConversationDeps) {
        this.deps = deps;
    }

    /** readMemory that mirrors the engine-ready assumption of the legacy code. */
    private mem(offset: number, length: number): Uint8Array {
        return this.deps.readMemory(offset, length) ?? new Uint8Array(length);
    }

    private parse(raw: Uint8Array | null): ParsedDialog | null {
        const parsed = parseDialogText(raw ?? [], this.deps.effects);
        return parsed.pages.length > 0 ? parsed : null;
    }

    /** Deactivate + clear wasm latch (+ optional completion callback). */
    close(callOnComplete = false): void {
        const onComplete = this.onComplete;
        this.active = false;
        this.savedBackground = null;
        this.onComplete = null;
        this.deps.townFinishConversation();
        if (callOnComplete && onComplete) onComplete();
    }

    /**
     * Start the conversation triggered by the wasm town code (space near an
     * NPC). No-op-safe: leaves state untouched when there is nothing to say.
     */
    startFromWasm(): void {
        const npcAddrBytes = this.mem(ADDR_NPC_ADDR_LATCH, 2);
        const npcAddr = (npcAddrBytes[0] ?? 0) | ((npcAddrBytes[1] ?? 0) << 8);
        let npcId = 0;
        if (npcAddr) {
            npcId = this.mem(npcAddr + 7, 1)[0] ?? 0;
        }
        // After buying the Asbestos Cape in Llama, its merchant (npc id 3)
        // stops re-selling it and only talks about the cape (pattern 9).
        if (
            npcId === 3 &&
            ((this.mem(ADDR_CALIENTE_ITEMS, 1)[0] ?? 0) & 0x40) !== 0 &&
            ((this.mem(ADDR_PLACE_MAP_ID, 1)[0] ?? 0) & 0x7f) === LLAMA_TOWN_ID
        ) {
            npcId = PATTERN_CAPE_ONLY_TALK;
        }

        const parsed = this.parse(this.deps.getNpcConversationRaw(npcId));
        if (!parsed) {
            this.deps.townFinishConversation();
            return;
        }

        // Hero Crest holders get different yes/no phrasing (pattern 14).
        if (this.mem(ADDR_HERO_CREST, 1)[0] && parsed.hasYesNo) {
            const crestParsed = this.parse(this.deps.getNpcConversationRaw(PATTERN_CREST_TEXT));
            if (!crestParsed) {
                this.deps.townFinishConversation();
                return;
            }
            this.applyParsed(crestParsed, false);
        } else {
            this.applyParsed(parsed, false);
        }

        const facingLeft = npcAddr ? (this.mem(npcAddr + 2, 1)[0] ?? 0) & 0x80 : false;
        this.facingLeft = facingLeft;
        this.deps.layout(facingLeft);
    }

    /** Load a conversation pattern; deactivates when it is empty. */
    loadPattern(patternIdx: number): void {
        const parsed = this.parse(this.deps.getNpcConversationRaw(patternIdx));
        if (!parsed) {
            this.close();
            return;
        }
        this.applyParsed(parsed, true);
        this.deps.layout(this.facingLeft);
    }

    /**
     * Start a dialog from pre-parsed pages with a completion callback
     * (e.g. the Pureza warp building's "Fooled again..." dialog). The caller
     * runs its own parse (it may need custom control-code effects); no-ops
     * are the caller's responsibility — parsed pages must be non-empty.
     */
    startDialog(parsed: ParsedDialog, onComplete: () => void): void {
        this.applyParsed(parsed, false);
        this.onComplete = onComplete;
        this.deps.layout(this.facingLeft);
    }

    private applyParsed(parsed: ParsedDialog, keepFacingLeft: boolean): void {
        this.active = true;
        this.pages = parsed.pages;
        this.page = 0;
        this.hasYesNo = parsed.hasYesNo;
        this.yesNoMode = false;
        this.yesNoCursor = 0;
        this.purchaseMode = false;
        this.purchaseCursor = 0;
        this.endCode = parsed.endCode;
        if (!keepFacingLeft) this.facingLeft = false;
        this.savedBackground = null;
        this.onComplete = null;
    }

    private spaceLatched(): boolean {
        const latched = this.mem(ADDR_SPACEBAR_LATCH, 1)[0];
        if (latched) this.deps.writeMemory(ADDR_SPACEBAR_LATCH, [0]);
        return !!latched;
    }

    private moveChoiceCursor(current: number, dirUp: boolean, dirDown: boolean): number {
        let cursor = current;
        if (dirUp && cursor > 0) cursor--;
        else if (dirDown && cursor < 1) cursor++;
        return cursor;
    }

    /**
     * One conversation tick (town mode only). Direction edges are computed by
     * the caller because they share edge state with other input paths.
     */
    handleTick(dirUp: boolean, dirDown: boolean): void {
        if (!this.active) return;
        const spaceLatched = this.spaceLatched();

        if (this.purchaseMode) {
            this.purchaseCursor = this.moveChoiceCursor(this.purchaseCursor, dirUp, dirDown);
            if (spaceLatched) this.handlePurchaseSelection(this.purchaseCursor === 0);
            return;
        }

        if (this.yesNoMode) {
            this.yesNoCursor = this.moveChoiceCursor(this.yesNoCursor, dirUp, dirDown);
            if (spaceLatched) this.handleYesNoSelection(this.yesNoCursor === 0);
            return;
        }

        if (!spaceLatched) return;

        if (this.page < this.pages.length - 1) {
            this.page++;
            this.deps.layout(this.facingLeft);
        } else if (this.hasYesNo) {
            this.yesNoMode = true;
            this.yesNoCursor = 0;
            this.deps.layout(this.facingLeft, 2);
        } else if (this.endCode === 0x87) {
            // Asbestos cape: second part ("It's not free though...")
            this.endCode = null;
            this.loadPattern(PATTERN_NOT_FREE);
        } else if (this.endCode === 0x89) {
            // Asbestos cape: Take/No-Take purchase confirmation
            this.endCode = null;
            this.purchaseMode = true;
            this.purchaseCursor = 0;
            this.deps.layout(this.facingLeft, 2);
        } else {
            this.close(true);
        }
    }

    private handleYesNoSelection(selectedYes: boolean): void {
        this.active = false;
        this.savedBackground = null;
        this.yesNoMode = false;
        this.hasYesNo = false;
        this.deps.townFinishConversation();

        const responsePattern = selectedYes ? PATTERN_YES_RESPONSE : PATTERN_NO_RESPONSE;
        const parsed = this.parse(this.deps.getNpcConversationRaw(responsePattern));
        if (parsed) {
            this.active = true;
            this.pages = parsed.pages;
            this.page = 0;
            this.hasYesNo = false;
            this.endCode = null;
            this.savedBackground = null;
            this.deps.layout(this.facingLeft);
        }
    }

    private handlePurchaseSelection(take: boolean): void {
        if (take) {
            // Buy the Asbestos Cape for 2500 almas.
            const almas = this.deps.getHeroAlmasValue();
            if (almas >= ASBESTOS_CAPE_PRICE) {
                this.deps.setHeroAlmasValue(almas - ASBESTOS_CAPE_PRICE);
                this.deps.renderAlmasHud();
                // caliente_items bit6 = bought Asbestos Cape
                const ci = this.mem(ADDR_CALIENTE_ITEMS, 1)[0] ?? 0;
                this.deps.writeMemory(ADDR_CALIENTE_ITEMS, [ci | 0x40]);
                // Insert the cape (item id 5) into the first empty inventory slot.
                for (let slot = ITEM_SLOT_SCAN_START; slot < ITEM_SLOT_SCAN_END; slot++) {
                    if (this.mem(slot, 1)[0] === 0) {
                        this.deps.writeMemory(slot, [ASBESTOS_CAPE_ITEM_ID]);
                        break;
                    }
                }
                this.loadPattern(PATTERN_BOUGHT);
            } else {
                this.loadPattern(PATTERN_NO_ALMAS);
            }
        } else {
            this.loadPattern(PATTERN_REFUSED);
        }
    }
}
