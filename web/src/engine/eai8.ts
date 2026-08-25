/**
 * eai8.ts — TS port of src/eai8.c (Stage 9e): monster AI for five types,
 * selected by `flags & 0x0F`: 0=medusa top half (twin at m+0x10; HP
 * 0x64), 1=medusa bottom half (no-op), 2=crab (grounded horizontal
 * mover, HP 0x30), 3=slime (grounded walker with a short projectile
 * attack sequence, HP 0x40), 4=plasma (hovering seeker, HP 0x60).
 *
 * Ported 1:1; carry conventions as in eai1.ts.
 */

import {
    coordsToProxAddr,
    isBlocking,
    wrapMapFromAbove,
    wrapMapFromBelow,
    moveMonsterE,
    moveMonsterN,
    moveMonsterS,
    moveMonsterW,
    monsterMoveInDirection,
} from './dungeon-entities.js';
import {
    getRandom,
    heroHitsMonster,
} from './dungeon-combat.js';
import { addProjectileToArray } from './dungeon-projectiles.js';

// g_mem addresses
const HERO_Y = 0xff35;
const MAP_WIDTH_ADDR = 0xc002; // word

function g8(g: Uint8Array, addr: number): number {
    return g[addr & 0xffff] ?? 0;
}

function s8(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
}

function g16(g: Uint8Array, addr: number): number {
    return (g[addr & 0xffff] ?? 0) | ((g[(addr + 1) & 0xffff] ?? 0) << 8);
}

function s16(g: Uint8Array, addr: number, v: number): void {
    g[addr & 0xffff] = v & 0xff;
    g[(addr + 1) & 0xffff] = (v >> 8) & 0xff;
}

interface ProxResult8 {
    value: number;    // AL
    distance: number; // AH
    carry: boolean;   // CF
}

const TYPE4_DIR_RIGHT = [0, 0, 1, 0, 0, 0, 7, 0]; // unk_A71B
const TYPE4_DIR_LEFT = [4, 4, 3, 4, 4, 4, 5, 4]; // unk_A723

// Projectile descriptors from byte_A666 and byte_A673. X/Y are patched
// immediately before Add_Projectile_To_Array().
//
// Descriptor byte 2 indexes DUNGEONS[rawMapId].projectiles. The EAI8
// dungeons define two projectile types:
//     index 0 -> tile 0x2A, index 1 -> tile 0x2B
// The original 0x2A/0x2B were raw base-tile indices in mpp8.png, remapped
// to 0 and 1 (as in eai8.c).
const type3ShotRight = [0, 0, 0, 0, 0x12, 0, 0x50, 0, 0, 0, 0, 0, 0];
const type3ShotLeft = [0, 0, 1, 0, 0x12, 4, 1, 0, 0, 0, 0, 0, 0];

/** Monster_AI_8 (eai8.c:61). */
export function monsterAi8(g: Uint8Array, m: number): void {
    switch (g8(g, m + 4) & 0x0f) {
        case 0: type0Ai(g, m); return; // medusa top
        case 1: type1Ai(g, m); return; // medusa bottom
        case 2: type2Ai(g, m); return; // crab
        case 3: type3Ai(g, m); return; // slime
        case 4: type4Ai(g, m); return; // plasma
        default: return;
    }
}

// ─── Type 0: large two-slot monster (medusa); bottom slot passive. ───

function type1Ai(_g: Uint8Array, _m: number): void {
}

function type0Ai(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 0x64);

    if ((g8(g, m + 5) & 0x20) !== 0) {
        type0Hit(g, m);
        return;
    }

    // twin.ai_flags: clear bit 0x40 every frame
    s8(g, m + 0x15, g8(g, m + 0x15) & 0xbf);

    if ((g8(g, m + 9) & 1) === 0) {
        // add 0x80; call sub_A343 only on 8-bit carry
        const old = g8(g, m + 6);
        s8(g, m + 6, (old + 0x80) & 0xff);
        if ((old & 0x80) !== 0) type0AnimStep(g, m);

        s8(g, m + 0x0a, 0);

        const pr = proximity5(g, m);
        if (!pr.carry) {
            if (pr.value !== 0xff) {
                s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | pr.value) & 0xff);
            }
        } else if (pr.distance < 0x0f) {
            s8(g, m + 9, (g8(g, m + 9) | 1) & 0xff);
        }

        type0SyncTwin(g, m);
        return;
    }

    // charging / walking burst
    s8(g, m + 0x0a, (g8(g, m + 0x0a) + 1) & 0xff);
    if (g8(g, m + 0x0a) === 0x10) {
        s8(g, m + 9, g8(g, m + 9) & 0xfe);
        type0SyncTwin(g, m);
        return;
    }

    if ((g8(g, m + 5) & 0x80) === 0) {
        if (type0MoveWest(g, m) !== 0) {
            s8(g, m + 9, g8(g, m + 9) & 0xfe);
            type0SyncTwin(g, m);
            return;
        }
    } else {
        if (type0MoveEast(g, m) !== 0) {
            s8(g, m + 9, g8(g, m + 9) & 0xfe);
            type0SyncTwin(g, m);
            return;
        }
    }

    type0AnimStep(g, m);
    type0SyncTwin(g, m);
}

