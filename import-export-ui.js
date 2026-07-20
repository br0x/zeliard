// import-export-ui.js – Canvas‑based Import/Export dialog for Zeliard
import { getSaveSlotNames } from './game.js';

class ImportExportDialog {
    constructor(onExportSlot, onImportFromFile, onDeleteSlot, onCancel) {
        this.onExportSlot = onExportSlot;
        this.onImportFromFile = onImportFromFile;
        this.onDeleteSlot = onDeleteSlot;
        this.onCancel = onCancel;
        this.mode = 'export';
        this.slots = [];
        this.selectedSlotIndex = 0;
        this.confirmDeleteSlot = null;
        this.refreshSlots();
        this.visible = true;
    }

    refreshSlots() {
        this.slots = getSaveSlotNames();
        if (this.selectedSlotIndex >= this.slots.length) {
            this.selectedSlotIndex = Math.max(0, this.slots.length - 1);
        }
    }

    handleKey(keyCode, now) {
        // Confirmation state: Y / Enter to confirm, N / Escape to cancel
        if (this.confirmDeleteSlot) {
            if (keyCode === 'y' || keyCode === 'Y' || keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                this.onDeleteSlot?.(this.confirmDeleteSlot);
                this.confirmDeleteSlot = null;
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
            this.onCancel?.();
            return true;
        }

        const modes = ['export', 'import', 'delete'];

        // Left/Right cycle mode
        if (keyCode === 'ArrowLeft') {
            const idx = (modes.indexOf(this.mode) - 1 + modes.length) % modes.length;
            this.mode = modes[idx];
            return true;
        }
        if (keyCode === 'ArrowRight') {
            const idx = (modes.indexOf(this.mode) + 1) % modes.length;
            this.mode = modes[idx];
            return true;
        }

        // Shared list navigation for export and delete
        if (this.mode === 'export' || this.mode === 'delete') {
            if (keyCode === 'ArrowUp') {
                if (this.slots.length > 0) {
                    this.selectedSlotIndex = (this.selectedSlotIndex - 1 + this.slots.length) % this.slots.length;
                }
                return true;
            }
            if (keyCode === 'ArrowDown') {
                if (this.slots.length > 0) {
                    this.selectedSlotIndex = (this.selectedSlotIndex + 1) % this.slots.length;
                }
                return true;
            }
            if (keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                if (this.slots.length > 0 && this.selectedSlotIndex < this.slots.length) {
                    const slotName = this.slots[this.selectedSlotIndex];
                    if (this.mode === 'export') {
                        this.onExportSlot?.(slotName);
                    } else {
                        this.confirmDeleteSlot = slotName;
                    }
                }
                return true;
            }
        } else if (this.mode === 'import') {
            if (keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                this.onImportFromFile?.();
                return true;
            }
        }

        return false;
    }

    draw(ctx, canvasWidth, canvasHeight, now) {
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
        const tabLabels = ['EXPORT', 'IMPORT', 'DELETE'];
        for (let i = 0; i < 3; i++) {
            const isActive = (i === ['export', 'import', 'delete'].indexOf(this.mode));
            ctx.fillStyle = isActive ? '#ff8' : '#888';
            ctx.fillText(tabLabels[i], tabX[i], y + 45);
        }

        // Separator line
        ctx.strokeStyle = '#862';
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 70);
        ctx.lineTo(x + boxWidth - 10, y + 70);
        ctx.stroke();

        if (this.mode === 'export' || this.mode === 'delete') {
            if (this.confirmDeleteSlot) {
                // Confirmation prompt
                ctx.font = '18px "Press Start 2P", monospace';
                ctx.fillStyle = '#f88';
                ctx.fillText('Delete this save?', x + 100, y + 140);
                ctx.font = '16px monospace';
                ctx.fillStyle = '#ff8';
                ctx.fillText('"' + this.confirmDeleteSlot + '"', x + 140, y + 190);
                ctx.font = '16px "Press Start 2P", monospace';
                ctx.fillStyle = '#aaa';
                ctx.fillText('[ Y ] Yes   [ N ] No', x + 130, y + 250);
                ctx.font = '14px monospace';
                ctx.fillStyle = '#aaa';
                ctx.fillText('Y: confirm   N / ESC: cancel', x + 120, y + boxHeight - 25);
            } else {
                // List save slots
                ctx.font = '18px "Press Start 2P", monospace';
                let listY = y + 110;
                const lineHeight = 30;
                if (this.slots.length === 0) {
                    ctx.fillStyle = '#aaa';
                    ctx.fillText('(no saved games)', x + 40, listY);
                } else {
                    for (let i = 0; i < this.slots.length; i++) {
                        const isSelected = (i === this.selectedSlotIndex);
                        ctx.fillStyle = isSelected ? '#ff8' : '#cca';
                        if (isSelected) {
                            ctx.beginPath();
                            ctx.moveTo(x + 24, listY - 19);
                            ctx.lineTo(x + 24, listY - 1);
                            ctx.lineTo(x + 24 + 10, listY - 10);
                            ctx.closePath();
                            ctx.fill();
                        }
                        ctx.fillText(this.slots[i], x + 42, listY);
                        listY += lineHeight;
                        if (listY > y + boxHeight - 80) break;
                    }
                }

                ctx.font = '14px monospace';
                ctx.fillStyle = '#aaa';
                const action = this.mode === 'export' ? 'export' : 'delete';
                ctx.fillText('←/→: switch mode   ↑/↓: select slot   ENTER: ' + action + ' slot   ESC: cancel', x + 20, y + boxHeight - 25);
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
            ctx.fillText('←/→: switch mode   ENTER: import   ESC: cancel', x + 20, y + boxHeight - 25);
        }
    }
}

export { ImportExportDialog };
