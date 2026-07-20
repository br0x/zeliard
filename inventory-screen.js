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

const SPELL_NAMES = ['Espada', 'Saeta', 'Fuego', 'Lanzar', 'Rascar', 'Agua', 'Guerra'];

const WEARABLE_NAMES = [
    null,
    ['Feruza', 'shoes'],
    ['Pirika', 'shoes'],
    ['Silkarn', 'shoes'],
    ['Ruzeria', 'shoes'],
    ['Asbestos', 'cape'],
];

const ITEM_NAMES = [
    null,
    ['Ken\'ko', 'Potion'],
    ['Juu-en', 'Fruit'],
    ['Elixir', 'of Kashi'],
    ['Chikara', 'Powder'],
    ['Magia', 'Stone'],
    ['Holy Water', 'of Acero'],
    ['Sabre', 'Oil'],
    ['Kioku', 'feather'],
];

const ITEM_USE_TEXT = [
    null,
    'a Ken\'ko Potion.',
    'a Juu-en Fruit.',
    'an Elixir of Kashi.',
    'some Chikara Powder.',
    'a Magia Stone.',
    'some Holy Water of Acero.',
    'some Sabre Oil.',
    'a Kioku feather.',
];

const SWORD_NAMES = [
    ['Training', 'Sword'],
    ['Wise man\'s', 'Sword'],
    ['Spirit', 'Sword'],
    ['Knight\'s', 'Sword'],
    ['Illumination', 'Sword'],
    ['Enchantment', 'Sword'],
];

const SHIELD_NAMES = [
    ['Clay', 'Shield'],
    ['Wise Man\'s', 'Shield'],
    ['Stone', 'Shield'],
    ['Honor', 'Shield'],
    ['Light', 'Shield'],
    ['Titanium', 'Shield'],
];

const ADDR_SWORD_TYPE = 0x92;
const ADDR_SHIELD_TYPE = 0x93;
const ADDR_SHIELD_HP = 0x94;
const ADDR_SHIELD_MAX_HP = 0x96;
const ADDR_KEYS_AMOUNT = 0x98;
const ADDR_LION_KEYS_AMOUNT = 0x99;
const ADDR_ELF_CREST = 0x9A;
const ADDR_CREST_OF_GLORY = 0x9B;
const ADDR_HERO_CREST = 0x9C;
const ADDR_CURRENT_MAGIC_SPELL = 0x9D;
const ADDR_CURRENT_ACCESSORY = 0x9E;
const ADDR_FERUZA_SHOES = 0xA1;
const ADDR_MAGIC_ITEMS = 0xA6;
const ADDR_SPELLS_ESPADA = 0xAB;
const ADDR_HERO_HP = 0x90;
const ADDR_HERO_MAX_HP = 0xB2;
const ADDR_ESPADA_COUNT = 0xB4;
const ADDR_ESPADA_ACTIVE = 0xBB;
const ADDR_BYTE_E4 = 0xE4;
const ADDR_SOUND_FX_REQUEST = 0xFF75;
const ADDR_SPIRIT_SPRITE0 = 0xEB60;
const ADDR_SPIRIT_SPRITE1 = 0xEB67;
const ADDR_SPIRIT_SPRITE2 = 0xEB6E;
const ADDR_SPIRIT_SPRITE3 = 0xEB75;
const ADDR_HERO_LEVEL = 0x8D;
const ADDR_HERO_XP = 0x8E;
const ADDR_HERO_ALMAS = 0x8B;

const SHIELD_HP_VALUES = [0x50, 0x5A, 0x64, 0x6E, 0x73, 0x78];

export class InventoryScreen {
    constructor({ canvas, ctx, readMemory, writeMemory, soundManager, onExit }) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.readMemory = readMemory;
        this.writeMemory = writeMemory;
        this.soundManager = soundManager;
        this.onExit = onExit;

        this.active = false;
        this.currentTab = 0;
        this.selectedIndex = 0;
        this.savedMusicTrack = null;

        this.sheets = {};
        this.sheetsReady = false;
        this.sheetsLoading = false;

        this.usageMessage = '';
        this.usageTimer = 0;

