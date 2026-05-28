// import-export-ui.js – Canvas‑based Import/Export dialog for Zeliard
import { getSaveSlotNames } from './game.js';

class ImportExportDialog {
    constructor(onExportSlot, onImportFromFile, onCancel) {
        this.onExportSlot = onExportSlot;
        this.onImportFromFile = onImportFromFile;
        this.onCancel = onCancel;
        this.mode = 'export';        // 'export' or 'import'
        this.slots = [];
        this.selectedSlotIndex = 0;
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
        // Escape always cancels
        if (keyCode === 'Escape') {
            this.onCancel?.();
            return true;
        }

        // Left/Right switch mode
        if (keyCode === 'ArrowLeft') {
            this.mode = 'export';
            return true;
        }
        if (keyCode === 'ArrowRight') {
            this.mode = 'import';
            return true;
        }

        if (this.mode === 'export') {
            // Up/Down navigate slots
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
            // Enter or Space: export selected slot
            if (keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                if (this.slots.length > 0 && this.selectedSlotIndex < this.slots.length) {
                    const slotName = this.slots[this.selectedSlotIndex];
                    this.onExportSlot?.(slotName);
                }
                return true;
            }
        } 
        else if (this.mode === 'import') {
            // Enter or Space: open file picker
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
        const exportX = x + 60;
        const importX = x + 260;
        if (this.mode === 'export') {
            ctx.fillStyle = '#ff8';
            ctx.fillText('EXPORT', exportX, y + 50);
            ctx.fillStyle = '#888';
            ctx.fillText('IMPORT', importX, y + 50);
        } else {
            ctx.fillStyle = '#888';
            ctx.fillText('EXPORT', exportX, y + 50);
            ctx.fillStyle = '#ff8';
            ctx.fillText('IMPORT', importX, y + 50);
        }

        // Separator line
        ctx.strokeStyle = '#862';
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 70);
        ctx.lineTo(x + boxWidth - 10, y + 70);
        ctx.stroke();

        if (this.mode === 'export') {
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
                    const prefix = isSelected ? '> ' : '  ';
                    ctx.fillText(prefix + this.slots[i], x + 30, listY);
                    listY += lineHeight;
                    if (listY > y + boxHeight - 80) break;
                }
            }

            ctx.font = '14px monospace';
            ctx.fillStyle = '#aaa';
            ctx.fillText('←/→: switch mode   ↑/↓: select slot   ENTER: export slot   ESC: cancel', x + 20, y + boxHeight - 25);
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
