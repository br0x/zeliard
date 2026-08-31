const SHEETS = {
    magics: { path: 'assets/images/magics.png', frameW: 48, frameH: 48 },
    wearables: { path: 'assets/images/wearables.png', frameW: 48, frameH: 48 },
    magic_items: { path: 'assets/images/magic_items.png', frameW: 48, frameH: 48 },
    no_use: { path: 'assets/images/no_use.png', frameW: 48, frameH: 48 },
    keys: { path: 'assets/images/keys.png', frameW: 48, frameH: 48 },
    crests: { path: 'assets/images/crests.png', frameW: 48, frameH: 48 },
    shields: { path: 'assets/images/shields.png', frameW: 48, frameH: 48 },
    swords: { path: 'assets/images/swords.png', frameW: 60, frameH: 54 },
};

export const SPELL_NAMES = ['Espada', 'Saeta', 'Fuego', 'Lanzar', 'Rascar', 'Agua', 'Guerra'];

export const WEARABLE_NAMES = [
    null,
    'Feruza shoes',
    'Pirika shoes',
    'Silkarn shoes',
    'Ruzeria shoes',
    'Asbestos cape',
];

export const ITEM_NAMES = [
    null,
    'Ken\'ko Potion',
    'Juu-en Fruit',
    'Elixir of Kashi',
    'Chikara Powder',
    'Magia Stone',
    'Holy Water of Acero',
    'Sabre Oil',
    'Kioku feather',
];

export const ITEM_USE_TEXT = [
    null,
    'a Ken\'ko Potion.',
    'a Juu-en Fruit.',
    'an Elixir of Kashi.',
    'some Chikara Powder.',
    '         a Magia Stone.',
    'some Holy Water of Acero.',
    'some Sabre Oil.',
    'a Kioku feather.',
];

export const SWORD_NAMES = [
    ['Training', 'Sword'],
    ['Wise man\'s', 'Sword'],
    ['Spirit', 'Sword'],
    ['Knight\'s', 'Sword'],
    ['Illumination', 'Sword'],
    ['Enchantment', 'Sword'],
];

export const SHIELD_NAMES = [
    ['Clay', 'Shield'],
    ['Wise Man\'s', 'Shield'],
    ['Stone', 'Shield'],
    ['Honor', 'Shield'],
    ['Light', 'Shield'],
    ['Titanium', 'Shield'],
];

import {
    ADDR_SWORD_TYPE, ADDR_SHIELD_TYPE, ADDR_SHIELD_HP, ADDR_SHIELD_MAX_HP,
    ADDR_KEYS_AMOUNT, ADDR_LION_KEYS_AMOUNT, ADDR_ELF_CREST, ADDR_CREST_OF_GLORY,
    ADDR_HERO_CREST, ADDR_CURR_SPELL_TYPE, ADDR_CURRENT_ACCESSORY, ADDR_FERUZA_SHOES,
    ADDR_MAGIC_ITEMS, ADDR_SPELLS_ACTIVE, ADDR_HERO_HP, ADDR_HERO_MAX_HP,
    ADDR_SPELLS_INVENTORY, ADDR_ESPADA_ACTIVE, ADDR_SWORD_ENCHANTMENT_LEVEL,
    ADDR_HEALTH_BAR_REQUEST, ADDR_MAGIA_STONE_SPRITE0, ADDR_MAGIA_STONE_SPRITE1,
    ADDR_MAGIA_STONE_SPRITE2, ADDR_MAGIA_STONE_SPRITE3, ADDR_HERO_LEVEL, ADDR_HERO_XP,
    ADDR_HERO_ALMAS,
} from '../core/memory.js';

export const SHIELD_HP_VALUES = [0x50, 0x5A, 0x64, 0x6E, 0x73, 0x78];
//        Level:   0   1   2   3    4    5    6    7    8    9    10    11    12    13    14    15
export const XP_TABLE = [50,150,300,420,1000,1500,3000,5000,6000,8000,10000,15000,20000,40000,50000,60000];

export interface InventoryDeps {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    readMemory: ((offset: number, length: number) => Uint8Array | null) | null;
    writeMemory: ((offset: number, data: Uint8Array) => void) | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- legacy SoundManager
    soundManager?: any;
    onExit?: (() => void) | null;
}

