/**
 * eai7.ts — TS port of src/eai7.c (Stage 9e): monster AI for five types,
 * selected by `flags & 0x0F`: 0=paired ranged monster, active/top slot
 * (HP 0x10; variable preferred firing distance), 1=passive twin slot,
 * 2=paired ranged monster patrolling viewport centre (HP 0x40),
 * 3=passive twin slot, 4=grounded patrol with ledge/wall trajectory
 * sequences (HP 8).
 *
 * Ported 1:1; carry conventions as in eai1.ts. Projectile descriptor
 * byte 2 is remapped from the original raw tile IDs 0x2f..0x32 to web
 * projectile array indices 0..3, in tile order (as in eai7.c).
 */

import {
    coordsToProxAddr,
    isBlocking,
    wrapMapFromAbove,
    wrapMapFromBelow,
    moveMonsterE,
    moveMonsterS,
    moveMonsterW,
    monsterMoveInDirection,
} from './dungeon-entities.js';
import {
    getRandom,
    heroHitsMonster,
    checkVerticalDistanceBetweenHeroAndMonster,
} from './dungeon-combat.js';
import { addProjectileToArray } from './dungeon-projectiles.js';
import { checkMonsterOnAggressiveGround } from './dungeon-monsters.js';
import { memRead8, memRead16, memWrite8, memWrite16 } from '../core/ts-memory.js';

// g_mem addresses
const HERO_Y = 0xff35;
const MAP_WIDTH_ADDR = 0xc002; // word



interface ProxResult {
    value: number;
    carry: boolean;
}

// Overlay-global preferred firing distances (byte_A491/byte_A492),
// shared among all type-0 instances.
let type0RightDistance = 8;
let type0LeftDistance = 8;

/** Test-only pin mirroring eai7.c's `eai7_set_distances` (via
 * `wasm_debug_set_eai7_distances` on the C side). */
export function setEai7Distances(right: number, left: number): void {
    type0RightDistance = right & 0xff;
    type0LeftDistance = left & 0xff;
}

// Type-4 trajectory tables (direction encoding:
// 0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE).
// The original two seven-byte ledge tables are adjacent. XLAT can legally
// use index 7 when ai_state bit 0x80 shifts the phase, thereby reading the
// first byte of the following table. The eighth entries encode that
// deliberate overlap without invoking out-of-bounds C behaviour.
const TYPE4_LEDGE_RIGHT = [1, 1, 0, 0, 0, 7, 7, 3]; // A8B1 + A8B8[0]
const TYPE4_LEDGE_LEFT = [3, 3, 4, 4, 4, 5, 5, 2]; // A8B8 + A8BF[0]
const TYPE4_WALL_RIGHT = [2, 1, 1, 0, 0, 7, 7, 6]; // byte_A8BF
const TYPE4_WALL_LEFT = [2, 3, 3, 4, 4, 5, 5, 6]; // byte_A8C7

// Projectile descriptors. Bytes 0 and 1 are patched with X/Y before firing.
const EAI7_PROJECTILE_2F = 0;
const EAI7_PROJECTILE_30 = 1;
const EAI7_PROJECTILE_31 = 2;
const EAI7_PROJECTILE_32 = 3;

const type0ShotRight = [0, 0, EAI7_PROJECTILE_30, 0, 0x14, 0, 0x28, 0, 0, 0, 0, 0, 0];
const type0ShotLeft = [0, 0, EAI7_PROJECTILE_2F, 0, 0x14, 4, 0x28, 0, 0, 0, 0, 0, 0];
const type2ShotRight = [0, 0, EAI7_PROJECTILE_32, 0, 0x14, 0, 0x28, 0, 0, 0, 0, 0, 0];
const type2ShotLeft = [0, 0, EAI7_PROJECTILE_31, 0, 0x14, 4, 0x28, 0, 0, 0, 0, 0, 0];

