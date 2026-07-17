/**
 * indoor-bank.js – Bank indoor scene.
 *
 * Faithful port of bankpro.asm.  Supports:
 *   • Entering animation – clerk writes in ledger (writing1/writing2 cycling, played while "....." is typed),
 *     then notices the player (notice1→notice2→notice3), played while "Oh, excuse me." is typed.
 *   • After greeting, frame stays at notice3.
 *   • Laughing animation – triggered when player deposits ≥ 1000 gold in one transaction;
 *     laughing1/laughing2 loop until any menu option is chosen, then show static notice3.
 *   • Exiting animation – entering animation played in reverse (notice3→notice2→notice1 and 5 cycles of writing1/writing2),
 *     then fade out and return to town.
 *   • Exchange almas  – trade almas for gold at the town-specific rate.
 *   • Deposit money   – numeric entry, deduct from hero gold, add to bank gold.
 *   • Withdraw money  – numeric entry, deduct from bank gold, add to hero gold.
 *   • Check balance   – display bank account balance.
 *
 * Memory layout mirrors common.inc / bankpro.asm variable names.
 */

import { IndoorSceneBase } from './indoor-base.js';
import { TypewriterText }  from './ui-menu-dialog.js';

// ─── Layout ───────────────────────────────────────────────────────────────────
const PANEL_W = 672;
const PANEL_H = 432;

const IMG_X = 16,  IMG_Y = 16;
const IMG_W = 291, IMG_H = 192;   // clerk portrait area

const MENU_X = IMG_X + IMG_W + 16;
const MENU_Y = IMG_Y;
const MENU_W = PANEL_W - MENU_X - 16;
const MENU_H = IMG_H;

const DLG_X = 16;
const DLG_Y = IMG_Y + IMG_H + 14;
const DLG_W = PANEL_W - 32;
const DLG_H = PANEL_H - DLG_Y - 16;

const NUM_X  = MENU_X;            // numeric-entry panel (deposit / withdraw)
const NUM_Y  = MENU_Y;
const NUM_W  = MENU_W;
const NUM_H  = MENU_H;

const FONT_MENU  = '13px "Press Start 2P", monospace';
const FONT_DLG   = '13px "Press Start 2P", monospace';
const LINE_H_MNU = 36;
const LINE_H_DLG = 20;
const CHAR_MS    = 28;

const MENU_TEXT_X  = MENU_X + 28;
const MENU_TEXT_Y  = MENU_Y + 26;
const CURSOR_X     = MENU_X + 6;
const DLG_TEXT_X   = DLG_X  + 14;
const DLG_TEXT_Y   = DLG_Y  + 22;

// ─── Animation image paths ────────────────────────────────────────────────────
const WRITING_FRAMES  = [
    'assets/images/bank/writing1.png',
    'assets/images/bank/writing2.png',
];
const NOTICE_FRAMES   = [
    'assets/images/bank/notice1.png',
    'assets/images/bank/notice2.png',
    'assets/images/bank/notice3.png',
];
const LAUGHING_FRAMES = [
    'assets/images/bank/laughing1.png',
    'assets/images/bank/laughing2.png',
];

// Timing (milliseconds)
const WRITING_FRAME_MS  = 320;   // alternation speed for writing anim
const NOTICE_FRAME_MS   = 420;   // speed for notice sequence
const LAUGHING_FRAME_MS = 260;   // speed for laughing loop
const NUM_REPEAT_FRAME_MS      = 5;
const NUM_REPEAT_INITIAL_FRAMES = 35;
const NUM_REPEAT_MIN_FRAMES     = 1;

// ─── Entering/exiting animation sequence ──────────────────────────────────────
// The entering anim plays:
//   • WRITING_REPEAT times of  [writing1, writing2]
//   • then once: [notice1, notice2, notice3]
// The exiting anim is the exact reverse.
const WRITING_REPEAT = 5;   // ASM: mov cx, 5 at loc_A071

// Build the flat frame list for entering (forward) sequence:
//   writing1, writing2, writing1, writing2, …  (WRITING_REPEAT pairs)
//   notice1, notice2, notice3
function buildEnterSequence() {
    const seq = [];
    for (let i = 0; i < WRITING_REPEAT; i++) {
        seq.push({ type: 'writing', idx: 0 });
        seq.push({ type: 'writing', idx: 1 });
    }
    seq.push({ type: 'notice', idx: 0 });
    seq.push({ type: 'notice', idx: 1 });
    seq.push({ type: 'notice', idx: 2 });
    return seq;
}
const ENTER_SEQ = buildEnterSequence();
const EXIT_SEQ  = [...ENTER_SEQ].reverse();

// ─── Main menu ────────────────────────────────────────────────────────────────
const MENU_ITEMS = [
    'Go outside',
    'Exchange almas',
    'Deposit money',
    'Withdraw money',
    'Check balance',
];
const MI_GO_OUTSIDE      = 0;
const MI_EXCHANGE_ALMAS  = 1;
const MI_DEPOSIT         = 2;
const MI_WITHDRAW        = 3;
const MI_BALANCE         = 4;