interface SheetCfg { path: string; frameW: number; frameH: number }
interface LoadedSheet { img: HTMLImageElement; cfg: SheetCfg; count: number }

export interface InventoryData {
    spells: number[];
    spellCounts: number[];
    spellMaxCounts: number[];
    wearables: number[];
    currentAccessory: number;
    items: number[];
    swordType: number;
    shieldType: number;
    shieldHP: number;
    shieldMaxHP: number;
    keys: number;
    lionKeys: number;
    elfCrest: boolean;
    gloryCrest: boolean;
    heroCrest: boolean;
    currentSpell: number;
    enchantCount: number;
    heroHP: number;
    heroMaxHP: number;
    level: number;
    heroXP: number;
    almas: number;
}

export class InventoryScreen {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly readMemory: InventoryDeps['readMemory'];
    private readonly writeMemory: InventoryDeps['writeMemory'];
    private readonly soundManager: InventoryDeps['soundManager'];
    private readonly onExit: InventoryDeps['onExit'];

    active = false;
    currentTab = 0;
    selectedIndices: number[] = [0, 0, 0];
    private savedMusicTrack: unknown = null;

    private sheets: Record<string, LoadedSheet> = {};
    private sheetsReady = false;
    private sheetsLoading = false;

    usageMessage = '';
    usageTimer = 0;

    debugPopup = false;
    private _debugS = false;
    private _debugE = false;

    private _lastNavSound = 0;

    /** game-state snapshot read from g_mem on enter() */
    data!: InventoryData;

    constructor(deps: InventoryDeps) {
        this.canvas = deps.canvas;
        this.ctx = deps.ctx;
        this.readMemory = deps.readMemory;
        this.writeMemory = deps.writeMemory;
        this.soundManager = deps.soundManager;
        this.onExit = deps.onExit ?? null;
    }

    async loadAssets(): Promise<void> {
        if (this.sheetsReady || this.sheetsLoading) return;
        this.sheetsLoading = true;
        const loads = Object.entries(SHEETS).map(([name, cfg]) =>
            new Promise<void>(resolve => {
                const img = new Image();
                img.onload = () => {
                    this.sheets[name] = { img, cfg, count: Math.floor(img.width / cfg.frameW) };
                    resolve();
                };
                img.onerror = () => { console.warn('Failed to load', cfg.path); resolve(); };
                img.src = cfg.path;
            })
        );
        await Promise.all(loads);
        this.sheetsReady = true;
        this.sheetsLoading = false;
    }

    get ready(): boolean { return this.sheetsReady; }

    enter(): void {
        this.active = true;
        this.currentTab = 0;
        this.selectedIndices = [0, 0, 0];
        this.usageMessage = '';
        this.usageTimer = 0;

        this._readGameData();

        if (this.soundManager && this.soundManager._currentTrack) {
            this.savedMusicTrack = this.soundManager._currentTrack;
        }
        this.soundManager?.stopMusic(0.3);

        this._selectFirstAvailableTab();

        const d = this.data;
        if (d) {
            const spellIdx = d.spells.indexOf(d.currentSpell);
            if (spellIdx >= 0) this.selectedIndices[0] = spellIdx;

            const wearIdx = d.wearables.indexOf(d.currentAccessory);
            if (wearIdx >= 0) this.selectedIndices[1] = wearIdx;
        }
    }

    exit(): void {
        this.active = false;
        if (this.savedMusicTrack) {
            this.soundManager?.playMusic(this.savedMusicTrack, 0.3);
        }
        if (this.onExit) this.onExit();
    }

