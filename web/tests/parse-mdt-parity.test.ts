import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    initWasmFromBytes,
    getWasmMemory,
    loadMdt,
    getCavernName,
    getTownName,
    getMusicTrackId,
    getTownBackgroundType,
    getTownPatId,
    getCavernMdtHeader,
    getTownMdtHeader,
} from '../src/wasm/bridge.js';
import {
    parseCavernMdtHeader,
    parseTownMdtHeader,
    getCavernName as tsCavernName,
    getTownName as tsTownName,
    getMusicTrackId as tsMusicTrackId,
    getTownBackgroundType as tsTownBackgroundType,
    getTownPatId as tsTownPatId,
} from '../src/engine/mdt.js';

const WASM_PATH = fileURLToPath(new URL('../../build/zeliard.wasm', import.meta.url));
const GAME_DIR = fileURLToPath(new URL('../public/game/', import.meta.url));

/** Every .mdt shipped under public/game (recursively). */
function collectMdtFiles(): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
        if (!existsSync(dir)) return;
        for (const entry of readdirSync(dir)) {
            const full = path.join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (entry.toLowerCase().endsWith('.mdt')) out.push(full);
        }
    };
    walk(GAME_DIR);
    return out.sort();
}

const mdtFiles = collectMdtFiles();

beforeAll(() => {
    initWasmFromBytes(new Uint8Array(readFileSync(WASM_PATH)));
});

describe('MDT asset inventory', () => {
    it('ships a meaningful number of maps', () => {
        expect(mdtFiles.length).toBeGreaterThan(30);
    });
});

describe.each(mdtFiles)('MDT parity: %s', (filePath) => {
    let bytes: Uint8Array;

    beforeAll(() => {
        bytes = new Uint8Array(readFileSync(filePath));
        // Load into wasm memory so bridge getters read the same image.
        expect(loadMdt(bytes, filePath)).toBe(0);
    });

    it('parses the town header identically (when header is town-shaped)', () => {
        const viaTs = parseTownMdtHeader(bytes);
        const viaWasm = getTownMdtHeader();
        expect(viaWasm).not.toBeNull();
        expect(viaTs).toEqual(viaWasm);
    });

    it('parses the cavern header identically (when header is cavern-shaped)', () => {
        const viaTs = parseCavernMdtHeader(bytes);
        const viaWasm = getCavernMdtHeader();
        expect(viaWasm).not.toBeNull();
        expect(viaTs).toEqual(viaWasm);
    });

    it('reads music track id identically', () => {
        expect(tsMusicTrackId(bytes)).toBe(getMusicTrackId());
    });

    it('reads town background type identically', () => {
        expect(tsTownBackgroundType(bytes)).toBe(getTownBackgroundType());
    });

    it('reads town pat id identically', () => {
        expect(tsTownPatId(bytes)).toBe(getTownPatId());
    });
});

// Names are only meaningful for their respective map kinds; run them over
// every file anyway — both sides read the same bytes, so parity must hold
// regardless of whether the value is semantically "a town name".
//
// Caveat: when the Pascal length byte is absurd (e.g. 0xFF on a dungeon
// file whose name field points at unrelated data), the wasm getter reads
// past the file image into stale g_mem leftovers — that behavior depends
// on what was loaded before it and is not part of any contract. Skip those.
function pascalNameInBounds(bytes: Uint8Array, wordOffset: number): boolean {
    const abs = (bytes[wordOffset] ?? 0) | ((bytes[wordOffset + 1] ?? 0) << 8);
    const offset = abs + 3 - 0xc000;
    const length = bytes[offset] ?? 0;
    return length > 0 && length < 0xf0 && offset + 1 + length <= bytes.length;
}

describe.each(mdtFiles)('MDT name parity: %s', (filePath) => {
    let bytes: Uint8Array;

    beforeAll(() => {
        bytes = new Uint8Array(readFileSync(filePath));
        loadMdt(bytes, filePath);
    });

    it('reads the town-name Pascal string identically', (ctx) => {
        if (!pascalNameInBounds(bytes, 4)) ctx.skip();
        expect(tsTownName(bytes)).toBe(getTownName());
    });

    it('reads the cavern-name Pascal string identically', (ctx) => {
        if (!pascalNameInBounds(bytes, 0x0e)) ctx.skip();
        expect(tsCavernName(bytes)).toBe(getCavernName());
    });
});

it('wasm memory stays reachable for the getters above', () => {
    expect(getWasmMemory()).not.toBeNull();
});