        this._lastNavSound = 0;
    }

    async loadAssets() {
        if (this.sheetsReady || this.sheetsLoading) return;
        this.sheetsLoading = true;
        const loads = Object.entries(SHEETS).map(([name, cfg]) =>
            new Promise(resolve => {
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

    get ready() { return this.sheetsReady; }

    enter() {
        this.active = true;
        this.currentTab = 0;
        this.selectedIndex = 0;
        this.usageMessage = '';
        this.usageTimer = 0;

        this._readGameData();

        if (this.soundManager && this.soundManager._currentTrack) {
            this.savedMusicTrack = this.soundManager._currentTrack;
        }
        this.soundManager?.stopMusic(0.3);

        this._selectFirstAvailableTab();
    }

    exit() {
        this.active = false;
        if (this.savedMusicTrack) {
            this.soundManager?.playMusic(this.savedMusicTrack, 0.3);
        }
        if (this.onExit) this.onExit();
    }

    _readGameData() {
        const r = this.readMemory;
        if (!r) return;
        const d = this.data = {};

        d.spells = [];
        d.spellCounts = [];
        d.spellMaxCounts = [];
        for (let i = 0; i < 7; i++) {
            const active = r(ADDR_ESPADA_ACTIVE + i, 1)[0];
            if (active) {
                d.spells.push(i + 1);
                d.spellCounts.push(r(ADDR_SPELLS_ESPADA + i, 1)[0]);
                d.spellMaxCounts.push(r(ADDR_ESPADA_COUNT + i, 1)[0]);
            }
        }

        const acc = r(ADDR_FERUZA_SHOES, 5);
        d.wearables = [0];
        for (let i = 0; i < 5; i++) {
            d.wearables.push(acc[i] || 0);
        }
        d.currentAccessory = r(ADDR_CURRENT_ACCESSORY, 1)[0];

        const it = r(ADDR_MAGIC_ITEMS, 5);
        d.items = [0];
        for (let i = 0; i < 5; i++) {
            d.items.push(it[i] || 0);
        }

        d.swordType = r(ADDR_SWORD_TYPE, 1)[0];
        d.shieldType = r(ADDR_SHIELD_TYPE, 1)[0];
        const shp = r(ADDR_SHIELD_HP, 2);
        d.shieldHP = shp[0] | (shp[1] << 8);
        const smx = r(ADDR_SHIELD_MAX_HP, 2);
        d.shieldMaxHP = smx[0] | (smx[1] << 8);
        d.keys = r(ADDR_KEYS_AMOUNT, 1)[0];
        d.lionKeys = r(ADDR_LION_KEYS_AMOUNT, 1)[0];
        d.elfCrest = !!r(ADDR_ELF_CREST, 1)[0];
        d.gloryCrest = !!r(ADDR_CREST_OF_GLORY, 1)[0];
        d.heroCrest = !!r(ADDR_HERO_CREST, 1)[0];
        d.currentSpell = r(ADDR_CURRENT_MAGIC_SPELL, 1)[0];
        d.enchantCount = r(ADDR_BYTE_E4, 1)[0];
        const hp = r(ADDR_HERO_HP, 2);
        d.heroHP = hp[0] | (hp[1] << 8);
        const mx = r(ADDR_HERO_MAX_HP, 2);
        d.heroMaxHP = mx[0] | (mx[1] << 8);
        d.level = r(ADDR_HERO_LEVEL, 1)[0];
        const xp = r(ADDR_HERO_XP, 2);
        d.heroXP = xp[0] | (xp[1] << 8);
        const al = r(ADDR_HERO_ALMAS, 2);
        d.almas = al[0] | (al[1] << 8);
    }

    _selectedId() {
        const d = this.data;
        switch (this.currentTab) {
            case 0: return d.spells[this.selectedIndex] || 0;
            case 1: return d.wearables[this.selectedIndex] || 0;
            case 2: return d.items[this.selectedIndex] || 0;
            default: return 0;
        }
    }

    _selectFirstAvailableTab() {
        if (this.data.spells.length > 0) { this.currentTab = 0; this.selectedIndex = 0; return; }
        if (this.data.wearables.some(v => v > 0)) { this.currentTab = 1; this.selectedIndex = 1; return; }
        if (this.data.items.some(v => v > 0)) { this.currentTab = 2; this.selectedIndex = 1; return; }
    }

    _activeCount() {
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

    draw(now) {
        const ctx = this.ctx;
        const W = this.canvas.width;
        const H = this.canvas.height;

        ctx.save();
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, W - 12, H - 12);

        this._drawMagicSection(ctx, W);
        this._drawBottomHalf(ctx, W, H);
        this._drawUsageMessage(ctx, W, H);

        ctx.restore();
    }

    _drawMagicSection(ctx, W) {
        const d = this.data;
        const icons = d.spells;
        const iconSize = 48;
        const padX = 14;
        const gap = 48;
        const rowW = 7 * iconSize + 6 * gap;

        const selName = this.selectedIndex < icons.length ? SPELL_NAMES[icons[this.selectedIndex] - 1] : '';

        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = this.currentTab === 0 ? '#e46' : '#2dd';
        ctx.fillText('SELECT-MAGIC:', padX, 18);
        if (selName) {
            ctx.fillStyle = '#fff';
            ctx.fillText(selName, padX + 200, 18);
        }

        const startX = padX + Math.floor((W - padX * 2 - rowW) / 2);
        const iconsY = 56;

        for (let i = 0; i < 7; i++) {
            const ix = startX + i * (iconSize + gap);
            const sid = icons[i] || 0;
            if (i === this.selectedIndex) {
                if (this.currentTab === 0) {
                    ctx.strokeStyle = '#f62';
                } else if (sid > 0) {
                    ctx.strokeStyle = '#64d';
                }
                ctx.lineWidth = 5;
                ctx.strokeRect(ix - 5, iconsY - 5, iconSize + 10, iconSize + 10);
            }

            if (sid > 0) {
                this._drawSheet(ctx, 'magics', sid - 1, ix, iconsY, iconSize, iconSize);
            }

            const cur = icons[i] ? d.spellCounts[i] : 0;
            const max = icons[i] ? d.spellMaxCounts[i] : 0;
            if (max > 0) {
                ctx.font = 'bold 14px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.fillStyle = '#fff';
                ctx.fillText(String(cur).padStart(3, '0'), ix + iconSize / 2, iconsY + iconSize + 12);
                ctx.fillStyle = '#2dd';
                ctx.fillText(`(${String(max).padStart(3, '0')})`, ix + iconSize / 2, iconsY + iconSize + 28);
            }
        }
    }

    _drawBottomHalf(ctx, W, H) {
        const magicEnd = 156;
        const leftW = Math.floor(W * 0.625);
        const rightW = W - leftW;

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(6, magicEnd);
        ctx.lineTo(W-6, magicEnd);
        ctx.moveTo(6, magicEnd+138);
        ctx.lineTo(leftW, magicEnd+138);
        ctx.moveTo(leftW, magicEnd);
        ctx.lineTo(leftW, H - 6);
        ctx.stroke();

        this._drawWearPanel(ctx, 0, magicEnd, leftW);
        this._drawUsePanel(ctx, 0, magicEnd + 138, leftW);
        this._drawInventoryPanel(ctx, leftW, magicEnd, rightW);
    }

    _drawWearPanel(ctx, x, y, w) {
        const d = this.data;
        const items = d.wearables;
        const iconSize = 48;
        const padX = 12;
        const gap = 6;
        const activeCount = items.slice(1).filter(v => v > 0).length + 1;
        const rowW = activeCount * iconSize + (activeCount - 1) * gap;
        const startX = padX + Math.floor((w - padX * 2 - rowW) / 2);

        const selId = this.currentTab === 1 ? d.wearables[this.selectedIndex] : 0;
        const selNames = selId > 0 ? (WEARABLE_NAMES[selId] || ['', '']) : null;

        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#2fd4d4';
        ctx.fillText('WEAR:', x + padX, y + 10);

        if (selNames) {
            ctx.fillStyle = '#fff';
            ctx.fillText(selNames[0], x + padX + 68, y + 10);
            ctx.fillText(selNames[1], x + padX + 68, y + 26);
        }

        const iconsY = y + 48;
        for (let i = 0; i < activeCount; i++) {
            const ix = startX + i * (iconSize + gap);
            const id = items[i];
            const isSel = this.currentTab === 1 && i === this.selectedIndex;

            ctx.strokeStyle = isSel ? '#ff2020' : '#666';
            ctx.lineWidth = isSel ? 3 : 2;
            ctx.strokeRect(ix, iconsY, iconSize, iconSize);

            if (id > 0) {
                this._drawSheet(ctx, 'wearables', id - 1, ix + 1, iconsY + 1, iconSize - 2, iconSize - 2);
            } else {
                ctx.font = '9px "Courier New", monospace';
                ctx.fillStyle = '#c00';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('NO', ix + iconSize / 2, iconsY + iconSize / 2 - 5);
                ctx.fillText('USE', ix + iconSize / 2, iconsY + iconSize / 2 + 6);
            }
        }
    }

    _drawUsePanel(ctx, x, y, w) {
        const d = this.data;
        const items = d.items;
        const iconSize = 48;
        const padX = 12;
        const gap = 6;
        const activeCount = items.slice(1).filter(v => v > 0).length + 1;
        const rowW = activeCount * iconSize + (activeCount - 1) * gap;
        const startX = padX + Math.floor((w - padX * 2 - rowW) / 2);

        const selId = this.currentTab === 2 ? d.items[this.selectedIndex] : 0;
        const selNames = selId > 0 ? (ITEM_NAMES[selId] || ['', '']) : null;

        ctx.font = 'bold 24px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#2fd4d4';
        ctx.fillText('USE:', x + padX, y + 10);

        if (selNames) {
            ctx.fillStyle = '#fff';
            ctx.fillText(selNames[0], x + padX + 56, y + 10);
            if (selNames[1]) ctx.fillText(selNames[1], x + padX + 56, y + 26);
        }

        const iconsY = y + 44;
        for (let i = 0; i < activeCount; i++) {
            const ix = startX + i * (iconSize + gap);
            const id = items[i];
            const isSel = this.currentTab === 2 && i === this.selectedIndex;

            ctx.strokeStyle = isSel ? '#ff2020' : '#666';
            ctx.lineWidth = isSel ? 3 : 2;
            ctx.strokeRect(ix, iconsY, iconSize, iconSize);

            if (id > 0) {
                this._drawSheet(ctx, 'magic_items', id - 1, ix + 1, iconsY + 1, iconSize - 2, iconSize - 2);
            } else {
                ctx.font = '9px "Courier New", monospace';
                ctx.fillStyle = '#c00';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('NO', ix + iconSize / 2, iconsY + iconSize / 2 - 5);
                ctx.fillText('USE', ix + iconSize / 2, iconsY + iconSize / 2 + 6);
            }
        }
    }

    _drawInventoryPanel(ctx, x, y, w) {
        const d = this.data;

        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#ff3aa0';
        ctx.fillText('INVENTORY', x + 12, y + 10);

        let ey = y + 42;
        const labelX = x + 60;
        const iconSize = 48;

        if (d.swordType) {
            const sn = SWORD_NAMES[d.swordType - 1] || ['', ''];
            this._drawSheet(ctx, 'swords', d.swordType - 1, x + 10, ey, 60, 48);
            ctx.fillStyle = '#2fd4d4';
            ctx.font = '12px "Courier New", monospace';
            ctx.fillText(sn[0], labelX, ey + 2);
            ctx.fillText(sn[1], labelX, ey + 18);
            ey += 58;
        }

        if (d.shieldType) {
            const shn = SHIELD_NAMES[d.shieldType - 1] || ['', ''];
            this._drawSheet(ctx, 'shields', d.shieldType - 1, x + 10, ey + 2, iconSize, iconSize);
            ctx.fillStyle = '#fff';
            ctx.font = '12px "Courier New", monospace';
            ctx.fillText(shn[0], labelX, ey + 4);
            ctx.fillStyle = '#ff9a2a';
            ctx.fillText(`(${d.shieldHP})`, labelX, ey + 20);
            ctx.fillStyle = '#2fd4d4';
            ctx.fillText(shn[1], labelX + 72, ey + 20);
            ey += 58;
        }

        if (d.keys) {
            this._drawSheet(ctx, 'keys', 0, x + 10, ey + 2, iconSize, iconSize);
            ctx.fillStyle = '#fff';
            ctx.font = '12px "Courier New", monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`\u00d7${d.keys}`, labelX, ey + 18);
            ey += 54;
        }

        if (d.lionKeys) {
            this._drawSheet(ctx, 'keys', 1, x + 10, ey + 2, iconSize, iconSize);
            ctx.fillStyle = '#fff';
            ctx.font = '12px "Courier New", monospace';
            ctx.fillText(`\u00d7${d.lionKeys}`, labelX, ey + 18);
            ey += 54;
        }

        if (d.elfCrest || d.gloryCrest || d.heroCrest) {
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

    _drawUsageMessage(ctx, W, H) {
        if (!this.usageMessage) return;
        if (performance.now() - this.usageTimer > 3000) {
            this.usageMessage = '';
            return;
        }

        ctx.font = '12px "Courier New", monospace';
        ctx.fillStyle = '#0f0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const x = 16;
        const y = H - 80;

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(x - 4, y - 4, 360, 50);
        ctx.fillStyle = '#0f0';
        ctx.fillText('I have used', x, y);
        ctx.fillText(this.usageMessage, x, y + 18);
    }

    _drawSheet(ctx, name, index, dx, dy, dw, dh) {
        const s = this.sheets[name];
        if (!s) return;
        if (index < 0 || index >= s.count) return;
        const sx = index * s.cfg.frameW;
        ctx.drawImage(s.img, sx, 0, s.cfg.frameW, s.cfg.frameH, dx, dy, dw || s.cfg.frameW, dh || s.cfg.frameH);
    }

    handleInput(code, repeat) {
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
            case 'Enter':
                this.exit();
                break;
        }
    }

    _navNext() {
        const n = this._activeCount();
        if (n < 2) return;
        this.selectedIndex = (this.selectedIndex + 1) % n;
        this._playNavSfx(12);
        this._onNavigate();
    }

    _navPrev() {
        const n = this._activeCount();
        if (n < 2) return;
        this.selectedIndex = (this.selectedIndex - 1 + n) % n;
        this._playNavSfx(12);
        this._onNavigate();
    }

    _tabHasItems(tab) {
        const d = this.data;
        if (tab === 0) return d.spells.length > 0;
        if (tab === 1) return d.wearables.slice(1).some(v => v > 0);
        if (tab === 2) return d.items.slice(1).some(v => v > 0);
        return false;
    }

    _tabNext() {
        const old = this.currentTab;
        for (let i = 0; i < 3; i++) {
            this.currentTab = (this.currentTab + 1) % 3;
            if (this._tabHasItems(this.currentTab)) break;
        }
        if (this.currentTab !== old) {
            this.selectedIndex = 0;
            this._playNavSfx(13);
        }
    }

    _tabPrev() {
        const old = this.currentTab;
        for (let i = 0; i < 3; i++) {
            this.currentTab = (this.currentTab - 1 + 3) % 3;
            if (this._tabHasItems(this.currentTab)) break;
        }
        if (this.currentTab !== old) {
            this.selectedIndex = 0;
            this._playNavSfx(13);
        }
    }

    _playNavSfx(id) {
        const now = performance.now();
        if (now - this._lastNavSound < 80) return;
        this._lastNavSound = now;
        this.soundManager?.playSfx(id);
    }

    _onNavigate() {
        const w = this.writeMemory;
        if (!w) return;
        if (this.currentTab === 0) {
            const id = this._selectedId();
            if (id > 0) w(ADDR_CURRENT_MAGIC_SPELL, [id]);
        } else if (this.currentTab === 1) {
            const id = this._selectedId();
            if (id > 0) w(ADDR_CURRENT_ACCESSORY, [id]);
        }
    }

    _selectCurrent() {
        if (this.currentTab === 0) {
            const id = this._selectedId();
            if (id > 0) this.writeMemory?.(ADDR_CURRENT_MAGIC_SPELL, [id]);
        } else if (this.currentTab === 1) {
            const id = this._selectedId();
            if (id > 0) this.writeMemory?.(ADDR_CURRENT_ACCESSORY, [id]);
        }
    }

    _useItem() {
        const itemId = this._selectedId();
        if (itemId === 0) return;

        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;

        const it = r(ADDR_MAGIC_ITEMS, 5);
        let slot = -1;
        let nth = 0;
        for (let i = 0; i < 5; i++) {
            if (it[i]) {
                if (nth === this.selectedIndex - 1) { slot = i; break; }
                nth++;
            }
        }
        if (slot < 0) return;

        this.soundManager?.playSfx(14);

        if (itemId >= 3 && itemId <= 7) {
            this.usageMessage = ITEM_USE_TEXT[itemId] || '';
            this.usageTimer = performance.now();
        }

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
                this.usageMessage = 'a Kioku feather.';
                this.usageTimer = performance.now();
                w(ADDR_MAGIC_ITEMS + slot, [0]);
                this.data.items[this.selectedIndex] = 0;
                setTimeout(() => this.exit(), 600);
                return;
        }

        w(ADDR_MAGIC_ITEMS + slot, [0]);
        this.data.items[this.selectedIndex] = 0;
    }

    _healHP(amount) {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        const hp = r(ADDR_HERO_HP, 2);
        let val = hp[0] | (hp[1] << 8);
        const mx = r(ADDR_HERO_MAX_HP, 2);
        const maxVal = mx[0] | (mx[1] << 8);
        val = Math.min(maxVal, val + amount);
        w(ADDR_HERO_HP, [val & 0xFF, (val >> 8) & 0xFF]);
        this.data.heroHP = val;
    }

    _fullHeal() {
        const w = this.writeMemory;
        if (!w) return;
        const mx = this.readMemory(ADDR_HERO_MAX_HP, 2);
        const maxVal = mx[0] | (mx[1] << 8);
        w(ADDR_HERO_HP, [maxVal & 0xFF, (maxVal >> 8) & 0xFF]);
        this.data.heroHP = maxVal;
    }

    _refillSpell() {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        const cur = r(ADDR_CURRENT_MAGIC_SPELL, 1)[0];
        if (!cur) return;
        const idx = cur - 1;
        const max = r(ADDR_ESPADA_COUNT + idx, 1)[0];
        w(ADDR_SPELLS_ESPADA + idx, [max]);
        for (let i = 0; i < this.data.spells.length; i++) {
            if (this.data.spells[i] === cur) {
                this.data.spellCounts[i] = max;
                break;
            }
        }
    }

    _refillAllSpells() {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        for (let i = 0; i < 7; i++) {
            const max = r(ADDR_ESPADA_COUNT + i, 1)[0];
            w(ADDR_SPELLS_ESPADA + i, [max]);
        }
        for (let i = 0; i < this.data.spells.length; i++) {
            const sid = this.data.spells[i];
            const max = r(ADDR_ESPADA_COUNT + sid - 1, 1)[0];
            this.data.spellCounts[i] = max;
        }
    }

    _spiritShield() {
        const w = this.writeMemory;
        if (!w) return;
        w(ADDR_SPIRIT_SPRITE0, [0x00, 0x01, 0x50, 0, 0, 0, 0]);
        w(ADDR_SPIRIT_SPRITE1, [0x04, 0xFF, 0x50, 0, 0, 0, 0]);
        w(ADDR_SPIRIT_SPRITE2, [0x08, 0xFF, 0x50, 0, 0, 0, 0]);
        w(ADDR_SPIRIT_SPRITE3, [0x0C, 0x01, 0x50, 0, 0, 0, 0]);
    }

    _repairShield() {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        const st = r(ADDR_SHIELD_TYPE, 1)[0];
        if (!st) return;
        const hp = r(ADDR_SHIELD_HP, 2);
        let val = hp[0] | (hp[1] << 8);
        const mx = r(ADDR_SHIELD_MAX_HP, 2);
        const maxVal = mx[0] | (mx[1] << 8);
        val = Math.min(maxVal, val + (SHIELD_HP_VALUES[st - 1] || 0));
        w(ADDR_SHIELD_HP, [val & 0xFF, (val >> 8) & 0xFF]);
        this.data.shieldHP = val;
    }

    _enchantSword() {
        const r = this.readMemory;
        const w = this.writeMemory;
        if (!r || !w) return;
        const c = r(ADDR_BYTE_E4, 1)[0] + 1;
        w(ADDR_BYTE_E4, [c]);
        this.data.enchantCount = c;
    }
}
