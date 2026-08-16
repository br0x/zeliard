// ─────────────────────────────────────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────────────────────────────────────
const INTRO_PRINCESS_FULL_SRC   = 'assets/images/enddemo/princess_full.png';
const INTRO_TEMPLATE2_SRC       = 'assets/images/opdemo/template2.png';
const INTRO_SPIRIT_SRC          = 'assets/images/opdemo/spirit.png';

const DUKE_SRC_BASE             = 'assets/images/opdemo/duke0.png';
const PRINCESS_SRC_BASE         = 'assets/images/enddemo/princess_base.png';
const KING_PRINCESS_SRC         = 'assets/images/enddemo/king_princess.png'
const SPIRIT_SRC                = 'assets/images/opdemo/spirit.png';
// Overlay assets (lips and eyes)
const DUKE_LIPS_SRC_BASE        = 'assets/images/enddemo/duke_lips_';   // 0..2
const DUKE_EYES_SRC_BASE        = 'assets/images/enddemo/duke_eyes_';   // 0..5
const PRINCESS_LIPS_SRC_BASE    = 'assets/images/enddemo/princess_lips_'; // 0..3
const PRINCESS_EYES_SRC_BASE    = 'assets/images/enddemo/princess_eyes_'; // 0..2

// Face overlay layout: position (relative to each base image) and native size.
const FACE_LAYOUT = {
  duke: {
    eyes: { x: 51,  y: 74,  w: 90, h: 31 },
    lips: { x: 54,  y: 128, w: 84, h: 51 },
  },
  princess: {
    eyes: { x: 49,  y: 63,  w: 54, h: 25 },
    lips: { x: 62,  y: 86,  w: 48, h: 35 },
  },
};
const DUKE_FACE_DEFAULT       = { eyes: 0, lips: 4 };
const PRINCESS_FACE_DEFAULT   = { eyes: 0, lips: 1 };
const PRINCESS_CROSSFADE_MS   = 1000;

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
const CHAR_DELAY_MS                 = 100;
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

// King & Princess scene curtain (clears the window interior before the new image)
const ENDING_CURTAIN_X      = 35;
const ENDING_CURTAIN_Y      = 35;
const ENDING_CURTAIN_W      = 571;
const ENDING_CURTAIN_H      = 203;
const ENDING_CURTAIN_COLOR  = '#f906ed';
const KING_PRINCESS_FADE_IN_MS = 1000;
const SPIRIT_CROSSFADE_MS = 1000;
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
const DIALOGUE_BOX_BG            = 'rgba(0,0,0,0.75)';
const DIALOGUE_BOX_RECT          = { x: 16, y: 276, w: 608, h: 110 };
const DIALOGUE_FONT              = '16px "Press Start 2P", monospace';
const DIALOGUE_TEXT_COLOR        = '#fbfbfb';
// Text shadow colours map to the game's text attribute (byte_6635/byte_6636):
//   0xFA → shadow colour 0 (black, invisible on the dark box)
//   0xFB → shadow colour 1 (blue, used for direct speech)
const DIALOGUE_TEXT_SHADOW_COLOR = '#000000';