/** Monster_AI_7 (eai7.c:97). */
export function monsterAi7(g: Uint8Array, m: number): void {
    switch (memRead8(g, m + 4) & 0x0f) { // .flags
        case 0: type0Ai(g, m); return;
        case 1: passiveTwinAi(g, m); return;
        case 2: type2Ai(g, m); return;
        case 3: passiveTwinAi(g, m); return;
        case 4: type4Ai(g, m); return;
        default: return; // five-entry jump table
    }
}

function passiveTwinAi(_g: Uint8Array, _m: number): void {
}

// loc_A5F5 / loc_A71E: normalize a hit on a paired sprite and propagate
// the active hit/death bits to its passive twin before common combat.
function pairedHitReaction(g: Uint8Array, m: number): void {
    let al = memRead8(g, m + 0x15); // twin.ai_flags
    al = ((al & 0xbf) | 0x20) & 0xff;
    memWrite8(g, m + 5, al); // active.ai_flags
    memWrite8(g, m + 0x15, (al | 0x60) & 0xff);
    heroHitsMonster(g, m);
}

// loc_A47A / loc_A732: mirror animation and facing into the twin.
function pairedSync(g: Uint8Array, m: number): void {
    memWrite8(g, m + 0x16, memRead8(g, m + 6)); // twin.anim_counter
    memWrite8(
        g,
        m + 0x15,
        ((memRead8(g, m + 0x15) & 0x7f) | (memRead8(g, m + 5) & 0x80)) & 0xff,
    );
}

// sub_A59D: 1 = grounded (incl. proximity-map edges), 0 = both halves
// moved down one row.
function pairedTryFall(g: Uint8Array, m: number): number {
    if (memRead8(g, m + 3) === 0 || memRead8(g, m + 3) === 0x23) return 1;
    if (pairedHasGroundBelow(g, m) !== 0) return 1;

    memWrite8(g, m + 2, (memRead8(g, m + 2) + 1) & 0x3f);
    memWrite8(g, m + 0x12, (memRead8(g, m + 0x12) + 1) & 0x3f);
    return 0;
}

// sub_A5C3: the two tiles four rows below the pair.
function pairedHasGroundBelow(g: Uint8Array, m: number): number {
    let addr = coordsToProxAddr(g, memRead8(g, m + 3), memRead8(g, m + 2));
    addr = (addr + 0x90) & 0xffff; // four rows in a 36-column map
    addr = wrapMapFromAbove(addr);

    if (isBlocking(g, memRead8(g, addr)) !== 0 || isBlocking(g, memRead8(g, addr + 1)) !== 0) return 1;

    return ((memRead8(g, addr) | memRead8(g, addr + 1)) & 0x80) !== 0 ? 1 : 0;
}

// sub_A493: 1 = blocked, 0 = both halves moved east.
function pairedMoveEast(g: Uint8Array, m: number): number {
    if (memRead8(g, m + 3) >= 0x22) return 1;
    if (pairedWallOrLedgeEast(g, m) !== 0) return 1;

    let x = (memRead16(g, m) + 1) & 0xffff;
    if (x === memRead16(g, MAP_WIDTH_ADDR)) x = 0;

    memWrite16(g, m, x);
    memWrite16(g, m + 0x10, x);
    memWrite8(g, m + 3, (memRead8(g, m + 3) + 1) & 0xff);
    memWrite8(g, m + 0x13, (memRead8(g, m + 0x13) + 1) & 0xff);
    return 0;
}

// sub_A4B9: four-tile wall scan, then a five-tile ledge/attribute scan.
function pairedWallOrLedgeEast(g: Uint8Array, m: number): number {
    let addr = (coordsToProxAddr(g, memRead8(g, m + 3), memRead8(g, m + 2)) + 2) & 0xffff;

    for (let i = 0; i < 4; i++) {
        if (isBlocking(g, memRead8(g, addr)) !== 0) return 1;
        addr = (addr + 0x24) & 0xffff;
        addr = wrapMapFromAbove(addr);
    }

    let combined = 0;
    for (let i = 0; i < 5; i++) {
        addr = (addr - 0x24) & 0xffff;
        addr = wrapMapFromBelow(addr);
        combined |= memRead8(g, addr);
    }
    return (combined & 0x80) !== 0 ? 1 : 0;
}

