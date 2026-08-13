// ─────────────────────────────────────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────────────────────────────────────
const INTRO_DUKE0_SRC           = 'assets/images/opdemo/duke0.png';
const INTRO_DUKE1_SRC           = 'assets/images/opdemo/duke1.png';
const INTRO_DUKE2_SRC           = 'assets/images/opdemo/duke2.png';
const INTRO_PRINCESS_SRC        = 'assets/images/enddemo/princess_full.png';
const INTRO_TEMPLATE2_SRC       = 'assets/images/opdemo/template2.png';
const INTRO_SPIRIT_SRC          = 'assets/images/opdemo/spirit.png';

// ─────────────────────────────────────────────────────────────────────────────
// Text content
// ─────────────────────────────────────────────────────────────────────────────

const INTRO_COPYRIGHT_LINES = [
];

const STORY_LINES = [
];

const CREDITS_LINES = [
];


const SPIRIT_LINES = [
];


// ─────────────────────────────────────────────────────────────────────────────
// Timing & layout constants
// ─────────────────────────────────────────────────────────────────────────────

const INTRO_FADE_IN_MS              = 2000;
const INTRO_FADE_OUT_MS             = 2000;
const STORY_IMAGE_FADE_IN_MS        = 2000;
const STORY_CROSSFADE_MS            = 4000;
const STORY_FONT                    = '16px "Press Start 2P", monospace';
const STORY_FONT_SAMPLE             = 'The Age of Darkness.';
const STORY_LINE_HEIGHT             = 20;
const STORY_START_Y                 = 400;
const STORY_SCROLL_SPEED            = 28;   // px / second
const CHAR_DELAY_MS                 = 45;
const CREDITS_FONT                  = '16px "Press Start 2P", monospace';
const CREDITS_LINE_HEIGHT           = 20;
const CREDITS_START_Y               = 400;
const CREDITS_SCROLL_SPEED          = 28;   // px / second
const CURTAIN_X1                    = 33;
const CURTAIN_Y1                    = 33;
const CURTAIN_X2                    = 607;
const CURTAIN_Y2                    = 239;
const CURTAIN_COLOR                 = '#56040a';
const CURTAIN_MS                    = 1000;
const DUKE_FADE_IN_MS               = 1000;
const PRINCESS_FADE_IN_MS           = 1000;
const PRINCESS_SCROLL_DURATION_MS   = 7000;
const DUKE_X                        = 94;
const DUKE_Y                        = 45;
const DUKE_SIZE                     = 180;
const PRINCESS_CLIP_SIZE            = 180;
const PRINCESS_SRC_X                = 4;
const PRINCESS_SRC_START_Y          = 340;
const PRINCESS_SRC_END_Y            = 0;
const PRINCESS_DST_X                = 366;
const PRINCESS_DST_START_Y          = 175;
const PRINCESS_DST_END_Y            = 45;

// ── Window border colours (used in expandWindow line-drawing) ──────────────
const WIN_TOP_COLORS = [
    '#51060a',
    '#593e26',
    '#e8d597',
    '#b49555',
    '#8c6e3d',
  ]; // y=44..40
const WIN_LEFT_COLORS = [
    '#4d0808',
    '#5a2f18',
    '#f0d591',
    '#c0a158',
    '#96753c',
  ]; // x=160..156
const WIN_BOTTOM_COLORS =      ['#edd589','#a27e3c','#7a5026','#410407','#51060a']; // y=225..229
const WIN_BOTTOM_OUTER_FIRST = ['#51060a','#410407','#7a5026','#a27e3c','#edd589'];
const WIN_BORDER_THICKNESS = 5;
// Fixed window interior coordinates
const WIN_GARLAND_X        = 121;
const WIN_GARLAND_Y        = 45;

