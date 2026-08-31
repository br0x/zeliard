// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest';
import { Hud, normalizeHealthTo100 } from '../src/ui/hud.js';
import { createLiveHeroState } from '../src/core/game-state.js';

/**
 * Fake g_mem: real byte buffer addressed exactly like the wasm-shared array,
 * so tests assert actual bytes written at actual addresses.
 */
function makeMem() {
    const buf = new Uint8Array(0x10000);
    const hero = createLiveHeroState(buf);
    return {
        buf,
        hero,
        readMemory: (offset: number, length: number) => buf.subarray(offset, offset + length),
        writeMemory: (offset: number, data: ArrayLike<number>) => {
            for (let i = 0; i < data.length; i++) buf[offset + i] = data[i] ?? 0;
        },
    };
}

const ICON_PATHS = {
    sword: ['s1.png', 's2.png'],
    shield: ['h1.png'],
    magic: ['m1.png', 'm2.png', 'm3.png'],
};

function makeHud(mem = makeMem(), getBossName = () => 'DRAGON') {
    const hud = new Hud({ hero: mem.hero, mem, iconPaths: ICON_PATHS, getBossName });
    return { hud, mem };
}

describe('normalizeHealthTo100 (asm parity)', () => {
    it('caps above 800 and truncates below', () => {
        expect(normalizeHealthTo100(801)).toBe(100);
        expect(normalizeHealthTo100(5000)).toBe(100);
    });

    it('mirrors hp >> 3 integer truncation at boundaries', () => {
        expect(normalizeHealthTo100(800)).toBe(100); // 800/8 = 100 exactly
        expect(normalizeHealthTo100(799)).toBe(99); // truncation, not rounding
        expect(normalizeHealthTo100(8)).toBe(1);
        expect(normalizeHealthTo100(7)).toBe(0);
        expect(normalizeHealthTo100(0)).toBe(0);
    });
});

describe('hero stat accessors', () => {
    it('round-trips HP through g_mem addresses', () => {
        const { hud, mem } = makeHud();
        hud.setHeroHp(300);
        expect(mem.buf[0x90]).toBe(300 & 0xff);
        expect(mem.buf[0x91]).toBe((300 >> 8) & 0xff);
        expect(hud.getHeroHp()).toBe(300);

        hud.setHeroMaxHp(800);
        expect(hud.getHeroMaxHp()).toBe(800);
    });

    it('clamps out-of-range values', () => {
        const { hud } = makeHud();
        hud.setHeroHp(-5);
        expect(hud.getHeroHp()).toBe(0);
        hud.setHeroHp(70000);
        expect(hud.getHeroHp()).toBe(0xffff);
    });

    it('composes gold from LO/HI bytes as lo + hi*0x10000', () => {
        const { hud, mem } = makeHud();
        mem.buf[0x86] = 0x34; // gold lo
        mem.buf[0x87] = 0x12; // gold mid
        mem.buf[0x85] = 0x01; // gold hi -> 0x011234
        expect(hud.getHeroGoldValue()).toBe(0x011234);

        hud.setHeroGoldValue(0xabcdef);
        expect(hud.getHeroGoldValue()).toBe(0xabcdef);
    });

    it('clamps gold to 24 bits', () => {
        const { hud } = makeHud();
        hud.setHeroGoldValue(0x1234567);
        expect(hud.getHeroGoldValue()).toBe(0xffffff);
        hud.setHeroGoldValue(-1);
        expect(hud.getHeroGoldValue()).toBe(0);
    });

    it('reads almas as a single word', () => {
        const { hud, mem } = makeHud();
        mem.buf[0x8b] = 0xcd;
        mem.buf[0x8c] = 0x01;
        expect(hud.getHeroAlmasValue()).toBe(0x01cd);
    });
});

