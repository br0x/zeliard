/**
 * explosion-ring.ts — boss death explosion ring sprites.
 *
 * Ring pixel data decoded from C gfmcga.c: each phase is 16×16 pixels,
 * 2 bits/pixel (0=transparent, 1/2=inner color, 3=outer color). Phases are
 * ordered as in C boss_explosion_ring_phases[]: index 0 = most decayed …
 * index 3 = most intact. Canvases are pre-rendered per (variant, phase,
 * scale) and cached.
 *
 * Extracted from game.js (Stage 2); the memory-list spawn/draw logic stays
 * in game.js.
 */

export const RING_PHASES = 4;

/**
 * Decoded phase bitmaps: one flat Uint8Array of 16×16 = 256 palette values
 * (0–3) per phase. Values: 0 transparent, 1/2 inner color, 3 outer color.
 */
export const BOSS_EXPLOSION_RING_DATA: readonly Uint8Array[] = (() => {
    const raw: number[][] = [
        // Reordered to match C boss_explosion_ring_phases indexing:
        //   frame/life=0 → index 0 (most decayed), frame/life=3 → index 3 (most intact)
        // phase 3 – most decayed (C: boss_explosion_ring_phases[0])
        [0b0000000000101111, 0b1111010000000000, 0b0000000101111111, 0b1111111010000000,
            0b0000011111010000, 0b0000101111100000, 0b0000111100000000, 0b0000000011110000,
            0b0011110000000000, 0b0000000000111100, 0b0111100000000000, 0b0000000000011110,
            0b0111000000000000, 0b0000000000001110, 0b1111000000000000, 0b0000000000001111,
            0b1111000000000000, 0b0000000000001111, 0b0111000000000000, 0b0000000000001110,
            0b0111100000000000, 0b0000000000011110, 0b0011110000000000, 0b0000000000111100,
            0b0000111100000000, 0b0000000011110000, 0b0000011111010000, 0b0000101111100000,
            0b0000000101111111, 0b1111111010000000, 0b0000000000101111, 0b1111010000000000],
        // phase 2 (C: boss_explosion_ring_phases[1])
        [0b0000000000101111, 0b1111010000000000, 0b0000000101111111, 0b1111111010000000,
            0b0000011111111111, 0b1111111111100000, 0b0000111111111111, 0b1111111111110000,
            0b0011111111110100, 0b0010111111111100, 0b0111111110100000, 0b0000010111111110,
            0b0111111110000000, 0b0000000111111110, 0b1111111100000000, 0b0000000011111111,
            0b1111111100000000, 0b0000000011111111, 0b0111111110000000, 0b0000000111111110,
            0b0111111110100000, 0b0000010111111110, 0b0011111111110100, 0b0010111111111100,
            0b0000111111111111, 0b1111111111110000, 0b0000011111111111, 0b1111111111100000,
            0b0000000101111111, 0b1111111010000000, 0b0000000000101111, 0b1111010000000000],
        // phase 1 (C: boss_explosion_ring_phases[2])
        [0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
            0b0000000000101111, 0b1111010000000000, 0b0000000011111111, 0b1111111100000000,
            0b0000001111111111, 0b1111111111000000, 0b0000011111111111, 0b1111111111100000,
            0b0000111111111010, 0b0101111111110000, 0b0000111111110000, 0b0000111111110000,
            0b0000111111110000, 0b0000111111110000, 0b0000111111111010, 0b0101111111110000,
            0b0000011111111111, 0b1111111111100000, 0b0000001111111111, 0b1111111111000000,
            0b0000000011111111, 0b1111111100000000, 0b0000000000101111, 0b1111010000000000,
            0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000],
        // phase 0 – most intact (C: boss_explosion_ring_phases[3])
        [0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
            0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
            0b0000000000001011, 0b1101000000000000, 0b0000000001011111, 0b1111101000000000,
            0b0000000001111111, 0b1111111000000000, 0b0000000011111111, 0b1111111100000000,
            0b0000000011111111, 0b1111111100000000, 0b0000000001111111, 0b1111111000000000,
            0b0000000001011111, 0b1111101000000000, 0b0000000000001011, 0b1101000000000000,
            0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000,
            0b0000000000000000, 0b0000000000000000, 0b0000000000000000, 0b0000000000000000],
    ];
    // Decode each phase into a flat Uint8Array of 256 pixel values (0–3)
    return raw.map((words) => {
        const px = new Uint8Array(256);
        for (let i = 0; i < 32; i++) {
            let w = words[i]!;
            for (let j = 0; j < 8; j++) {
                px[i * 8 + j] = (w >> 14) & 3;
                w <<= 2;
            }
        }
        return px;
    });
})();

/**
 * Color tables for each mask variant: RGB derived from the original VGA
 * palette index pairs in boss_explosion_mask_variants.
 */
export const BOSS_EXPLOSION_COLORS: ReadonlyArray<{ inner: [number, number, number]; outer: [number, number, number] }> = [
    { inner: [125, 0, 0], outer: [251, 0, 0] },     // red
    { inner: [125, 125, 0], outer: [251, 251, 0] }, // yellow
    { inner: [125, 0, 125], outer: [251, 0, 251] }, // magenta
    { inner: [125, 125, 0], outer: [251, 251, 0] }, // yellow
];

/** Minimal canvas surface used to pre-render a ring (injectable for tests). */
export interface RingSurface {
    width: number;
    height: number;
    getContext(kind: '2d'): {
        createImageData(w: number, h: number): { data: Uint8ClampedArray };
        putImageData(img: unknown, dx: number, dy: number): void;
    } | null;
}

export interface RingDocument {
    createElement(tag: 'canvas'): RingSurface;
}

const ringCache = new Map<string, unknown>();

/** Build (or fetch from cache) the pre-rendered ring canvas. */
export function getExplosionRingCanvas(
    variant: number,
    phase: number,
    scale: number,
    doc: RingDocument = document,
): unknown {
    const key = `${variant}_${phase}_${scale}`;
    if (ringCache.has(key)) return ringCache.get(key);

    const size = 16 * scale;
    const c = doc.createElement('canvas');
    c.width = size;
    c.height = size;
    const cx = c.getContext('2d')!;
    const img = cx.createImageData(size, size);
    const d = img.data;

    const colors = BOSS_EXPLOSION_COLORS[variant]!;
    const pixels = BOSS_EXPLOSION_RING_DATA[phase]!; // 256 values

    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const pv = pixels[y * 16 + x];
            if (pv === 0) continue;
            const rgb = pv === 3 ? colors.outer : colors.inner;
            for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                    const di = ((y * scale + sy) * size + (x * scale + sx)) * 4;
                    d[di] = rgb[0];
                    d[di + 1] = rgb[1];
                    d[di + 2] = rgb[2];
                    d[di + 3] = 255;
                }
            }
        }
    }
    cx.putImageData(img, 0, 0);
    ringCache.set(key, c);
    return c;
}