// sub_A518: 1 = blocked, 0 = both halves moved west.
function pairedMoveWest(g: Uint8Array, m: number): number {
    if (memRead8(g, m + 3) < 2) return 1;
    if (pairedWallOrLedgeWest(g, m) !== 0) return 1;

    let x = (memRead16(g, m) - 1) & 0xffff;
    if (x === 0xffff) x = (memRead16(g, MAP_WIDTH_ADDR) - 1) & 0xffff;

    memWrite16(g, m, x);
    memWrite16(g, m + 0x10, x);
    memWrite8(g, m + 3, (memRead8(g, m + 3) - 1) & 0xff);
    memWrite8(g, m + 0x13, (memRead8(g, m + 0x13) - 1) & 0xff);
    return 0;
}

// sub_A53E: west-facing mirror of sub_A4B9.
function pairedWallOrLedgeWest(g: Uint8Array, m: number): number {
    let addr = (coordsToProxAddr(g, memRead8(g, m + 3), memRead8(g, m + 2)) - 1) & 0xffff;

    for (let i = 0; i < 4; i++) {
        if (isBlocking(g, memRead8(g, addr)) !== 0) return 1;
        addr = (addr + 0x24) & 0xffff;
        addr = wrapMapFromAbove(addr);
    }

    addr -= 1;
    let combined = 0;
    for (let i = 0; i < 5; i++) {
        addr = (addr - 0x24) & 0xffff;
        addr = wrapMapFromBelow(addr);
        combined |= memRead8(g, addr);
    }
    return (combined & 0x80) !== 0 ? 1 : 0;
}

function proximityAndFacing(g: Uint8Array, m: number, maxDistance: number): ProxResult {
    const dy = (memRead8(g, HERO_Y) - memRead8(g, m + 2)) & 0xff;
    const absDy = (dy & 0x80) !== 0 ? (-((dy << 24) >> 24)) & 0xff : dy;

    if (absDy >= maxDistance) {
        return { value: 0xff, carry: false };
    }

    if (memRead8(g, m + 3) < 0x11) {
        return { value: 0x80, carry: (memRead8(g, m + 5) & 0x80) !== 0 };
    }

    return { value: 0, carry: (memRead8(g, m + 5) & 0x80) === 0 };
}

// sub_A609
function proximityAndFacing5(g: Uint8Array, m: number): ProxResult {
    return proximityAndFacing(g, m, 5);
}

// sub_A882
function proximityAndFacing6(g: Uint8Array, m: number): ProxResult {
    return proximityAndFacing(g, m, 6);
}

// ─── Type 0: paired ranged monster with variable preferred distance. ───