    private _readGameData(): void {
        const r0 = this.readMemory;
        if (!r0) return;
        // reads are guaranteed present once we know memory is live
        const r = (addr: number, len: number): Uint8Array =>
            r0(addr, len) ?? new Uint8Array(len);
        /** single g_mem byte (0 when out of range) */
        const u8 = (addr: number): number => r(addr, 1)[0] ?? 0;
        /** little-endian g_mem word */
        const le16 = (addr: number): number =>
            (r(addr, 2)[0] ?? 0) | ((r(addr, 2)[1] ?? 0) << 8);

        const d: InventoryData = {
            spells: [], spellCounts: [], spellMaxCounts: [],
            wearables: [], currentAccessory: 0, items: [],
            swordType: 0, shieldType: 0, shieldHP: 0, shieldMaxHP: 0,
            keys: 0, lionKeys: 0, elfCrest: false, gloryCrest: false, heroCrest: false,
            currentSpell: 0, enchantCount: 0, heroHP: 0, heroMaxHP: 0,
            level: 0, heroXP: 0, almas: 0,
        };

        for (let i = 0; i < 7; i++) {
            if (u8(ADDR_ESPADA_ACTIVE + i)) {
                d.spells.push(i + 1);
                d.spellCounts.push(u8(ADDR_SPELLS_ACTIVE + i));
                d.spellMaxCounts.push(u8(ADDR_SPELLS_INVENTORY + i));
            }
        }

        const acc = r(ADDR_FERUZA_SHOES, 5);
        d.wearables = [0];
        for (let i = 0; i < 5; i++) {
            d.wearables.push(acc[i] || 0);
        }
        d.currentAccessory = u8(ADDR_CURRENT_ACCESSORY);

        const it = r(ADDR_MAGIC_ITEMS, 5);
        d.items = [0, ...Array.from(it).filter(v => v > 0)];

        d.swordType = u8(ADDR_SWORD_TYPE);
        d.shieldType = u8(ADDR_SHIELD_TYPE);
        d.shieldHP = le16(ADDR_SHIELD_HP);
        d.shieldMaxHP = le16(ADDR_SHIELD_MAX_HP);
        d.keys = u8(ADDR_KEYS_AMOUNT);
        d.lionKeys = u8(ADDR_LION_KEYS_AMOUNT);
        d.elfCrest = !!u8(ADDR_ELF_CREST);
        d.gloryCrest = !!u8(ADDR_CREST_OF_GLORY);
        d.heroCrest = !!u8(ADDR_HERO_CREST);
        d.currentSpell = u8(ADDR_CURR_SPELL_TYPE);
        d.enchantCount = u8(ADDR_SWORD_ENCHANTMENT_LEVEL);
        d.heroHP = le16(ADDR_HERO_HP);
        d.heroMaxHP = le16(ADDR_HERO_MAX_HP);
        d.level = u8(ADDR_HERO_LEVEL);
        d.heroXP = le16(ADDR_HERO_XP);
        d.almas = le16(ADDR_HERO_ALMAS);

        this.data = d;
    }

    private _selectedId(): number {
        const d = this.data;
        const idx = this.selectedIndices[this.currentTab] ?? 0;
        switch (this.currentTab) {
            case 0: return d.spells[idx] ?? 0;
            case 1: return d.wearables[idx] ?? 0;
            case 2: return d.items[idx] ?? 0;
            default: return 0;
        }
    }

    private _selectFirstAvailableTab(): void {
        if (this.data.spells.length > 0) { this.currentTab = 0; this.selectedIndices = [0, 0, 0]; return; }
        if (this.data.wearables.some(v => v > 0)) { this.currentTab = 1; this.selectedIndices = [0, 1, 0]; return; }
        if (this.data.items.some(v => v > 0)) { this.currentTab = 2; this.selectedIndices = [0, 0, 1]; return; }
    }

    private _activeCount(): number {
        const d = this.data;
        switch (this.currentTab) {
            case 0: return d.spells.length;
            case 1: {
                const n = d.wearables.slice(1).filter(v => v > 0).length;
                return n > 0 ? n + 1 : 0;
            }
            case 2: {
                const n = d.items.slice(1).filter(v => v > 0).length;
                return n > 0 ? n + 1 : 0;
            }
            default: return 0;
        }
    }

    draw(_now?: number): void {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, W - 12, H - 12); // big window frame

        this._drawMagicSection(ctx, W);
        this._drawBottomHalf(ctx, W, H);
        this._drawUsageMessage(ctx, W, H);
        this._drawDebugPopup(ctx, W, H);

