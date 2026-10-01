/**
 * dungeons-source.mjs — strict reader for the five navigation-relevant fields
 * of web/src/data/dungeons.ts, plus a drift guard against the shipped tilesets.
 *
 * `dungeons.ts` is the runtime source of truth: main.ts pushes its arrays into
 * seg1 at 0x8000..0x802F (core/ts-memory.ts:124-147) and the engine classifies
 * tiles from there. So the extractor must not duplicate those tables, and a
 * mis-parse here would silently produce a wrong graph.
 *
 * Two defences against that:
 *   1. every shape assumption below is asserted, so a reformat of dungeons.ts
 *      fails the build instead of yielding partial data;
 *   2. the parsed arrays are compared byte-for-byte against the unpacked
 *      tileset headers in tools/GrpViewer/mpp*.grp.unp, which are the original
 *      data and are committed to the repo.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export class SourceError extends Error {}

const REPO = resolve(new URL('../..', import.meta.url).pathname);

/** Map ids must be contiguous from 0; the whole extractor depends on it. */
export const EXPECTED_MAP_COUNT = 31;

function fail(msg) {
    throw new SourceError(msg);
}

/**
 * Pull one `name: [ ... ]` array out of an entry body.
 *
 * Comments are stripped first: `passableTiles` carries a trailing
 * `// mppX.grp.unp bytes 0..0x17` comment, and a naive split on "," turns the
 * first value into "// mppX.grp.unp bytes 0..0x17\n 0x00" which parses to NaN
 * and silently drops a tile id.
 */
function readArray(body, name, entryId, { required }) {
    const re = new RegExp(String.raw`^\s*${name}:\s*\[([^\]]*)\]`, 'm');
    const m = body.match(re);
    if (!m) {
        if (required) fail(`map ${entryId}: missing required array '${name}'`);
        return null;
    }
    const text = m[1].replace(/\/\/[^\n]*/g, '');
    const values = [];
    for (const raw of text.split(',')) {
        const token = raw.trim();
        if (!token) continue;
        const v = token.startsWith('0x') || token.startsWith('0X')
            ? Number.parseInt(token, 16)
            : Number.parseInt(token, 10);
        if (!Number.isFinite(v) || v < 0) {
            fail(`map ${entryId}: unparseable value '${token}' in '${name}'`);
        }
        values.push(v);
    }
    return values;
}

function readString(body, name, entryId, { required }) {
    const m = body.match(new RegExp(String.raw`^\s*${name}:\s*'([^']*)'`, 'm'));
    if (!m) {
        if (required) fail(`map ${entryId}: missing required string '${name}'`);
        return null;
    }
    return m[1];
}

/**
 * @param {string} src text of dungeons.ts
 * @returns {Map<number, object>} keyed by DUNGEONS key
 */
export function parseDungeons(src) {
    const entries = new Map();
    // Entries are `^    <id>: {` ... up to the first `^    },` at 4-space indent.
    const re = /^\s{4}(\d+):\s*\{([\s\S]*?)\n {4}\},/gm;
    let m;
    while ((m = re.exec(src)) !== null) {
        const id = Number.parseInt(m[1], 10);
        if (entries.has(id)) fail(`map ${id}: duplicate DUNGEONS key`);
        const body = m[2];

        const mdtPath = readString(body, 'mdtPath', id, { required: true });
        const tilesheetPath = readString(body, 'tilesheetPath', id, { required: true });

        entries.set(id, {
            id,
            mdtPath,
            tilesheetPath,
            passable: readArray(body, 'passableTiles', id, { required: true }),
            slopeLeft: readArray(body, 'slopeTilesLeft', id, { required: false }),
            slopeRight: readArray(body, 'slopeTilesRight', id, { required: false }),
            aggressive: readArray(body, 'aggressiveGround', id, { required: false }),
            airflows: readArray(body, 'airflows', id, { required: false }),
        });
    }

    if (entries.size !== EXPECTED_MAP_COUNT) {
        fail(`expected ${EXPECTED_MAP_COUNT} DUNGEONS entries, parsed ${entries.size} — dungeons.ts was reformatted?`);
    }
    for (let i = 0; i < EXPECTED_MAP_COUNT; i++) {
        if (!entries.has(i)) fail(`DUNGEONS is missing key ${i}; keys must be contiguous from 0`);
    }

    // The arrays are written into fixed-size memory slots; an over-long list
    // would be silently truncated at runtime by writeFixedList.
    if (entries.get(0).passable.length > 24) fail('passableTiles must hold at most 24 entries');
    for (const e of entries.values()) {
        for (const [name, arr, limit] of [
            ['slopeTilesLeft', e.slopeLeft, 4],
            ['slopeTilesRight', e.slopeRight, 4],
            ['aggressiveGround', e.aggressive, 4],
        ]) {
            if (arr && arr.length > limit) fail(`map ${e.id}: ${name} has ${arr.length} entries, max ${limit}`);
        }
        if (e.airflows && e.airflows.length > 12) {
            fail(`map ${e.id}: airflows has ${e.airflows.length} entries, max 12`);
        }
    }

    return entries;
}

