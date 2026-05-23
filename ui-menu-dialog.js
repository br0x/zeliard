/**
 * ui-menu-dialog.js – Reusable typewriter text and vertical menu components.
 */
export class TypewriterText {
    /**
     * @param {string} text  raw text (newlines preserved)
     * @param {string} font  canvas font, e.g. '14px "Press Start 2P"'
     * @param {number} maxWidth  maximum pixel width for word wrap
     * @param {number} charMs  milliseconds per character
     * @param {number} lineHeight  px between baselines
     * @param {CanvasRenderingContext2D} ctx  (used for measureText)
     */
    constructor(text, font, maxWidth, charMs, lineHeight, ctx) {
        this.text = text;
        this.font = font;
        this.maxWidth = maxWidth;
        this.charMs = charMs;
        this.lineHeight = lineHeight;
        this.ctx = ctx;

        this.lines = [];          // wrapped lines (array of strings)
        this.totalChars = 0;
        this.startTime = 0;
        this.done = false;
        this._wrap();
    }

    _wrap() {
        // Set the font before measuring, restore afterwards
        this.ctx.save();
        this.ctx.font = this.font;

        const lines = [];
        for (const para of this.text.split('\n')) {
            const words = para.split(' ');
            let line = '';
            for (const word of words) {
                const candidate = line ? line + ' ' + word : word;
                if (line && this.ctx.measureText(candidate).width > this.maxWidth) {
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

        this.ctx.restore();
    }

    start(now) {
        this.startTime = now;
        this.done = false;
    }

    /** Fast‑forward to end */
    skip(now) {
        this.startTime = now - this.totalChars * this.charMs;
    }

    /** Returns array of visible lines (each line clipped to visible chars) */
    getVisibleLines(now) {
        const elapsed = now - this.startTime;
        let remaining = Math.min(this.totalChars, Math.floor(elapsed / this.charMs));
        const out = [];
        for (const line of this.lines) {
            if (remaining <= 0) break;
            const visible = line.slice(0, Math.min(line.length, remaining));
            out.push(visible);
            remaining -= line.length;
        }
        return out;
    }

    isDone(now) {
        return this.done || this.getVisibleChars(now) >= this.totalChars;
    }

    getVisibleChars(now) {
        return Math.min(this.totalChars, Math.floor((now - this.startTime) / this.charMs));
    }

    /** Draw all visible lines at (x,y) */
    draw(ctx, x, y, now, alpha = 1) {
        ctx.save();
        ctx.font = this.font;
        ctx.fillStyle = '#fff';
        ctx.globalAlpha = alpha;
        const lines = this.getVisibleLines(now);
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], x, y + i * this.lineHeight);
        }
        // show cursor when fully revealed
        if (this.isDone(now) && lines.length) {
            ctx.fillStyle = '#0ee';
            this._drawDownwardArrow(ctx, x + this.maxWidth / 2 - 12, y + lines.length * this.lineHeight - 6);
        }
        ctx.restore();
    }

    _drawDownwardArrow(ctx, x, y) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 24, y);
        ctx.lineTo(x + 12, y + 14);
        ctx.closePath();
        ctx.fill();
    }
}

export class MenuList {
    /**
     * @param {string[]} items
     * @param {string} font
     * @param {number} lineHeight
     * @param {number} selectedIndex
     */
    constructor(items, font, lineHeight, selectedIndex = 0) {
        this.items = items;
        this.font = font;
        this.lineHeight = lineHeight;
        this.selectedIndex = selectedIndex;
    }

    handleArrow(dir) {
        const n = this.items.length;
        this.selectedIndex = (this.selectedIndex + dir + n) % n;
    }

    /**
     * Draw menu at (x, y). The text is drawn at (x, y + i*lineHeight),
     * and the cursor is drawn 24px to the left of x.
     */
    draw(ctx, x, y, now, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = this.font;
        for (let i = 0; i < this.items.length; i++) {
            const yi = y + i * this.lineHeight;
            const selected = i === this.selectedIndex;
            ctx.fillStyle = selected ? '#ff0' : '#fff';
            ctx.fillText(this.items[i], x, yi);
            if (selected) {
                // red right‑pointing triangle, placed to the left of the text
                ctx.fillStyle = '#f00';
                this._triangle(ctx, x - 24, yi - 18, 14, 18, false);
            }
        }
        ctx.restore();
    }

    _triangle(ctx, x, y, w, h, down) {
        ctx.beginPath();
        if (down) {
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w / 2, y + h);
        } else {
            ctx.moveTo(x, y);
            ctx.lineTo(x + w, y + h / 2);
            ctx.lineTo(x, y + h);
        }
        ctx.closePath();
        ctx.fill();
    }
}