function type0AnimStep(g: Uint8Array, m: number): void {
    s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff);
    if (g8(g, m + 6) >= 6) s8(g, m + 6, 0);
}

function type0SyncTwin(g: Uint8Array, m: number): void {
    s8(g, m + 0x16, g8(g, m + 6)); // twin.anim_counter

    const facing = g8(g, m + 5) & 0x80;
    s8(g, m + 0x15, ((g8(g, m + 0x15) & 0x7f) | facing) & 0xff);
}

function type0Hit(g: Uint8Array, m: number): void {
    const al = ((g8(g, m + 5) & 0xbf) | 0x20) & 0xff;
    s8(g, m + 5, al);
    s8(g, m + 0x15, (al | 0x60) & 0xff);
    heroHitsMonster(g, m);
}

function type0MoveEast(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) >= 0x22) return 1;

    if (type0CheckEast(g, m) !== 0) return 1;

    let x = (g16(g, m) + 1) & 0xffff;
    if (x === g16(g, MAP_WIDTH_ADDR)) x = 0;

    s16(g, m, x);
    s16(g, m + 0x10, x);
    s8(g, m + 3, (g8(g, m + 3) + 1) & 0xff);
    s8(g, m + 0x13, (g8(g, m + 0x13) + 1) & 0xff);
    return 0;
}

function type0CheckEast(g: Uint8Array, m: number): number {
    let addr = (coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2)) + 2) & 0xffff;

    for (let i = 0; i < 4; i++) {
        if (isBlocking(g, g8(g, addr)) !== 0) return 1;
        addr += 36;
        addr = wrapMapFromAbove(addr);
    }

    addr -= 36;
    addr = wrapMapFromBelow(addr);

    let al = g8(g, addr);
    for (let i = 0; i < 4; i++) {
        addr -= 36;
        addr = wrapMapFromBelow(addr);
        al |= g8(g, addr);
    }

    return (al & 0x80) !== 0 ? 1 : 0;
}

function type0MoveWest(g: Uint8Array, m: number): number {
    if (g8(g, m + 3) < 2) return 1;

    if (type0CheckWest(g, m) !== 0) return 1;

    let x = (g16(g, m) - 1) & 0xffff;
    if (x === 0xffff) x = (g16(g, MAP_WIDTH_ADDR) - 1) & 0xffff;

    s16(g, m, x);
    s16(g, m + 0x10, x);
    s8(g, m + 3, (g8(g, m + 3) - 1) & 0xff);
    s8(g, m + 0x13, (g8(g, m + 0x13) - 1) & 0xff);
    return 0;
}

function type0CheckWest(g: Uint8Array, m: number): number {
    let addr = (coordsToProxAddr(g, g8(g, m + 3), g8(g, m + 2)) - 1) & 0xffff;

    for (let i = 0; i < 4; i++) {
        if (isBlocking(g, g8(g, addr)) !== 0) return 1;
        addr += 36;
        addr = wrapMapFromAbove(addr);
    }

    addr--;
    addr -= 36;
    addr = wrapMapFromBelow(addr);

    let al = g8(g, addr);
    for (let i = 0; i < 4; i++) {
        addr -= 36;
        addr = wrapMapFromBelow(addr);
        al |= g8(g, addr);
    }

    return (al & 0x80) !== 0 ? 1 : 0;
}

// ─── Type 2: grounded horizontal mover (crab). ───