function type0Ai(g: Uint8Array, m: number): void {
    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 0x10);

    if ((memRead8(g, m + 5) & 0x20) !== 0 || (memRead8(g, m + 0x15) & 0x40) !== 0) {
        pairedHitReaction(g, m);
        return;
    }

    if (pairedTryFall(g, m) === 0) return;

    if ((memRead8(g, m + 9) & 1) !== 0) {
        type0AttackTick(g, m);
        return;
    }

    const pr = proximityAndFacing5(g, m);
    if (!pr.carry) {
        if (pr.value !== 0xff) memWrite8(g, m + 5, memRead8(g, m + 5) ^ 0x80);
        type0Wander(g, m);
        return;
    }

    // Face toward the hero by horizontal position. At x_rel == 17 the
    // original chooses right-facing.
    memWrite8(g, m + 5, memRead8(g, m + 5) & 0x7f);
    if (memRead8(g, m + 3) <= 0x11) memWrite8(g, m + 5, (memRead8(g, m + 5) | 0x80) & 0xff);

    let blocked: number;

    if ((memRead8(g, m + 5) & 0x80) !== 0) {
        const distance = (0x11 - memRead8(g, m + 3)) & 0xff;
        const preferred = type0RightDistance;

        if (distance === preferred) {
            type0PrepareAttack(g, m, 1);
            return;
        }

        if (distance < preferred) {
            blocked = pairedMoveWest(g, m); // back away from hero
            if (blocked !== 0) {
                if ((getRandom(g) & 1) !== 0) return; // bypasses twin sync
                type0PrepareAttack(g, m, 3);
                return;
            }
            memWrite8(g, m + 6, (memRead8(g, m + 6) - 1) & 3);
            pairedSync(g, m);
            return;
        }

        blocked = pairedMoveEast(g, m); // close distance
    } else {
        const distance = (memRead8(g, m + 3) - 0x11) & 0xff;
        const preferred = type0LeftDistance;

        if (distance === preferred) {
            type0PrepareAttack(g, m, 1);
            return;
        }

        if (distance < preferred) {
            blocked = pairedMoveEast(g, m); // back away from hero
            if (blocked !== 0) {
                if ((getRandom(g) & 1) !== 0) return; // bypasses twin sync
                type0PrepareAttack(g, m, 3);
                return;
            }
            memWrite8(g, m + 6, (memRead8(g, m + 6) - 1) & 3);
            pairedSync(g, m);
            return;
        }

        blocked = pairedMoveWest(g, m); // close distance
    }

    if (blocked !== 0) {
        type0PrepareAttack(g, m, 1);
        return;
    }

    memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 3);
    pairedSync(g, m);
}

// loc_A342: half-rate wandering when the hero is not lined up.
function type0Wander(g: Uint8Array, m: number): void {
    const sum = memRead8(g, m + 6) + 0x80;
    memWrite8(g, m + 6, sum & 0xff);

    if (sum >= 0x100) {
        memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 3);

        if ((memRead8(g, m + 5) & 0x80) !== 0) {
            if (pairedMoveEast(g, m) !== 0) memWrite8(g, m + 5, memRead8(g, m + 5) & 0x7f);
        } else {
            if (pairedMoveWest(g, m) !== 0) memWrite8(g, m + 5, (memRead8(g, m + 5) | 0x80) & 0xff);
        }
    }

    pairedSync(g, m);
}

// loc_A3DF / loc_A40A setup. stateBits is 1 for the normal firing state
// and 3 for the blocked-retreat variant; both execute the same animation,
// but the original preserves the otherwise-unused bit 1 until the attack
// ends.
function type0PrepareAttack(g: Uint8Array, m: number, stateBits: number): void {
    if (stateBits === 1) {
        type0RightDistance = (getRandom(g) & 3) + 7;
        type0LeftDistance = (getRandom(g) & 3) + 7;

        if (!proximityAndFacing5(g, m).carry) {
            pairedSync(g, m);
            return;
        }
    }

    memWrite8(g, m + 9, (memRead8(g, m + 9) | stateBits) & 0xff);
    memWrite8(g, m + 6, 4);
    pairedSync(g, m);
}

// loc_A41E: unthrottled attack animation; fire on frame 6, finish on 8.
function type0AttackTick(g: Uint8Array, m: number): void {
    memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 0xff);

    if (memRead8(g, m + 6) === 6) {
        type0Fire(g, m);
    } else if (memRead8(g, m + 6) === 8) {
        memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfc);
        memWrite8(g, m + 6, 0);
    }

    pairedSync(g, m);
}

