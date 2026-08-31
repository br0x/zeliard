/**
 * hud.ts — DOM HUD: hero stats (HP/gold/almas), equipment icons, boss bar.
 *
 * All game state lives in g_mem; this module only reads/writes the
 * relevant addresses and mirrors them into the DOM. Memory accessors and
 * asset paths are injected so tests can run headless.
 */

import {
    ADDR_BOSS_MODE, ADDR_BOSS_STATE_PTR, ADDR_HERO_HP, ADDR_HERO_MAX_HP,
    ADDR_HERO_GOLD_LO, ADDR_HERO_GOLD_HI, ADDR_HERO_ALMAS, ADDR_SWORD_TYPE,
    ADDR_SHIELD_TYPE, ADDR_SHIELD_HP, ADDR_CURR_SPELL_TYPE, ADDR_SPELL_COUNTS,
} from '../core/memory.js';

/** Minimal memory accessor surface used by the HUD. */
export interface HudMemoryAccess {
    readMemory(offset: number, length: number): Uint8Array | null;
    writeMemory(offset: number, data: ArrayLike<number>): void;
}

export interface HudIconPaths {
    sword: string[];
    shield: string[];
    magic: string[];
}

export interface HudOptions {
    mem: HudMemoryAccess;
    iconPaths: HudIconPaths;
    getBossName: () => string;
}