function type2Ai(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 0x30);

    if ((g8(g, m + 5) & 0x20) !== 0) {
        heroHitsMonster(g, m);
        return;
    }

    // Original continues only when downward movement is blocked.
    if (moveMonsterS(g, m) !== 0) return;

    if ((g8(g, m + 9) & 1) === 0) {
        const pr = proximity5(g, m);
        s8(g, m + 9, pr.carry ? 1 : 0);

        if (pr.value !== 0xff) {
            s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | pr.value) & 0xff);
        }

        const old = g8(g, m + 6);
        s8(g, m + 6, (old + 0x80) & 0xff);
        if ((old & 0x80) === 0) return;

        s8(g, m + 6, (g8(g, m + 6) + 1) & 7);

        if ((g8(g, m + 5) & 0x80) === 0) {
            if (moveMonsterW(g, m) === 0) {
                s8(g, m + 9, 0);
                s8(g, m + 5, g8(g, m + 5) ^ 0x80);
                return;
            }
            s8(g, m + 5, g8(g, m + 5) & 0x7f);
        } else {
            if (moveMonsterE(g, m) === 0) {
                s8(g, m + 9, 0);
                s8(g, m + 5, g8(g, m + 5) ^ 0x80);
                return;
            }
            s8(g, m + 5, (g8(g, m + 5) | 0x80) & 0xff);
        }
        return;
    }

    s8(g, m + 0x0a, (g8(g, m + 0x0a) - 1) & 0xff);
    if ((g8(g, m + 0x0a) & 3) === 0) {
        const pr = proximity5(g, m);
        s8(g, m + 9, pr.carry ? 1 : 0);
        if (pr.value !== 0xff) {
            s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | pr.value) & 0xff);
        }
    }

    s8(g, m + 6, (g8(g, m + 6) + 1) & 7);

    if ((g8(g, m + 5) & 0x80) === 0) {
        if (moveMonsterW(g, m) === 0) {
            s8(g, m + 9, 0);
            return;
        }
        s8(g, m + 5, g8(g, m + 5) & 0x7f);
    } else {
        if (moveMonsterE(g, m) === 0) {
            s8(g, m + 9, 0);
            return;
        }
        s8(g, m + 5, (g8(g, m + 5) | 0x80) & 0xff);
    }
}

// ─── Type 3: grounded walker with a short projectile attack (slime). ───

function type3Ai(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 0x40);

    if ((g8(g, m + 5) & 0x20) !== 0) {
        heroHitsMonster(g, m);
        return;
    }

    if (moveMonsterS(g, m) !== 0) return;

    if ((g8(g, m + 9) & 4) !== 0) {
        type3FireTick(g, m);
        return;
    }

    if ((g8(g, m + 9) & 1) === 0) {
        type3UpdateFacingAndMaybeFire(g, m);

        const old = g8(g, m + 6);
        s8(g, m + 6, (old + 0x80) & 0xff);
        if ((old & 0x80) === 0) return;

        if (type3AnimStep(g, m) !== 0) return;

        if ((getRandom(g) & 3) === 0) {
            s8(g, m + 9, 1);
            s8(g, m + 0x0a, 0);
        }
        return;
    }

    if ((g8(g, m + 9) & 2) !== 0) {
        s8(g, m + 9, g8(g, m + 9) & 0xfe);
        s8(g, m + 6, 0);
        return;
    }

    type3AnimStep(g, m);
    s8(g, m + 0x0a, (g8(g, m + 0x0a) + 1) & 0xff);
    if (g8(g, m + 0x0a) !== 8) return;

    s8(g, m + 9, (g8(g, m + 9) | 2) & 0xff);

    // The original computes/wraps a proximity-map address here but then
    // reads [DI] after XCHG DI,SI — the monster struct's first byte.
    // Preserve that observable instruction semantics rather than replacing
    // it with an inferred tile lookup.
    const probe = g8(g, m);

    if ((getRandom(g) & 0x80) === 0) { // (int8_t)get_random() >= 0
        if (isBlocking(g, probe) !== 0) moveMonsterE(g, m);
        else moveMonsterW(g, m);
    } else {
        if (isBlocking(g, probe) !== 0) moveMonsterW(g, m);
        else moveMonsterE(g, m);
    }
}

function type3UpdateFacingAndMaybeFire(g: Uint8Array, m: number): void {
    const pr = proximity5(g, m);
    if (pr.value === 0xff) return;

    s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | pr.value) & 0xff);

    if ((getRandom(g) & 7) === 0) {
        s8(g, m + 9, (g8(g, m + 9) | 4) & 0xff);
        s8(g, m + 0x0a, 0);
    }
}

function type3AnimStep(g: Uint8Array, m: number): number {
    let al = (g8(g, m + 6) + 1) & 0xff;
    if (al >= 3) al = 0;
    s8(g, m + 6, al);
    return al;
}

