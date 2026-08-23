// save-restore.ts – Canvas-based save/restore dialogs for Zeliard
import { getSaveSlotNames } from '../platform/save.js';

type ConfirmCallback = (slotName: string | null) => void;
type CancelCallback = () => void;

// Base class for both save and restore dialogs
class BaseSaveRestoreDialog {
    readonly title: string;
    readonly includeRestart: boolean;
    readonly showNewNameInput: boolean;  // true for Save, false for Restore
    readonly onConfirm: ConfirmCallback;
    readonly onCancel: CancelCallback;

    items: string[] = [];
    selectedIndex = 0;
    inputText = '';
    inputActive: boolean;
    cursorBlink = false;
    maxNameLength = 12;
    visible = true;
    scrollOffset = 0;

    constructor(title: string, includeRestart: boolean, showNewNameInput: boolean,
                onConfirm: ConfirmCallback, onCancel: CancelCallback) {
        this.title = title;
        this.includeRestart = includeRestart;
        this.showNewNameInput = showNewNameInput;
        this.onConfirm = onConfirm;
        this.onCancel = onCancel;
        this.inputActive = showNewNameInput; // only active if input is shown
    }

    refreshItems(): void {
        const slots = getSaveSlotNames();
        this.items = this.includeRestart ? ['Re-Start', ...slots] : [...slots];
        if (this.selectedIndex >= this.items.length) this.selectedIndex = Math.max(0, this.items.length - 1);
        this._clampScroll();
        // In restore mode, ensure inputActive is false
        if (!this.showNewNameInput) this.inputActive = false;
    }

    _maxVisible(): number {
        return this.showNewNameInput ? 7 : 8;
    }

    _clampScroll(): void {
        const maxVis = this._maxVisible();
        if (this.selectedIndex < this.scrollOffset) this.scrollOffset = this.selectedIndex;
        if (this.selectedIndex >= this.scrollOffset + maxVis) this.scrollOffset = this.selectedIndex - maxVis + 1;
        if (this.scrollOffset > Math.max(0, this.items.length - maxVis)) this.scrollOffset = Math.max(0, this.items.length - maxVis);
    }

    handleKey(keyCode: string, _now: number): boolean {
        if (keyCode === 'Escape') {
            this.onCancel();
            return true;
        }

        // --- Restore mode: no text input ---
        if (!this.showNewNameInput) {
            if (keyCode === 'ArrowUp') {
                this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
                this._clampScroll();
                return true;
            }
            if (keyCode === 'ArrowDown') {
                this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
                this._clampScroll();
                return true;
            }
            if (keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                const selected = this.items[this.selectedIndex];
                if (selected === 'Re-Start') {
                    this.onConfirm(null);
                } else if (selected) {
                    this.onConfirm(selected);
                }
                return true;
            }
            return false;
        }

        // --- Save mode: text input + list ---
        if (this.inputActive) {
            if (keyCode === 'ArrowUp' || keyCode === 'ArrowDown') {
                this.inputActive = false;
                if (this.items.length === 0) this.selectedIndex = 0;
                else if (keyCode === 'ArrowUp') this.selectedIndex = this.items.length - 1;
                else if (this.selectedIndex >= this.items.length) this.selectedIndex = this.items.length - 1;
                this._clampScroll();
                return true;
            }
            if (keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                const name = this.inputText.trim();
                if (name.length > 0) {
                    this.onConfirm(name);
                }
                return true;
            }
            if (keyCode === 'Backspace') {
                this.inputText = this.inputText.slice(0, -1);
                return true;
            }
            if (keyCode.length === 1 && /[a-zA-Z0-9 ]/.test(keyCode)) {
                if (this.inputText.length < this.maxNameLength) {
                    this.inputText += keyCode;
                }
                return true;
            }
            return false;
        } else {
            // List navigation in save mode
            if (keyCode === 'ArrowUp') {
                if (this.selectedIndex === 0) {
                    this.inputActive = true;
                } else {
                    this.selectedIndex--;
                    this._clampScroll();
                }
                return true;
            }
            if (keyCode === 'ArrowDown') {
                if (this.selectedIndex === this.items.length - 1) {
                    this.inputActive = true;
                } else {
                    this.selectedIndex++;
                    this._clampScroll();
                }
                return true;
            }
            if (keyCode === 'Enter' || keyCode === 'Space' || keyCode === ' ') {
                const selected = this.items[this.selectedIndex];
                if (selected === 'Re-Start') {
                    this.onConfirm(null);
                } else if (selected) {
                    this.onConfirm(selected);
                }
                return true;
            }
            if (keyCode.length === 1 && /[a-zA-Z0-9 ]/.test(keyCode)) {
                this.inputActive = true;
                this.inputText += keyCode;
                return true;
            }
            return false;
        }
    }

    draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, now: number): void {
        this.cursorBlink = Math.sin(now / 500) > 0;

        const boxWidth = 480;
        const boxHeight = 360;
        const x = (canvasWidth - boxWidth) / 2;
        const y = (canvasHeight - boxHeight) / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        ctx.strokeStyle = '#ca6';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, boxWidth, boxHeight);
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, boxWidth, boxHeight);

        ctx.font = 'bold 24px "Press Start 2P", monospace';
        ctx.fillStyle = '#fc6';
        ctx.fillText(this.title, x + 20, y + 40);

        ctx.strokeStyle = '#862';
        ctx.beginPath();
        ctx.moveTo(x + 10, y + 60);
        ctx.lineTo(x + boxWidth - 10, y + 60);
        ctx.stroke();

        ctx.font = '18px "Press Start 2P", monospace';
        let listY = y + 100;
        const lineHeight = 28;
        const maxVis = this._maxVisible();
        for (let i = 0; i < maxVis && this.scrollOffset + i < this.items.length; i++) {
            const idx = this.scrollOffset + i;
            const isSelected = (!this.inputActive && idx === this.selectedIndex);
            ctx.fillStyle = isSelected ? '#ff8' : '#cca';
            if (isSelected) {
                ctx.beginPath();
                ctx.moveTo(x + 24, listY - 19);
                ctx.lineTo(x + 24, listY - 1);
                ctx.lineTo(x + 24 + 10, listY - 10);
                ctx.closePath();
                ctx.fill();
            }
            ctx.fillText(this.items[idx]!, x + 42, listY);
            listY += lineHeight;
        }
        if (this.scrollOffset > 0) {
            ctx.fillStyle = '#888';
            ctx.font = '14px monospace';
            ctx.fillText('▲', x + boxWidth - 40, y + 92);
        }
        if (this.scrollOffset + maxVis < this.items.length) {
            ctx.fillStyle = '#888';
            ctx.font = '14px monospace';
            ctx.fillText('▼', x + boxWidth - 40, listY - 22);
        }

        // Only draw input field if showNewNameInput is true (Save mode)
        if (this.showNewNameInput) {
            ctx.fillStyle = '#aaf';
            ctx.font = '16px "Press Start 2P", monospace';
            ctx.fillText('New name:', x + 30, listY + 10);
            const inputX = x + 180;
            const inputY = listY;
            const inputW = 220;
            const inputH = 28;
            ctx.strokeStyle = '#8af';
            ctx.strokeRect(inputX, inputY - 20, inputW, inputH);
            ctx.fillStyle = '#fff';
            ctx.fillRect(inputX, inputY - 20, inputW, inputH);
            ctx.fillStyle = '#000';
            ctx.font = '18px "Press Start 2P", monospace';
            let displayName = this.inputText;
            if (this.inputActive && this.cursorBlink) displayName += '_';
            ctx.fillText(displayName, inputX + 8, inputY + 2);
        }

        ctx.font = '12px monospace';
        ctx.fillStyle = '#888';
        ctx.fillText('UP/DOWN: switch | SPACE/ENTER: confirm | ESC: cancel', x + 20, y + boxHeight - 20);
    }
}

export class SaveDialog extends BaseSaveRestoreDialog {
    constructor(onSave: ConfirmCallback, onCancel: CancelCallback) {
        super('Save your Game', false, true, onSave, onCancel);
        this.refreshItems();
        this.inputActive = true;
        this.selectedIndex = 0;
    }
}

export class RestoreDialog extends BaseSaveRestoreDialog {
    constructor(onRestore: ConfirmCallback, onCancel: CancelCallback) {
        super('Restore Game', true, false, onRestore, onCancel);
        this.refreshItems();
        this.inputActive = false;
        this.selectedIndex = 0;
    }
}
