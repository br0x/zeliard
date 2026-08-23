// import-export.ts – Canvas-based Import/Export dialog for Zeliard
import { getSaveSlotNames } from '../platform/save.js';

export type ImportExportMode = 'export' | 'import' | 'delete';

class ImportExportDialog {
    readonly onExportSlot: (slotName: string) => void;
    readonly onImportFromFile: () => void;
    readonly onDeleteSlot: (slotName: string) => void;
    readonly onCancel: () => void;

    mode: ImportExportMode = 'export';
    slots: string[] = [];
    selectedSlotIndex = 0;
    scrollOffset = 0;
    confirmDeleteSlot: string | null = null;
    visible = true;

    constructor(onExportSlot: (slotName: string) => void,
                onImportFromFile: () => void,
                onDeleteSlot: (slotName: string) => void,
                onCancel: () => void) {
        this.onExportSlot = onExportSlot;
        this.onImportFromFile = onImportFromFile;
        this.onDeleteSlot = onDeleteSlot;
        this.onCancel = onCancel;
        this.refreshSlots();
    }

    refreshSlots(): void {
        this.slots = getSaveSlotNames();
        if (this.selectedSlotIndex >= this.slots.length) {
            this.selectedSlotIndex = Math.max(0, this.slots.length - 1);
        }
        this._clampScroll();
    }

    _maxVisible(): number {
        return 8;
    }

    _clampScroll(): void {
        const maxVis = this._maxVisible();
        if (this.selectedSlotIndex < this.scrollOffset) this.scrollOffset = this.selectedSlotIndex;
        if (this.selectedSlotIndex >= this.scrollOffset + maxVis) this.scrollOffset = this.selectedSlotIndex - maxVis + 1;
        if (this.scrollOffset > Math.max(0, this.slots.length - maxVis)) this.scrollOffset = Math.max(0, this.slots.length - maxVis);
    }

    handleKey(keyCode: string, _now: number): boolean {
        // Confirmation state: Y / Enter to confirm, N / Escape to cancel
        if (this.confirmDeleteSlot) {
            if (keyCode === 'y' || keyCode === 'Y' || keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                const slot = this.confirmDeleteSlot;
                this.confirmDeleteSlot = null;
                this.onDeleteSlot(slot);
                this.refreshSlots();
                return true;
            }
            if (keyCode === 'n' || keyCode === 'N' || keyCode === 'Escape') {
                this.confirmDeleteSlot = null;
                return true;
            }
            return true;
        }

        // Escape always cancels
        if (keyCode === 'Escape') {
            this.onCancel();
            return true;
        }

        const modes: ImportExportMode[] = ['export', 'import', 'delete'];

        // Left/Right cycle mode
        if (keyCode === 'ArrowLeft') {
            const idx = (modes.indexOf(this.mode) - 1 + modes.length) % modes.length;
            this.mode = modes[idx]!;
            return true;
        }
        if (keyCode === 'ArrowRight') {
            const idx = (modes.indexOf(this.mode) + 1) % modes.length;
            this.mode = modes[idx]!;
            return true;
        }

        // Shared list navigation for export and delete
        if (this.mode === 'export' || this.mode === 'delete') {
            if (keyCode === 'ArrowUp') {
                if (this.slots.length > 0) {
                    this.selectedSlotIndex = (this.selectedSlotIndex - 1 + this.slots.length) % this.slots.length;
                    this._clampScroll();
                }
                return true;
            }
            if (keyCode === 'ArrowDown') {
                if (this.slots.length > 0) {
                    this.selectedSlotIndex = (this.selectedSlotIndex + 1) % this.slots.length;
                    this._clampScroll();
                }
                return true;
            }
            if (keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                if (this.slots.length > 0 && this.selectedSlotIndex < this.slots.length) {
                    const slotName = this.slots[this.selectedSlotIndex]!;
                    if (this.mode === 'export') {
                        this.onExportSlot(slotName);
                    } else {
                        this.confirmDeleteSlot = slotName;
                    }
                }
                return true;
            }
        } else if (this.mode === 'import') {
            if (keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                this.onImportFromFile();
                return true;
            }
        }

        return false;
    }

    draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, _now: number): void {
        const boxWidth = 520;
        const boxHeight = 360;
        const x = (canvasWidth - boxWidth) / 2;
        const y = (canvasHeight - boxHeight) / 2;

        // Background overlay
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Dialog box
        ctx.strokeStyle = '#ca6';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, boxWidth, boxHeight);
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, boxWidth, boxHeight);

        // Header with mode tabs
        ctx.font = 'bold 24px "Press Start 2P", monospace';
        const tabX = [x + 40, x + 200, x + 360];
        const tabLabels = ['Export', 'Import', 'Delete'];
        for (let i = 0; i < 3; i++) {
            const isActive = (i === modesOrder.indexOf(this.mode));
            ctx.fillStyle = isActive ? '#ff8' : '#888';
            ctx.fillText(tabLabels[i]!, tabX[i]!, y + 40);
        }

        // Separator line
        ctx.strokeStyle = '#862';
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 60);
        ctx.lineTo(x + boxWidth - 10, y + 60);
        ctx.stroke();

        if (this.mode === 'export' || this.mode === 'delete') {
            if (this.confirmDeleteSlot) {
                // Confirmation prompt
                ctx.font = '18px "Press Start 2P", monospace';
                ctx.fillStyle = '#f88';
                ctx.fillText('Delete this save?', x + 100, y + 140);
                ctx.font = '16px "Press Start 2P", monospace';
                ctx.fillStyle = '#ff8';
                ctx.fillText('"' + this.confirmDeleteSlot + '"', x + 140, y + 190);
                ctx.font = '16px "Press Start 2P", monospace';
                ctx.fillStyle = '#aaa';
                ctx.fillText('[Y] Yes   [N] No', x + 130, y + 250);
                ctx.font = '14px monospace';
                ctx.fillStyle = '#aaa';
                ctx.fillText('Y: confirm   N / ESC: cancel', x + 120, y + boxHeight - 25);
            } else {
                // List save slots
                ctx.font = '18px "Press Start 2P", monospace';
                let listY = y + 100;
                const lineHeight = 28;
                if (this.slots.length === 0) {
                    ctx.fillStyle = '#aaa';
                    ctx.fillText('(no saved games)', x + 40, listY);
                } else {
                    const maxVis = this._maxVisible();
                    for (let i = 0; i < maxVis && this.scrollOffset + i < this.slots.length; i++) {
                        const idx = this.scrollOffset + i;
                        const isSelected = (idx === this.selectedSlotIndex);
                        ctx.fillStyle = isSelected ? '#ff8' : '#cca';
                        if (isSelected) {
                            ctx.beginPath();
                            ctx.moveTo(x + 24, listY - 19);
                            ctx.lineTo(x + 24, listY - 1);
                            ctx.lineTo(x + 24 + 10, listY - 10);
                            ctx.closePath();
                            ctx.fill();
                        }
                        ctx.fillText(this.slots[idx]!, x + 42, listY);
                        listY += lineHeight;
                    }
                    if (this.scrollOffset > 0) {
                        ctx.fillStyle = '#888';
                        ctx.font = '14px monospace';
                        ctx.fillText('▲', x + boxWidth - 40, y + 102);
                    }
                    if (this.scrollOffset + maxVis < this.slots.length) {
                        ctx.fillStyle = '#888';
                        ctx.font = '14px monospace';
                        ctx.fillText('▼', x + boxWidth - 40, listY - 22);
                    }
                }

                ctx.font = '14px monospace';
                ctx.fillStyle = '#aaa';
                const action = this.mode === 'export' ? 'export' : 'delete';
                ctx.fillText('←/→: mode   ↑/↓: slot   ENTER: ' + action + ' slot   ESC: cancel', x + 20, y + boxHeight - 25);
            }
        }
        else { // IMPORT mode
            ctx.font = '18px "Press Start 2P", monospace';
            ctx.fillStyle = '#ff8';
            ctx.fillText('Load from .sav file', x + 70, y + 140);
            ctx.font = '16px monospace';
            ctx.fillStyle = '#8af';
            ctx.fillText('Press ENTER to select a file', x + 110, y + 200);
            ctx.font = '14px monospace';
            ctx.fillStyle = '#aaa';
            ctx.fillText('←/→: mode   ENTER: import   ESC: cancel', x + 20, y + boxHeight - 25);
        }
    }
}

const modesOrder: ImportExportMode[] = ['export', 'import', 'delete'];

export { ImportExportDialog };