        ctx.restore();
    }

    private _drawMagicSection(ctx: CanvasRenderingContext2D, W: number): void {
        const d = this.data;
        const spells = d.spells;
        const iconSize = 48;
        const padX = 14;
        const gap = 48;
        const rowW = 7 * iconSize + 6 * gap;

        const selName = (this.selectedIndices[0] ?? 0) < spells.length
            ? SPELL_NAMES[(spells[this.selectedIndices[0] as number] ?? 1) - 1]
            : '';

        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#50f';
        ctx.fillText('SELECT-MAGIC:', padX + 1, 16 + 1);
        ctx.fillStyle = this.currentTab === 0 ? '#f00' : '#0f4';
        ctx.fillText('SELECT-MAGIC:', padX, 16);

        if (selName) {
            ctx.fillStyle = '#fff';
            ctx.fillText(selName, padX + 200, 16);
        }

        const startX = padX + Math.floor((W - padX * 2 - rowW) / 2);
        const iconsY = 56;

        for (let i = 0; i < 7; i++) {
            const ix = startX + i * (iconSize + gap);
            const sid = spells[i] || 0;
            if (i === this.selectedIndices[0]) {
                if (this.currentTab === 0) {
                    ctx.strokeStyle = '#f62';
                    ctx.lineWidth = 5;
                    ctx.strokeRect(ix - 5, iconsY - 5, iconSize + 10, iconSize + 10);
                } else if (sid > 0) {
                    ctx.strokeStyle = '#64d';
                    ctx.lineWidth = 5;
                    ctx.strokeRect(ix - 5, iconsY - 5, iconSize + 10, iconSize + 10);
                }
            }

            if (sid > 0) {
                this._drawSheet(ctx, 'magics', sid - 1, ix, iconsY, iconSize, iconSize);
            }

            const cur = spells[i] ? d.spellCounts[i] ?? 0 : 0;
            const max: number = spells[i] ? d.spellMaxCounts[i] ?? 0 : 0;
            if (max > 0) {
                ctx.font = 'bold 14px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff';
                ctx.fillText(String(cur).padStart(3, '0'), ix + iconSize / 2, iconsY + iconSize + 12);
                ctx.fillStyle = '#0ff';
                ctx.fillText(`(${String(max).padStart(3, '0')})`, ix + iconSize / 2, iconsY + iconSize + 28);
            }
        }
    }

    private _drawBottomHalf(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        const magicEnd = 156;
        const leftW = Math.floor(W * 0.625);
        const rightW = W - leftW;

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(6, magicEnd);
        ctx.lineTo(W-6, magicEnd); // Horizontal separator between magic and wearables
        ctx.moveTo(6, magicEnd+138);
        ctx.lineTo(leftW, magicEnd+138); // Horizontal separator between wearables and items
        ctx.moveTo(leftW, magicEnd);
        ctx.lineTo(leftW, H - 6); // Vertical separator between wearables/items and inventory
        ctx.stroke();

        this._drawWearPanel(ctx, 6, magicEnd, leftW-6);
        this._drawUsePanel(ctx, 6, magicEnd + 138, leftW-6);
        this._drawInventoryPanel(ctx, leftW, magicEnd, rightW);
    }

    private _drawWearPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
        const d = this.data;
        const items = d.wearables;
        const iconSize = 48;
        const padX = 18;
        const gap = Math.floor((w-(padX*2+iconSize*6))/5);
        const activeCount = items.slice(1).filter(v => v > 0).length + 1; // 'No use' always present, so +1

        const selId: number = (this.currentTab === 1 ? d.wearables[this.selectedIndices[1] ?? 0] : 0) ?? 0;
        const selName = selId > 0 ? (WEARABLE_NAMES[selId] || 'NO USE') : 'NO USE';

        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#50f';
        ctx.fillText('WEAR:', padX + 1, y + 10 + 1);
        ctx.fillStyle = this.currentTab === 2 ? '#f00' : '#0f4';
        ctx.fillText('WEAR:', padX, y + 10);

        if (selName) {
            ctx.fillStyle = '#fff';
            ctx.fillText(selName, x + padX + 77, y + 10);
        }

        const iconsY = y + 54;
        for (let i = 0; i < activeCount; i++) {
            const ix = x + padX + i * (iconSize + gap);
            const id = items[i];
            if (i === this.selectedIndices[1]) {
                if (this.currentTab === 1) {
                    ctx.strokeStyle = '#f00';
                } else {
                    ctx.strokeStyle = '#50f';
                }
                ctx.lineWidth = 5;
                ctx.strokeRect(ix - 5, iconsY - 5, iconSize + 10, iconSize + 10);
            }

            if ((id ?? 0) > 0) {
                this._drawSheet(ctx, 'wearables', (id as number) - 1, ix, iconsY, iconSize, iconSize);
            } else {
                this._drawSheet(ctx, 'no_use', 0, ix, iconsY, iconSize, iconSize);
            }
        }
    }

    // Navigation here should only work in the caverns
    private _drawUsePanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
        const d = this.data;
        const items = d.items;
        const iconSize = 48;
        const padX = 18;
        const gap = Math.floor((w-(padX*2+iconSize*6))/5);
        const activeCount = items.slice(1).filter(v => v > 0).length + 1; // 'No use' always present, so +1

        const selId: number = (this.currentTab === 2 ? d.items[this.selectedIndices[2] ?? 0] : 0) ?? 0;
        const selName = selId > 0 ? (ITEM_NAMES[selId] || 'NO USE') : 'NO USE';

        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#50f';
        ctx.fillText('USE:', padX + 1, y + 10 + 1);
        ctx.fillStyle = this.currentTab === 2 ? '#f00' : '#0f4';
        ctx.fillText('USE:', padX, y + 10);

        if (selName) {
            ctx.fillStyle = '#fff';
            ctx.fillText(selName, x + padX + 65, y + 10);
        }

        const iconsY = y + 54;
        for (let i = 0; i < activeCount; i++) {
            const ix = x + padX + i * (iconSize + gap);
            const iid = items[i];

            if (i === this.selectedIndices[2]) {
                if (this.currentTab === 2) {
                    ctx.strokeStyle = '#f00';
                } else {
                    ctx.strokeStyle = '#50f';
                }
                ctx.lineWidth = 5;
                ctx.strokeRect(ix - 5, iconsY - 5, iconSize + 10, iconSize + 10);
            }

            if ((iid ?? 0) > 0) {
                this._drawSheet(ctx, 'magic_items', (iid as number) - 1, ix, iconsY, iconSize, iconSize);
            } else {
                this._drawSheet(ctx, 'no_use', 0, ix, iconsY, iconSize, iconSize);
            }
        }
    }

    private _drawInventoryPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number): void {
        const d = this.data;
        const padX = 12;

        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#50f';
        ctx.fillText('INVENTORY', x + padX + 1, y + 10 + 1);
        ctx.fillStyle = '#0f4';
        ctx.fillText('INVENTORY', x + padX, y + 10);

        let ey = y + 42;
        const labelX = x + 80;
        const iconSize = 48;

        if (d.swordType) {
            const sn = SWORD_NAMES[d.swordType - 1] || ['', ''];
            this._drawSheet(ctx, 'swords', d.swordType - 1, x + 10, ey, 60, 48);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px "Courier New", monospace';
            ctx.fillText(sn[0] ?? '', labelX, ey + 4);
            ctx.fillText(sn[1] ?? '', labelX, ey + 24);
            ey += 52;
        }

        if (d.shieldType) {
            const shn = SHIELD_NAMES[d.shieldType - 1] || ['', ''];
            this._drawSheet(ctx, 'shields', d.shieldType - 1, x + 10, ey + 2, iconSize, iconSize);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px "Courier New", monospace';
            ctx.fillText(shn[0] ?? '', labelX, ey + 8);
            ctx.fillText(shn[1] ?? '', labelX + 64, ey + 27);
            ctx.fillStyle = '#0ff';
            ctx.fillText(`(${d.shieldHP})`, labelX, ey + 27);
            ey += 52;
        }

        if (d.keys || d.lionKeys) {
            let cx = x + 10;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px "Courier New", monospace';
            ctx.textAlign = 'left';
            if (d.keys) {
                this._drawSheet(ctx, 'keys', 0, x + 10, ey + 2, iconSize, iconSize);
                ctx.fillText(`×${d.keys}`, labelX, ey + 18);
                cx += 64;
            }
            if (d.lionKeys) {
                this._drawSheet(ctx, 'keys', 1, cx, ey + 2, iconSize, iconSize);
                ctx.fillText(`×${d.lionKeys}`, cx + 70, ey + 18);
                cx += 64;
            }
            ey += 52;
        }

        if (d.elfCrest || d.gloryCrest || d.heroCrest) {
            if (!d.keys && !d.lionKeys) {
                ey += 52;
            }
            let cx = x + 10;
            if (d.elfCrest) {
                this._drawSheet(ctx, 'crests', 0, cx, ey + 2, iconSize, iconSize);
                cx += 52;
            }
            if (d.gloryCrest) {
                this._drawSheet(ctx, 'crests', 1, cx, ey + 2, iconSize, iconSize);
                cx += 52;
            }
            if (d.heroCrest) {
                this._drawSheet(ctx, 'crests', 2, cx, ey + 2, iconSize, iconSize);
            }
        }
    }

    private _drawUsageMessage(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        if (!this.usageMessage) return;
        if (performance.now() - this.usageTimer > 3000) {
            this.usageMessage = '';
            return;
        }

        const boxW = 300;
        const boxH = 72;
        const x = (W - boxW) / 2;
        const y = (H - boxH) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, 8);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();

        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('I have used', x+20, y + boxH * 0.35);
        ctx.textAlign = 'right';
        ctx.fillText(this.usageMessage, x+boxW-20, y + boxH * 0.7);
    }

    private _drawDebugPopup(ctx: CanvasRenderingContext2D, W: number, H: number): void {
        if (!this.debugPopup) return;

        const boxW = 280;
        const boxH = 96;
        const x = (W - boxW) / 2;
        const y = (H - boxH) / 2;
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x, y, boxW, boxH, 8);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();

        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.fillStyle = '#fd0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`LEVEL ${this.data.level}`, x + 20, y + boxH * 0.3);
        ctx.fillText(`EXP ${this.data.heroXP}/${XP_TABLE[this.data.level]}`, x + 20, y + boxH * 0.7);
        ctx.fillStyle = '#fff';
        ctx.fillText(`LEVEL`, x + 20, y + boxH * 0.3);
        ctx.fillText(`EXP`, x + 20, y + boxH * 0.7);
    }

    private _showDebugPopup(): void {
        const r = this.readMemory;
        if (r) {
            this.data.level = (r(ADDR_HERO_LEVEL, 1) ?? new Uint8Array(1))[0] ?? 0;
            const xp = r(ADDR_HERO_XP, 2) ?? new Uint8Array(2);
            this.data.heroXP = (xp[0] ?? 0) | ((xp[1] ?? 0) << 8);
        }
        this.debugPopup = true;
    }

    resetDebugCombo(): void {
        this._debugS = false;
        this._debugE = false;
    }

    handleKey(code: string, ctrlKey: boolean, shiftKey: boolean, repeat: boolean): boolean {
        if (this.debugPopup) {
            const isModifier = ['ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(code);
            if (!repeat && !isModifier) {
                this.debugPopup = false;
                this._playNavSfx(12);
            }
            return true;
        }

        if (ctrlKey && shiftKey && !repeat && (code === 'KeyS' || code === 'KeyE')) {
            if (code === 'KeyS') this._debugS = true;
            if (code === 'KeyE') this._debugE = true;
            if (this._debugS && this._debugE) {
                this._debugS = false;
                this._debugE = false;
                if (this.currentTab === 2) this._showDebugPopup();
            }
            return true;
        }

        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Space'].includes(code)) {
            this.handleInput(code, repeat);
            return true;
        }
        return false;
    }

    private _drawSheet(ctx: CanvasRenderingContext2D, name: string, index: number, dx: number, dy: number, dw?: number, dh?: number): void {
        const s = this.sheets[name];
        if (!s) return;
        if (index < 0 || index >= s.count) return;
        const sx = index * s.cfg.frameW;
        ctx.drawImage(s.img, sx, 0, s.cfg.frameW, s.cfg.frameH, dx, dy, dw || s.cfg.frameW, dh || s.cfg.frameH);
    }

    handleInput(code: string, repeat = false): void {
        if (repeat) return;

        switch (code) {
            case 'ArrowRight':
                this._navNext();
                break;
            case 'ArrowLeft':
                this._navPrev();
                break;
            case 'ArrowDown':
                this._tabNext();
                break;
            case 'ArrowUp':
                this._tabPrev();
                break;
            case 'Space':
                if (this.currentTab === 2) this._useItem();
                break;
            case 'Enter':
                this.exit();
                break;
        }
    }

    private _navNext(): void {
        const n = this._activeCount();
        if (n < 2) return;
        const idx = this.selectedIndices[this.currentTab] ?? 0;
        if (idx + 1 >= n) return;
        this.selectedIndices[this.currentTab] = idx + 1;
        this._playNavSfx(12);
        this._onNavigate();
    }

    private _navPrev(): void {
        const n = this._activeCount();
        if (n < 2) return;
        const idx = this.selectedIndices[this.currentTab] ?? 0;
        if (idx - 1 < 0) return;
        this.selectedIndices[this.currentTab] = idx - 1;
        this._playNavSfx(12);
        this._onNavigate();
    }

    private _tabHasItems(tab: number): boolean {
        const d = this.data;
        if (tab === 0) return d.spells.length > 0;
        if (tab === 1) return d.wearables.slice(1).some(v => v > 0);
        if (tab === 2) return d.items.slice(1).some(v => v > 0);
        return false;
    }

    private _tabNext(): void {
        const old = this.currentTab;
        for (let i = this.currentTab + 1; i < 3; i++) {
            if (this._tabHasItems(i)) {
                this.currentTab = i;
                break;
            }
        }
        if (this.currentTab !== old) {
            this._playNavSfx(13);
        }
    }

    private _tabPrev(): void {
        const old = this.currentTab;
        for (let i = this.currentTab - 1; i >= 0; i--) {
            if (this._tabHasItems(i)) {
                this.currentTab = i;
                break;
            }
        }
        if (this.currentTab !== old) {
            this._playNavSfx(13);
        }
    }

    private _playNavSfx(id: number): void {
        const now = performance.now();
        if (now - this._lastNavSound < 80) return;
        this._lastNavSound = now;
        this.soundManager?.playSfx(id);
    }

    private _onNavigate(): void {
        const w = this.writeMemory;
        if (!w) return;
        if (this.currentTab === 0) {
            const id = this._selectedId();
            if (id > 0) w(ADDR_CURR_SPELL_TYPE, Uint8Array.of(id));
        } else if (this.currentTab === 1) {
            const id = this._selectedId();
            w(ADDR_CURRENT_ACCESSORY, Uint8Array.of(id));
        }
    }

    private _useItem(): void {
        const itemId = this._selectedId();
        if (itemId === 0) return;

        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;

        const it = r(ADDR_MAGIC_ITEMS, 5) ?? new Uint8Array(5);
        let slot = -1;
        let nth = 0;
        for (let i = 0; i < 5; i++) {
            if (it[i]) {
                if (nth === (this.selectedIndices[2] ?? 0) - 1) { slot = i; break; }
                nth++;
            }
        }
        if (slot < 0) return;

        this.soundManager?.playSfx(14);

        this.usageMessage = ITEM_USE_TEXT[itemId] || '';
        this.usageTimer = performance.now();

        switch (itemId) {
            case 1: this._healHP(0x80); break;
            case 2: this._fullHeal(); break;
            case 3: this._refillSpell(); break;
            case 4: this._refillAllSpells(); break;
            case 5: this._spiritShield(); break;
            case 6: this._repairShield(); break;
            case 7: this._enchantSword(); break;
            case 8:
                this.soundManager?.playSfx(15);
                w(ADDR_MAGIC_ITEMS + slot, Uint8Array.of(0));
                this.data.items.splice(this.selectedIndices[2] ?? 0, 1);
                this.selectedIndices[2] = 0;
                setTimeout(() => this.exit(), 600);
                return;
        }

        w(ADDR_MAGIC_ITEMS + slot, Uint8Array.of(0));
        this.data.items.splice(this.selectedIndices[2] ?? 0, 1);
        this.selectedIndices[2] = 0;
    }

    /** read a single g_mem byte, 0 when memory is unavailable */
    private _byte(addr: number): number {
        return (this.readMemory?.(addr, 1) ?? new Uint8Array(1))[0] ?? 0;
    }

    /** read a little-endian g_mem word */
    private _word(addr: number): number {
        const v = this.readMemory?.(addr, 2) ?? new Uint8Array(2);
        return (v[0] ?? 0) | ((v[1] ?? 0) << 8);
    }

    private _healHP(amount: number): void {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        let val = this._word(ADDR_HERO_HP);
        const maxVal = this._word(ADDR_HERO_MAX_HP);
        val = Math.min(maxVal, val + amount);
        w(ADDR_HERO_HP, Uint8Array.of(val & 0xFF, (val >> 8) & 0xFF));
        w(ADDR_HEALTH_BAR_REQUEST, Uint8Array.of(0xFF));
        this.data.heroHP = val;
    }

    private _fullHeal(): void {
        const w = this.writeMemory;
        if (!w) return;
        const maxVal = this._word(ADDR_HERO_MAX_HP);
        w(ADDR_HERO_HP, Uint8Array.of(maxVal & 0xFF, (maxVal >> 8) & 0xFF));
        w(ADDR_HEALTH_BAR_REQUEST, Uint8Array.of(0xFF));
        this.data.heroHP = maxVal;
    }

    private _refillSpell(): void {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        const cur = this._byte(ADDR_CURR_SPELL_TYPE);
        if (!cur) return;
        const idx = cur - 1;
        const max = this._byte(ADDR_SPELLS_INVENTORY + idx);
        w(ADDR_SPELLS_ACTIVE + idx, Uint8Array.of(max));
        for (let i = 0; i < this.data.spells.length; i++) {
            if (this.data.spells[i] === cur) {
                this.data.spellCounts[i] = max;
                break;
            }
        }
    }

    private _refillAllSpells(): void {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        for (let i = 0; i < 7; i++) {
            w(ADDR_SPELLS_ACTIVE + i, Uint8Array.of(this._byte(ADDR_SPELLS_INVENTORY + i)));
        }
        for (let i = 0; i < this.data.spells.length; i++) {
            const sid = this.data.spells[i] as number;
            this.data.spellCounts[i] = this._byte(ADDR_SPELLS_INVENTORY + sid - 1);
        }
    }

    private _spiritShield(): void {
        const w = this.writeMemory;
        if (!w) return;
        w(ADDR_MAGIA_STONE_SPRITE0, Uint8Array.of(0x00, 0x01, 0x50, 0, 0, 0, 0));
        w(ADDR_MAGIA_STONE_SPRITE1, Uint8Array.of(0x04, 0xFF, 0x50, 0, 0, 0, 0));
        w(ADDR_MAGIA_STONE_SPRITE2, Uint8Array.of(0x08, 0xFF, 0x50, 0, 0, 0, 0));
        w(ADDR_MAGIA_STONE_SPRITE3, Uint8Array.of(0x0C, 0x01, 0x50, 0, 0, 0, 0));
    }

    private _repairShield(): void {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        const st = this._byte(ADDR_SHIELD_TYPE);
        if (!st) return;
        let val = this._word(ADDR_SHIELD_HP);
        const maxVal = this._word(ADDR_SHIELD_MAX_HP);
        val = Math.min(maxVal, val + (SHIELD_HP_VALUES[st - 1] || 0));
        w(ADDR_SHIELD_HP, Uint8Array.of(val & 0xFF, (val >> 8) & 0xFF));
        this.data.shieldHP = val;
    }

    private _enchantSword(): void {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        const c = this._byte(ADDR_SWORD_ENCHANTMENT_LEVEL) + 1;
        w(ADDR_SWORD_ENCHANTMENT_LEVEL, Uint8Array.of(c));
        this.data.enchantCount = c;
    }
}