function type3FireTick(g: Uint8Array, m: number): void {
    s8(g, m + 6, 3);
    s8(g, m + 0x0a, (g8(g, m + 0x0a) + 1) & 0xff);
    if (g8(g, m + 0x0a) !== 3) return;

    s8(g, m + 6, 4);

    const x = g8(g, m + 3);
    const y = g8(g, m + 2) & 0x3f;

    type3ShotLeft[0] = x;
    type3ShotRight[0] = (x + 1) & 0xff;
    type3ShotLeft[1] = y;
    type3ShotRight[1] = y;

    addProjectileToArray(
        g,
        (g8(g, m + 5) & 0x80) !== 0 ? type3ShotRight : type3ShotLeft,
    );

    s8(g, m + 9, g8(g, m + 9) & 0xfb);
    s8(g, m + 9, (g8(g, m + 9) | 2) & 0xff);
    s8(g, m + 0x0a, 0);
}

// ─── Type 4: hovering seeker, structurally similar to EAI6 type 2. ───

function type4Ai(g: Uint8Array, m: number): void {
    if (g8(g, m + 8) === 0) s8(g, m + 8, 0x60);

    if ((g8(g, m + 5) & 0x20) !== 0) {
        heroHitsMonster(g, m);
        return;
    }

    s8(g, m + 6, (g8(g, m + 6) + 1) & 0xff);
    s8(g, m + 6, g8(g, m + 6) & 3);

    const oldTimer = g8(g, m + 0x0a);
    s8(g, m + 0x0a, (oldTimer + 0x80) & 0xff);
    if ((oldTimer & 0x80) === 0) return;

    const pr = proximity8(g, m);

    if (!pr.carry) {
        if ((g8(g, m + 9) & 0x70) === 0) {
            if (pr.value === 0xff) {
                const facing = ((getRandom(g) << 1) & 0x80) & 0xff;
                s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | facing) & 0xff);
            } else {
                s8(g, m + 5, ((g8(g, m + 5) & 0x7f) | pr.value) & 0xff);
            }
        }

        const dy = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff;
        if (((dy << 24) >> 24) < 0) moveMonsterN(g, m);
        else moveMonsterS(g, m);
    } else {
        const dy = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff;
        if (((dy << 24) >> 24) < 0) moveMonsterN(g, m);
        else moveMonsterS(g, m);
    }

    s8(g, m + 9, (g8(g, m + 9) + 0x10) & 0xff);
    const idx = ((g8(g, m + 9) >> 4) & 7) & 0xff;
    const table = (g8(g, m + 5) & 0x80) !== 0 ? TYPE4_DIR_RIGHT : TYPE4_DIR_LEFT;

    if (monsterMoveInDirection(g, m, table[idx] ?? 0) === 0) {
        s8(g, m + 5, g8(g, m + 5) ^ 0x80);
    }
}

// ─── Shared proximity/facing helpers. ───

// sub_A72B
function proximity8(g: Uint8Array, m: number): ProxResult8 {
    const dy = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff;
    const absDy = ((dy << 24) >> 24) < 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= 8) return { value: 0xff, distance: 0, carry: false };

    const al = (0x10 - g8(g, m + 3)) & 0xff;
    if (((al << 24) >> 24) >= 0) {
        const ah = al;
        const carry = (g8(g, m + 5) & 0x80) !== 0;
        return { value: 0x80, distance: ah, carry };
    }

    // Unlike sub_A75D, sub_A72B does not negate AL in this branch and does
    // not assign AH before returning. AH is irrelevant to all EAI8 callers.
    const carry = (g8(g, m + 5) & 0x80) === 0;
    return { value: 0x00, distance: 0, carry };
}

// sub_A75D
function proximity5(g: Uint8Array, m: number): ProxResult8 {
    const dy = (g8(g, HERO_Y) - g8(g, m + 2)) & 0xff;
    const absDy = ((dy << 24) >> 24) < 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= 5) return { value: 0xff, distance: 0, carry: false };

    let al = (0x11 - g8(g, m + 3)) & 0xff;
    if (((al << 24) >> 24) >= 0) {
        const ah = al;
        const carry = (g8(g, m + 5) & 0x80) !== 0;
        return { value: 0x80, distance: ah, carry };
    }

    al = (-al) & 0xff;
    const ah = al;
    const carry = (g8(g, m + 5) & 0x80) === 0;
    return { value: 0x00, distance: ah, carry };
}
