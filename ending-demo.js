// ─────────────────────────────────────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────────────────────────────────────
const INTRO_DUKE0_SRC           = 'assets/images/opdemo/duke0.png';
const INTRO_DUKE1_SRC           = 'assets/images/opdemo/duke1.png';
const INTRO_DUKE2_SRC           = 'assets/images/opdemo/duke2.png';
const INTRO_PRINCESS_SRC        = 'assets/images/enddemo/princess_full.png';
const INTRO_TEMPLATE2_SRC       = 'assets/images/opdemo/template2.png';
const INTRO_SPIRIT_SRC          = 'assets/images/opdemo/spirit.png';

const DUKE_SRC_BASE             = 'assets/images/opdemo/duke0.png';
const PRINCESS_SRC_BASE         = 'assets/images/enddemo/princess_base.png';
// Overlay assets (lips and eyes)
const DUKE_LIPS_SRC_BASE        = 'assets/images/enddemo/duke_lips_';   // 0..3
const DUKE_EYES_SRC_BASE        = 'assets/images/enddemo/duke_eyes_';   // 0..2
const PRINCESS_LIPS_SRC_BASE    = 'assets/images/enddemo/princess_lips_'; // 0..3
const PRINCESS_EYES_SRC_BASE    = 'assets/images/enddemo/princess_eyes_'; // 0..2

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
// Dialogue script (extracted from enddemo.asm up to "Father!")
// ─────────────────────────────────────────────────────────────────────────────
const DIALOGUE_SCRIPT = [
  { speaker: 'narrator', text: 'At long last, Jashiin was destroyed and the nine Tears of Esmesanti were returned to their rightful place.' },
  { speaker: 'narrator', text: 'Princess Felicia was restored to her true form.' },
  { speaker: 'duke', text: 'You are as beautiful as a rose in bloom!' },
  { speaker: 'princess', text: 'Thank you, Duke Garland.' },
  { speaker: 'princess', text: 'You have done a great deed in defeating Jashiin. Although my body was here, my soul was with you, watching you.' },
  { speaker: 'princess', text: "I don't know how to thank you for rescuing me and saving my country." },
  { speaker: 'princess', text: 'Father!' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Timing & layout constants (added for dialogue)
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
const TEMPLATE2_FADE_IN_MS = 1000;

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

const DIALOGUE_TEXT_X            = 20;
const DIALOGUE_TEXT_Y            = 280;
const DIALOGUE_TEXT_MAX_WIDTH    = 600;
const DIALOGUE_TEXT_LINE_HEIGHT  = 20;
const DIALOGUE_CHAR_DELAY_MS     = 45;
const DIALOGUE_LINE_PAUSE_MS     = 1200;   // wait after line is fully typed
const DIALOGUE_BOX_BG            = 'rgba(0,0,0,0.75)';
const DIALOGUE_BOX_RECT          = { x: 16, y: 266, w: 608, h: 120 };
const DIALOGUE_FONT              = '16px "Press Start 2P", monospace';
const DIALOGUE_TEXT_COLOR        = '#fbfbfb';

// Face overlay positions (assume overlays are same size as base and fully opaque where needed)
const DUKE_POS = { x: 94, y: 45, w: 180, h: 180 };
const PRINCESS_POS = { x: 366, y: 45, w: 180, h: 180 };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (existing) + new face animation helpers
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

// Returns lip index (0‑3) cycling every few characters
function getLipIndex(visibleCount) {
  return (Math.floor(visibleCount / 3) % 4);
}

// Returns eye index (0‑2) with blinking
function getEyeIndex(timestamp) {
  const cycle = 4000;        // blink every 4 seconds
  const blinkDuration = 150; // closed for 150 ms
  const t = timestamp % cycle;
  if (t < blinkDuration) return 1;      // closed
  if (t < blinkDuration + 200) return 0; // opening
  if (t < cycle - blinkDuration) return 0; // normal
  return 1; // closing
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
      template2Image: images.template2,
      dukeFadeInMs: DUKE_FADE_IN_MS,
      princessFadeInMs: PRINCESS_FADE_IN_MS,
      scrollDurationMs: PRINCESS_SCROLL_DURATION_MS,
      template2FadeInMs: TEMPLATE2_FADE_IN_MS,
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
    // ── 2. Dialogue scene (Duke & Princess exchange) ────────────────────────
    {
      type: 'dialogueScene',
      script: DIALOGUE_SCRIPT,
      // The renderer uses the images object for overlays
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// EndingDemo — updated class
// ─────────────────────────────────────────────────────────────────────────────


  // ─────────────────────────────────────────────────────────────────────────────
  // Raw script data from enddemo.asm (unk_6AA8 up to "Father!")
  // ─────────────────────────────────────────────────────────────────────────────
const RAW_SCRIPT = [
  0xF0, 0xFA, 0xF3, 0x41, 0x74, 0x20, 0x6C, 0x6F, 0x6E, 0x67, 0x20, 0x6C, 0x61, 0x73, 0x74, 0x2C,
  0x20, 0x4A, 0x61, 0x73, 0x68, 0x69, 0x69, 0x6E, 0x20, 0x77, 0x61, 0x73, 0x20, 0x64, 0x65, 0x73,
  0x74, 0x72, 0x6F, 0x79, 0x65, 0x64, 0x20, 0x61, 0x6E, 0x64, 0x20, 0x74, 0x68, 0x65, 0x20, 0x6E,
  0x69, 0x6E, 0x65, 0x20, 0x54, 0x65, 0x61, 0x72, 0x73, 0x20, 0x6F, 0x66, 0x20, 0x45, 0x73, 0x6D,
  0x65, 0x73, 0x61, 0x6E, 0x74, 0x69, 0x20, 0x77, 0x65, 0x72, 0x65, 0x20, 0x72, 0x65, 0x74, 0x75,
  0x72, 0x6E, 0x65, 0x64, 0x20, 0x74, 0x6F, 0x20, 0x74, 0x68, 0x65, 0x69, 0x72, 0x20, 0x72, 0x69,
  0x67, 0x68, 0x74, 0x66, 0x75, 0x6C, 0x20, 0x70, 0x6C, 0x61, 0x63, 0x65, 0x2E, 0xF5, 0xF5, 0xF5,
  0xFE, 0xF3, 0x50, 0x72, 0x69, 0x6E, 0x63, 0x65, 0x73, 0x73, 0x20, 0x46, 0x65, 0x6C, 0x69, 0x63,
  0x69, 0x61, 0x20, 0x77, 0x61, 0x73, 0x20, 0x72, 0x65, 0x73, 0x74, 0x6F, 0x72, 0x65, 0x64, 0x20,
  0x74, 0x6F, 0x20, 0x68, 0x65, 0x72, 0x20, 0x74, 0x72, 0x75, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D,
  0x2E, 0xF5, 0xF5, 0xF5, 0xFB, 0xFE, 0xF3, 0xEF, 0x22, 0x95, 0x59, 0x6F, 0x75, 0x20, 0x90, 0x61,
  0x72, 0x65, 0x94, 0x20, 0x90, 0x61, 0x95, 0x73, 0x20, 0x92, 0x62, 0x65, 0x95, 0x61, 0x75, 0x92,
  0x74, 0x69, 0x95, 0x66, 0x75, 0x93, 0x6C, 0x20, 0x90, 0x61, 0x95, 0x73, 0x20, 0x90, 0x61, 0x20,
  0x93, 0x72, 0x6F, 0x91, 0x73, 0x65, 0x20, 0x92, 0x69, 0x94, 0x6E, 0x20, 0x93, 0x62, 0x95, 0x6C,
  0x6F, 0x6F, 0x94, 0x6D, 0x21, 0x22, 0xF5, 0xF2, 0xEB, 0xA3, 0x22, 0xA4, 0xA0, 0x54, 0xA5, 0x68,
  0xA4, 0x61, 0xA3, 0xA2, 0x6E, 0xA1, 0x6B, 0x20, 0xA2, 0x79, 0x6F, 0x75, 0x2C, 0x20, 0xA1, 0xA3,
  0x44, 0xA4, 0x75, 0xA5, 0x6B, 0xA4, 0x65, 0xA3, 0x20, 0xA0, 0x47, 0x61, 0x72, 0xA1, 0x6C, 0x61,
  0xA2, 0x6E, 0x64, 0x2E, 0x22, 0xA1, 0xF5, 0xF5, 0xF5, 0xFE, 0xF3, 0x22, 0xA1, 0x59, 0x6F, 0x75,
  0x20, 0xA0, 0x68, 0x61, 0xA2, 0x76, 0x65, 0x20, 0xA1, 0x64, 0x6F, 0xA2, 0x6E, 0x65, 0x20, 0xA0,
  0x61, 0x20, 0xA1, 0x67, 0x72, 0x65, 0xA0, 0x61, 0x74, 0x20, 0xA1, 0x64, 0x65, 0x65, 0x64, 0x20,
  0xA2, 0x69, 0x6E, 0x20, 0xA0, 0x64, 0x65, 0x66, 0x65, 0x61, 0xA1, 0x74, 0xA2, 0x69, 0x6E, 0x67,
  0x20, 0xA1, 0x4A, 0x61, 0x73, 0x68, 0x69, 0xA2, 0x69, 0x6E, 0x2E, 0xA1, 0x20, 0x20, 0xF5, 0xA0,
  0xA4, 0x41, 0xA5, 0x6C, 0xA4, 0xA2, 0x74, 0xA3, 0x68, 0x6F, 0x75, 0xA1, 0x67, 0x68, 0x20, 0xA0,
  0x6D, 0x79, 0x20, 0xA1, 0x62, 0x6F, 0x64, 0xA1, 0x79, 0x20, 0xA0, 0x77, 0x61, 0xA1, 0x73, 0x20,
  0xA1, 0x68, 0xA0, 0x65, 0x72, 0x65, 0x2C, 0x20, 0xA4, 0x6D, 0xA5, 0xA1, 0x79, 0xA4, 0x20, 0xA3,
  0xA1, 0x73, 0x6F, 0xA2, 0x75, 0x6C, 0x20, 0xA0, 0x77, 0x61, 0xA2, 0x73, 0x20, 0xA2, 0x77, 0xA1,
  0x69, 0x74, 0x68, 0x20, 0xA0, 0x74, 0x68, 0x65, 0x20, 0xA1, 0x48, 0x6F, 0xA2, 0x6C, 0x79, 0x20,
  0xA2, 0x53, 0xA1, 0x70, 0x69, 0xA0, 0x72, 0xA2, 0x69, 0x74, 0x2C, 0x20, 0xA0, 0x77, 0x61, 0x74,
  0xA1, 0x63, 0x68, 0xA2, 0x69, 0x6E, 0x67, 0x20, 0xA1, 0x79, 0x6F, 0x75, 0x2E, 0x22, 0xF5, 0xF5,
  0xF5, 0xFE, 0xF3, 0x22, 0xA0, 0x49, 0x20, 0xA1, 0x64, 0x6F, 0xA2, 0x6E, 0x27, 0x74, 0x20, 0xA1,
  0x6B, 0xA2, 0x6E, 0x6F, 0x77, 0x20, 0xA0, 0x68, 0x6F, 0xA2, 0x77, 0x20, 0xA1, 0x74, 0x6F, 0x20,
  0xA0, 0x74, 0x68, 0x61, 0xA2, 0x6E, 0x6B, 0x20, 0xA1, 0x79, 0x6F, 0x75, 0x20, 0xA2, 0x66, 0x6F,
  0x72, 0x20, 0xA1, 0x72, 0x65, 0xA2, 0x73, 0x63, 0x75, 0xA1, 0x69, 0x6E, 0x67, 0x20, 0xA2, 0x6D,
  0x65, 0x20, 0xA0, 0x61, 0x6E, 0x64, 0x20, 0xA1, 0x73, 0x61, 0x76, 0xA2, 0x69, 0x6E, 0x67, 0x20,
  0xA0, 0x6D, 0x79, 0x20, 0xA1, 0x63, 0x6F, 0xA0, 0x75, 0x6E, 0xA2, 0x74, 0x72, 0x79, 0x2E, 0x22,
  0xA1, 0xF5, 0xF5, 0xF5, 0xFE, 0xFD, 0xF3,
];

// ─────────────────────────────────────────────────────────────────────────────
// Parser – builds a flat array of command objects
// ─────────────────────────────────────────────────────────────────────────────
function parseDialogueScript(bytes) {
  const commands = [];
  let i = 0;
  let currentSpeaker = 'narrator';
  let currentColor = '#fbfbfb'; // default
  let pendingText = '';

  function flushText() {
    if (pendingText) {
      commands.push({ type: 'text', speaker: currentSpeaker, text: pendingText, color: currentColor });
      pendingText = '';
    }
  }

  while (i < bytes.length) {
    const b = bytes[i++];
    if (b === 0xFF) break; // end of script

    // Control codes
    if (b >= 0xF0) {
      flushText();
      switch (b) {
        case 0xF0: currentSpeaker = 'narrator'; break;
        case 0xEF: currentSpeaker = 'duke'; break;
        case 0xEB: currentSpeaker = 'princess'; break;
        case 0xEC: currentSpeaker = 'spirit'; break;
        case 0xF3: break; // unknown
        case 0xF5: break; // unknown
        case 0xFA: break; // unknown
        case 0xFB: break; // unknown
        case 0xFC: break; // unknown
        case 0xFD: break; // unknown
        case 0xFE: break;
        default: /* ignore */ break;
      }
    } else if (b >= 0x90 && b <= 0x98) {
      // Duke eyes/lips choice
    } else if (b >= 0xA0 && b <= 0xA5) {
      // princess eyes/lips choice
    } else {
      // Normal printable character (ASCII)
      pendingText += String.fromCharCode(b);
    }
  }
  flushText();
  return commands;
}
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
    // Load base images
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

    // Load overlay images (lips & eyes) for Duke and Princess
    const lipEyePromises = [];
    for (let i = 0; i < 4; i++) {
      lipEyePromises.push(loadImage(`${DUKE_LIPS_SRC_BASE}${i}.png`));
      lipEyePromises.push(loadImage(`${PRINCESS_LIPS_SRC_BASE}${i}.png`));
    }
    for (let i = 0; i < 3; i++) {
      lipEyePromises.push(loadImage(`${DUKE_EYES_SRC_BASE}${i}.png`));
      lipEyePromises.push(loadImage(`${PRINCESS_EYES_SRC_BASE}${i}.png`));
    }
    const overlayResults = await Promise.allSettled(lipEyePromises);

    // Organise overlays by name
    const overlays = {};
    const names = [];
    for (let i = 0; i < 4; i++) {
      names.push(`duke_lips${i}`, `princess_lips${i}`);
    }
    for (let i = 0; i < 3; i++) {
      names.push(`duke_eyes${i}`, `princess_eyes${i}`);
    }
    overlayResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        overlays[names[idx]] = result.value;
      } else {
        console.warn(`Failed to load overlay: ${names[idx]}`, result.reason);
      }
    });

    this.images = {
      princess,
      duke0, duke1, duke2,
      template2,
      spirit,
      ...overlays,
    };
  }

  // ── Step lifecycle ─────────────────────────────────────────────────────────

  _enterStep(index) {
    this.stepIndex = index;
    const step = this.timeline[index];
    if (!step) {
      // End of timeline: stop animating but keep the last frame visible
      this.active = false;
      cancelAnimationFrame(this.frameId);
      // Notify completion but do NOT hide the screen
      if (this.onComplete) this.onComplete();
      return;
    }
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
      case 'dialogueScene':         return this._drawDialogueScene(step, s, ts);
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
      default: break;
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
    const template2FadeInMs = step.template2FadeInMs ?? 1000;

    const totalDurationMs = dukeFadeInMs + princessFadeInMs + scrollDurationMs + template2FadeInMs;

    // -- Phase calculations --
    let dukeAlpha = 0;
    let princessAlpha = 0;
    let scrollProgress = 0;
    let template2Alpha = 0;

    // Phase 1: Duke fades in
    if (elapsed < dukeFadeInMs) {
      dukeAlpha = Math.min(1, elapsed / dukeFadeInMs);
    } else {
      dukeAlpha = 1;
      // Phase 2: Princess fades in (after duke is fully visible)
      const princessElapsed = elapsed - dukeFadeInMs;
      if (princessElapsed < princessFadeInMs) {
        princessAlpha = Math.min(1, princessElapsed / princessFadeInMs);
      } else {
        princessAlpha = 1;
        // Phase 3: Princess scrolls
        const scrollElapsed = elapsed - dukeFadeInMs - princessFadeInMs;
        if (scrollElapsed < scrollDurationMs) {
          scrollProgress = Math.min(1, scrollElapsed / scrollDurationMs);
        } else {
          scrollProgress = 1;
          // Phase 4: Template2 fades in over the scene
          const templateElapsed = elapsed - dukeFadeInMs - princessFadeInMs - scrollDurationMs;
          template2Alpha = Math.min(1, templateElapsed / template2FadeInMs);
        }
      }
    }

    // Calculate princess source and destination positions based on scrollProgress
    const srcX = step.princessSrcX;
    const srcY = Math.round(step.princessSrcStartY + (step.princessSrcEndY - step.princessSrcStartY) * scrollProgress);
    const srcW = step.clipWidth;
    const srcH = step.clipHeight;

    const dstX = step.princessDstX;
    const dstY = Math.round(step.princessDstStartY + (step.princessDstEndY - step.princessDstStartY) * scrollProgress);
    const dstW = step.clipWidth;
    const dstH = step.clipHeight;

    // ── Draw ──
    this._clearBlack();

    // 1. Duke
    if (step.dukeImage && dukeAlpha > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = dukeAlpha;
      this.ctx.drawImage(step.dukeImage, step.dukeX, step.dukeY, step.dukeWidth, step.dukeHeight);
      this.ctx.restore();
    }

    // 2. Princess clip
    if (step.princessImage && princessAlpha > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = princessAlpha;
      this.ctx.drawImage(step.princessImage, srcX, srcY, srcW, srcH, dstX, dstY, dstW, dstH);
      this.ctx.restore();
    }

    // 3. Template2 overlay (fills entire canvas)
    if (step.template2Image && template2Alpha > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = template2Alpha;
      this.ctx.drawImage(step.template2Image, 0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }

    // Advance when all phases are complete
    if (elapsed >= totalDurationMs) {
      this._nextStep();
    }
  }

  // ── Dialogue scene renderer ──────────────────────────────────────────────


  // ─────────────────────────────────────────────────────────────────────────────
  // EndingDemo._drawDialogueScene – now uses parsed commands
  // ─────────────────────────────────────────────────────────────────────────────
  _drawDialogueScene(step, s, ts) {
  if (!s.commands) {
    s.commands = parseDialogueScript(RAW_SCRIPT);
    s.cmdIndex = 0;
    s.charPos = 0;
    s.lineStartTime = 0;
    s.pauseUntil = 0;
    s.currentSpeaker = 'narrator';
    s.currentColor = '#fbfbfb';
  }

  // Advance through commands if we've finished the current one
  while (s.cmdIndex < s.commands.length) {
    const cmd = s.commands[s.cmdIndex];
    if (cmd.type === 'pause') {
      if (!s.pauseStart) s.pauseStart = ts;
      if (ts - s.pauseStart < cmd.ms) {
        // still pausing – draw current state
        break;
      } else {
        s.pauseStart = null;
        s.cmdIndex++;
        continue;
      }
    } else if (cmd.type === 'newline') {
      // Just a line break – we handle it during text rendering
      s.cmdIndex++;
      continue;
    } else if (cmd.type === 'text') {
      // Typewriter
      if (s.charPos === 0) s.lineStartTime = ts;
      const elapsed = ts - s.lineStartTime;
      const totalChars = cmd.text.length;
      const visibleCount = Math.min(Math.floor(elapsed / CHAR_DELAY_MS), totalChars);
      // Update current speaker and colour for overlay and text style
      s.currentSpeaker = cmd.speaker;
      s.currentColor = cmd.color;
      // Store visible text for drawing
      s.displayText = cmd.text.slice(0, visibleCount);
      s.isComplete = (visibleCount === totalChars);

      if (s.isComplete) {
        // Wait a little before moving to next command
        if (!s.doneTime) s.doneTime = ts;
        if (ts - s.doneTime < LINE_PAUSE_MS) {
          // still waiting – draw
          break;
        } else {
          s.doneTime = null;
          s.cmdIndex++;
          s.charPos = 0;
          s.lineStartTime = 0;
          continue;
        }
      } else {
        s.charPos = visibleCount;
        break; // draw current state
      }
    } else {
      s.cmdIndex++;
    }
  }

  // ── Drawing ──────────────────────────────────────────────────────────────
  this._clearBlack();

  // Draw Duke and Princess base (always visible)
  this.ctx.drawImage(this.images.duke0, DUKE_POS.x, DUKE_POS.y, DUKE_POS.w, DUKE_POS.h);
  this.ctx.drawImage(this.images.princess, 4, 0, 180, 180, PRINCESS_POS.x, PRINCESS_POS.y, PRINCESS_POS.w, PRINCESS_POS.h);

  // Animate lips/eyes for the speaker
  const speaker = s.currentSpeaker;
  if (speaker === 'duke' || speaker === 'princess') {
    const isDuke = speaker === 'duke';
    const basePos = isDuke ? DUKE_POS : PRINCESS_POS;
    const lipIdx = getLipIndex(s.charPos || 0);
    const eyeIdx = getEyeIndex(ts);
    const lipKey = `${speaker}_lips${lipIdx}`;
    const eyeKey = `${speaker}_eyes${eyeIdx}`;
    const lipImg = this.images[lipKey];
    const eyeImg = this.images[eyeKey];
    if (lipImg) this.ctx.drawImage(lipImg, basePos.x, basePos.y, basePos.w, basePos.h);
    if (eyeImg) this.ctx.drawImage(eyeImg, basePos.x, basePos.y, basePos.w, basePos.h);
  }

  // Draw text box and typewriter text
  const box = DIALOGUE_BOX_RECT;
  this.ctx.fillStyle = DIALOGUE_BOX_BG;
  this.ctx.fillRect(box.x, box.y, box.w, box.h);

  this.ctx.save();
  this.ctx.font = DIALOGUE_FONT;
  this.ctx.fillStyle = s.currentColor || DIALOGUE_TEXT_COLOR;
  this.ctx.textBaseline = 'top';
  this.ctx.textAlign = 'left';

  // Wrap text to fit
  const fullText = s.displayText || '';
  const wrapped = this._wrapText(fullText, DIALOGUE_TEXT_MAX_WIDTH);
  for (let i = 0; i < wrapped.length; i++) {
    this.ctx.fillText(
      wrapped[i].text,
      DIALOGUE_TEXT_X,
      DIALOGUE_TEXT_Y + i * DIALOGUE_TEXT_LINE_HEIGHT
    );
  }
  this.ctx.restore();

  // Advance if finished all commands
  if (s.cmdIndex >= s.commands.length) {
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