function type0Fire(g: Uint8Array, m: number): void {
    const x = memRead8(g, m + 3);
    const y = (memRead8(g, m + 2) + 1) & 0xff;

    type0ShotLeft[0] = x;
    type0ShotRight[0] = (x + 1) & 0xff;
    type0ShotLeft[1] = y;
    type0ShotRight[1] = y;

    addProjectileToArray(
        g,
        (memRead8(g, m + 5) & 0x80) !== 0 ? type0ShotRight : type0ShotLeft,
    );
}

// ─── Type 2: paired ranged monster that patrols around centre. ───

function type2Ai(g: Uint8Array, m: number): void {
    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 0x40);

    if ((memRead8(g, m + 5) & 0x20) !== 0) {
        pairedHitReaction(g, m);
        return;
    }

    memWrite8(g, m + 0x15, memRead8(g, m + 0x15) & 0xbf);

    if (pairedTryFall(g, m) === 0) return;

    if ((memRead8(g, m + 9) & 1) !== 0) {
        type2AttackTick(g, m);
        return;
    }

    const pr = proximityAndFacing5(g, m);
    if (
        pr.carry &&
        (getRandom(g) & 0xc0) === 0 &&
        (memRead8(g, m + 6) & 1) !== 0
    ) {
        memWrite8(g, m + 9, (memRead8(g, m + 9) | 1) & 0xff);
        memWrite8(g, m + 6, 4);
        pairedSync(g, m);
        return;
    }

    type2Wander(g, m);
}

// loc_A661: half-rate animation and movement every other phase.
function type2Wander(g: Uint8Array, m: number): void {
    const sum = memRead8(g, m + 6) + 0x80;
    memWrite8(g, m + 6, sum & 0xff);

    if (sum >= 0x100) {
        memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 3);

        if ((memRead8(g, m + 6) & 1) === 0) {
            if (memRead8(g, m + 3) > 0x10) {
                if (pairedMoveWest(g, m) === 0) memWrite8(g, m + 5, memRead8(g, m + 5) & 0x7f);
            } else {
                if (pairedMoveEast(g, m) === 0) memWrite8(g, m + 5, (memRead8(g, m + 5) | 0x80) & 0xff);
            }
        }
    }

    pairedSync(g, m);
}

// loc_A6BB: throttled firing animation.
function type2AttackTick(g: Uint8Array, m: number): void {
    const sum = memRead8(g, m + 6) + 0x80;
    memWrite8(g, m + 6, sum & 0xff);

    if (sum >= 0x100) {
        memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 0xff);
        const phase = memRead8(g, m + 6) & 7;

        if (phase === 6) {
            type2Fire(g, m);
        } else if (phase === 0) {
            memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfe);
            memWrite8(g, m + 6, 3);
        }
    }

    pairedSync(g, m);
}

function type2Fire(g: Uint8Array, m: number): void {
    const x = memRead8(g, m + 3);
    const y = (memRead8(g, m + 2) + 1) & 0xff;

    type2ShotLeft[0] = x;
    type2ShotRight[0] = (x + 1) & 0xff;
    type2ShotLeft[1] = y;
    type2ShotRight[1] = y;

    addProjectileToArray(
        g,
        (memRead8(g, m + 5) & 0x80) !== 0 ? type2ShotRight : type2ShotLeft,
    );
}

// ─── Type 4: grounded patrol with ledge/wall trajectories. ───

function type4Ai(g: Uint8Array, m: number): void {
    if (checkMonsterOnAggressiveGround(g, m) === 0) {
        checkVerticalDistanceBetweenHeroAndMonster(g, m);
        return;
    }

    if (memRead8(g, m + 8) === 0) memWrite8(g, m + 8, 8);

    if ((memRead8(g, m + 5) & 0x20) !== 0) {
        heroHitsMonster(g, m);
        return;
    }

    if ((memRead8(g, m + 9) & 0x18) !== 0) {
        type4TrajectoryStep(g, m);
        return;
    }

    // Ground logic runs when move_monster_S reports a blocked downward
    // step; a successful fall consumes the frame.
    if (moveMonsterS(g, m) !== 0) return;

    type4GroundStep(g, m);
}