// ─── Almas exchange rates by town (bankpro.asm almas_exchange_rates_by_town) ─
// Each entry [almasGiven, goldsReceived], matching the original ASM's
// little-endian word layout (low byte = almas, high byte = gold).
const ALMAS_RATES = [
    [1, 6],   // Muralla  (town 1) — 1 alma → 6 gold
    [1, 6],   // Satono   (town 2)
    [1, 8],   // Bosque   (town 3) — 1 alma → 8 gold
    [1, 4],   // Helada   (town 4) — 1 alma → 4 gold
    [1, 2],   // Tumba    (town 5) — 1 alma → 2 gold
    [1, 4],   // Dorado   (town 6) — 1 alma → 4 gold
    [4, 2],   // Llama    (town 7) — 4 almas → 2 gold
    [1, 6],   // Pureza   (town 8) — 1 alma → 6 gold
    [1, 8],   // Esco     (town 9) — 1 alma → 8 gold
];

// ─── Memory addresses (common.inc) ───────────────────────────────────────────
const ADDR_PLACE_MAP_ID  = 0xC4;   // town id byte (0x81..0x89 = towns 1..9)
const ADDR_GOLD_HI       = 0x85;   // 24-bit hero gold: hi byte
const ADDR_GOLD_LO       = 0x86;   // 24-bit hero gold: lo word (2 bytes, LE)
const ADDR_BANK_HI       = 0x88;   // 16-bit bank gold: hi byte
const ADDR_BANK_LO       = 0x89;   // 16-bit bank gold: lo byte (word at 0x88)
const ADDR_ALMAS         = 0x8B;   // 16-bit hero almas (word, LE)

// ─── Numeric-entry labels (mirroring the on-screen layout in original) ────────
// In the original, the deposit/withdraw screen shows two rows:
//   "GOLD CARRIED" / "GOLD IN BANK"   (current holdings, top)
//   "DEPOSIT AMT"  / "WITHDRAW AMT"   (amount being entered, bottom)
const DEPOSIT_LABELS  = ['GOLD CARRIED', 'DEPOSIT AMT' ];
const WITHDRAW_LABELS = ['GOLD IN BANK', 'WITHDRAW AMT'];

// ─── Scene class ──────────────────────────────────────────────────────────────

export class BankScene extends IndoorSceneBase {