// Frame timing for the 0xF5/0xF6 wait commands (asm/enddemo.asm sub_62EE) and the
// 0x0A-frame-per-character typewriter (sub_66CD).  The game reprograms PIT Timer 0
// with reload value 0x13B1 = 5041 (asm/zeliard.asm start), giving a ~236.70 Hz tick
// (1,193,182 / 5041).  timer_ISR_int8_chained (asm/stick.asm) increments frame_timer
// once per IRQ0; kbd_chain_divider = 13 keeps the BIOS clock at 236.70/13 ≈ 18.2 Hz.
const DIALOGUE_TICK_HZ          = 1193182 / 5041;
const DIALOGUE_FRAME_MS         = 1000 / DIALOGUE_TICK_HZ;
const DIALOGUE_PAUSE_MS         = Math.round(0xF0 * DIALOGUE_FRAME_MS);  // 0xF5 → ~1.01 s
const DIALOGUE_CHAR_DELAY_MS    = Math.round(0x0A * DIALOGUE_FRAME_MS);  // 10 frames/char

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
      dukeImage: images.dukeBase,
      princessImage: images.princessFull,
      princessBaseImage: images.princessBase,
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
      background: images.template2,
      // The renderer uses the images object for overlays
    },
    // ── 3. Curtain clears the window interior, then King & Princess ──────
    {
      type: 'kingPrincessScene',
      background: images.template2,
      image: images.kingPrincess,
      rect: { x: ENDING_CURTAIN_X, y: ENDING_CURTAIN_Y, w: ENDING_CURTAIN_W, h: ENDING_CURTAIN_H },
      curtainColor: ENDING_CURTAIN_COLOR,
      curtainMs: CURTAIN_MS,
      fadeInMs: KING_PRINCESS_FADE_IN_MS,
      snapshotOnComplete: true,
    },
    // ── 4. Spirit arrival scene (cross-fades from the King & Princess) ──
    {
      type: 'spiritScene',
      image: images.spirit,
      entryFromSnapshot: true,
      crossfadeMs: SPIRIT_CROSSFADE_MS,
      curtainMs: CURTAIN_MS,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// EndingDemo — updated class
// ─────────────────────────────────────────────────────────────────────────────


  // ─────────────────────────────────────────────────────────────────────────────
  // Raw script data from enddemo.asm (unk_6AA8 up to "Father!")
  // ─────────────────────────────────────────────────────────────────────────────
const DUKE_PRINCESS_SCRIPT = [
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
// Raw script data from enddemo.asm (unk_6AA8 after the Duke & Princess scene)
// ─────────────────────────────────────────────────────────────────────────────
const KING_PRINCESS_SCRIPT = [
  0xF5, 0xF5, 0xF5, 0xFE, 0xFD, 0xF3,
  // Princess speaks with the direct-speech attribute (blue shadow)
  0xFB, 0xEB,
  // '"Father!"'
  0x22, 0x46, 0x61, 0x74, 0x68, 0x65, 0x72, 0x21, 0x22,
  0xF5, 0xF5, 0xF2, 0xEE, // King speaks (blue shadow, inherited from 0xFB)
  // '"My darling Felicia!  '
  0x22, 0x4D, 0x79, 0x20, 0x64, 0x61, 0x72, 0x6C, 0x69, 0x6E, 0x67, 0x20, 0x46,
  0x65, 0x6C, 0x69, 0x63, 0x69, 0x61, 0x21, 0x20, 0x20,
  0xF5,
  // 'How I',27h,'ve longed to hold you in my arms and hear your sweet voice!"'
  0x48, 0x6F, 0x77, 0x20, 0x49, 0x27, 0x76, 0x65, 0x20, 0x6C, 0x6F, 0x6E, 0x67,
  0x65, 0x64, 0x20, 0x74, 0x6F, 0x20, 0x68, 0x6F, 0x6C, 0x64, 0x20, 0x79, 0x6F,
  0x75, 0x20, 0x69, 0x6E, 0x20, 0x6D, 0x79, 0x20, 0x61, 0x72, 0x6D, 0x73, 0x20,
  0x61, 0x6E, 0x64, 0x20, 0x68, 0x65, 0x61, 0x72, 0x20, 0x79, 0x6F, 0x75, 0x72,
  0x20, 0x73, 0x77, 0x65, 0x65, 0x74, 0x20, 0x76, 0x6F, 0x69, 0x63, 0x65, 0x21,
  0x22,
  0xF5, 0xF5, 0xF5, 0xFA, 0xFE, 0xF3, 0xF0, // narrator speaks
  // 'Outside, the land cursed by the evil magic of Jashiin began to resume its
  //  original lushness.'
  0x4F, 0x75, 0x74, 0x73, 0x69, 0x64, 0x65, 0x2C, 0x20, 0x74, 0x68, 0x65, 0x20,
  0x6C, 0x61, 0x6E, 0x64, 0x20, 0x63, 0x75, 0x72, 0x73, 0x65, 0x64, 0x20, 0x62,
  0x79, 0x20, 0x74, 0x68, 0x65, 0x20, 0x65, 0x76, 0x69, 0x6C, 0x20, 0x6D, 0x61,
  0x67, 0x69, 0x63, 0x20, 0x6F, 0x66, 0x20, 0x4A, 0x61, 0x73, 0x68, 0x69, 0x69,
  0x6E, 0x20, 0x62, 0x65, 0x67, 0x61, 0x6E, 0x20, 0x74, 0x6F, 0x20, 0x72, 0x65,
  0x73, 0x75, 0x6D, 0x65, 0x20, 0x69, 0x74, 0x73, 0x20, 0x6F, 0x72, 0x69, 0x67,
  0x69, 0x6E, 0x61, 0x6C, 0x20, 0x6C, 0x75, 0x73, 0x68, 0x6E, 0x65, 0x73, 0x73,
  0x2E,
  0xF5, 0xF5, 0xF5, 0xFE, 0xF3,
  // 'The dreadful power of Jashiin was washed from the earth, and the land of
  //  Zeliard was peaceful once more.'
  0x54, 0x68, 0x65, 0x20, 0x64, 0x72, 0x65, 0x61, 0x64, 0x66, 0x75, 0x6C, 0x20,
  0x70, 0x6F, 0x77, 0x65, 0x72, 0x20, 0x6F, 0x66, 0x20, 0x4A, 0x61, 0x73, 0x68,
  0x69, 0x69, 0x6E, 0x20, 0x77, 0x61, 0x73, 0x20, 0x77, 0x61, 0x73, 0x68, 0x65,
  0x64, 0x20, 0x66, 0x72, 0x6F, 0x6D, 0x20, 0x74, 0x68, 0x65, 0x20, 0x65, 0x61,
  0x72, 0x74, 0x68, 0x2C, 0x20, 0x61, 0x6E, 0x64, 0x20, 0x74, 0x68, 0x65, 0x20,
  0x6C, 0x61, 0x6E, 0x64, 0x20, 0x6F, 0x66, 0x20, 0x5A, 0x65, 0x6C, 0x69, 0x61,
  0x72, 0x64, 0x20, 0x77, 0x61, 0x73, 0x20, 0x70, 0x65, 0x61, 0x63, 0x65, 0x66,
  0x75, 0x6C, 0x20, 0x6F, 0x6E, 0x63, 0x65, 0x20, 0x6D, 0x6F, 0x72, 0x65, 0x2E,
  0xF5, 0xF5, 0xF5, 0xFE, 0xFD,
];

// ─────────────────────────────────────────────────────────────────────────────
// Raw script data from enddemo.asm (unk_6AA8 after the King & Princess scene)
// ─────────────────────────────────────────────────────────────────────────────
const SPIRIT_SCRIPT = [
  // Narrator (normal attribute), cursor row 1
  0xFA, 0xF3,
  // 'The Guardian Spirit of the Holy Land of Zeliard appeared before Duke
  //  Garland once again.'
  0x54, 0x68, 0x65, 0x20, 0x47, 0x75, 0x61, 0x72, 0x64, 0x69, 0x61, 0x6E,
  0x20, 0x53, 0x70, 0x69, 0x72, 0x69, 0x74, 0x20, 0x6F, 0x66, 0x20, 0x74,
  0x68, 0x65, 0x20, 0x48, 0x6F, 0x6C, 0x79, 0x20, 0x4C, 0x61, 0x6E, 0x64,
  0x20, 0x6F, 0x66, 0x20, 0x5A, 0x65, 0x6C, 0x69, 0x61, 0x72, 0x64, 0x20,
  0x61, 0x70, 0x70, 0x65, 0x61, 0x72, 0x65, 0x64, 0x20, 0x62, 0x65, 0x66,
  0x6F, 0x72, 0x65, 0x20, 0x44, 0x75, 0x6B, 0x65, 0x20, 0x47, 0x61, 0x72,
  0x6C, 0x61, 0x6E, 0x64, 0x20, 0x6F, 0x6E, 0x63, 0x65, 0x20, 0x61, 0x67,
  0x61, 0x69, 0x6E, 0x2E,
  0xF5, 0xF5, 0xF5, 0xFE,
  // Spirit speaks with the direct-speech attribute (blue shadow), row 1
  0xF3, 0xFB, 0xEC,
  // '"You have suffered many hardships to defeat Jashiin, Duke Garland."'
  0x22, 0x59, 0x6F, 0x75, 0x20, 0x68, 0x61, 0x76, 0x65, 0x20, 0x73, 0x75,
  0x66, 0x66, 0x65, 0x72, 0x65, 0x64, 0x20, 0x6D, 0x61, 0x6E, 0x79, 0x20,
  0x68, 0x61, 0x72, 0x64, 0x73, 0x68, 0x69, 0x70, 0x73, 0x20, 0x74, 0x6F,
  0x20, 0x64, 0x65, 0x66, 0x65, 0x61, 0x74, 0x20, 0x4A, 0x61, 0x73, 0x68,
  0x69, 0x69, 0x6E, 0x2C, 0x20, 0x44, 0x75, 0x6B, 0x65, 0x20, 0x47, 0x61,
  0x72, 0x6C, 0x61, 0x6E, 0x64, 0x2E, 0x22,
  0xF5, 0xF5, 0xF5, 0xFE, 0xFD,
];

// ─────────────────────────────────────────────────────────────────────────────
// Parser – builds a flat array of command objects
//
// Control codes, as decoded from asm/enddemo.asm (sub_6318 / sub_66CD):
//   0xF0        narrator speaks (silent – clears the character voice)
//   0xF1 0xF2 0xF3 0xF7   move the text cursor to row 3 / 2 / 1 / 0, column 0
//   0xF5        wait 0xF0 (240) frames before continuing (sub_62EE)
//   0xF6        wait 3 × 0xF0 (720) frames
//   0xF9 0xFA 0xFB   text attribute FG/BG = 2/6, 0/7 (normal), 1/7 (direct speech)
//   0xFC        clear the text box and reset the cursor to row 0, column 0
//   0xFE        same as 0xFC but ends the current page
//   0xFD 0xFF   end of script
//   0xEB-0xEF   speaker select (princess / spirit / king / duke)
//   0x80-0xCF   lip/eye articulation codes
// ─────────────────────────────────────────────────────────────────────────────
function parseDialogueScript(bytes) {
  const commands = [];
  let i = 0;
  let currentSpeaker = 'narrator';
  let currentColor = DIALOGUE_TEXT_COLOR;
  let currentShadow = DIALOGUE_TEXT_SHADOW_COLOR;
  let currentRow = 0;
  let pendingText = '';
  let pendingHolds = [];   // { at, ms } pause points within pendingText
  let faceChanges = [];
  let face = { duke: { eyes: 0, lips: 0 }, princess: { eyes: 0, lips: 3 } };

  function flushText() {
    if (pendingText) {
      commands.push({
        type: 'text',
        speaker: currentSpeaker,
        text: pendingText,
        color: currentColor,
        shadow: currentShadow,
        row: currentRow,
        holds: pendingHolds,
        faceChanges: faceChanges,
      });
    } else {
      // No text accumulated – emit any queued waits as standalone pauses
      for (const h of pendingHolds) commands.push({ type: 'pause', ms: h.ms });
    }
    pendingText = '';
    pendingHolds = [];
    faceChanges = [];
  }

  while (i < bytes.length) {
    const b = bytes[i++];
    if (b === 0xFF) break; // end of script

    // Control codes
    if (b >= 0xF0) {
      switch (b) {
        case 0xF0:
          flushText();
          currentSpeaker = 'narrator';
          break;
        // Cursor row select (sub_6318 loc_6424 → loc_649E)
        case 0xF7:
          flushText();
          currentRow = 0;
          commands.push({ type: 'newline', row: 0 });
          break;
        case 0xF3:
          flushText();
          currentRow = 1;
          commands.push({ type: 'newline', row: 1 });
          break;
        case 0xF2:
          flushText();
          currentRow = 2;
          commands.push({ type: 'newline', row: 2 });
          break;
        case 0xF1:
          flushText();
          currentRow = 3;
          commands.push({ type: 'newline', row: 3 });
          break;
        // Wait 0xF0 frames (sub_6318 loc_64C9 / loc_64D1). Does NOT break the
        // line – the pause is applied at the current character offset.
        case 0xF5:
          pendingHolds.push({ at: pendingText.length, ms: DIALOGUE_PAUSE_MS });
          break;
        case 0xF6:
          pendingHolds.push({ at: pendingText.length, ms: DIALOGUE_PAUSE_MS * 3 });
          break;
        // Text attribute (sub_6318 loc_640F / loc_63FB)
        case 0xFA:
          flushText();
          currentColor = DIALOGUE_TEXT_COLOR;
          currentShadow = DIALOGUE_TEXT_SHADOW_COLOR;
          commands.push({ type: 'color', color: currentColor, shadow: currentShadow });
          break;
        case 0xFB:
          flushText();
          currentColor = DIRECT_SPEECH_TEXT_COLOR;
          currentShadow = DIRECT_SPEECH_SHADOW_COLOR;
          commands.push({ type: 'color', color: currentColor, shadow: currentShadow });
          break;
        // Clear the text box (sub_6318 loc_64B8, sub_66CD loc_67AD)
        case 0xFC:
          flushText();
          currentRow = 0;
          commands.push({ type: 'clear' });
          break;
        case 0xFE:
          flushText();
          currentRow = 0;
          commands.push({ type: 'pageBreak' });
          break;
        default: /* 0xFD and others are ignored */ break;
      }
    } else if (b >= 0xEB && b <= 0xEF) {
      // Speaker codes (0xEB-0xEF)
      flushText();
      switch (b) {
        case 0xEB: currentSpeaker = 'princess'; break;
        case 0xEC: currentSpeaker = 'spirit'; break;
        case 0xED: currentSpeaker = 'king'; break;
        case 0xEE: currentSpeaker = 'king'; break;
        case 0xEF: currentSpeaker = 'duke'; break;
        default: break;
      }
    } else if (b >= 0x90 && b <= 0x98) {
      // Duke eyes/lips: 0x90-0x95 lips, 0x96-0x98 eyes
      const rel = b - 0x90;
      const part = rel < 6 ? 'lips' : 'eyes';
      const index = rel < 6 ? rel : rel - 6;
      face.duke[part] = index;
      faceChanges.push({ at: pendingText.length, speaker: 'duke', part: part, index: index });
    } else if (b >= 0xA0 && b <= 0xA5) {
      // Princess eyes/lips: 0xA0-0xA2 lips, 0xA3-0xA5 eyes
      const rel = b - 0xA0;
      const part = rel < 3 ? 'lips' : 'eyes';
      const index = rel < 3 ? rel : rel - 3;
      face.princess[part] = index;
      faceChanges.push({ at: pendingText.length, speaker: 'princess', part: part, index: index });
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
      princessFull,
      princessBase,
      dukeBase,
      template2,
      spirit,
      kingPrincess,
    ] = await Promise.all([
      loadImage(INTRO_PRINCESS_FULL_SRC),
      loadImage(PRINCESS_SRC_BASE),
      loadImage(DUKE_SRC_BASE),
      loadImage(INTRO_TEMPLATE2_SRC),
      loadImage(INTRO_SPIRIT_SRC),
      loadImage(KING_PRINCESS_SRC),
      loadStoryFont(),
    ]);

    // Load overlay images (lips & eyes) for Duke and Princess
    const lipEyePromises = [];
    for (let i = 0; i < 6; i++) {
      lipEyePromises.push(loadImage(`${DUKE_LIPS_SRC_BASE}${i}.png`));
    }
    for (let i = 0; i < 3; i++) {
      lipEyePromises.push(loadImage(`${PRINCESS_LIPS_SRC_BASE}${i}.png`));
    }
    for (let i = 0; i < 3; i++) {
      lipEyePromises.push(loadImage(`${DUKE_EYES_SRC_BASE}${i}.png`));
    }
    for (let i = 0; i < 3; i++) {
      lipEyePromises.push(loadImage(`${PRINCESS_EYES_SRC_BASE}${i}.png`));
    }
    const overlayResults = await Promise.allSettled(lipEyePromises);

    // Organise overlays by name
    const overlays = {};
    const names = [];
    for (let i = 0; i < 6; i++) {
      names.push(`duke_lips${i}`);
    }
    for (let i = 0; i < 3; i++) {
      names.push(`princess_lips${i}`);
    }
    for (let i = 0; i < 3; i++) {
      names.push(`duke_eyes${i}`);
    }
    for (let i = 0; i < 3; i++) {
      names.push(`princess_eyes${i}`);
    }
    overlayResults.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        overlays[names[idx]] = result.value;
      } else {
        console.warn(`Failed to load overlay: ${names[idx]}`, result.reason);
      }
    });

    this.images = {
      princessFull,
      princessBase,
      dukeBase,
      template2,
      spirit,
      kingPrincess,
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

    if (step.type === 'spiritScene') {
      const entryImage = this.snapshotForNext;
      this.snapshotForNext = null;
      return {
        ...base,
        entryImage: entryImage,
        crossfadeDone: false,
        curtainStartTime: 0,
        curtainSnapshot: null,
      };
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
      case 'dialogueScene':         return this._drawDukePrincessDialogueScene(step, s, ts);
      case 'kingPrincessScene':     return this._drawKingPrincessScene(step, s, ts);
      case 'spiritScene':           return this._drawSpiritScene(step, s, ts);
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

    const totalDurationMs = dukeFadeInMs + princessFadeInMs + scrollDurationMs + template2FadeInMs + PRINCESS_CROSSFADE_MS;

    // -- Phase calculations --
    let dukeAlpha = 0;
    let princessAlpha = 0;
    let scrollProgress = 0;
    let template2Alpha = 0;
    let crossfadeAlpha = 0;

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
          // Phase 5: Princess final cropped image cross-fades into princess_base
          const crossfadeElapsed = elapsed - dukeFadeInMs - princessFadeInMs - scrollDurationMs - template2FadeInMs;
          crossfadeAlpha = Math.min(1, crossfadeElapsed / PRINCESS_CROSSFADE_MS);
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

    // 4. Princess final cropped image cross-fades into princess_base
    if (step.princessBaseImage && crossfadeAlpha > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = crossfadeAlpha;
      this.ctx.drawImage(step.princessBaseImage, dstX, dstY, dstW, dstH);
      this.ctx.restore();
    }

    // Advance when all phases are complete
    if (elapsed >= totalDurationMs) {
      this._nextStep();
    }
  }

  // ── Dialogue scene renderer ──────────────────────────────────────────────


  // ─────────────────────────────────────────────────────────────────────────────
  // EndingDemo._drawDukePrincessDialogueScene – now uses parsed commands
  // ─────────────────────────────────────────────────────────────────────────────

  _initDialogueState(s, script) {
    s.commands = parseDialogueScript(script);
    s.cmdIndex = 0;
    s.row = 0;                 // next text row within the current box page
    s.pageLines = [];          // lines on the current box page
    s.typingLine = 0;          // index into pageLines currently being typed
    s.charCount = 0;           // chars revealed on typingLine
    s.baseChars = 0;           // chars already revealed before the current typing segment
    s.holdIndex = 0;           // index into the active line's holds[]
    s.holdStart = 0;           // timestamp when the active hold began (0 = not holding)
    s.lineStartTime = 0;
    s.pauseStart = 0;
    s.currentSpeaker = 'narrator';
    s.currentColor = DIALOGUE_TEXT_COLOR;
    s.currentShadow = DIALOGUE_TEXT_SHADOW_COLOR;
    s.face = { duke: { ...DUKE_FACE_DEFAULT }, princess: { ...PRINCESS_FACE_DEFAULT } };
  }

  // ── Command processing + typewriter reveal ────────────────────────────────
  // Advance the typewriter, and consume commands whenever no line is being
  // typed or held. Stop as soon as we must draw the current state.
  _processDialogueCommands(s, ts) {
    let drawing = false;
    while (!drawing) {
      // 1. Type / hold the current line, if any
      if (s.typingLine < s.pageLines.length) {
        const line = s.pageLines[s.typingLine];
        const holds = line.holds || [];

        // Finish an active hold (a 0xF5 wait at a character offset)
        if (s.holdStart !== 0) {
          const hold = holds[s.holdIndex];
          if (hold && ts - s.holdStart >= hold.ms) {
            s.holdStart = 0;
            s.holdIndex++;
            s.baseChars = hold.at;
            s.lineStartTime = ts;
          } else {
            s.charCount = hold ? hold.at : line.text.length;
            drawing = true; // still holding
            break;
          }
        }

        // Normal typewriter progress, clamped so it never overshoots a hold
        if (!s.lineStartTime) s.lineStartTime = ts;
        const nextHoldAt = s.holdIndex < holds.length ? holds[s.holdIndex].at : line.text.length;
        const revealed = s.baseChars + Math.floor((ts - s.lineStartTime) / DIALOGUE_CHAR_DELAY_MS);
        s.charCount = Math.min(revealed, line.text.length, nextHoldAt);

        // Reach a hold offset → begin holding
        if (s.holdIndex < holds.length && s.charCount >= holds[s.holdIndex].at) {
          s.charCount = holds[s.holdIndex].at;
          s.holdStart = ts;
          drawing = true; // begin holding
          break;
        }

        if (s.charCount < line.text.length) {
          drawing = true; // still typing
          break;
        }

        // Line fully typed – move to the next one
        s.typingLine++;
        s.baseChars = 0;
        s.holdIndex = 0;
        s.holdStart = 0;
        s.lineStartTime = 0;
        s.charCount = 0;
        continue;
      }

      // 2. No line pending – consume the next command
      if (s.cmdIndex >= s.commands.length) break;
      const cmd = s.commands[s.cmdIndex];
      switch (cmd.type) {
        case 'pause': // standalone pause (edge case; 0xF5 usually becomes a hold)
          if (!s.pauseStart) s.pauseStart = ts;
          if (ts - s.pauseStart < cmd.ms) { drawing = true; break; }
          s.pauseStart = 0;
          s.cmdIndex++;
          continue;
        case 'color':
          s.currentColor = cmd.color;
          s.currentShadow = cmd.shadow;
          s.cmdIndex++;
          continue;
        case 'newline':
          s.row = cmd.row;
          s.cmdIndex++;
          continue;
        case 'clear':
        case 'pageBreak':
          s.pageLines = [];
          s.row = 0;
          s.typingLine = 0;
          s.baseChars = 0;
          s.holdIndex = 0;
          s.holdStart = 0;
          s.charCount = 0;
          s.lineStartTime = 0;
          s.cmdIndex++;
          continue;
        case 'text':
          s.pageLines.push({
            row: cmd.row,
            text: cmd.text,
            speaker: cmd.speaker,
            color: cmd.color,
            shadow: cmd.shadow,
            holds: cmd.holds || [],
            faceChanges: cmd.faceChanges,
          });
          s.cmdIndex++;
          continue; // type it next
        default:
          s.cmdIndex++;
          continue;
      }
      break;
    }
  }

  // Draws the dialogue box and the typewriter text for the current page.
  _drawDialogueTextBox(s) {
    const box = DIALOGUE_BOX_RECT;
    this.ctx.fillStyle = DIALOGUE_BOX_BG;
    this.ctx.fillRect(box.x, box.y, box.w, box.h);

    this.ctx.save();
    this.ctx.font = DIALOGUE_FONT;
    this.ctx.textBaseline = 'top';
    this.ctx.textAlign = 'left';

    let nextFreeRow = 0;
    for (let li = 0; li < s.pageLines.length && li <= s.typingLine; li++) {
      const line = s.pageLines[li];
      const visibleCount = li < s.typingLine ? line.text.length : s.charCount;
      if (!visibleCount) continue;

      // Apply face changes that have been revealed so far on this line
      for (const fc of line.faceChanges || []) {
        if (fc.at <= visibleCount) {
          s.face[fc.speaker][fc.part] = fc.index;
        }
      }

      // Lay the line out from its script row, but never let a wrapped line spill
      // into a row already claimed by an earlier line (the game's proportional
      // font keeps each line on a single row; with our wider monospace font a
      // line can wrap, so the next line must be pushed below it instead of
      // overlapping).  Positions use the FULL text so they never shift mid-type.
      const wrapped = this._wrapText(line.text, DIALOGUE_TEXT_MAX_WIDTH);
      const startRow = Math.max(line.row, nextFreeRow);
      nextFreeRow = startRow + wrapped.length;

      let shown = visibleCount;
      for (let wi = 0; wi < wrapped.length && shown > 0; wi++) {
        const { text } = wrapped[wi];
        const chunkVisible = Math.min(shown, text.length);
        shown -= chunkVisible;
        if (chunkVisible <= 0) break;
        const rowY = DIALOGUE_TEXT_Y + (startRow + wi) * DIALOGUE_TEXT_LINE_HEIGHT;
        this.ctx.fillStyle = line.shadow;
        this.ctx.fillText(text.slice(0, chunkVisible), DIALOGUE_TEXT_X + DIRECT_SPEECH_SHADOW_OFFSET, rowY + DIRECT_SPEECH_SHADOW_OFFSET);
        this.ctx.fillStyle = line.color;
        this.ctx.fillText(text.slice(0, chunkVisible), DIALOGUE_TEXT_X, rowY);
      }
    }
    this.ctx.restore();
  }

  _drawDukePrincessDialogueScene(step, s, ts) {
    if (!s.commands) this._initDialogueState(s, DUKE_PRINCESS_SCRIPT);
    this._processDialogueCommands(s, ts);

    // ── Drawing ──────────────────────────────────────────────────────────────
    this._clearBlack();

    // Draw the scene background (template2) so it remains from the previous step
    if (step.background) {
      this.ctx.drawImage(step.background, 0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw Duke and Princess base (always visible)
    this.ctx.drawImage(this.images.dukeBase, DUKE_POS.x, DUKE_POS.y, DUKE_POS.w, DUKE_POS.h);
    this.ctx.drawImage(this.images.princessBase, PRINCESS_POS.x, PRINCESS_POS.y, PRINCESS_POS.w, PRINCESS_POS.h);

    // Draw face overlays (lips & eyes) for both characters at native size/offset
    for (const speaker of ['duke', 'princess']) {
      const basePos = speaker === 'duke' ? DUKE_POS : PRINCESS_POS;
      const layout = FACE_LAYOUT[speaker];
      const face = s.face[speaker];
      for (const part of ['eyes', 'lips']) {
        const img = this.images[`${speaker}_${part}${face[part]}`];
        if (!img) continue;
        const off = layout[part];
        this.ctx.drawImage(img, basePos.x + off.x, basePos.y + off.y, off.w, off.h);
      }
    }

    this._drawDialogueTextBox(s);

    // Advance if finished all commands
    if (s.cmdIndex >= s.commands.length) {
      this._nextStep();
    }
  }

  // ── King & Princess scene ─────────────────────────────────────────────────
  // After the Duke & Princess dialogue, a curtain clears the window interior
  // (rect), then the King & Princess image fades in over the same area and a
  // typewriter dialogue plays.  No face animations.
  _drawKingPrincessScene(step, s, ts) {
    const elapsed = ts - s.startTime;

    // Snapshot the finished dialogue scene so the closing curtain can reveal it
    if (!s.snapshot) {
      s.snapshot = this._makeOffscreen();
      s.snapshot.getContext('2d').drawImage(this.canvas, 0, 0);
    }

    const curtainProgress = Math.min(elapsed / step.curtainMs, 1);
    this._drawCurtainRect(curtainProgress, s.snapshot, step.rect, step.curtainColor);

    if (curtainProgress >= 1) {
      // Curtain fully closed – fade the new image into the cleared area
      const fadeProgress = Math.min((elapsed - step.curtainMs) / step.fadeInMs, 1);

      this._clearBlack();
      if (step.background) {
        this.ctx.drawImage(step.background, 0, 0, this.canvas.width, this.canvas.height);
      }

      // The cleared area remains curtain-coloured until the image covers it
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(step.rect.x, step.rect.y, step.rect.w, step.rect.h);
      this.ctx.clip();
      this.ctx.fillStyle = step.curtainColor;
      this.ctx.fillRect(step.rect.x, step.rect.y, step.rect.w, step.rect.h);
      if (fadeProgress > 0 && step.image) {
        this.ctx.globalAlpha = fadeProgress;
        this.ctx.drawImage(step.image, step.rect.x, step.rect.y, step.rect.w, step.rect.h);
      }
      this.ctx.restore();

      // Once fully faded in, run the King & Princess typewriter dialogue
      if (fadeProgress >= 1) {
        if (!s.commands) this._initDialogueState(s, KING_PRINCESS_SCRIPT);
        this._processDialogueCommands(s, ts);
        this._drawDialogueTextBox(s);

        if (s.cmdIndex >= s.commands.length) {
          this._nextStep();
        }
      }
    }
  }

  // ── Spirit arrival scene ─────────────────────────────────────────────────
  // Cross-fades from the captured King & Princess scene into the spirit image,
  // types the narrator + Spirit dialogue, then a standard curtain
  // (CURTAIN_COLOR) closes over the scene to clear it.
  _drawSpiritScene(step, s, ts) {
    const elapsed = ts - s.startTime;

    // Phase 1: cross-fade from the snapshot to the spirit image
    if (!s.crossfadeDone) {
      const progress = Math.min(elapsed / step.crossfadeMs, 1);
      this._clearBlack();

      if (s.entryImage && progress < 1) {
        this.ctx.save();
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.drawImage(s.entryImage, 0, 0);
        this.ctx.restore();
      }
      if (progress > 0) {
        this.ctx.save();
        this.ctx.globalAlpha = progress;
        this.ctx.drawImage(step.image, 0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
      }

      if (progress >= 1) s.crossfadeDone = true;
      return;
    }

    // Phase 2: spirit image + typewriter dialogue
    this._clearBlack();
    this.ctx.drawImage(step.image, 0, 0, this.canvas.width, this.canvas.height);

    if (!s.commands) this._initDialogueState(s, SPIRIT_SCRIPT);
    this._processDialogueCommands(s, ts);
    this._drawDialogueTextBox(s);

    // Phase 3: when the dialogue is done, a curtain (standard CURTAIN_COLOR)
    // closes over the scene to clear it
    if (s.cmdIndex >= s.commands.length) {
      if (!s.curtainSnapshot) {
        s.curtainSnapshot = this._makeOffscreen();
        s.curtainSnapshot.getContext('2d').drawImage(this.canvas, 0, 0);
        s.curtainStartTime = ts;
      }
      const curtainProgress = Math.min((ts - s.curtainStartTime) / step.curtainMs, 1);
      this._clearBlack();
      this.ctx.drawImage(s.curtainSnapshot, 0, 0);
      this._drawCurtainClose(curtainProgress, s.curtainSnapshot);

      if (curtainProgress >= 1) {
        this._nextStep();
      }
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
    this._drawCurtainRect(progress, backgroundImage, {
      x: CURTAIN_X1, y: CURTAIN_Y1, w: CURTAIN_X2 - CURTAIN_X1, h: CURTAIN_Y2 - CURTAIN_Y1,
    }, CURTAIN_COLOR);
  }

  // Parameterized curtain-close over an arbitrary rect + colour.
  _drawCurtainRect(progress, backgroundImage, rect, color) {
    if (progress <= 0) return;

    const rx1 = rect.x, ry1 = rect.y;
    const rw  = rect.w, rh = rect.h;
    const maxInset = Math.floor(Math.min(rw, rh) / 2);
    const inset    = Math.ceil(progress * maxInset);

    this.ctx.save();
    this.ctx.fillStyle = color;
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
