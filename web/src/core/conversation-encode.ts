/**
 * conversation-encode.ts — build an NPC dialog byte stream from localized text.
 *
 * Localized conversation text is stored as plain UTF-8-friendly strings where
 * `/` marks a forced line break (matching the original 0x2F). Gameplay control
 * codes are stored separately as an `endCode` name and re-appended here, so the
 * translated string itself never carries raw control bytes.
 *
 * The produced stream is consumed by `parseDialogText`, which performs the
 * original word wrapping and control-code dispatch.
 */

import type { ConversationEndCode } from './conversation-text.js';

export type { ConversationEndCode };

const END_CODE_BYTES: Record<ConversationEndCode, number> = {
    yesNo: 0x81,
    elfCrest: 0x83,
    pattern5: 0x87,
    purchase: 0x89,
    tear: 0x8b,
};

/**
 * Encode localized conversation text into a byte stream for `parseDialogText`.
 *
 * ASCII/English only: the original byte pipeline cannot carry code points above
 * 0x7F. Non-ASCII translations must go through `parseLocalizedDialog` instead.
 *
 * @param text    localized text; `/` is a forced line break
 * @param endCode optional terminal control code (0xFF is appended when absent)
 */
export function encodeConversationText(text: string, endCode?: ConversationEndCode | null): Uint8Array {
    const bytes: number[] = [];
    for (const ch of text) {
        if (ch === '/') {
            bytes.push(0x2f);
            continue;
        }
        const code = ch.codePointAt(0) ?? 0;
        // Control codes cannot appear in localized text: they are metadata.
        if (code >= 0x80) continue;
        bytes.push(code);
    }
    if (endCode && endCode in END_CODE_BYTES) {
        bytes.push(END_CODE_BYTES[endCode]);
    } else {
        bytes.push(0xff);
    }
    return new Uint8Array(bytes);
}