// Text styling
const DIRECT_SPEECH_TEXT_COLOR      = '#fbfbfb';
const DIRECT_SPEECH_SHADOW_COLOR    = '#0000fb';
const DIRECT_SPEECH_SHADOW_OFFSET   = 2;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload  = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadStoryFont() {
  if (!document.fonts?.load) return;
  try {
    await document.fonts.load(STORY_FONT, STORY_FONT_SAMPLE);
    await document.fonts.ready;
  } catch (error) {
    console.warn('Failed to load intro font; using fallback font.', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline definition
//
// Each step is processed by the engine's generic draw/skip handlers.
// Steps reference image keys resolved from `this.images` after asset load.
//
// Step types:
//   fadeInImage    – fade a single image in, hold, then advance
//   crossfade      – crossfade from one image to another, then advance
//   scrollText     – scroll a pre-rendered text canvas over a background image,
//                    then crossfade to a second image and advance
//   spriteAnim     – play a frame sequence from a sprite array, then advance
//   typeText       – type lines over an image with auto-advance; supports
//                    mouth animation and fade-out
//   layeredFadeIn  – stagger-fade multiple image layers, then advance
//   curtainThen    – close curtain over backgroundKey image, then advance
//   typedScene     – sequence of (image, lines[]) sub-scenes with crossfades
// ─────────────────────────────────────────────────────────────────────────────

function buildTimeline(images) {
  return [
    // ── 1. Duke static + Princess scroll ───────────────────────────────────────
    {
      type: 'dukeAndPrincessScroll',
      dukeImage: images.duke0,
      princessImage: images.princess,
      dukeFadeInMs: DUKE_FADE_IN_MS,
      princessFadeInMs: PRINCESS_FADE_IN_MS,
      scrollDurationMs: PRINCESS_SCROLL_DURATION_MS,
      dukeX: DUKE_X,
      dukeY: DUKE_Y,
      dukeWidth: DUKE_SIZE,
      dukeHeight: DUKE_SIZE,
      clipWidth: PRINCESS_CLIP_SIZE,
      clipHeight: PRINCESS_CLIP_SIZE,
      princessSrcX: PRINCESS_SRC_X,
      princessSrcStartY: PRINCESS_SRC_START_Y,
      princessSrcEndY: PRINCESS_SRC_END_Y,
      princessDstX: PRINCESS_DST_X,
      princessDstStartY: PRINCESS_DST_START_Y,
      princessDstEndY: PRINCESS_DST_END_Y,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// EndingDemo — timeline engine
// ─────────────────────────────────────────────────────────────────────────────

export class EndingDemo {
  constructor({ screen, canvas, onComplete }) {
    this.screen     = screen;
    this.canvas     = canvas; // 640x400
    this.ctx        = canvas.getContext('2d');
    this.onComplete = onComplete;

    this.active   = false;
    this.frameId  = 0;

    // Runtime state set by start()
    this.timeline     = [];
    this.stepIndex    = 0;
    this.stepState    = null;   // mutable state object for the current step
    this.images       = {};
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async start() {
    this.active = true;
    this.ctx.imageSmoothingEnabled = false;
    this.screen.classList.remove('hidden');

    try {
      await this._loadAssets();
    } catch (error) {
      console.error(error);
      this.finish();
      return;
    }

    this.timeline  = buildTimeline(this.images);
    this.stepIndex = 0;
    this._enterStep(0);

    this.frameId = requestAnimationFrame((ts) => this._tick(ts));
  }

  skipPage() {
    if (!this.active) return;
    this.finish();
  }

  finish() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.frameId);
    this.screen.classList.add('hidden');
    this.onComplete();
  }

  // ── Asset loading ──────────────────────────────────────────────────────────

  async _loadAssets() {
    const [
      princess,
      duke0, duke1, duke2,
      template2,
      spirit,
    ] = await Promise.all([
      loadImage(INTRO_PRINCESS_SRC),
      loadImage(INTRO_DUKE0_SRC),
      loadImage(INTRO_DUKE1_SRC),
      loadImage(INTRO_DUKE2_SRC),
      loadImage(INTRO_TEMPLATE2_SRC),
      loadImage(INTRO_SPIRIT_SRC),
      loadStoryFont(),
    ]);

    this.images = {
      princess,
      duke0, duke1, duke2,
      template2,
      spirit,
    };
  }

  // ── Step lifecycle ─────────────────────────────────────────────────────────

  _enterStep(index) {
    this.stepIndex = index;
    const step = this.timeline[index];
    if (!step) { this.finish(); return; }
    this.stepState = this._buildStepState(step);
  }

  _nextStep() {
    const currentStep = this.timeline[this.stepIndex];
    if (currentStep && currentStep.snapshotOnComplete) {
      const snapCanvas = this._makeOffscreen();
      snapCanvas.getContext('2d').drawImage(this.canvas, 0, 0);
      this.snapshotForNext = snapCanvas;   // store as a canvas element
    }
    this._enterStep(this.stepIndex + 1);
  }

  _buildStepState(step) {
    const base = { startTime: 0 };

    if (step.type === 'dualDialogue') {
      return {
        ...base,
        fadeInStartTime: 0,          // will be set later
        scriptIndex: 0,
        lineIndex: 0,
        lineStartTime: 0,
        lineFullyTypedTime: 0,
      };
    }    

    if (step.type === 'expandWindow') {
      return { ...base, animationDone: false, holdStartTime: 0 };
    }

    if (step.type === 'curtainOnly') {
      return { ...base, snapshot: null, done: false };
    }

    if (step.type === 'windowText') {
      return {
        ...base,
        lineIndex: 0,
        lineStartTime: 0,
        lineFullyTypedTime: 0,
      };
    }

    return base;
  }

  // ── RAF loop ───────────────────────────────────────────────────────────────

  _tick(timestamp) {
    if (!this.active) return;
    const step = this.timeline[this.stepIndex];
    if (!step) { this.finish(); return; }

    const s = this.stepState;
    if (!s.startTime) s.startTime = timestamp;

    this._drawStep(step, s, timestamp);

    if (this.active) {
      this.frameId = requestAnimationFrame((ts) => this._tick(ts));
    }
  }

  // ── Generic draw dispatcher ────────────────────────────────────────────────

  _drawStep(step, s, ts) {
    switch (step.type) {
      case 'dukeAndPrincessScroll': return this._drawDukeAndPrincessScroll(step, s, ts);
      case 'fadeInImage':    return this._drawFadeInImage(step, s, ts);
      case 'scrollText':     return this._drawScrollText(step, s, ts);
      case 'spriteAnim':     return this._drawSpriteAnim(step, s, ts);
      case 'typeText':       return this._drawTypeText(step, s, ts);
      case 'layeredFadeIn':  return this._drawLayeredFadeIn(step, s, ts);
      case 'typedScene':     return this._drawTypedScene(step, s, ts);
      case 'dualDialogue':   return this._drawDualDialogue(step, s, ts);
      case 'expandWindow':   return this._drawExpandWindow(step, s, ts);
      case 'curtainOnly':    return this._drawCurtainOnly(step, s, ts);
      case 'windowText':     return this._drawWindowText(step, s, ts);    
    }
  }


  // ─────────────────────────────────────────────────────────────────────────
  // Step renderers
  // ─────────────────────────────────────────────────────────────────────────

  _drawDukeAndPrincessScroll(step, s, ts) {
    const elapsed = ts - s.startTime;
    const dukeFadeInMs     = step.dukeFadeInMs     ?? 1000;
    const princessFadeInMs = step.princessFadeInMs ?? 1000;
    const scrollDurationMs = step.scrollDurationMs ?? 7000;
    const totalDurationMs  = dukeFadeInMs + princessFadeInMs + scrollDurationMs;

    // Phase 1: Duke fades in (0 .. dukeFadeInMs)
    const dukeAlpha = Math.min(1, Math.max(0, elapsed / dukeFadeInMs));

    // Phase 2: Princess initial frame fades in (dukeFadeInMs .. dukeFadeInMs + princessFadeInMs)
    const princessAlpha = elapsed < dukeFadeInMs
      ? 0
      : Math.min(1, Math.max(0, (elapsed - dukeFadeInMs) / princessFadeInMs));

    // Phase 3: Princess frame motion (after dukeFadeInMs + princessFadeInMs for scrollDurationMs)
    const scrollElapsed = elapsed - dukeFadeInMs - princessFadeInMs;
    const progress = Math.min(1, Math.max(0, scrollElapsed / scrollDurationMs));

    const srcX = step.princessSrcX;
    const srcY = Math.round(step.princessSrcStartY + (step.princessSrcEndY - step.princessSrcStartY) * progress);
    const srcW = step.clipWidth;
    const srcH = step.clipHeight;

    const dstX = step.princessDstX;
    const dstY = Math.round(step.princessDstStartY + (step.princessDstEndY - step.princessDstStartY) * progress);
    const dstW = step.clipWidth;
    const dstH = step.clipHeight;

    this._clearBlack();

    // 1. Static Duke0 image (94, 45), 180x180 px
    if (step.dukeImage && dukeAlpha > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = dukeAlpha;
      this.ctx.drawImage(
        step.dukeImage,
        step.dukeX,
        step.dukeY,
        step.dukeWidth,
        step.dukeHeight
      );
      this.ctx.restore();
    }

    // 2. Moving clip of Princess image (180x180 px)
    if (step.princessImage && princessAlpha > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = princessAlpha;
      this.ctx.drawImage(
        step.princessImage,
        srcX,
        srcY,
        srcW,
        srcH,
        dstX,
        dstY,
        dstW,
        dstH
      );
      this.ctx.restore();
    }

    if (elapsed >= totalDurationMs) {
      this._nextStep();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Shared rendering utilities
  // ─────────────────────────────────────────────────────────────────────────

  _clearBlack() {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  _clearTextArea() {
    this.ctx.clearRect(0, 275, this.canvas.width, 125);
  }

  _makeOffscreen() {
    const off    = document.createElement('canvas');
    off.width    = this.canvas.width;
    off.height   = this.canvas.height;
    return off;
  }

  // Draws the storyText canvas at (0, y) with the given opacity
  _drawStoryText(textCanvas, y, opacity) {
    this.ctx.globalAlpha = opacity;
    this.ctx.drawImage(textCanvas, 0, y);
  }

  _drawCreditsText(x, y) {
    this.ctx.fillStyle   = '#fff';
    this.ctx.font        = CREDITS_FONT;
    this.ctx.textAlign   = 'left';
    this.ctx.textBaseline = 'top';
    for (let i = 0; i < CREDITS_LINES.length; i++) {
      this.ctx.fillText(CREDITS_LINES[i], x, y + i * CREDITS_LINE_HEIGHT);
    }
  }

  // Generic typewriter text for balcony/typedScene steps.
  // textStyle: 'normal' | 'jashiin'
  _drawBalconyText(lines, s, ts, textStyle = 'normal') {
    const line = lines[s.lineIndex] ?? '';
    if (!s.lineStartTime || !line) return;

    const elapsed      = ts - s.lineStartTime;
    const visibleCount = Math.min(
      Math.floor(Math.max(elapsed, 0) / CHAR_DELAY_MS),
      line.length,
    );

    this._clearTextArea();
    if (!visibleCount) return;

    this.ctx.save();
    this.ctx.globalAlpha  = 1;
    this.ctx.font         = BALCONY_FONT;
    this.ctx.textAlign    = 'left';
    this.ctx.textBaseline = 'top';

    const wrapped = this._wrapText(line, BALCONY_TEXT_MAX_WIDTH);

    // Jashiin lines are entirely yellow/red; normal lines honour "..." quoting
    const useJashiin = textStyle === 'jashiin' && line.trimStart().startsWith('"');

    for (let i = 0; i < wrapped.length; i++) {
      const { text: chunk, start: chunkStart } = wrapped[i];
      if (chunkStart >= visibleCount) break;
      const chunkVisible = Math.min(visibleCount - chunkStart, chunk.length);
      const y            = BALCONY_TEXT_Y + i * BALCONY_LINE_HEIGHT;

      if (useJashiin) {
        const visText = line.slice(chunkStart, chunkStart + chunkVisible);
        this.ctx.fillStyle = JASHIIN_SHADOW_COLOR;
        this.ctx.fillText(visText, BALCONY_TEXT_X + DIRECT_SPEECH_SHADOW_OFFSET, y + DIRECT_SPEECH_SHADOW_OFFSET);
        this.ctx.fillStyle = JASHIIN_TEXT_COLOR;
        this.ctx.fillText(visText, BALCONY_TEXT_X, y);
      } else {
        const quotedMap = this._buildQuotedMap(line);
        this._drawWrappedSegmentedText(
          line, quotedMap, chunkStart, chunkVisible, BALCONY_TEXT_X, y,
          DIRECT_SPEECH_TEXT_COLOR, DIRECT_SPEECH_SHADOW_COLOR, DIRECT_SPEECH_SHADOW_OFFSET,
        );
      }
    }

    this.ctx.restore();
  }


  _drawShadowedText(text, x, y, textColor, shadowColor, shadowOffset) {
    this.ctx.fillStyle = shadowColor;
    this.ctx.fillText(text, x + shadowOffset, y + shadowOffset);
    this.ctx.fillStyle = textColor;
    this.ctx.fillText(text, x, y);
  }

  // ── Text layout helpers ────────────────────────────────────────────────────

  // Returns [{text, start}] where start is the char offset in the original string
  _wrapText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let current = '', currentStart = 0, pos = 0;

    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (this.ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) { lines.push({ text: current, start: currentStart }); currentStart = pos; }
        current      = word;
        currentStart = pos;
      }
      pos += word.length + 1;
    }
    if (current) lines.push({ text: current, start: currentStart });
    return lines;
  }

  // Returns boolean[] where true means the character is inside a matched "…" pair
  _buildQuotedMap(text) {
    const map = new Array(text.length).fill(false);
    let i = 0;
    while (i < text.length) {
      if (text[i] === '"') {
        const close = text.indexOf('"', i + 1);
        if (close !== -1) {
          for (let j = i; j <= close; j++) map[j] = true;
          i = close + 1;
        } else {
          i++;
        }
      } else {
        i++;
      }
    }
    return map;
  }

  // Renders `chunkVisible` chars from `fullLine` starting at `chunkStart`,
  // switching text style on quoted/plain boundaries.
  _drawWrappedSegmentedText(fullLine, quotedMap, chunkStart, chunkVisible, x, y, plainColor, shadowColor, shadowOffset) {
    let curX       = x;
    let batchStart = chunkStart;
    let batchQuoted = quotedMap[chunkStart] ?? false;

    const flush = (end) => {
      if (end <= batchStart) return;
      const text = fullLine.slice(batchStart, end);
      if (batchQuoted) {
        this.ctx.fillStyle = shadowColor;
        this.ctx.fillText(text, curX + shadowOffset, y + shadowOffset);
        this.ctx.fillStyle = plainColor;
      } else {
        this.ctx.fillStyle = plainColor;
      }
      this.ctx.fillText(text, curX, y);
      curX += this.ctx.measureText(text).width;
    };

    for (let i = chunkStart + 1; i < chunkStart + chunkVisible; i++) {
      const q = quotedMap[i] ?? false;
      if (q !== batchQuoted) { flush(i); batchStart = i; batchQuoted = q; }
    }
    flush(chunkStart + chunkVisible);
  }

  // ── Curtain ────────────────────────────────────────────────────────────────

  _drawCurtainClose(progress, backgroundImage) {
    if (progress <= 0) return;

    const rx1 = CURTAIN_X1, ry1 = CURTAIN_Y1;
    const rw  = CURTAIN_X2 - CURTAIN_X1, rh = CURTAIN_Y2 - CURTAIN_Y1;
    const maxInset = Math.floor(Math.min(rw, rh) / 2);
    const inset    = Math.ceil(progress * maxInset);

    this.ctx.save();
    this.ctx.fillStyle = CURTAIN_COLOR;
    this.ctx.fillRect(rx1, ry1, rw, rh);

    const innerX = rx1 + inset, innerY = ry1 + inset;
    const innerW = rw - inset * 2,  innerH = rh - inset * 2;

    if (innerW > 0 && innerH > 0 && progress < 1) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(innerX, innerY, innerW, innerH);
      this.ctx.clip();
      this.ctx.globalAlpha = 1;
      this.ctx.drawImage(backgroundImage, 0, 0);
      this.ctx.restore();
    }

    this.ctx.restore();
  }


  // ── Canvas factories ───────────────────────────────────────────────────────

  _createStoryTextCanvas() {
    const tc    = document.createElement('canvas');
    tc.width    = this.canvas.width;
    tc.height   = STORY_LINES.length * STORY_LINE_HEIGHT;
    const tCtx  = tc.getContext('2d');
    tCtx.imageSmoothingEnabled = false;
    tCtx.clearRect(0, 0, tc.width, tc.height);
    tCtx.fillStyle   = '#fff';
    tCtx.font        = STORY_FONT;
    tCtx.textAlign   = 'left';
    tCtx.textBaseline = 'top';
    const x = 6;
    for (let i = 0; i < STORY_LINES.length; i++) {
      tCtx.fillText(STORY_LINES[i], x, i * STORY_LINE_HEIGHT);
    }
    return tc;
  }

  _createCreditsCanvas() {
    // Credits are drawn directly each frame (not pre-baked) so return null;
    // the _drawScrollText handler checks step.isCredits.
    return null;
  }

  _measureCreditsX() {
    this.ctx.save();
    this.ctx.font  = CREDITS_FONT;
    const maxWidth = Math.max(...CREDITS_LINES.map((l) => this.ctx.measureText(l).width));
    this.ctx.restore();
    return Math.round((this.canvas.width - maxWidth) / 2);
  }
}