    constructor(context) {
        super(context);
        this.renderGoldHud = context.renderGoldHud;
        this.renderAlmasHud = context.renderAlmasHud;

        // ── Image caches ─────────────────────────────────────────────────────
        this.writingImgs  = [];
        this.noticeImgs   = [];
        this.laughingImgs = [];

        // ── Animation state ──────────────────────────────────────────────────
        // animPhase:
        //   'entering'  – playing ENTER_SEQ frame-by-frame (dots + "Oh, excuse me.")
        //   'idle'      – writing1/2 loop during normal menu operation
        //   'laughing'  – laughing1/2 loop after large deposit
        //   'exiting'   – playing EXIT_SEQ frame-by-frame then fade out
        this.animPhase       = 'entering';
        this.animSeqIdx      = 0;       // index into current sequence
        this.animFrameTimer  = 0;       // ms timestamp of last frame switch
        this.idleFrameIdx    = 0;       // 0 or 1 for writing loop
        this.idleLastSwitch  = 0;
        this.laughFrameIdx   = 0;
        this.laughLastSwitch = 0;

        // ── Bank logic phase ─────────────────────────────────────────────────
        // 'loading'     → images loading
        // 'entering'    → entrance animation + "....." + "Oh, excuse me. "
        // 'greeting'    → "Can I help you?" dialog
        // 'menu'        → main menu shown
        // 'dialog'      → plain dismissible dialog shown
        // 'numentry'    → numeric deposit/withdraw input
        // 'confirm_exchange' → yes/no confirmation for almas exchange
        // 'exiting'     → exit animation plays, then fade out
        this.bankPhase       = 'loading';
        this.menuSel         = 0;

        // numeric-entry state
        this.numLabels       = DEPOSIT_LABELS;  // which labels to show
        this.numAmount       = 0;               // amount being entered
        this.numMax          = 0;               // maximum allowed
        this.numMode         = 'deposit';       // 'deposit' | 'withdraw'
        this._numRepeatTimer = 0;               // for key-repeat acceleration
        this._numKeyHeld     = null;
        this._numRepeatDelay = NUM_REPEAT_INITIAL_FRAMES;

        // flags mirroring bankpro.asm local variables
        this._hadLargeDeposit  = false;   // byte_AD23: did a deposit this session
        this._hadLargeSum      = false;   // byte_AD24: deposited >= 1000 gold once
        this._laughingActive   = false;   // byte_AD21: laughing anim flag
        this._almasRateFrom    = 0;       // byte_AD25
        this._almasRateTo      = 0;       // byte_AD26

        // exit-goodbye variant (mirrors which dialog is set on "Go outside")
        this._goodbyeMsg     = null;

        // dialog machinery
        this.typewriter           = null;
        this.dlgBuffer            = [];
        this._pendingLine         = null;
        this._dlgQueue            = [];
        this._dlgQueueIndex       = 0;
        this._dlgQueueAdvanceAt   = null;
        this._dlgCharMs           = CHAR_MS;
        this._dlgRevealFirstChar  = false;
        this._dlgAutoAdvance      = false;

        // after dialog is dismissed, what happens next
        this._afterDialog        = null;   // function (now) called on Space press

        this.fadeInMs  = 650;
        this.fadeOutMs = 450;
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    async onEnter(now) {
        try {
            const [w, n, l] = await Promise.all([
                Promise.all(WRITING_FRAMES .map(p => this._loadImg(p))),
                Promise.all(NOTICE_FRAMES  .map(p => this._loadImg(p))),
                Promise.all(LAUGHING_FRAMES.map(p => this._loadImg(p))),
            ]);
            this.writingImgs  = w;
            this.noticeImgs   = n;
            this.laughingImgs = l;
        } catch (e) {
            console.error('[Bank] image load failed:', e);
            this.finish();
            return;
        }

        const startNow = performance.now();
        this.animSeqIdx     = 0;
        this.animFrameTimer = startNow;
        this.animPhase      = 'entering';
        this.bankPhase      = 'entering';

        // First dialog line: five dots — the ASM types these as "." chars,
        // one per frame-group (unk_A989 = form-feed, unk_A98B = ".")
        this._setDialog('.....', null, WRITING_FRAME_MS * 2, true);
        // After dots finish, "Oh, excuse me. " is shown (set inside _tickEnterAnim)
    }

    _loadImg(src) {
        return new Promise((resolve, reject) => {
            const img   = new Image();
            img.onload  = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed: ${src}`));
            img.src     = src;
        });
    }

    // ── Memory helpers ────────────────────────────────────────────────────────

    _read(addr, len = 1) {
        return this.readMemory ? this.readMemory(addr, len) : new Array(len).fill(0);
    }
    _write(addr, bytes) {
        if (this.writeMemory) this.writeMemory(addr, bytes);
    }

    _getTownId() {
        // place_map_id: 0x81=Muralla, 0x82=Satono, … 0x89=Esco.
        // 1-based town index = (place_map_id & 0x7F) – 0x80 + 1 = raw & 0x0F
        return (this._read(ADDR_PLACE_MAP_ID, 1)[0] & 0x0F) || 1;
    }

    /** Hero gold: 24-bit – hi byte at 0x85, lo word at 0x86 (LE) */
    _getHeroGold() {
        const hi = this._read(ADDR_GOLD_HI, 1)[0] & 0xFF;
        const b  = this._read(ADDR_GOLD_LO, 2);
        return (hi * 0x10000) + ((b[0] & 0xFF) | ((b[1] & 0xFF) << 8));
    }
    _setHeroGold(amount) {
        const v  = Math.max(0, Math.floor(amount));
        const hi = (v >>> 16) & 0xFF;
        const lo = v & 0xFFFF;
        this._write(ADDR_GOLD_HI, [hi]);
        this._write(ADDR_GOLD_LO, [lo & 0xFF, (lo >> 8) & 0xFF]);
        this.renderGoldHud?.();
    }

    /** Bank gold: 16-bit – hi byte at 0x88, lo byte at 0x89 (LE word) */
    _getBankGold() {
        const b = this._read(ADDR_BANK_HI, 2);
        return (b[0] & 0xFF) | ((b[1] & 0xFF) << 8);
    }
    _setBankGold(amount) {
        const v = Math.max(0, Math.floor(amount)) & 0xFFFF;
        this._write(ADDR_BANK_HI, [v & 0xFF, (v >> 8) & 0xFF]);
    }

    /** Hero almas: 16-bit word at 0x8B (LE) */
    _getAlmas() {
        const b = this._read(ADDR_ALMAS, 2);
        return (b[0] & 0xFF) | ((b[1] & 0xFF) << 8);
    }
    _setAlmas(amount) {
        const v = Math.max(0, Math.floor(amount)) & 0xFFFF;
        this._write(ADDR_ALMAS, [v & 0xFF, (v >> 8) & 0xFF]);
        this.renderAlmasHud?.();
    }

    // ── Dialog machinery ──────────────────────────────────────────────────────

    get _dlgMaxLines() {
        return Math.floor((DLG_H - 22 - 40) / LINE_H_DLG);
    }

    _wrapText(text) {
        this.ctx.save();
        this.ctx.font = FONT_DLG;
        const maxW = DLG_W - 28;
        const lines = [];
        for (const para of text.split('\n')) {
            const words = para.split(' ');
            let line = '';
            for (const word of words) {
                const candidate = line ? line + ' ' + word : word;
                if (line && this.ctx.measureText(candidate).width > maxW) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            }
            if (line) lines.push(line);
        }
        this.ctx.restore();
        return lines;
    }

    _startTypewriterLine(line) {
        this._pendingLine = line;
        this.typewriter   = new TypewriterText(
            line, FONT_DLG, DLG_W - 28,
            this._dlgCharMs, LINE_H_DLG, DLG_H, this.ctx
        );
        const now = performance.now();
        this.typewriter.start(this._dlgRevealFirstChar ? now - this._dlgCharMs : now);
        this._dlgRevealFirstChar = false;
    }

    _setDialog(text, afterFn = null, charMs = CHAR_MS, revealFirstChar = false, autoAdvance = false) {
        const lines = this._wrapText(text);
        if (!lines.length) return;
        this.dlgBuffer          = [];
        this._pendingLine       = null;
        this._dlgQueue          = lines;
        this._dlgQueueIndex     = 0;
        this._dlgQueueAdvanceAt = null;
        this._dlgCharMs         = charMs;
        this._dlgRevealFirstChar = revealFirstChar;
        this._dlgAutoAdvance    = autoAdvance;
        this._afterDialog       = afterFn;
        this._showNextDlgLine();
    }

    _setAutoDialog(text, afterFn = null) {
        this._setDialog(text, afterFn, CHAR_MS, false, true);
    }

    _appendDialogText(text, afterFn = null, charMs = CHAR_MS, autoAdvance = false) {
        const base = this._pendingLine !== null
            ? this._pendingLine
            : (this.dlgBuffer.length ? this.dlgBuffer.pop() : '');
        const line = base + text;

        this._pendingLine       = line;
        this._dlgQueue          = [line];
        this._dlgQueueIndex     = 1;
        this._dlgQueueAdvanceAt = null;
        this._dlgCharMs         = charMs;
        this._dlgRevealFirstChar = false;
        this._dlgAutoAdvance    = autoAdvance;
        this._afterDialog       = afterFn;

        this.typewriter = new TypewriterText(
            line, FONT_DLG, DLG_W - 28,
            charMs, LINE_H_DLG, DLG_H, this.ctx
        );
        this.typewriter.start(performance.now() - base.length * charMs);
    }

    _showNextDlgLine() {
        if (this._dlgQueueIndex >= this._dlgQueue.length) return;
        const line   = this._dlgQueue[this._dlgQueueIndex++];
        const isLast = this._dlgQueueIndex >= this._dlgQueue.length;
        if (this._pendingLine !== null) {
            this.dlgBuffer.push(this._pendingLine);
            this._pendingLine = null;
        }
        this._startTypewriterLine(line);
        this._dlgQueueAdvanceAt = isLast ? null : 'pending';
    }

    _tickDlgQueue(now) {
        if (!this._dlgQueue || this._dlgQueueIndex >= this._dlgQueue.length) return;
        if (this._dlgQueueAdvanceAt === 'pending') {
            if (this.typewriter && this.typewriter.isDone(now)) {
                this._dlgQueueAdvanceAt = now;
            }
        } else if (this._dlgQueueAdvanceAt !== null && now >= this._dlgQueueAdvanceAt) {
            this._dlgQueueAdvanceAt = null;
            this._showNextDlgLine();
        }
    }

    _dlgScrollTop() {
        return Math.max(0, this.dlgBuffer.length + 1 - this._dlgMaxLines);
    }

    _dlgDone(now) {
        return (
            this.typewriter && this.typewriter.isDone(now) &&
            (!this._dlgQueue || this._dlgQueueIndex >= this._dlgQueue.length)
        );
    }

    _dlgArrowVisible(now) {
        if (this._dlgAutoAdvance) return false;
        if (!this._dlgDone(now)) return false;
        return (
            this.bankPhase === 'dialog'          ||
            this.bankPhase === 'confirm_exchange'
        );
    }

    _finishDialog(now) {
        if (this._pendingLine !== null) {
            this.dlgBuffer.push(this._pendingLine);
            this._pendingLine = null;
        }
        this.typewriter = null;
        this._dlgAutoAdvance = false;
        if (this._afterDialog) {
            const fn = this._afterDialog;
            this._afterDialog = null;
            fn(now);
        }
    }

    // ── Animation helpers ─────────────────────────────────────────────────────

    _currentFrame(now) {
        switch (this.animPhase) {
            case 'entering':
            case 'exiting': {
                const seq   = this.animPhase === 'entering' ? ENTER_SEQ : EXIT_SEQ;
                const entry = seq[Math.min(this.animSeqIdx, seq.length - 1)];
                if (!entry) return null;
                if (entry.type === 'writing') return this.writingImgs[entry.idx]  || null;
                if (entry.type === 'notice')  return this.noticeImgs[entry.idx]   || null;
                return null;
            }
            case 'idle': {
                return this.noticeImgs[2] || null;
            }
            case 'laughing': {
                if (now - this.laughLastSwitch >= LAUGHING_FRAME_MS) {
                    this.laughLastSwitch = now;
                    this.laughFrameIdx   = (this.laughFrameIdx + 1) % 2;
                }
                return this.laughingImgs[this.laughFrameIdx] || null;
            }
        }
        return null;
    }

    /**
     * Advance the entering/exiting frame sequence.
     * Returns true once the full sequence has completed.
     */
    _tickEnterExitAnim(now) {
        const seq   = this.animPhase === 'exiting' ? EXIT_SEQ : ENTER_SEQ;
        const entry = seq[this.animSeqIdx];
        if (!entry) return true;
        const hold = (entry.type === 'writing') ? WRITING_FRAME_MS : NOTICE_FRAME_MS;
        if (now - this.animFrameTimer >= hold) {
            this.animFrameTimer = now;
            this.animSeqIdx++;
            if (this.animSeqIdx >= seq.length) return true;
        }
        return false;
    }

    // ── Main draw ─────────────────────────────────────────────────────────────

    drawContent(now, alpha) {
        this._tickDlgQueue(now);
        this._tickBankLogic(now);
        if (this._dlgAutoAdvance && this._dlgDone(now)) {
            this._finishDialog(now);
        }

        this._drawClerkPortrait(now);
        if (this.bankPhase === 'menu' || this.bankPhase === 'dialog' ||
            this.bankPhase === 'numentry' || this.bankPhase === 'confirm_exchange') {
            this._drawMainMenu(alpha);
        }
        if (this.bankPhase === 'numentry') {
            this._drawNumEntry(now, alpha);
        }
        this._drawDialogBox(now, alpha);
    }

    _tickBankLogic(now) {
        // ── Entering phase ───────────────────────────────────────────────────
        // The ASM structure (sub_A004):
        //   1. Show dialog "....." (unk_A989 + 5× unk_A98B = form-feed + 5 dots)
        //      while looping the writing1/writing2 frames 5 times (loc_A071).
        //   2. Show dialog "Oh, excuse me. " while playing notice1→notice3 once.
        //   3. Fade in to menu ("Can I help you?").
        //
        // We gate each stage by tracking _enterStage (0=dots, 1=excuse, 2=done).
        if (this.bankPhase === 'entering') {
            if (this._enterStage === undefined) this._enterStage = 0;

            this._tickEnterExitAnim(now);   // advance animation regardless

            if (this._enterStage === 0) {
                // Dots dialog: one dot is revealed for each writing1/writing2
                // cycle, then the clerk looks up and speaks.
                const writingDone = this.animSeqIdx >= WRITING_REPEAT * WRITING_FRAMES.length;
                if (writingDone && this._dlgDone(now)) {
                    this._enterStage = 1;
                    this._appendDialogText('Oh, excuse me. ');
                }
            } else if (this._enterStage === 1) {
                // "Oh, excuse me.": wait until the full enter sequence is done
                // AND the dialog is typed.
                const seqDone = this.animSeqIdx >= ENTER_SEQ.length;
                if (seqDone && this._dlgDone(now)) {
                    this._enterStage = 2;
                    this.animPhase      = 'idle';
                    this.idleFrameIdx   = 0;
                    this.idleLastSwitch = now;

                    this.bankPhase = 'greeting';
                    this._appendDialogText('Can I help you?', (n) => {
                        this.bankPhase = 'menu';
                    }, CHAR_MS, true);
                }
            }
            return;
        }

        // ── Exiting phase: run exit animation, then trigger fade-out ─────────
        if (this.bankPhase === 'exiting') {
            const done = this._tickEnterExitAnim(now);
            if (done) {
                this.startFadeOut(now);
            }
            return;
        }

        // ── Greeting: wait for Space ──────────────────────────────────────────
        // (handled by handleInput / _afterDialog callback)

        // ── Laughing anim stops when menu is entered ──────────────────────────
        // (laughter was started by deposit; it loops until the player acts —
        //  handled when any menu option is selected)
    }

    // ── Rendering ─────────────────────────────────────────────────────────────

    _drawClerkPortrait(now) {
        const ctx = this.ctx;
        ctx.strokeStyle = '#44aacc';
        ctx.lineWidth   = 3;
        ctx.strokeRect(IMG_X - 2, IMG_Y - 2, IMG_W + 4, IMG_H + 4);
        ctx.fillStyle = '#000c12';
        ctx.fillRect(IMG_X, IMG_Y, IMG_W, IMG_H);
        const frame = this._currentFrame(now);
        if (frame) {
            ctx.drawImage(frame, IMG_X, IMG_Y, IMG_W, IMG_H);
        }
    }

    _drawMainMenu(alpha) {
        const ctx = this.ctx;
        ctx.save();
        // Dim the menu when numeric entry or confirm overlays are shown.
        const dimmed = (this.bankPhase === 'numentry' || this.bankPhase === 'confirm_exchange');
        ctx.globalAlpha = dimmed ? alpha * 0.25 : alpha;

        ctx.strokeStyle = '#008888'; ctx.lineWidth = 2;
        ctx.strokeRect(MENU_X - 2, MENU_Y - 2, MENU_W + 4, MENU_H + 4);
        ctx.strokeStyle = '#004444'; ctx.lineWidth = 1;
        ctx.strokeRect(MENU_X, MENU_Y, MENU_W, MENU_H);
        ctx.fillStyle = '#000a0a';
        ctx.fillRect(MENU_X, MENU_Y, MENU_W, MENU_H);

        ctx.font = FONT_MENU;
        for (let i = 0; i < MENU_ITEMS.length; i++) {
            const yi  = MENU_TEXT_Y + i * LINE_H_MNU;
            const sel = (i === this.menuSel) && !dimmed;
            ctx.fillStyle = sel ? '#ffff00' : '#aadddd';
            ctx.fillText(MENU_ITEMS[i], MENU_TEXT_X, yi);
            if (sel) {
                ctx.fillStyle = '#ff2200';
                this._triangle(ctx, CURSOR_X, yi - 18, 12, 18, false);
            }
        }
        ctx.restore();
    }

    _drawNumEntry(now, alpha) {
        const ctx    = this.ctx;
        const heroG  = this._getHeroGold();
        const bankG  = this._getBankGold();
        const labels = this.numLabels;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#aaaaff'; ctx.lineWidth = 2;
        ctx.strokeRect(NUM_X - 2, NUM_Y - 2, NUM_W + 4, NUM_H + 4);
        ctx.fillStyle = '#04040e';
        ctx.fillRect(NUM_X, NUM_Y, NUM_W, NUM_H);

        ctx.font = FONT_MENU;

        // Row 0: holdings label + value
        const topLabel = labels[0];
        const topVal   = this.numMode === 'deposit' ? heroG : bankG;
        ctx.fillStyle  = '#aaaaff';
        ctx.fillText(topLabel, NUM_X + 12, NUM_Y + 24);
        ctx.fillStyle  = '#ffffff';
        ctx.fillText(String(topVal), NUM_X + 12, NUM_Y + 50);

        // Row 1: entry label + current entered amount
        const botLabel  = labels[1];
        ctx.fillStyle   = '#aaaaff';
        ctx.fillText(botLabel, NUM_X + 12, NUM_Y + 90);
        ctx.fillStyle   = '#ffff00';
        ctx.fillText(String(this.numAmount), NUM_X + 12, NUM_Y + 116);

        // Row 2: remaining (for withdraw: how much stays in bank; for deposit: hero gold remaining)
        const remaining = this.numMax - this.numAmount;
        ctx.fillStyle   = '#66dd88';
        const remLabel  = this.numMode === 'deposit' ? 'REMAINING' : 'BALANCE AFTER';
        ctx.fillText(remLabel, NUM_X + 12, NUM_Y + 152);
        ctx.fillStyle   = '#ffffff';
        ctx.fillText(String(remaining), NUM_X + 12, NUM_Y + 178);

        ctx.restore();
    }

    _drawDialogBox(now, alpha) {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = alpha;

        ctx.strokeStyle = '#226666'; ctx.lineWidth = 2;
        ctx.strokeRect(DLG_X - 2, DLG_Y - 2, DLG_W + 4, DLG_H + 4);
        ctx.strokeStyle = '#113333'; ctx.lineWidth = 1;
        ctx.strokeRect(DLG_X, DLG_Y, DLG_W, DLG_H);
        ctx.fillStyle = '#000a08';
        ctx.fillRect(DLG_X, DLG_Y, DLG_W, DLG_H);

        ctx.font = FONT_DLG;
        ctx.fillStyle = '#aaddcc';
        const scrollTop = this._dlgScrollTop();
        let row = 0;
        for (const line of this.dlgBuffer.slice(scrollTop)) {
            ctx.fillText(line, DLG_TEXT_X, DLG_TEXT_Y + row * LINE_H_DLG);
            row++;
        }
        if (this.typewriter) {
            const vis = this.typewriter.getVisibleLines(now);
            if (vis.length) {
                ctx.fillStyle = '#aaddcc';
                ctx.fillText(vis[0], DLG_TEXT_X, DLG_TEXT_Y + row * LINE_H_DLG);
            }
        }
        if (this._dlgArrowVisible(now)) {
            ctx.fillStyle = '#00ffcc';
            const ax = DLG_X + DLG_W / 2 - 12;
            const ay = DLG_Y + DLG_H - 36;
            ctx.beginPath();
            ctx.moveTo(ax,      ay);
            ctx.lineTo(ax + 24, ay);
            ctx.lineTo(ax + 12, ay + 14);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    handleInput(key, repeat = false) {
        const now = performance.now();
        if (this.phase === 'fadeOut')    return;
        if (this.bankPhase === 'loading')    return;
        if (this.bankPhase === 'entering')   { this._handleEnterInput(key, now); return; }
        if (this.bankPhase === 'exiting')    return;
        if (this.bankPhase === 'greeting')   { this._onConfirmDialog(now); return; }
        if (this.bankPhase === 'dialog')     { this._onConfirmDialog(now); return; }
        if (this.bankPhase === 'confirm_exchange') {
            this._handleConfirmExchange(key, now); return;
        }
        if (this.bankPhase === 'numentry')   { this._handleNumEntry(key, now, repeat); return; }
        if (this.bankPhase === 'menu') {
            if (key === 'ArrowUp')   this.menuSel = (this.menuSel - 1 + MENU_ITEMS.length) % MENU_ITEMS.length;
            if (key === 'ArrowDown') this.menuSel = (this.menuSel + 1) % MENU_ITEMS.length;
            if (key === 'Space' || key === 'Enter') this._selectMenuItem(now);
            if (key === 'Escape') this._doGoOutside(now);
        }
    }

    handleHeldInput(keys, now) {
        if (this.bankPhase !== 'numentry') {
            this._resetNumRepeat();
            return;
        }

        const key = this._numHeldKeyFromState(keys);
        if (!key) {
            this._resetNumRepeat();
            return;
        }

        if (key !== this._numKeyHeld) {
            this._numKeyHeld = key;
            this._numRepeatDelay = NUM_REPEAT_INITIAL_FRAMES;
            this._numRepeatTimer = now;
            return;
        }

        const delayMs = this._numRepeatDelay * NUM_REPEAT_FRAME_MS;
        if (now - this._numRepeatTimer < delayMs) return;

        this._adjustNumAmountForKey(key);
        this._numRepeatTimer = now;
        this._numRepeatDelay = Math.max(NUM_REPEAT_MIN_FRAMES, this._numRepeatDelay - 1);
    }

    _handleEnterInput(key, now) {
        // During entering animation, Space/Enter skips the current typewriter.
        if (key === 'Space' || key === 'Enter') {
            if (this.typewriter && !this.typewriter.isDone(now)) {
                this.typewriter.skip(now);
            }
        }
    }

    _onConfirmDialog(now) {
        // If the typewriter is still running, skip it first.
        if (this.typewriter && !this.typewriter.isDone(now)) {
            this.typewriter.skip(now);
            return;
        }
        // If there are more lines in the queue, advance.
        if (this._dlgQueue && this._dlgQueueIndex < this._dlgQueue.length) {
            if (this._pendingLine !== null) {
                this.dlgBuffer.push(this._pendingLine);
                this._pendingLine = null;
            }
            this._showNextDlgLine();
            return;
        }
        // Dialog fully done: flush pending line and invoke callback.
        this._finishDialog(now);
    }

    _selectMenuItem(now) {
        // Stop laughing animation when any menu option is chosen.
        if (this.animPhase === 'laughing') {
            this.animPhase      = 'idle';
            this.idleLastSwitch = now;
        }
        switch (this.menuSel) {
            case MI_GO_OUTSIDE:     this._doGoOutside(now);     break;
            case MI_EXCHANGE_ALMAS: this._doExchangeAlmas(now); break;
            case MI_DEPOSIT:        this._doDeposit(now);        break;
            case MI_WITHDRAW:       this._doWithdraw(now);       break;
            case MI_BALANCE:        this._doBalance(now);        break;
        }
    }

    // ── Menu action: Go outside ────────────────────────────────────────────────

    _doGoOutside(now) {
        let msg;
        if (this._hadLargeSum) {
            msg = "Thank you. Come again to make a deposit for a large sum in savings. ";
        } else if (this._hadLargeDeposit) {
            msg = "Next time please deposit a large sum in savings. ";
        } else {
            msg = "Unless you have business, don't come in here. I'm a busy man.";
        }
        this._clearDlgArea();
        this._setAutoDialog(msg, (n) => {
            // Start exit animation.
            this.bankPhase      = 'exiting';
            this.animPhase      = 'exiting';
            this.animSeqIdx     = 0;
            this.animFrameTimer = n;
        });
        this.bankPhase = 'dialog';
    }

    // ── Menu action: Exchange almas ────────────────────────────────────────────

    _doExchangeAlmas(now) {
        this._clearDlgArea();

        const almas = this._getAlmas();
        if (!almas) {
            this._setAutoDialog("Sir, you aren't carrying any almas. ", (n) => {
                this.bankPhase = 'menu';
            });
            this.bankPhase = 'dialog';
            return;
        }

        // Look up rate for this town.
        const townId = this._getTownId();           // 1-based
        const rateIdx = Math.max(0, Math.min(8, townId - 1));
        const [from, to] = ALMAS_RATES[rateIdx];
        this._almasRateFrom = from;
        this._almasRateTo   = to;

        // "Our exchange rate is X almas to Y golds. Will that be all right?"
        const msg = `Our exchange rate is ${from} almas to ${to} golds.\nWill that be all right?`;
        this._setDialog(msg);
        this.bankPhase = 'confirm_exchange';
    }

    _handleConfirmExchange(key, now) {
        // Two-button yes/no: Enter/Space = yes, Escape = no.
        if (this.typewriter && !this.typewriter.isDone(now)) {
            if (key === 'Space' || key === 'Enter') this.typewriter.skip(now);
            return;
        }
        if (key === 'Escape') {
            this._clearDlgArea();
            this._setAutoDialog("I don't understand. Please state your business clearly.", (n) => {
                this.bankPhase = 'menu';
            });
            this.bankPhase = 'dialog';
            return;
        }
        if (key === 'Space' || key === 'Enter') {
            this._executeExchange(now);
        }
    }

    _executeExchange(now) {
        const almas = this._getAlmas();
        const from  = this._almasRateFrom;
        const to    = this._almasRateTo;

        // How many full batches can be exchanged?
        const batches = Math.floor(almas / from);
        if (!batches) {
            this._clearDlgArea();
            this._setAutoDialog("I'm sorry, you do not have enough almas.", (n) => {
                this.bankPhase = 'menu';
            });
            this.bankPhase = 'dialog';
            return;
        }

        // Deduct all exchangeable almas, add gold.
        const newAlmas = almas - batches * from;
        const goldGain = batches * to;
        this._setAlmas(newAlmas);
        this._setHeroGold(this._getHeroGold() + goldGain);
        this._hadLargeDeposit = true;   // byte_AD23: exchanged counts as "did something"

        this._clearDlgArea();
        this._setAutoDialog('Will there be anything else?', (n) => {
            this.bankPhase = 'menu';
        });
        this.bankPhase = 'dialog';
    }

    // ── Menu action: Deposit money ─────────────────────────────────────────────

    _doDeposit(now) {
        this._clearDlgArea();
        const heroGold = this._getHeroGold();
        if (!heroGold) {
            this._setAutoDialog("You aren't carrying any gold, are you?", (n) => {
                this.bankPhase = 'menu';
            });
            this.bankPhase = 'dialog';
            return;
        }

        this._setDialog('How much gold would you like to deposit?');
        this.numMode   = 'deposit';
        this.numLabels = DEPOSIT_LABELS;
        this.numAmount = 0;
        this.numMax    = heroGold;
        this._resetNumRepeat();
        this.bankPhase = 'numentry';
    }

    _doWithdraw(now) {
        this._clearDlgArea();
        const bankGold = this._getBankGold();
        if (!bankGold) {
            this._setAutoDialog("I'm afraid we have a problem here. You don't have any gold in your account.", (n) => {
                this.bankPhase = 'menu';
            });
            this.bankPhase = 'dialog';
            return;
        }

        this._setDialog('How much do you wish to withdraw?');
        this.numMode   = 'withdraw';
        this.numLabels = WITHDRAW_LABELS;
        this.numAmount = 0;
        this.numMax    = bankGold;
        this._resetNumRepeat();
        this.bankPhase = 'numentry';
    }

    // ── Numeric entry input ────────────────────────────────────────────────────
    // Arrow keys: Up = +1, Down = -1; Left = +10, Right = -10.
    // Space/Enter = confirm; Escape = cancel.

    _handleNumEntry(key, now, repeat = false) {
        const isConfirm = key === 'Space' || key === 'Enter';
        if (key === 'Escape' || isConfirm && !this.numAmount) {
            this._clearDlgArea();
            this._setAutoDialog("I don't understand. Please state your business clearly.", (n) => {
                this.bankPhase = 'menu';
            });
            this.bankPhase = 'dialog';
            return;
        }

        if (isConfirm) {
            if (this.numMode === 'deposit')
                this._executeDeposit(now);
            else
                this._executeWithdraw(now);

            return;
        }

        if (repeat && this._isNumArrowKey(key)) return;

        // Arrow adjustment.
        if (this._isNumArrowKey(key)) {
            this._adjustNumAmountForKey(key);
            this._numKeyHeld = key;
            this._numRepeatDelay = NUM_REPEAT_INITIAL_FRAMES;
            this._numRepeatTimer = now;
        }
    }

    _isNumArrowKey(key) {
        return key === 'ArrowUp' || key === 'ArrowDown' ||
               key === 'ArrowLeft' || key === 'ArrowRight';
    }

    _numHeldKeyFromState(keys) {
        if (!keys) return null;
        if (keys.ArrowRight) return 'ArrowRight';
        if (keys.ArrowLeft)  return 'ArrowLeft';
        if (keys.ArrowDown)  return 'ArrowDown';
        if (keys.ArrowUp)    return 'ArrowUp';
        return null;
    }

    _adjustNumAmountForKey(key) {
        if (key === 'ArrowUp' || key === 'ArrowLeft') {
            const delta = (key === 'ArrowLeft') ? 10 : 1;
            this.numAmount = Math.min(this.numAmount + delta, this.numMax);
        } else if (key === 'ArrowDown' || key === 'ArrowRight') {
            const delta = (key === 'ArrowRight') ? 10 : 1;
            this.numAmount = Math.max(this.numAmount - delta, 0);
        }
    }

    _resetNumRepeat() {
        this._numRepeatTimer = 0;
        this._numKeyHeld = null;
        this._numRepeatDelay = NUM_REPEAT_INITIAL_FRAMES;
    }

    _executeDeposit(now) {
        const amount = this.numAmount;
        const hero   = this._getHeroGold();
        if (amount > hero) {
            this._clearDlgArea();
            this._setAutoDialog("I'm sorry, you do not have enough gold.", (n) => {
                this.bankPhase = 'menu';
            });
            this.bankPhase = 'dialog';
            return;
        }

        // Deduct from hero, add to bank.
        this._setHeroGold(hero - amount);
        this._setBankGold(this._getBankGold() + amount);
        this._hadLargeDeposit = true;  // byte_AD23

        // Laugh if amount >= 1000 (bankpro.asm loc_A331..loc_A33A).
        if (amount >= 1000) {
            this._hadLargeSum    = true;  // byte_AD24
            this._laughingActive = true;
            this.animPhase       = 'laughing';
            this.laughFrameIdx   = 0;
            this.laughLastSwitch = now;
        }

        const bankGold = this._getBankGold();
        let msg;
        if (this._laughingActive) {
            msg = 'Thank you. Please come again.';
        } else if (!bankGold) {
            msg = 'Your account is empty.';
        } else if (bankGold === 1) {
            msg = 'You have one gold in your account.';
        } else {
            msg = `Your balance is ${bankGold} golds.`;
        }
        this._clearDlgArea();
        this._setAutoDialog(msg, (n) => {
            this.bankPhase = 'menu';
        });
        this.bankPhase = 'dialog';
    }

    _executeWithdraw(now) {
        const amount   = this.numAmount;
        const bankGold = this._getBankGold();
        if (amount > bankGold) {
            this._clearDlgArea();
            this._setAutoDialog("I'm afraid we have a problem here. You don't have enough gold in your account.", (n) => {
                this.bankPhase = 'menu';
            });
            this.bankPhase = 'dialog';
            return;
        }

        // Transfer gold.
        this._setBankGold(bankGold - amount);
        this._setHeroGold(this._getHeroGold() + amount);
        this._hadLargeDeposit = true;  // byte_AD23: any transaction counts

        const newBank = this._getBankGold();
        let handOverMsg;
        if (amount === 1) {
            handOverMsg = 'Here you are, sir. One gold.';
        } else {
            handOverMsg = `Here you are, sir. ${amount} golds.`;
        }

        let balanceMsg;
        if (!newBank) {
            balanceMsg = 'Your account is now empty.';
        } else if (newBank === 1) {
            balanceMsg = 'You have one gold in your account.';
        } else {
            balanceMsg = `Your balance is ${newBank} golds.`;
        }

        this._clearDlgArea();
        this._setAutoDialog(`${handOverMsg}\n${balanceMsg}`, (n) => {
            this.bankPhase = 'menu';
        });
        this.bankPhase = 'dialog';
    }

    // ── Menu action: Check balance ─────────────────────────────────────────────

    _doBalance(now) {
        this._clearDlgArea();
        const bankGold = this._getBankGold();
        let msg;
        if (!bankGold) {
            msg = 'Your account is empty.';
        } else if (bankGold === 1) {
            msg = 'You have one gold in your account.';
        } else {
            msg = `You have ${bankGold} golds in your account.`;
        }
        this._hadLargeDeposit = true;  // byte_AD23 (checking balance still counts)
        this._setAutoDialog(msg, (n) => {
            this.bankPhase = 'menu';
        });
        this.bankPhase = 'dialog';
    }

    // ── Utility ───────────────────────────────────────────────────────────────

    _clearDlgArea() {
        this.dlgBuffer          = [];
        this._pendingLine       = null;
        this._dlgQueue          = [];
        this._dlgQueueIndex     = 0;
        this._dlgQueueAdvanceAt = null;
        this._dlgCharMs         = CHAR_MS;
        this._dlgRevealFirstChar = false;
        this.typewriter         = null;
    }

    _triangle(ctx, x, y, w, h, down) {
        ctx.beginPath();
        if (down) {
            ctx.moveTo(x,         y);
            ctx.lineTo(x + w,     y);
            ctx.lineTo(x + w / 2, y + h);
        } else {
            ctx.moveTo(x,         y);
            ctx.lineTo(x + w,     y + h / 2);
            ctx.lineTo(x,         y + h);
        }
        ctx.closePath();
        ctx.fill();
    }

    getName() { return 'The Bank'; }
}