function readU16At(bytes: Uint8Array, offset: number): number {
    return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

/**
 * Mirrors the original normalize_health_to_100 (asm/gmmcga.asm):
 *   hp > 800 -> 100, otherwise -> hp >> 3 (integer truncation).
 * Max possible HP is 800 (which corresponds to 100% of the bar).
 */
export function normalizeHealthTo100(hp: number): number {
    return hp > 800 ? 100 : Math.floor(hp / 8);
}

interface IconRegistry {
    images: (HTMLImageElement | null)[];
    ready: boolean;
}

export class Hud {
    private readonly mem: HudMemoryAccess;
    private readonly iconPaths: HudIconPaths;
    private readonly getBossName: () => string;

    private lifeFillCurrentEl: HTMLElement | null = null;
    private lifeFillMaxEl: HTMLElement | null = null;

    private bossLifeFillCurrentEl: HTMLElement | null = null;
    private bossLifeFillMaxEl: HTMLElement | null = null;
    private bossMaxHP: number | null = null;

    private readonly swords: IconRegistry = { images: [], ready: false };
    private readonly shields: IconRegistry = { images: [], ready: false };
    private readonly magics: IconRegistry = { images: [], ready: false };

    constructor(opts: HudOptions) {
        this.mem = opts.mem;
        this.iconPaths = opts.iconPaths;
        this.getBossName = opts.getBossName;
    }

    // ── generic DOM helper ───────────────────────────────────────────────

    updateElementText(elementId: string, value: string | number | undefined): void {
        const el = document.getElementById(elementId);
        if (el && value !== undefined) el.textContent = String(value);
    }

    // ── place / boss-mode chrome ─────────────────────────────────────────

    resetBossHud(): void {
        this.mem.writeMemory(ADDR_BOSS_MODE, [0]);
        const bossLifeBar = document.getElementById('bossLifeBarContainer');
        if (bossLifeBar) bossLifeBar.classList.add('hidden');
        const placeName = document.getElementById('currentMapName');
        if (placeName) placeName.style.display = '';
        const placeLabel = document.getElementById('placeLabel');
        if (placeLabel) placeLabel.textContent = 'PLACE';
        const goldLabel = document.getElementById('goldLabel');
        if (goldLabel) { goldLabel.textContent = 'GOLD'; goldLabel.style.display = ''; }
        const goldValue = document.getElementById('gold');
        if (goldValue) goldValue.style.display = '';
    }

    updatePlaceHud(name: string, indoor = false): void {
        const placeRow = document.querySelector('.place-row');
        const placeLabel = document.getElementById('placeLabel');
        if (placeRow) placeRow.classList.toggle('indoor-place', indoor);
        if (placeLabel) placeLabel.textContent = indoor ? '' : 'PLACE';
        this.updateElementText('currentMapName', name);
    }

    renderBossName(): void {
        const name = this.getBossName();
        const label = document.getElementById('goldLabel');
        const value = document.getElementById('gold');
        if (label) label.textContent = '';
        if (value) value.textContent = name;
    }

    /** Forget cached boss max HP (call on dungeon entry). */
    resetBossMaxHp(): void {
        this.bossMaxHP = null;
    }

    // ── hero HP ──────────────────────────────────────────────────────────

    getHeroHp(): number {
        const hpBytes = this.mem.readMemory(ADDR_HERO_HP, 2);
        return hpBytes ? (hpBytes[0] ?? 0) | ((hpBytes[1] ?? 0) << 8) : 0;
    }

    setHeroHp(hp: number): void {
        const clamped = Math.max(0, Math.min(0xffff, hp));
        this.mem.writeMemory(ADDR_HERO_HP, [clamped & 0xff, (clamped >> 8) & 0xff]);
    }

    getHeroMaxHp(): number {
        const hpBytes = this.mem.readMemory(ADDR_HERO_MAX_HP, 2);
        return hpBytes ? (hpBytes[0] ?? 0) | ((hpBytes[1] ?? 0) << 8) : 0;
    }

    setHeroMaxHp(maxHp: number): void {
        const clamped = Math.max(0, Math.min(0xffff, maxHp));
        this.mem.writeMemory(ADDR_HERO_MAX_HP, [clamped & 0xff, (clamped >> 8) & 0xff]);
    }

    drawLifeBar(): void {
        if (!this.lifeFillCurrentEl) {
            this.lifeFillCurrentEl = document.querySelector('.life-fill-current');
            this.lifeFillMaxEl = document.querySelector('.life-fill-max');
        }
        this.setLife(this.getHeroHp(), this.getHeroMaxHp());
    }

    setLife(currentLife: number, maxLife: number): void {
        if (this.lifeFillCurrentEl && this.lifeFillMaxEl) {
            this.lifeFillMaxEl.style.width = normalizeHealthTo100(maxLife) + '%';
            this.lifeFillCurrentEl.style.width = normalizeHealthTo100(currentLife) + '%';
        }
    }

    drawBossHealth(): void {
        if (!this.bossLifeFillCurrentEl) {
            const container = document.getElementById('bossLifeBarContainer');
            if (!container) return;
            this.bossLifeFillCurrentEl = container.querySelector('.life-fill-current');
            this.bossLifeFillMaxEl = container.querySelector('.life-fill-max');
        }

        const memView = this.mem.readMemory(ADDR_BOSS_STATE_PTR, 2);
        if (!memView) return;
        const bossStatePtr = readU16At(memView, 0);
        const hpBytes = this.mem.readMemory(bossStatePtr + 3, 2);
        if (!hpBytes) return;
        const currHp = readU16At(hpBytes, 0);
        if (!this.bossMaxHP) {
            this.bossMaxHP = currHp;
        }
        if (this.bossLifeFillCurrentEl && this.bossLifeFillMaxEl) {
            this.bossLifeFillCurrentEl.style.width = normalizeHealthTo100(currHp) + '%';
            this.bossLifeFillMaxEl.style.width = normalizeHealthTo100(this.bossMaxHP) + '%';
        }
    }

    // ── gold / almas ─────────────────────────────────────────────────────

    getHeroGoldValue(): number {
        const lo = this.mem.readMemory(ADDR_HERO_GOLD_LO, 2);
        const hi = this.mem.readMemory(ADDR_HERO_GOLD_HI, 1);
        if (!lo || !hi) return 0;
        return ((lo[0] ?? 0) | ((lo[1] ?? 0) << 8)) + (hi[0] ?? 0) * 0x10000;
    }

    setHeroGoldValue(value: number): void {
        const clamped = Math.max(0, Math.min(0xffffff, value));
        this.mem.writeMemory(ADDR_HERO_GOLD_LO, [clamped & 0xff, (clamped >> 8) & 0xff]);
        this.mem.writeMemory(ADDR_HERO_GOLD_HI, [(clamped >> 16) & 0xff]);
    }

    renderGoldHud(): void {
        this.updateElementText('gold', this.getHeroGoldValue());
    }

    getHeroAlmasValue(): number {
        const almasBytes = this.mem.readMemory(ADDR_HERO_ALMAS, 2);
        return almasBytes ? (almasBytes[0] ?? 0) | ((almasBytes[1] ?? 0) << 8) : 0;
    }

    setHeroAlmasValue(value: number): void {
        const clamped = Math.max(0, Math.min(0xffff, value));
        this.mem.writeMemory(ADDR_HERO_ALMAS, [clamped & 0xff, (clamped >> 8) & 0xff]);
    }

    renderAlmasHud(): void {
        this.updateElementText('almas', this.getHeroAlmasValue());
    }

    // ── sword ────────────────────────────────────────────────────────────

    async loadSwordIcons(): Promise<(HTMLImageElement | null)[]> {
        return this.loadIcons(this.swords, this.iconPaths.sword);
    }

    getHeroSwordType(): number {
        const bytes = this.mem.readMemory(ADDR_SWORD_TYPE, 1);
        return bytes ? (bytes[0] ?? 0) : 0;
    }

    setHeroSwordType(type: number): void {
        this.mem.writeMemory(ADDR_SWORD_TYPE, [type]);
    }

    renderSwordHud(): void {
        const type = this.getHeroSwordType() - 1;
        const icon = document.getElementById('activeSwordIcon');
        if (icon) icon.setAttribute('src', type >= 0 && this.swords.images[type] ? this.swords.images[type]!.src : '');
    }

    // ── shield ───────────────────────────────────────────────────────────

    async loadShieldIcons(): Promise<(HTMLImageElement | null)[]> {
        return this.loadIcons(this.shields, this.iconPaths.shield);
    }

    getHeroShieldType(): number {
        const bytes = this.mem.readMemory(ADDR_SHIELD_TYPE, 1);
        return bytes ? (bytes[0] ?? 0) : 0;
    }

    setHeroShieldType(type: number): void {
        this.mem.writeMemory(ADDR_SHIELD_TYPE, [type]);
    }

    getHeroShieldHP(): number {
        const hpBytes = this.mem.readMemory(ADDR_SHIELD_HP, 2);
        return hpBytes ? (hpBytes[0] ?? 0) | ((hpBytes[1] ?? 0) << 8) : 0;
    }

    setHeroShieldHP(hp: number): void {
        this.mem.writeMemory(ADDR_SHIELD_HP, [hp & 0xff, (hp >> 8) & 0xff]);
    }

    renderShieldHud(): void {
        const type = this.getHeroShieldType() - 1;
        const icon = document.getElementById('activeShieldIcon');
        if (icon) icon.setAttribute('src', type >= 0 && this.shields.images[type] ? this.shields.images[type]!.src : '');
        this.updateElementText('shieldHp', type >= 0 ? this.getHeroShieldHP() : '');
    }

    // ── magic ────────────────────────────────────────────────────────────

    async loadMagicIcons(): Promise<(HTMLImageElement | null)[]> {
        return this.loadIcons(this.magics, this.iconPaths.magic);
    }

    getHeroMagicType(): number {
        const bytes = this.mem.readMemory(ADDR_CURR_SPELL_TYPE, 1);
        return bytes ? (bytes[0] ?? 0) : 0;
    }

    setHeroMagicType(type: number): void {
        this.mem.writeMemory(ADDR_CURR_SPELL_TYPE, [type]);
    }

    getHeroMagicCount(type: number): number {
        const idx = type - 1;
        if (idx < 0 || idx >= ADDR_SPELL_COUNTS.length) return 0;
        const bytes = this.mem.readMemory(ADDR_SPELL_COUNTS[idx]!, 1);
        return bytes ? (bytes[0] ?? 0) : 0;
    }

    setHeroMagicCount(type: number, count: number): void {
        const idx = type - 1;
        if (idx < 0 || idx >= ADDR_SPELL_COUNTS.length || count < 0 || count > 255) return;
        this.mem.writeMemory(ADDR_SPELL_COUNTS[idx]!, [count]);
    }

    renderMagicHud(): void {
        const type0 = this.getHeroMagicType() - 1;
        const icon = document.getElementById('activeSpellIcon');
        if (icon) icon.setAttribute('src', type0 >= 0 && this.magics.images[type0] ? this.magics.images[type0]!.src : '');
        this.updateElementText('spellCounter', type0 >= 0 ? this.getHeroMagicCount(type0 + 1) : '');
    }

    // ── icon loading ─────────────────────────────────────────────────────

    private async loadIcons(registry: IconRegistry, paths: string[]): Promise<(HTMLImageElement | null)[]> {
        if (registry.ready) return registry.images;
        const loads = paths.map((path, index) => {
            if (!path) return Promise.resolve(null);
            return new Promise<HTMLImageElement | null>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`Failed to load ${path}`));
                img.src = path;
            }).then((img) => { registry.images[index] = img; return img; });
        });
        await Promise.all(loads);
        registry.ready = true;
        return registry.images;
    }
}