/** Read and parse the real dungeons.ts. */
export function loadDungeonsSource() {
    return parseDungeons(readFileSync(resolve(REPO, 'web/src/data/dungeons.ts'), 'utf8'));
}

/**
 * Compare a parsed cavern's arrays against the unpacked tileset header.
 *
 * tools/GrpViewer/mpp*.grp.unp bytes:
 *   0x00-0x17 passable (24, fixed, zero-padded)  0x18-0x1B slope left (4)
 *   0x1C-0x1F slope right (4)                    0x20-0x23 aggressive (4)
 *   0x24-0x2F airflows (12 = 3 groups of 4)
 *
 * The relationship is a *prefix*, not equality, and deliberately so. A tileset
 * file holds the defaults for a whole world, but `dungeons.ts` overrides them
 * per map: every boss room shares its world's `mppX.grp.unp` yet declares empty
 * slope, aggressive and airflow tables, because a boss arena has no hazards.
 * A map may therefore list a prefix of its tileset's lists. A value that is not
 * in the tileset, a reordering, or an extra entry still fails.
 *
 * @returns {string[]} human-readable differences; empty means agreement
 */
export function diffAgainstTileset(tilesheetPath, e) {
    const name = tilesheetPath.split('/').pop();          // mpp1.png
    const letter = name.replace(/^mpp/, '').replace(/\.png$/, '');
    const file = resolve(REPO, `tools/GrpViewer/mpp${letter}.grp.unp`);
    let grp;
    try {
        grp = readFileSync(file);
    } catch {
        return [`${file} is missing — cannot verify the tileset drift guard`];
    }

    /** Fixed-width window with trailing padding removed (padding only, never leading). */
    const fixed = (lo, hi) => {
        const out = [];
        for (let i = lo; i < hi; i++) out.push(grp[i]);
        while (out.length > 0 && out[out.length - 1] === 0) out.pop();
        return out;
    };
    /** Zero-terminated group: a 0 in the first slot means "empty". */
    const group = (lo) => {
        const out = [];
        for (let i = lo; i < lo + 4; i++) {
            if (grp[i] === 0) break;
            out.push(grp[i]);
        }
        return out;
    };

    const problems = [];
    // Only trailing zeros are padding. A leading/interior 0 is a real tile id
    // (tile 0 is passable in every cavern) and must survive the comparison.
    const stripTrailing = (a) => {
        const b = a.slice();
        while (b.length > 0 && b[b.length - 1] === 0) b.pop();
        return b;
    };
    const check = (label, actual, expected) => {
        const got = stripTrailing(actual ?? []);
        const exp = stripTrailing(expected);
        if (got.length > exp.length || got.some((v, i) => v !== exp[i])) {
            problems.push(
                `${label}: dungeons.ts has [${got.join(',')}] but ` +
                `mpp${letter}.grp.unp allows [${exp.join(',')}]`,
            );
        }
    };

    check('passableTiles', e.passable, fixed(0x00, 0x18));
    check('slopeTilesLeft', e.slopeLeft, group(0x18));
    check('slopeTilesRight', e.slopeRight, group(0x1c));
    check('aggressiveGround', e.aggressive, group(0x20));
    check('airflows.up', e.airflows?.slice(0, 4), group(0x24));
    check('airflows.left', e.airflows?.slice(4, 8), group(0x28));
    check('airflows.right', e.airflows?.slice(8, 12), group(0x2c));
    return problems;
}