describe('equipment and magic accessors', () => {
    it('sword/shield types are single bytes', () => {
        const { hud } = makeHud();
        hud.setHeroSwordType(3);
        hud.setHeroShieldType(2);
        expect(hud.getHeroSwordType()).toBe(3);
        expect(hud.getHeroShieldType()).toBe(2);
    });

    it('magic counts are per-spell bytes with range guards', () => {
        const { hud } = makeHud();
        hud.setHeroMagicCount(1, 9);
        hud.setHeroMagicCount(7, 4);
        expect(hud.getHeroMagicCount(1)).toBe(9);
        expect(hud.getHeroMagicCount(7)).toBe(4);

        // Out-of-range spell slots read 0 and ignore writes
        expect(hud.getHeroMagicCount(0)).toBe(0);
        expect(hud.getHeroMagicCount(8)).toBe(0);
        hud.setHeroMagicCount(0, 5); // must not throw / corrupt
        hud.setHeroMagicCount(2, 300); // clamped away

        hud.setHeroMagicCount(2, 255);
        expect(hud.getHeroMagicCount(2)).toBe(255);
    });

    it('shield HP is a word', () => {
        const { hud } = makeHud();
        hud.setHeroShieldHP(512);
        expect(hud.getHeroShieldHP()).toBe(512);
    });
});

describe('DOM HUD rendering', () => {
    beforeAll(() => {
        document.body.innerHTML = `
            <div class="place-row"><span id="placeLabel">PLACE</span><span id="currentMapName"></span></div>
            <span id="gold"></span><span id="almas"></span>
            <div id="bossLifeBarContainer">
                <div class="life-fill-max"></div><div class="life-fill-current"></div>
            </div>
            <img id="activeSwordIcon" /><span id="shieldHp"></span><span id="spellCounter"></span>
            <div class="life-fill-max"></div><div class="life-fill-current"></div>
        `;
    });

    it('setLife writes normalized percentage widths', () => {
        const { hud } = makeHud();
        // Element cache fills on first drawLifeBar(), like the legacy code.
        hud.drawLifeBar();
        hud.setLife(400, 800);
        const cur = document.querySelector<HTMLElement>('.life-fill-current')!;
        const max = document.querySelector<HTMLElement>('.life-fill-max')!;
        expect(cur.style.width).toBe('50%');
        expect(max.style.width).toBe('100%');
    });

    it('drawLifeBar pulls current values from g_mem', () => {
        const { hud, mem } = makeHud();
        mem.buf[0x90] = 200; // hp = 25%
        mem.buf[0xb2] = 0x20; mem.buf[0xb3] = 0x03; // max = 800
        hud.drawLifeBar();
        const cur = document.querySelector<HTMLElement>('.life-fill-current')!;
        expect(cur.style.width).toBe('25%');
    });

    it('updatePlaceHud toggles indoor mode and sets the map name', () => {
        const { hud } = makeHud();
        hud.updatePlaceHud('Dorado');
        const row = document.querySelector('.place-row')!;
        expect(row.classList.contains('indoor-place')).toBe(false);
        expect(document.getElementById('placeLabel')!.textContent).toBe('PLACE');
        expect(document.getElementById('currentMapName')!.textContent).toBe('Dorado');

        hud.updatePlaceHud('Bank', true);
        expect(row.classList.contains('indoor-place')).toBe(true);
        expect(document.getElementById('placeLabel')!.textContent).toBe('');
        expect(document.getElementById('currentMapName')!.textContent).toBe('Bank');
    });

    it('renderGoldHud mirrors the gold value into the DOM', () => {
        const { hud, mem } = makeHud();
        mem.buf[0x86] = 100;
        hud.renderGoldHud();
        expect(document.getElementById('gold')!.textContent).toBe('100');
    });

    it('renderSwordHud clears the icon for the no-sword slot', () => {
        const { hud, mem } = makeHud();
        mem.buf[0x92] = 0; // type 0 - 1 = -1 -> no sword
        hud.renderSwordHud();
        expect(document.getElementById('activeSwordIcon')!.getAttribute('src')).toBe('');
    });

    it('renderShieldHud hides HP counter when no shield equipped', () => {
        const { hud, mem } = makeHud();
        mem.buf[0x93] = 0;
        hud.renderShieldHud();
        expect(document.getElementById('shieldHp')!.textContent).toBe('');
    });

    it('renderMagicHud shows spell count for the equipped spell', () => {
        const { hud, mem } = makeHud();
        mem.buf[0x9d] = 2; // spell slot 2
        mem.buf[0xab + 1] = 6; // its count cell
        hud.renderMagicHud();
        expect(document.getElementById('spellCounter')!.textContent).toBe('6');
    });

    it('renderBossName swaps the gold label for the boss name', () => {
        const { hud } = makeHud();
        hud.renderBossName();
        expect(document.getElementById('gold')!.textContent).toBe('DRAGON');
    });
});