function type4GroundStep(g: Uint8Array, m: number): void {
    if ((memRead8(g, m + 9) & 2) === 0) {
        const pr = proximityAndFacing6(g, m);
        if (!pr.carry && pr.value !== 0xff) {
            memWrite8(g, m + 5, ((memRead8(g, m + 5) & 0x7f) | pr.value) & 0xff);
            memWrite8(g, m + 9, (memRead8(g, m + 9) | 2) & 0xff);
            return;
        }
    }

    // Probe two rows down and one column toward the current facing. A
    // clear tile starts the ledge trajectory (state bit 0x08).
    let probe = coordsToProxAddr(g, memRead8(g, m + 3), memRead8(g, m + 2));
    probe = (probe + 0x48 + ((memRead8(g, m + 5) & 0x80) !== 0 ? 1 : 0)) & 0xffff;
    probe = wrapMapFromAbove(probe);

    if (isBlocking(g, memRead8(g, probe)) === 0) {
        memWrite8(g, m + 6, 0);
        memWrite8(g, m + 9, (memRead8(g, m + 9) | 8) & 0xff);
        return;
    }

    memWrite8(g, m + 6, (memRead8(g, m + 6) + 1) & 3);

    if ((memRead8(g, m + 9) & 2) === 0) {
        const sum = memRead8(g, m + 0x0a) + 0x10;
        memWrite8(g, m + 0x0a, sum & 0xff);
        if (sum >= 0x100) {
            memWrite8(g, m + 9, memRead8(g, m + 9) ^ 0x80);
            return;
        }
    }

    if (proximityAndFacing6(g, m).carry) {
        memWrite8(g, m + 9, memRead8(g, m + 9) & 0xfd);
    }

    if ((memRead8(g, m + 5) & 0x80) !== 0) {
        moveMonsterE(g, m);
        if (moveMonsterE(g, m) !== 0) return;
    } else {
        moveMonsterW(g, m);
        if (moveMonsterW(g, m) !== 0) return;
    }

    memWrite8(g, m + 6, 0);
    memWrite8(g, m + 9, (memRead8(g, m + 9) | 0x10) & 0xff);
}

// loc_A818: execute one step from one of four direction tables. State
// bits 5..7 form the table phase; adding 0x20 advances that phase exactly
// as in the byte-sized assembly state variable.
function type4TrajectoryStep(g: Uint8Array, m: number): void {
    memWrite8(g, m + 9, (memRead8(g, m + 9) + 0x20) & 0xff);

    if ((memRead8(g, m + 9) & 0x20) === 0) {
        const oldAnim = memRead8(g, m + 6);
        const low = (oldAnim + 1) & 3;

        if (low === 0) {
            memWrite8(g, m + 9, 0);
            memWrite8(g, m + 6, 3);
            moveMonsterS(g, m); // result unused
            return;
        }

        memWrite8(g, m + 6, ((oldAnim & 0xf0) | low) & 0xff);
    }

    const index = ((((memRead8(g, m + 9) >> 5) & 7) - 1) & 7) & 0xff;
    let table: readonly number[];

    if ((memRead8(g, m + 5) & 0x80) !== 0) {
        table = (memRead8(g, m + 9) & 0x10) !== 0 ? TYPE4_WALL_RIGHT : TYPE4_LEDGE_RIGHT;
    } else {
        table = (memRead8(g, m + 9) & 0x10) !== 0 ? TYPE4_WALL_LEFT : TYPE4_LEDGE_LEFT;
    }

    if (monsterMoveInDirection(g, m, table[index] ?? 0) === 0) {
        memWrite8(g, m + 9, 0);
        if (memRead8(g, m + 6) === 0) return;
        memWrite8(g, m + 6, 3);
    }
}
