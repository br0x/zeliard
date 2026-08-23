/**
 * menu-dialog.ts — Reusable typewriter text and vertical menu components.
 */

export interface YesNoColors {
    borderOuter?: string;
    borderInner?: string;
    bg?: string;
    text?: string;
    selected?: string;
    cursor?: string;
}

export class TypewriterText {
    readonly text: string;
    readonly font: string;
    readonly maxWidth: number;
    readonly charMs: number;
    readonly lineHeight: number;
    readonly dlgHeight: number;

    /** wrapped lines */
    readonly lines: string[];
    readonly totalChars: number;

    startTime = 0;
    done = false;

    constructor(text: string, font: string, maxWidth: number, charMs: number,
                lineHeight: number, dlgHeight: number, ctx: CanvasRenderingContext2D) {
        this.text = text;
        this.font = font;
        this.maxWidth = maxWidth;
        this.charMs = charMs;
        this.lineHeight = lineHeight;
        this.dlgHeight = dlgHeight;

        // Set the font before measuring, restore afterwards
        ctx.save();
        ctx.font = font;

        const lines: string[] = [];
        for (const para of text.split('\n')) {
            const words = para.split(' ');
            let line = '';
            for (const word of words) {
                const candidate = line ? line + ' ' + word : word;
                if (line && ctx.measureText(candidate).width > maxWidth) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            }
            if (line) lines.push(line);
        }
        this.lines = lines;
        this.totalChars = lines.reduce((s, l) => s + l.length, 0);

        ctx.restore();
    }

    start(now: number): void {
        this.startTime = now;
        this.done = false;
    }

    /** Fast-forward to end */
    skip(now: number): void {
        this.startTime = now - this.totalChars * this.charMs;
    }

    getVisibleChars(now: number): number {
        return Math.min(this.totalChars, Math.floor((now - this.startTime) / this.charMs));
    }

    /** Returns array of visible lines (each line clipped to visible chars) */
    getVisibleLines(now: number): string[] {
        let remaining = Math.min(this.totalChars, Math.floor((now - this.startTime) / this.charMs));
        const out: string[] = [];
        for (const line of this.lines) {
            if (remaining <= 0) break;
            const visible = line.slice(0, Math.min(line.length, remaining));
            out.push(visible);
            remaining -= line.length;
        }
        return out;
    }

    isDone(now: number): boolean {
        return this.done || this.getVisibleChars(now) >= this.totalChars;
    }

    /** Draw all visible lines at (x,y) */
    draw(ctx: CanvasRenderingContext2D, x: number, y: number, now: number, alpha = 1): void {
        ctx.save();
        ctx.font = this.font;
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = alpha;
        const lines = this.getVisibleLines(now);
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i]!, x, y + i * this.lineHeight);
        }
        // show cursor when fully revealed
        if (this.isDone(now) && lines.length) {
            ctx.fillStyle = '#0ee';
            drawDownwardArrow(ctx, x + this.maxWidth / 2 - 12, y + this.dlgHeight - 40);
        }
        ctx.restore();
    }
}

function drawDownwardArrow(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 24, y);
    ctx.lineTo(x + 12, y + 14);
    ctx.closePath();
    ctx.fill();
}

function drawRightTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h / 2);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
}

export class MenuList {
    readonly items: string[];
    readonly font: string;
    readonly lineHeight: number;
    selectedIndex: number;

    constructor(items: string[], font: string, lineHeight: number, selectedIndex = 0) {
        this.items = items;
        this.font = font;
        this.lineHeight = lineHeight;
        this.selectedIndex = selectedIndex;
    }

    handleArrow(dir: number): void {
        const n = this.items.length;
        this.selectedIndex = (this.selectedIndex + dir + n) % n;
    }

    /**
     * Draw menu at (x, y). The text is drawn at (x, y + i*lineHeight),
     * and the cursor is drawn 24px to the left of x.
     */
    draw(ctx: CanvasRenderingContext2D, x: number, y: number, _now: number, alpha = 1): void {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = this.font;
        for (let i = 0; i < this.items.length; i++) {
            const yi = y + i * this.lineHeight;
            const selected = i === this.selectedIndex;
            ctx.fillStyle = selected ? '#ff0' : '#fff';
            ctx.fillText(this.items[i]!, x, yi);
            if (selected) {
                // red right-pointing triangle, placed to the left of the text
                ctx.fillStyle = '#f00';
                drawRightTriangle(ctx, x - 24, yi - 18, 14, 18);
            }
        }
        ctx.restore();
    }
}

/**
 * Small "Yes / No" confirmation box drawn on top of a dimmed menu,
 * mirroring the original's show_yes_no_dialog.  Cursor starts on "Yes";
 * ArrowUp/ArrowDown toggles the selection, Enter/Space picks it, and the
 * caller treats Escape as "No".
 */
export class YesNoDialog {
    readonly font: string;
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
    selectedIndex: number;
    colors: Required<YesNoColors>;

    constructor(_ctx: CanvasRenderingContext2D, font: string, x: number, y: number, w: number, h: number,
                selectedIndex = 0, colors: YesNoColors = {}) {
        this.font = font;
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.selectedIndex = selectedIndex;
        this.colors = {
            borderOuter: '#ccc',
            borderInner: '#888',
            bg: '#000',
            text: '#fff',
            selected: '#ff0',
            cursor: '#f00',
            ...colors,
        };
    }

    get isYes(): boolean {
        return this.selectedIndex === 0;
    }

    handleArrow(dir: number): void {
        this.selectedIndex = Math.max(0, Math.min(1, this.selectedIndex + dir));
    }

    draw(ctx: CanvasRenderingContext2D, alpha = 1): void {
        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.strokeStyle = this.colors.borderOuter;
        ctx.lineWidth   = 2;
        ctx.strokeRect(this.x - 2, this.y - 2, this.w + 4, this.h + 4);
        ctx.strokeStyle = this.colors.borderInner;
        ctx.lineWidth   = 1;
        ctx.strokeRect(this.x, this.y, this.w, this.h);
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(this.x, this.y, this.w, this.h);

        const items  = ['Yes', 'No'];
        const textX  = this.x + 30;
        const firstY = this.y + 34;
        const lineH  = 40;
        ctx.font = this.font;
        for (let i = 0; i < items.length; i++) {
            const yi  = firstY + i * lineH;
            const sel = i === this.selectedIndex;
            ctx.fillStyle = sel ? this.colors.selected : this.colors.text;
            ctx.fillText(items[i]!, textX, yi);
            if (sel) {
                ctx.fillStyle = this.colors.cursor;
                drawRightTriangle(ctx, this.x + 10, yi - 16, 10, 16);
            }
        }
        ctx.restore();
    }
}
