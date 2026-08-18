// ─────────────────────────────────────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────────────────────────────────────
const INTRO_PRINCESS_FULL_SRC   = 'assets/images/enddemo/princess_full.png';
const INTRO_TEMPLATE2_SRC       = 'assets/images/opdemo/template2.png';
const INTRO_SPIRIT_SRC          = 'assets/images/opdemo/spirit.png';

const DUKE_SRC_BASE             = 'assets/images/opdemo/duke0.png';
const PRINCESS_SRC_BASE         = 'assets/images/enddemo/princess_base.png';
const KING_PRINCESS_SRC         = 'assets/images/enddemo/king_princess.png'
const SPIRIT_SRC_BASE           = 'assets/images/enddemo/spirit_base.png';
const PRINCESS1_SRC_BASE        = 'assets/images/enddemo/princess1_base.png';
const FAREWELL_SRC_BASE         = 'assets/images/enddemo/farewell.png';
const CASTLE_SRC_BASE           = 'assets/images/enddemo/castle.jpg';
const DUKE_HORSE_SRC            = 'assets/images/enddemo/duke_horse.jpg';
const PRINCESS_BALCONY_SRC      = 'assets/images/enddemo/princess_balcony.jpg';
const DUKE_PRINCESS_SRC         = 'assets/images/enddemo/duke_princess.jpg';
// Overlay assets (lips and eyes)
const DUKE_LIPS_SRC_BASE        = 'assets/images/enddemo/duke_lips_';   // 0..2
const DUKE_EYES_SRC_BASE        = 'assets/images/enddemo/duke_eyes_';   // 0..5
const PRINCESS_LIPS_SRC_BASE    = 'assets/images/enddemo/princess_lips_'; // 0..3
const PRINCESS_EYES_SRC_BASE    = 'assets/images/enddemo/princess_eyes_'; // 0..2
const SPIRIT_LIPS_SRC_BASE      = 'assets/images/enddemo/spirit_lips_'; // 0..5
const PRINCESS1_LIPS_SRC_BASE   = 'assets/images/enddemo/princess1_lips_'; // 0..5
const PRINCESS1_EYES_SRC_BASE   = 'assets/images/enddemo/princess1_eyes_'; // 0..2
const PRINCESS2_LIPS_SRC_BASE   = 'assets/images/enddemo/farewell_lips_'; // 0..1

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
  spirit: {
    lips: { x: 74, y: 108, w: 23, h: 26 },
  },
  princess1: {
    eyes: { x: 36,  y: 85,  w: 64, h: 28 },
    lips: { x: 54,  y: 126,  w: 55, h: 37 },
  },
  princess2: {
    lips: { x: 452,  y: 121,  w: 10, h: 6 },
  },
};
const DUKE_FACE_DEFAULT       = { eyes: 0, lips: 4 };
const PRINCESS_FACE_DEFAULT   = { eyes: 0, lips: 1 };
const SPIRIT_FACE_DEFAULT     = { lips: 0 };
const PRINCESS1_FACE_DEFAULT  = { eyes: 0, lips: 4 };
const PRINCESS2_FACE_DEFAULT  = { lips: 0 };
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
// Curtain that closes over the Duke & Princess Felicia farewell scene
const PRINCESS1_CURTAIN_COLOR = '#00007d';
// Farewell scene – the Duke walks away and the left part of the scene fades out
const FAREWELL_CROSSFADE_MS    = 1000;
const FAREWELL_FADE_MS         = 2000;
const FAREWELL_FADE_COLOR      = '#000367';
const FAREWELL_FADE_RECT       = { x: 101, y: 34, w: 205, h: 205 };
// Final castle scene – cross-fades from the farewell scene to the castle image
// while the outro music ("Guinever (Aquarium 1981)") begins
const CASTLE_CROSSFADE_MS      = 2000;
const CASTLE_HOLD_MS           = 15000;
const CASTLE_MUSIC_TRACK       = 'outro/Guinever (Aquarium 1981)';
const CASTLE_MUSIC_FADE_MS     = 1500;
const END_CREDITS_MUSIC_TRACK  = 'outro/Zeliard-End-Credits';
// End credits – typed faster than the dialogue (7 frames/char vs 10) with a
// solid white square cursor that precedes each character (asm/enddemo.asm
// sub_66CD).  Three background images are shown (duke on horseback → duke &
// princess → princess on the balcony), then the canvas clears and the
// copyright notice is typed.
const CREDITS_CROSSFADE_MS       = 2000;
const CREDITS_HORSE_MS           = 50000;   // duke_horse.jpg, STAFF → SOUND EFFECTS
const CREDITS_BALCONY_MS         = 55000;   // princess_balcony.jpg, SPECIAL THANKS → Absor
// Phase 4 – the duke & princess image holds while PORT_CREDITS scrolls right to
// left along a 1990s-demoscene-style curve y = 343 - 0.8·e^(0.0067x)·sin(0.05154x).
const PORT_CREDITS_FONT             = '24px "Press Start 2P", monospace';
const PORT_CREDITS_SPEED            = 120;   // px / second
const PORT_CREDITS_COLOR            = '#ffffff';
const PORT_CREDITS_HIGHLIGHT_COLOR  = '#00ffff';  // characters inside {…}
const PORT_CREDITS_LEFT_BOUNDARY    = 10;    // phase ends once the whole text crosses x=10
const PORT_CREDITS_CURVE_Y          = (x) => 343 - 0.8 * Math.exp(0.0067 * x) * Math.sin(0.05154 * x);
const ENDING_CREDITS_FONT        = '16px "Press Start 2P", monospace';
const ENDING_CREDITS_LINE_HEIGHT = 28;
const CREDITS_BOX_RECT           = { x: 16, y: 295, w: 608, h: 140 };
const CREDITS_BOX_BG             = 'rgba(0,0,0,0.85)';
const CREDITS_TEXT_Y             = 296;
const CREDITS_LEFT_X             = 46;
const CREDITS_RIGHT_X            = 354;
const CREDITS_TEXT_COLOR         = '#ffffff';
const CREDITS_CURSOR_SIZE        = 16;
const CREDITS_SCREEN_HOLD_MS     = 4800;    // pause after each staff screen
const CREDITS_THANKS_HOLD_MS     = 6500;    // pause after each thanks screen
const CREDITS_MONSTERS_HOLD_MS   = 1500;    // pause after each serving-monsters screen
const CREDITS_COPYRIGHT_HOLD_MS  = 3000;    // pause after the copyright text
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
const DIALOGUE_TEXT_Y            = 285;
const DIALOGUE_TEXT_MAX_WIDTH    = 600;
const DIALOGUE_TEXT_LINE_HEIGHT  = 20;
const DIALOGUE_BOX_BG            = 'rgba(0,0,0,0.75)';
const DIALOGUE_BOX_RECT          = { x: 16, y: 281, w: 608, h: 110 };
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
const ENDING_CREDITS_CHAR_DELAY_MS = Math.round(0x07 * DIALOGUE_FRAME_MS); // 7 frames/char ≈30 ms

// Face overlay positions (assume overlays are same size as base and fully opaque where needed)
const DUKE_POS = { x: 94, y: 45, w: 180, h: 180 };
const PRINCESS_POS = { x: 366, y: 45, w: 180, h: 180 };
const SPIRIT_POS = { x: 366, y: 45, w: 180, h: 180 };
const PRINCESS1_POS = { x: 366, y: 45, w: 180, h: 180 };

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
    // ── 5. Duke & Spirit dialogue (template2 reveals, Duke left, Spirit right) ──
    {
      type: 'dukeSpiritScene',
      background: images.template2,
      fadeInMs: TEMPLATE2_FADE_IN_MS,
    },
    // ── 6. Final Duke with Princess dialogue (Spirit cross-fades into the new princess) ──
    {
      type: 'princess1Scene',
      background: images.template2,
      crossfadeMs: SPIRIT_CROSSFADE_MS,
      curtainColor: PRINCESS1_CURTAIN_COLOR,
      curtainMs: CURTAIN_MS,
      snapshotOnComplete: true,
    },
    // ── 7. Farewell scene – cross-fades to farewell.png, plays the farewell
    //        dialogue, fades the left part of the scene out as the Duke leaves,
    //        then finishes with the Princess left ──
    {
      type: 'farewellScene',
      image: images.farewell,
      crossfadeMs: FAREWELL_CROSSFADE_MS,
      fadeMs: FAREWELL_FADE_MS,
      fadeColor: FAREWELL_FADE_COLOR,
      fadeRect: FAREWELL_FADE_RECT,
    },
    // ── 8. Final castle scene – cross-fades to castle.jpg and starts the outro
    //        music ("Guinever (Aquarium 1981)"), holds for 15 s ──
    {
      type: 'castleScene',
      image: images.castle,
      crossfadeMs: CASTLE_CROSSFADE_MS,
      holdMs: CASTLE_HOLD_MS,
      snapshotOnComplete: true,
    },
    // ── 9. End credits – typed over the duke-on-horse, duke & princess and
    //        princess-on-balcony backgrounds, then the copyright notice ──
    {
      type: 'creditsScene',
      horseImage: images.dukeHorse,
      princessImage: images.dukePrincess,
      balconyImage: images.princessBalcony,
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
// Raw script data from enddemo.asm (unk_6AA8 after the Spirit arrival scene)
// ─────────────────────────────────────────────────────────────────────────────
const DUKE_SPIRIT_SCRIPT = [
  // Spirit speaks (direct speech), row 1
  0xFB, 0xF3, 0xEC,
  // '"You fought bravely to accomplish this quest.  '
  // (0x80-0x85 are Spirit lip articulation codes)
  0x22, 0x83, 0x59, 0x6F, 0x75, 0x20, 0x81, 0x66, 0x6F, 0x75, 0x82,
  0x67, 0x68, 0x74, 0x20, 0x83, 0x62, 0x81, 0x72, 0x61, 0x83, 0x76, 0x65,
  0x82, 0x6C, 0x79, 0x20, 0x83, 0x74, 0x6F, 0x20, 0x80, 0x61, 0x83, 0x63,
  0x63, 0x6F, 0x84, 0x6D, 0x82, 0x70, 0x6C, 0x69, 0x83, 0x73, 0x68, 0x20,
  0x82, 0x74, 0x68, 0x69, 0x83, 0x73, 0x20, 0x83, 0x71, 0x75, 0x81, 0x65,
  0x83, 0x73, 0x74, 0x2E, 0x20, 0x20,
  0xF5,
  // 'But this was only the beginning.  '
  0x80, 0x42, 0x75, 0x83, 0x74, 0x20, 0x82, 0x74, 0x68, 0x69, 0x83, 0x73,
  0x20, 0x80, 0x77, 0x61, 0x83, 0x73, 0x20, 0x6F, 0x84, 0x6E, 0x82, 0x6C,
  0x79, 0x20, 0x81, 0x74, 0x68, 0x65, 0x20, 0x82, 0x62, 0x65, 0x67, 0x69,
  0x6E, 0x84, 0x6E, 0x69, 0x6E, 0x83, 0x67, 0x2E, 0x20, 0x20, 0x84,
  0xF5,
  // 'Your next mission awaits you in a new land."'
  0x83, 0x59, 0x6F, 0x75, 0x80, 0x72, 0x20, 0x81, 0x6E, 0x65, 0x83, 0x78,
  0x74, 0x20, 0x82, 0x6D, 0x69, 0x83, 0x73, 0x73, 0x69, 0x82, 0x6F, 0x84,
  0x6E, 0x20, 0x80, 0x61, 0x77, 0x61, 0x82, 0x69, 0x83, 0x74, 0x73, 0x20,
  0x83, 0x79, 0x6F, 0x75, 0x20, 0x82, 0x69, 0x84, 0x6E, 0x20, 0x80, 0x61,
  0x20, 0x82, 0x6E, 0x65, 0x83, 0x77, 0x20, 0x80, 0x6C, 0x61, 0x84, 0x6E,
  0x64, 0x2E, 0x22,
  0xF5, 0xF5, 0xF5, 0xFE,
  // Duke speaks (direct speech), row 0
  0xF7, 0xEF,
  // '"My next mission?"'
  0x22, 0x90, 0x4D, 0x92, 0x79, 0x20, 0x91, 0x6E, 0x65, 0x93, 0x78, 0x74,
  0x20, 0x92, 0x6D, 0x69, 0x93, 0x73, 0x73, 0x69, 0x6F, 0x94, 0x6E, 0x3F,
  0x22,
  // Duke eye animation (half-closed, closed, half-closed, open)
  0x97, 0x20, 0x98, 0x20, 0x97, 0x20, 0x96,
  0xF5,
  // Spirit speaks (direct speech), row 1
  0xF3, 0xEC,
  // '"There are many who have needed your special talents.  '
  0x22, 0x81, 0x54, 0x68, 0x65, 0x80, 0x72, 0x65, 0x20, 0x80, 0x61, 0x72,
  0x65, 0x20, 0x81, 0x6D, 0x61, 0x84, 0x6E, 0x79, 0x20, 0x83, 0x77, 0x68,
  0x6F, 0x20, 0x81, 0x68, 0x61, 0x83, 0x76, 0x65, 0x20, 0x82, 0x6E, 0x65,
  0x65, 0x83, 0x64, 0x20, 0x6F, 0x66, 0x84, 0x20, 0x83, 0x79, 0x6F, 0x80,
  0x75, 0x72, 0x20, 0x83, 0x73, 0x81, 0x70, 0x65, 0x82, 0x63, 0x69, 0x80,
  0x61, 0x83, 0x6C, 0x20, 0x80, 0x74, 0x61, 0x81, 0x6C, 0x65, 0x84, 0x6E,
  0x74, 0x73, 0x2E, 0x20, 0x20, 0x84,
  0xF5,
  // 'Follow me and I will show you the way.  '
  0x83, 0x46, 0x6F, 0x6C, 0x6C, 0x6F, 0x77, 0x20, 0x82, 0x6D, 0x65, 0x20,
  0x80, 0x61, 0x84, 0x6E, 0x64, 0x20, 0x80, 0x49, 0x20, 0x83, 0x77, 0x82,
  0x69, 0x6C, 0x6C, 0x20, 0x83, 0x73, 0x68, 0x6F, 0x77, 0x81, 0x20, 0x85,
  0x79, 0x6F, 0x75, 0x20, 0x81, 0x74, 0x68, 0x65, 0x20, 0x83, 0x77, 0x80,
  0x61, 0x82, 0x79, 0x2E, 0x84, 0x20, 0x20,
  0xF5,
  // 'We must depart quickly."'
  0x83, 0x57, 0x82, 0x65, 0x20, 0x80, 0x6D, 0x75, 0x83, 0x73, 0x74, 0x20,
  0x81, 0x64, 0x65, 0x80, 0x70, 0x61, 0x72, 0x83, 0x74, 0x20, 0x85, 0x71,
  0x75, 0x82, 0x69, 0x63, 0x83, 0x6B, 0x82, 0x6C, 0x79, 0x2E, 0x22, 0x84,
  0xF5, 0xF5, 0xF5, 0xFE,
  // Narrator (normal attribute), row 1
  0xF0, 0xF3, 0xFA,
// 'There was no time to rest, and no time to stay in this peaceful land.'
   // (0x97/0x98 animate the Duke's eyes mid-line)
   0x54, 0x68, 0x65, 0x72, 0x65, 0x20, 0x77, 0x61, 0x73, 0x20, 0x6E, 0x6F,
   0x20, 0x74, 0x69, 0x6D, 0x65, 0x20, 0x74, 0x6F, 0x20, 0x72, 0x65, 0x73,
   0x74, 0x2C, 0x20,
   0x97, 0x61, 0x6E, 0x98,
   0x64, 0x20, 0x6E, 0x6F, 0x20, 0x74, 0x69, 0x6D, 0x65, 0x20, 0x74, 0x6F,
   0x20, 0x73, 0x74, 0x61, 0x79, 0x20, 0x69, 0x6E, 0x20, 0x74, 0x68, 0x69,
   0x73, 0x20, 0x70, 0x65, 0x61, 0x63, 0x65, 0x66, 0x75, 0x6C, 0x20, 0x6C,
   0x61, 0x6E, 0x64, 0x2E,
   0xF5, 0xF5, 0xF5, 0xFD,
];

// ─────────────────────────────────────────────────────────────────────────────
// Raw script data from enddemo.asm (unk_6AA8 after the Duke & Spirit scene)
// ─────────────────────────────────────────────────────────────────────────────
const PRINCESS1_SCRIPT = [
  // Princess Felicia speaks (direct speech), row 1.  She has replaced the Spirit
  // on the right.  (0x90-0x98 are Duke lip/eye codes; 0xB0-0xB8 are the new
  // princess lip/eye articulation codes.)
  0xFE,
  0xF3, 0xFB, 0xEB,
  // '"Must you leave so soon, Duke Garland?  '
  0x97, 0x22, 0x96, 0xB0, 0x4D, 0x75, 0xB3, 0x73, 0xB4, 0x74, 0x20, 0x79,
  0x6F, 0x75, 0x20, 0xB2, 0x6C, 0x65, 0xB1, 0x61, 0xB3, 0x76, 0x65, 0xB4,
  0x20, 0xB3, 0x73, 0x6F, 0x20, 0xB5, 0x73, 0x6F, 0x6F, 0xB4, 0x6E, 0x2C,
  0x20, 0xB7, 0xB3, 0x44, 0xB8, 0x75, 0xB1, 0xB7, 0x6B, 0xB6, 0x65, 0x20,
  0xB0, 0x47, 0x61, 0x72, 0x6C, 0x61, 0xB4, 0x6E, 0x64, 0x3F, 0x20, 0x20,
  0xF5,
  // 'I was hoping..."' (row 2)
  0xF2, 0xB7, 0xB0, 0x49, 0xB8, 0x20, 0xB7, 0xB5, 0x77, 0xB6, 0xB0, 0x61,
  0x73, 0x20, 0xB3, 0x68, 0x6F, 0x70, 0xB2, 0x69, 0xB4, 0x6E, 0xB3, 0x67,
  0x2E, 0x2E, 0x2E, 0xB4, 0x22,
  0xF5, 0xF5, 0xF5, 0xFE,
  // Duke speaks (direct speech), row 0
  0xF7, 0xEF,
  // '"Princess Felicia, I must bid you farewell.  '
  0x22, 0x95, 0x50, 0x72, 0x92, 0x69, 0x94, 0x6E, 0x91, 0x63, 0x65, 0x93,
  0x73, 0x73, 0x20, 0x91, 0x46, 0x65, 0x92, 0x6C, 0x69, 0x63, 0x69, 0x90,
  0x61, 0x2C, 0x20, 0x97, 0x90, 0x49, 0x98, 0x92, 0x20, 0x97, 0x90, 0x6D,
  0x96, 0x75, 0x93, 0x73, 0x74, 0x20, 0x92, 0x62, 0x69, 0x93, 0x64, 0x20,
  0x93, 0x79, 0x6F, 0x75, 0x20, 0x91, 0x66, 0x61, 0x90, 0x72, 0x65, 0x91,
  0x77, 0x65, 0x93, 0x6C, 0x6C, 0x2E, 0x94, 0x20, 0x20,
  0xF5,
  // 'Morning is coming soon, and I will miss the light of Spirit unless I
  //  start before the dawn."'
  0x93, 0x4D, 0x6F, 0x72, 0x94, 0x6E, 0x69, 0x6E, 0x95, 0x67, 0x20, 0x92,
  0x69, 0x95, 0x73, 0x20, 0x90, 0x63, 0x6F, 0x6D, 0x92, 0x69, 0x94, 0x6E,
  0x67, 0x20, 0x93, 0x73, 0x6F, 0x6F, 0x94, 0x6E, 0x2C, 0x20, 0x90, 0x61,
  0x94, 0x6E, 0x64, 0x20, 0x90, 0x49, 0x92, 0x20, 0x97, 0x92, 0x77, 0x98,
  0x69, 0x93, 0x97, 0x6C, 0x96, 0x6C, 0x20, 0x92, 0x6D, 0x69, 0x93, 0x73,
  0x73, 0x20, 0x91, 0x74, 0x68, 0x65, 0x20, 0x90, 0x6C, 0x91, 0x69, 0x67,
  0x93, 0x68, 0x74, 0x20, 0x6F, 0x95, 0x66, 0x20, 0x93, 0x53, 0x92, 0x70,
  0x69, 0x72, 0x69, 0x93, 0x74, 0x20, 0x75, 0x94, 0x6E, 0x91, 0x6C, 0x65,
  0x93, 0x73, 0x73, 0x20, 0x90, 0x49, 0x92, 0x20, 0x73, 0x90, 0x74, 0x61,
  0x72, 0x94, 0x74, 0x20, 0x91, 0x62, 0x65, 0x93, 0x66, 0x6F, 0x90, 0x72,
  0x65, 0x20, 0x91, 0x74, 0x68, 0x65, 0x20, 0x90, 0x64, 0x61, 0x94, 0x77,
  0x6E, 0x2E, 0x22,
  0xF5, 0xF5, 0xF5, 0xFE,
  // Narrator (normal attribute), row 1
  0xF0, 0xF3, 0xFA,
  // 'The Duke answered quickly, as if to head off the next words of Princess
  //  Felicia.'
  0x54, 0x68, 0x65, 0x20, 0x44, 0x75, 0x6B, 0x65, 0x20, 0x61, 0x6E, 0x73,
  0x77, 0x65, 0x72, 0x65, 0x64, 0x20, 0x71, 0x75, 0x69, 0x63, 0x6B, 0x6C,
  0x79, 0x2C, 0x20, 0x61, 0x73, 0x20, 0x69, 0x66, 0x20, 0x74, 0x6F, 0x20,
  0x68, 0x65, 0x61, 0x64, 0x20, 0x6F, 0x66, 0x66, 0x20, 0x74, 0x68, 0x65,
  0x20, 0x6E, 0x65, 0x78, 0x74, 0x20, 0x77, 0x6F, 0x72, 0x64, 0x73, 0x20,
  0x6F, 0x66, 0x20, 0x50, 0x72, 0x69, 0x6E, 0x63, 0x65, 0x73, 0x73, 0x20,
  0x46, 0x65, 0x6C, 0x69, 0x63, 0x69, 0x61, 0x2E,
  0xF5, 0xF5, 0xF5, 0xFD,
];

// ─────────────────────────────────────────────────────────────────────────────
// Raw script data from enddemo.asm (unk_6AA8 after the farewell scene cross-fade)
//
// Part 1: narrator watches the Duke walk away, then Princess Felicia calls out
//         ("Don't go, Duke Garland!"), and the narrator closes with
//         "... and did not look back."
// Part 2: the Duke leaves the castle and the Princess waits for his return
// ─────────────────────────────────────────────────────────────────────────────
const FAREWELL_SCRIPT_PART1 = [
  // Narrator (normal attribute), row 1 – the Duke walks away
  0xFE, 0xF3, 0xFA,
  // 'For if he heard those words, he might not be able to leave, as he knew he
  //  must.  '
  0x46, 0x6F, 0x72, 0x20, 0x69, 0x66, 0x20, 0x68, 0x65, 0x20, 0x68, 0x65,
  0x61, 0x72, 0x64, 0x20, 0x74, 0x68, 0x6F, 0x73, 0x65, 0x20, 0x77, 0x6F,
  0x72, 0x64, 0x73, 0x2C, 0x20, 0x68, 0x65, 0x20, 0x6D, 0x69, 0x67, 0x68,
  0x74, 0x20, 0x6E, 0x6F, 0x74, 0x20, 0x62, 0x65, 0x20, 0x61, 0x62, 0x6C,
  0x65, 0x20, 0x74, 0x6F, 0x20, 0x6C, 0x65, 0x61, 0x76, 0x65, 0x2C, 0x20,
  0x61, 0x73, 0x20, 0x68, 0x65, 0x20, 0x6B, 0x6E, 0x65, 0x77, 0x20, 0x68,
  0x65, 0x20, 0x6D, 0x75, 0x73, 0x74, 0x2E, 0x20, 0x20,
  0xF5,
  // 'He turned and walked away...'
  0x48, 0x65, 0x20, 0x74, 0x75, 0x72, 0x6E, 0x65, 0x64, 0x20, 0x61, 0x6E,
  0x64, 0x20, 0x77, 0x61, 0x6C, 0x6B, 0x65, 0x64, 0x20, 0x61, 0x77, 0x61,
  0x79, 0x2E, 0x2E, 0x2E,
  0xF5, 0xF5, 0xF5, 0xFE,
  // Princess Felicia speaks (direct speech, blue shadow), row 0.
  // (0xC0/0xC1 are the farewell Princess lip articulation codes.)
  0xF7, 0xFB, 0xEB,
  // '"Don't go, Duke Garland!"'
  0x22,
  0xC0, 0x44, 0x6F,
  0xC1, 0x6E, 0x27, 0x74, 0x20,
  0xC0, 0x67, 0x6F, 0x2C, 0x20,
  0xC1, 0x44, 0x75,
  0xC0, 0x6B, 0x65, 0x20,
  0xC0, 0x47, 0x61, 0x72,
  0xC1, 0x6C, 0x61, 0x6E,
  0xC0, 0x64, 0x21,
  0x22,
  0xF5, 0xF0, 0xF3, 0xFA,
  // Narrator (normal attribute), row 1
  // '... and did not look back.'
  0x2E, 0x2E, 0x2E, 0x20, 0x61, 0x6E, 0x64, 0x20, 0x64, 0x69, 0x64, 0x20,
  0x6E, 0x6F, 0x74, 0x20, 0x6C, 0x6F, 0x6F, 0x6B, 0x20, 0x62, 0x61, 0x63,
  0x6B, 0x2E,
  0xF5,
];

// Part 2 – after the left part of the scene fades out
const FAREWELL_SCRIPT_PART2 = [
  // Narrator (normal attribute), row 2
  0xF2,
  // 'Duke Garland left the castle, and he felt as if his heart might break.'
  0x44, 0x75, 0x6B, 0x65, 0x20, 0x47, 0x61, 0x72, 0x6C, 0x61, 0x6E, 0x64,
  0x20, 0x6C, 0x65, 0x66, 0x74, 0x20, 0x74, 0x68, 0x65, 0x20, 0x63, 0x61,
  0x73, 0x74, 0x6C, 0x65, 0x2C, 0x20, 0x61, 0x6E, 0x64, 0x20, 0x68, 0x65,
  0x20, 0x66, 0x65, 0x6C, 0x74, 0x20, 0x61, 0x73, 0x20, 0x69, 0x66, 0x20,
  0x68, 0x69, 0x73, 0x20, 0x68, 0x65, 0x61, 0x72, 0x74, 0x20, 0x6D, 0x69,
  0x67, 0x68, 0x74, 0x20, 0x62, 0x72, 0x65, 0x61, 0x6B, 0x2E,
  0xF5, 0xF5, 0xF5, 0xFE, 0xF7,
  // Narrator, row 0
  // 'As she watched him go, Princess Felicia said to herself, '
  0x41, 0x73, 0x20, 0x73, 0x68, 0x65, 0x20, 0x77, 0x61, 0x74, 0x63, 0x68,
  0x65, 0x64, 0x20, 0x68, 0x69, 0x6D, 0x20, 0x67, 0x6F, 0x2C, 0x20, 0x50,
  0x72, 0x69, 0x6E, 0x63, 0x65, 0x73, 0x73, 0x20, 0x46, 0x65, 0x6C, 0x69,
  0x63, 0x69, 0x61, 0x20, 0x73, 0x61, 0x69, 0x64, 0x20, 0x74, 0x6F, 0x20,
  0x68, 0x65, 0x72, 0x73, 0x65, 0x6C, 0x66, 0x2C, 0x20,
  0xF5, 0xF2, 0xFB,
  // Princess Felicia (direct speech), row 2
  // '"He will return.  '
  0x22, 0x48, 0x65, 0x20, 0x77, 0x69, 0x6C, 0x6C, 0x20, 0x72, 0x65, 0x74,
  0x75, 0x72, 0x6E, 0x2E, 0x20, 0x20,
  0xF5,
  // 'The road to his destiny, began here, and it shall end here."'
  0x54, 0x68, 0x65, 0x20, 0x72, 0x6F, 0x61, 0x64, 0x20, 0x74, 0x6F, 0x20,
  0x68, 0x69, 0x73, 0x20, 0x64, 0x65, 0x73, 0x74, 0x69, 0x6E, 0x79, 0x2C,
  0x20, 0x62, 0x65, 0x67, 0x61, 0x6E, 0x20, 0x68, 0x65, 0x72, 0x65, 0x2C,
  0x20, 0x61, 0x6E, 0x64, 0x20, 0x69, 0x74, 0x20, 0x73, 0x68, 0x61, 0x6C,
  0x6C, 0x20, 0x65, 0x6E, 0x64, 0x20, 0x68, 0x65, 0x72, 0x65, 0x2E, 0x22,
  0xF5, 0xF5, 0xF5, 0xFE, 0xF3,
  // Princess Felicia (direct speech persists), row 1
  // '"When his work in the world is done, he'll come back to me.  '
  0x22, 0x57, 0x68, 0x65, 0x6E, 0x20, 0x68, 0x69, 0x73, 0x20, 0x77, 0x6F,
  0x72, 0x6B, 0x20, 0x69, 0x6E, 0x20, 0x74, 0x68, 0x65, 0x20, 0x77, 0x6F,
  0x72, 0x6C, 0x64, 0x20, 0x69, 0x73, 0x20, 0x64, 0x6F, 0x6E, 0x65, 0x2C,
  0x20, 0x68, 0x65, 0x27, 0x6C, 0x6C, 0x20, 0x63, 0x6F, 0x6D, 0x65, 0x20,
  0x62, 0x61, 0x63, 0x6B, 0x20, 0x74, 0x6F, 0x20, 0x6D, 0x65, 0x2E, 0x20,
  0x20,
  0xF5,
  // 'Until then, I can only believe it, and wait for him."'
  0x55, 0x6E, 0x74, 0x69, 0x6C, 0x20, 0x74, 0x68, 0x65, 0x6E, 0x2C, 0x20,
  0x49, 0x20, 0x63, 0x61, 0x6E, 0x20, 0x6F, 0x6E, 0x6C, 0x79, 0x20, 0x62,
  0x65, 0x6C, 0x69, 0x65, 0x76, 0x65, 0x20, 0x69, 0x74, 0x2C, 0x20, 0x61,
  0x6E, 0x64, 0x20, 0x77, 0x61, 0x69, 0x74, 0x20, 0x66, 0x6F, 0x72, 0x20,
  0x68, 0x69, 0x6D, 0x2E, 0x22,
  0xF5, 0xF5, 0xF5, 0xF5, 0xF5,
];

// ─────────────────────────────────────────────────────────────────────────────
// End credits screens
//
// Decoded from the credits script in asm/enddemo.asm (sub_66CD, from "STAFF"
// up to the copyright notice).  Each screen is one "page" typed inside the
// credits box; a row is either a plain string (centered) or { left, right }
// (two columns, e.g. dungeon names vs boss names).  `hold` is the pause after
// the screen finishes typing before the next screen appears.
// ─────────────────────────────────────────────────────────────────────────────
const CREDITS_STAFF_SCREENS = [
  { rows: ['STAFF'], hold: CREDITS_SCREEN_HOLD_MS },
  { rows: ['PRODUCER - JAPANESE VERSION', 'Mitsuhiro Mazda'], hold: CREDITS_SCREEN_HOLD_MS },
  { rows: ['PRODUCER - ENGLISH VERSION', 'Josh Mandel'], hold: CREDITS_SCREEN_HOLD_MS },
  { rows: ['LEAD PROGRAMMER', 'Tomoyuki Shimada'], hold: CREDITS_SCREEN_HOLD_MS },
  { rows: ['GRAPHIC DESIGNERS', 'Akihiko Yoshida', 'Masatoshi Azumi'], hold: CREDITS_SCREEN_HOLD_MS },
  { rows: ['ENGLISH TEXT TRANSLATION', 'Marti McKenna'], hold: CREDITS_SCREEN_HOLD_MS },
  {
    rows: ['MUSIC COMPOSERS', '-- MECANO ASSOCIATES --', 'Fumihito Kasatani', 'Nobuyuki Aoshima'],
    hold: CREDITS_SCREEN_HOLD_MS,
  },
  { rows: ['STORY MAKER', 'Masaru Takeuchi'], hold: CREDITS_SCREEN_HOLD_MS },
  { rows: ['SOUND EFFECTS', 'Tomoyuki Shimada'], hold: 0 },
];

const CREDITS_THANKS_SCREENS = [
  { rows: ['SPECIAL THANKS'], hold: CREDITS_THANKS_HOLD_MS },
  {
    rows: [
      { left: 'Toshiyuki Uchida', right: 'Yuzo Sunaga' },
      { left: 'Takeshi Miyaji',   right: 'Naozumi Honma' },
      { left: 'Ray E. Nakazato',  right: 'Toshi Masubuchi' },
    ],
    hold: CREDITS_THANKS_HOLD_MS,
  },
  {
    rows: [
      { left: 'Hiroyuki Koyama', right: 'Satoshi Uesaka' },
      '-- Sierra On-Line Japan, Inc. --',
      'Eiji (Ed) Nagano',
    ],
    hold: CREDITS_THANKS_HOLD_MS,
  },
  {
    rows: ['ADVISERS', 'Osamu Harada', 'Hiromi Ohba', 'Greg Miyaji'],
    hold: CREDITS_THANKS_HOLD_MS,
  },
  { rows: ['SYSTEM DESIGNER', 'Rocky Cave Maker'], hold: CREDITS_THANKS_HOLD_MS },
  { rows: ['SERVING MONSTERS'], hold: CREDITS_MONSTERS_HOLD_MS },
  {
    rows: [
      { left: 'Cavern of Maricia', right: 'CANGREJO' },
      { left: 'Peligro',           right: 'PULPO' },
      { left: 'Riza',              right: 'POLLO' },
    ],
    hold: CREDITS_MONSTERS_HOLD_MS,
  },
  {
    rows: [
      { left: 'Cavern of Glacial', right: 'AGER' },
      { left: 'Cementar',          right: 'VISTA' },
      { left: 'Tesoro',            right: 'TARSO' },
    ],
    hold: CREDITS_MONSTERS_HOLD_MS,
  },
  {
    rows: [
      { left: 'Llama Town',         right: 'PAGURO' },
      { left: 'Cavern of Caliente', right: 'DRAGON' },
      { left: 'Absor',              right: 'ALGUIEN' },
    ],
    hold: 0,
  },
];

const CREDITS_COPYRIGHT_SCREENS = [
  {
    rows: [
      'Copyright (C)1987,1990 GAME ARTS',
      'Copyright (C)1990 Sierra On-Line',
      'This edition first published 1987 by',
      'GAME ARTS Co.,Ltd./ Tomoyuki Shimada',
    ],
    hold: 0,
  },
];

const PORT_CREDITS = "Web port ©2026 {brox//THIRTEEN} •••••••••••••••• Reverse engineering: {brox} •••••••••••••••• Graphics: {brox} •••••••••••••••• Code: {brox + free LLMs (Qwen 3.6, DeepSeek V4 Flash, GPT 5.5)} •••••••••••••••• QA: {Gene} •••••••••••••••• Non-free LLM provided by: {Gene} •••••••••••••••• End Credits music: 'Guinever' ©1981 {Aquarium}";

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
//   0x80-0x85   Spirit lip articulation codes
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
  let face = { 
    duke: { eyes: 0, lips: 0 }, 
    princess: { eyes: 0, lips: 3 }, 
    spirit: { lips: 0 }, 
    princess1: { eyes: 0, lips: 0 },
    princess2: { eyes: 0, lips: 0 },
  };

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
    } else if (b >= 0x80 && b <= 0x85) {
      // Spirit lips: 0x80-0x85 (six articulation frames)
      const index = b - 0x80;
      face.spirit.lips = index;
      faceChanges.push({ at: pendingText.length, speaker: 'spirit', part: 'lips', index: index });
    } else if (b >= 0xB0 && b <= 0xB8) {
      // Princess1 eyes/lips: 0xB0-0xB5 lips, 0xB6-0xB8 eyes
      const rel = b - 0xB0;
      const part = rel < 6 ? 'lips' : 'eyes';
      const index = rel < 6 ? rel : rel - 6;
      face.princess1[part] = index;
      faceChanges.push({ at: pendingText.length, speaker: 'princess1', part: part, index: index });
    } else if (b >= 0xC0 && b <= 0xC1) {
      // Farewell Princess lips
      const index = b - 0xC0;
      const part = 'lips';
      face.princess2[part] = index;
      faceChanges.push({ at: pendingText.length, speaker: 'princess2', part: part, index: index });
    } else {
      // Normal printable character (ASCII)
      pendingText += String.fromCharCode(b);
    }
  }
  flushText();
  return commands;
}
export class EndingDemo {
  constructor({ screen, canvas, onComplete, soundManager }) {
    this.screen     = screen;
    this.canvas     = canvas; // 640x400
    this.ctx        = canvas.getContext('2d');
    this.onComplete = onComplete;
    this.soundManager = soundManager;   // shared SoundManager from game.js (may be undefined in tests)

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

    // The demo takes over from a location where the standard theme is still
    // playing (dimmed).  Silence it here; only the final castle scene starts
    // the outro track.
    this.soundManager?.stopMusic(0);

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
      spiritBase,
      princess1Base,
      farewell,
      castle,
      dukeHorse,
      dukePrincess,
      princessBalcony,
    ] = await Promise.all([
      loadImage(INTRO_PRINCESS_FULL_SRC),
      loadImage(PRINCESS_SRC_BASE),
      loadImage(DUKE_SRC_BASE),
      loadImage(INTRO_TEMPLATE2_SRC),
      loadImage(INTRO_SPIRIT_SRC),
      loadImage(KING_PRINCESS_SRC),
      loadImage(SPIRIT_SRC_BASE),
      loadImage(PRINCESS1_SRC_BASE),
      loadImage(FAREWELL_SRC_BASE),
      loadImage(CASTLE_SRC_BASE),
      loadImage(DUKE_HORSE_SRC),
      loadImage(DUKE_PRINCESS_SRC),
      loadImage(PRINCESS_BALCONY_SRC),
      loadStoryFont(),
    ]);

    // Load overlay images (lips & eyes) for Duke, Princess and Spirit
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
    for (let i = 0; i < 6; i++) {
      lipEyePromises.push(loadImage(`${SPIRIT_LIPS_SRC_BASE}${i}.png`));
    }
    for (let i = 0; i < 6; i++) {
      lipEyePromises.push(loadImage(`${PRINCESS1_LIPS_SRC_BASE}${i}.png`));
    }
    for (let i = 0; i < 3; i++) {
      lipEyePromises.push(loadImage(`${PRINCESS1_EYES_SRC_BASE}${i}.png`));
    }
    for (let i = 0; i < 2; i++) {
      lipEyePromises.push(loadImage(`${PRINCESS2_LIPS_SRC_BASE}${i}.png`));
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
    for (let i = 0; i < 6; i++) {
      names.push(`spirit_lips${i}`);
    }
    for (let i = 0; i < 6; i++) {
      names.push(`princess1_lips${i}`);
    }
    for (let i = 0; i < 3; i++) {
      names.push(`princess1_eyes${i}`);
    }
    for (let i = 0; i < 2; i++) {
      names.push(`princess2_lips${i}`);
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
      spiritBase,
      princess1Base,
      farewell,
      castle,
      dukeHorse,
      dukePrincess,
      princessBalcony,
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

    if (step.type === 'dukeSpiritScene') {
      const entryImage = this.snapshotForNext;
      this.snapshotForNext = null;
      return {
        ...base,
        entryImage: entryImage,
      };
    }

    if (step.type === 'princess1Scene') {
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

    if (step.type === 'farewellScene') {
      const entryImage = this.snapshotForNext;
      this.snapshotForNext = null;
      return {
        ...base,
        entryImage: entryImage,
        phase: 'crossfade',   // crossfade → dialogue1 → fade → dialogue2
        fadeStartTime: 0,
      };
    }

    if (step.type === 'castleScene') {
      const entryImage = this.snapshotForNext;
      this.snapshotForNext = null;
      return {
        ...base,
        entryImage: entryImage,
        phase: 'crossfade',   // crossfade → hold
        holdStartTime: 0,
      };
    }

    if (step.type === 'creditsScene') {
      const entryImage = this.snapshotForNext;
      this.snapshotForNext = null;
      return {
        ...base,
        entryImage: entryImage,
        phase: 'horseFade',
        phaseStart: 0,
        screens: [],
        screenIndex: 0,
        rowIndex: 0,
        charCount: 0,
        lineStartTime: 0,
        screenTypedAt: 0,
        scroll: 0,          // port-credits scroller offset (px)
        scrollTs: 0,        // last tick timestamp for the scroller
        portLayout: null,   // cached PORT_CREDITS measurement
        endScroll: 0,       // scroll offset at which the text fully crosses x=10
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
      case 'dukeSpiritScene':       return this._drawDukeSpiritScene(step, s, ts);
      case 'princess1Scene':        return this._drawPrincess1Scene(step, s, ts);
      case 'farewellScene':         return this._drawFarewellScene(step, s, ts);
      case 'castleScene':           return this._drawCastleScene(step, s, ts);
      case 'creditsScene':          return this._drawCreditsScene(step, s, ts);
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
    s.face = {
      duke: { ...DUKE_FACE_DEFAULT },
      princess: { ...PRINCESS_FACE_DEFAULT },
      spirit: { ...SPIRIT_FACE_DEFAULT },
      princess1: { ...PRINCESS1_FACE_DEFAULT },
      princess2: { ...PRINCESS2_FACE_DEFAULT },
    };
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

  // ── Duke & Spirit dialogue scene ─────────────────────────────────────────
  // Reveals template2 (fade in) over the closed curtain from the Spirit
  // arrival scene, then plays the Duke/Spirit dialogue. Duke (left) uses the
  // same base + lip/eye overlays as the princess dialogue; Spirit (right) only
  // animates its lips.
  _drawDukeSpiritScene(step, s, ts) {
    const elapsed = ts - s.startTime;

    // Snapshot the incoming (curtain-closed) frame so template2 can reveal over it
    if (!s.entryImage) {
      s.entryImage = this._makeOffscreen();
      s.entryImage.getContext('2d').drawImage(this.canvas, 0, 0);
    }

    const fadeInMs = step.fadeInMs ?? TEMPLATE2_FADE_IN_MS;
    const progress = Math.min(elapsed / fadeInMs, 1);

    this._clearBlack();

    if (progress < 1 && s.entryImage) {
      this.ctx.save();
      this.ctx.globalAlpha = 1 - progress;
      this.ctx.drawImage(s.entryImage, 0, 0);
      this.ctx.restore();
    }

    if (progress > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = progress;
      if (step.background) {
        this.ctx.drawImage(step.background, 0, 0, this.canvas.width, this.canvas.height);
      }
      this.ctx.drawImage(this.images.dukeBase, DUKE_POS.x, DUKE_POS.y, DUKE_POS.w, DUKE_POS.h);
      this.ctx.drawImage(this.images.spiritBase, SPIRIT_POS.x, SPIRIT_POS.y, SPIRIT_POS.w, SPIRIT_POS.h);
      this.ctx.restore();
    }

    if (progress >= 1) {
      if (!s.commands) this._initDialogueState(s, DUKE_SPIRIT_SCRIPT);
      this._processDialogueCommands(s, ts);

      // Face overlays – Duke (eyes + lips) and Spirit (lips only)
      this.ctx.drawImage(this.images.dukeBase, DUKE_POS.x, DUKE_POS.y, DUKE_POS.w, DUKE_POS.h);
      this.ctx.drawImage(this.images.spiritBase, SPIRIT_POS.x, SPIRIT_POS.y, SPIRIT_POS.w, SPIRIT_POS.h);
      for (const speaker of ['duke', 'spirit']) {
        const basePos = speaker === 'duke' ? DUKE_POS : SPIRIT_POS;
        const layout = FACE_LAYOUT[speaker];
        const face = s.face[speaker];
        for (const part of ['eyes', 'lips']) {
          const off = layout[part];
          if (!off) continue; // spirit has no eyes overlay
          const img = this.images[`${speaker}_${part}${face[part]}`];
          if (!img) continue;
          this.ctx.drawImage(img, basePos.x + off.x, basePos.y + off.y, off.w, off.h);
        }
      }

      this._drawDialogueTextBox(s);

      // Only advance once the script is fully consumed AND the last line is
      // done typing/holding (cmdIndex reaches the end as soon as the final
      // text command is pushed to pageLines, before it is even typed).
      if (s.cmdIndex >= s.commands.length && s.typingLine >= s.pageLines.length) {
        this._nextStep();
      }
    }
  }

  // ── Princess Felicia (princess1) scene ────────────────────────────────────
  // Cross-fades from the Duke & Spirit scene into the new princess image on the
  // right (Duke stays put, Spirit becomes Princess Felicia), plays the farewell
  // dialogue, then closes a dark-blue curtain over the scene.
  _drawPrincess1Scene(step, s, ts) {
    const elapsed = ts - s.startTime;

    // Snapshot the incoming (Duke & Spirit) frame so the new scene can
    // cross-fade over it.
    if (!s.entryImage) {
      s.entryImage = this._makeOffscreen();
      s.entryImage.getContext('2d').drawImage(this.canvas, 0, 0);
    }

    // Initialise the dialogue state up front so the cross-fade can draw the
    // (empty) dialogue box over the scene.
    if (!s.commands) this._initDialogueState(s, PRINCESS1_SCRIPT);

    const crossfadeMs = step.crossfadeMs ?? SPIRIT_CROSSFADE_MS;

    // Phase 1: cross-fade Spirit → Princess Felicia (whole-frame cross-fade;
    // only the right-hand character actually changes).
    if (!s.crossfadeDone) {
      const progress = Math.min(elapsed / crossfadeMs, 1);
      this._clearBlack();

      if (progress < 1 && s.entryImage) {
        this.ctx.save();
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.drawImage(s.entryImage, 0, 0);
        this.ctx.restore();
      }

      if (progress > 0) {
        this.ctx.save();
        this.ctx.globalAlpha = progress;
        this._drawPrincess1Base(step);
        this._drawDialogueTextBox(s);
        this.ctx.restore();
      }

      if (progress >= 1) s.crossfadeDone = true;
      return;
    }

    // Phase 2: princess1 image + typewriter dialogue
    this._clearBlack();
    this._drawPrincess1Base(step);

    this._processDialogueCommands(s, ts);

    // Face overlays – Duke (eyes + lips) and Princess1 (eyes + lips)
    for (const speaker of ['duke', 'princess1']) {
      const basePos = speaker === 'duke' ? DUKE_POS : PRINCESS1_POS;
      const layout = FACE_LAYOUT[speaker];
      const face = s.face[speaker];
      for (const part of ['eyes', 'lips']) {
        const off = layout[part];
        if (!off) continue;
        const img = this.images[`${speaker}_${part}${face[part]}`];
        if (!img) continue;
        this.ctx.drawImage(img, basePos.x + off.x, basePos.y + off.y, off.w, off.h);
      }
    }

    this._drawDialogueTextBox(s);

    // Phase 3: when the dialogue is done, a dark-blue curtain closes over the
    // scene to clear it.
    if (s.cmdIndex >= s.commands.length && s.typingLine >= s.pageLines.length) {
      if (!s.curtainSnapshot) {
        s.curtainSnapshot = this._makeOffscreen();
        s.curtainSnapshot.getContext('2d').drawImage(this.canvas, 0, 0);
        s.curtainStartTime = ts;
      }
      const curtainProgress = Math.min((ts - s.curtainStartTime) / step.curtainMs, 1);
      this._clearBlack();
      this.ctx.drawImage(s.curtainSnapshot, 0, 0);
      this._drawCurtainRect(curtainProgress, s.curtainSnapshot, {
        x: CURTAIN_X1, y: CURTAIN_Y1, w: CURTAIN_X2 - CURTAIN_X1, h: CURTAIN_Y2 - CURTAIN_Y1,
      }, step.curtainColor);

      if (curtainProgress >= 1) {
        this._nextStep();
      }
    }
  }

  // Draws template2 + Duke (left) + Princess Felicia (right) with no dialogue
  // box or face overlays.
  _drawPrincess1Base(step) {
    if (step.background) {
      this.ctx.drawImage(step.background, 0, 0, this.canvas.width, this.canvas.height);
    }
    this.ctx.drawImage(this.images.dukeBase, DUKE_POS.x, DUKE_POS.y, DUKE_POS.w, DUKE_POS.h);
    this.ctx.drawImage(this.images.princess1Base, PRINCESS1_POS.x, PRINCESS1_POS.y, PRINCESS1_POS.w, PRINCESS1_POS.h);
  }

  // ── Farewell scene ─────────────────────────────────────────────────────────
  // Cross-fades from the closed-curtain princess1 screen into the farewell
  // image, types the farewell dialogue, fades the left part of the scene out to
  // the plain colour as the Duke walks away, then types the final narration
  // while the Princess waits for his return.
  _drawFarewellScene(step, s, ts) {
    // Snapshot the incoming (curtain-closed princess1) frame for the cross-fade
    if (!s.entryImage) {
      s.entryImage = this._makeOffscreen();
      s.entryImage.getContext('2d').drawImage(this.canvas, 0, 0);
    }
    if (!s.commands) this._initDialogueState(s, FAREWELL_SCRIPT_PART1);
    s.phase = s.phase || 'crossfade';

    const crossfadeMs = step.crossfadeMs ?? FAREWELL_CROSSFADE_MS;

    // Phase 1: cross-fade the princess1 screen into the farewell image
    if (s.phase === 'crossfade') {
      const progress = Math.min((ts - s.startTime) / crossfadeMs, 1);
      this._clearBlack();

      if (progress < 1 && s.entryImage) {
        this.ctx.save();
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.drawImage(s.entryImage, 0, 0);
        this.ctx.restore();
      }
      if (progress > 0) {
        this.ctx.save();
        this.ctx.globalAlpha = progress;
        this._drawFarewellBase(step);
        this._drawFarewellPrincessLips(s);
        this._drawDialogueTextBox(s);
        this.ctx.restore();
      }

      if (progress >= 1) s.phase = 'dialogue1';
      return;
    }

    // Phase 2: farewell image + part 1 typewriter dialogue
    if (s.phase === 'dialogue1') {
      this._clearBlack();
      this._drawFarewellBase(step);
      this._processDialogueCommands(s, ts);
      this._drawFarewellPrincessLips(s);
      this._drawDialogueTextBox(s);

      if (s.cmdIndex >= s.commands.length && s.typingLine >= s.pageLines.length) {
        s.phase = 'fade';
        s.fadeStartTime = ts;
      }
      return;
    }

    // Phase 3: fade the left part of the scene out to the plain colour
    if (s.phase === 'fade') {
      const fadeMs = step.fadeMs ?? FAREWELL_FADE_MS;
      const fadeProgress = Math.min((ts - s.fadeStartTime) / fadeMs, 1);

      this._clearBlack();
      this._drawFarewellBase(step);
      this._drawFarewellPrincessLips(s);
      this.ctx.save();
      this.ctx.globalAlpha = fadeProgress;
      this.ctx.fillStyle = step.fadeColor;
      this.ctx.fillRect(step.fadeRect.x, step.fadeRect.y, step.fadeRect.w, step.fadeRect.h);
      this.ctx.restore();
      this._drawDialogueTextBox(s);

      if (fadeProgress >= 1) {
        s.phase = 'dialogue2';
        this._initDialogueState(s, FAREWELL_SCRIPT_PART2);
      }
      return;
    }

    // Phase 4: part 2 typewriter dialogue over the faded scene, then finish
    this._clearBlack();
    this._drawFarewellBase(step);
    this._drawFarewellPrincessLips(s);
    this.ctx.fillStyle = step.fadeColor;
    this.ctx.fillRect(step.fadeRect.x, step.fadeRect.y, step.fadeRect.w, step.fadeRect.h);
    this._processDialogueCommands(s, ts);
    this._drawDialogueTextBox(s);

    if (s.cmdIndex >= s.commands.length && s.typingLine >= s.pageLines.length) {
      this._nextStep();
    }
  }

  _drawFarewellBase(step) {
    if (step.image) {
      this.ctx.drawImage(step.image, 0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // Draws the farewell Princess lip overlay at its absolute position in the
  // full-canvas farewell image (the FACE_LAYOUT offsets are already screen
  // coordinates for this scene, not offsets into a base sprite).
  _drawFarewellPrincessLips(s) {
    const off = FACE_LAYOUT.princess2?.lips;
    if (!off) return;
    const img = this.images[`princess2_lips${s.face.princess2.lips}`];
    if (!img) return;
    this.ctx.drawImage(img, off.x, off.y, off.w, off.h);
  }

  // ── Final castle scene ─────────────────────────────────────────────────────
  // Cross-fades from the farewell screen into the castle image while the outro
  // music ("Guinever (Aquarium 1981)") starts, holds the final frame, then
  // completes the demo (leaving the castle visible).  The outro track plays a
  // single pass (no loop); when it ends the end-credits track takes over.
  _drawCastleScene(step, s, ts) {
    // Snapshot the incoming farewell frame for the cross-fade
    if (!s.entryImage) {
      s.entryImage = this._makeOffscreen();
      s.entryImage.getContext('2d').drawImage(this.canvas, 0, 0);
    }
    // Start the outro music once, as the castle fades in.  It plays only once;
    // when it finishes, the end-credits track starts (while the demo is active).
    if (!s.musicStarted && this.soundManager) {
      s.musicStarted = true;
      this.soundManager.playMusic(CASTLE_MUSIC_TRACK, CASTLE_MUSIC_FADE_MS / 1000, {
        loop: false,
        onEnded: () => {
          if (!this.active || !this.soundManager) return;
          this.soundManager.playMusic(END_CREDITS_MUSIC_TRACK, CASTLE_MUSIC_FADE_MS / 1000);
        },
      });
    }

    const crossfadeMs = step.crossfadeMs ?? CASTLE_CROSSFADE_MS;

    // Phase 1: cross-fade the farewell screen into the castle image
    if (s.phase === 'crossfade') {
      const progress = Math.min((ts - s.startTime) / crossfadeMs, 1);
      this._clearBlack();

      if (progress < 1 && s.entryImage) {
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

      if (progress >= 1) {
        s.phase = 'hold';
        s.holdStartTime = ts;
      }
      return;
    }

    // Phase 2: hold the castle image, then finish the demo
    const holdMs = step.holdMs ?? CASTLE_HOLD_MS;
    this._clearBlack();
    this.ctx.drawImage(step.image, 0, 0, this.canvas.width, this.canvas.height);

    if (ts - s.holdStartTime >= holdMs) {
      this._nextStep();
    }
  }

  // ── End credits scene ─────────────────────────────────────────────────────
  // After the final castle scene the credits are typed over three background
  // images (duke on horseback → duke & princess → princess on the balcony),
  // then the canvas clears to black and the copyright notice is typed.  Unlike
  // the dialogue typewriter, the credits are typed faster (7 frames/char) and
  // a solid white square cursor precedes each character (asm/enddemo.asm
  // sub_66CD).
  _drawCreditsScene(step, s, ts) {
    const fadeMs = CREDITS_CROSSFADE_MS;

    // Phase 1: cross-fade from the castle into the duke-on-horse image
    if (s.phase === 'horseFade') {
      const progress = Math.min((ts - s.startTime) / fadeMs, 1);
      this._clearBlack();
      if (progress < 1 && s.entryImage) {
        this.ctx.save();
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.drawImage(s.entryImage, 0, 0);
        this.ctx.restore();
      }
      if (progress > 0) {
        this.ctx.save();
        this.ctx.globalAlpha = progress;
        this.ctx.drawImage(step.horseImage, 0, 0);
        this.ctx.restore();
      }
      if (progress >= 1) {
        s.phase = 'horseText';
        s.phaseStart = ts;
        this._initCreditsState(s, CREDITS_STAFF_SCREENS);
      }
      return;
    }

    // Phase 2: type the staff credits over the horse image (50 s)
    if (s.phase === 'horseText') {
      this._clearBlack();
      this.ctx.drawImage(step.horseImage, 0, 0);
      this._drawCreditsTextBox(s, true);
      this._typeCreditsScreen(s, ts);
      if (ts - s.phaseStart >= CREDITS_HORSE_MS) {
        s.phase = 'princessFade';
        s.phaseStart = ts;
      }
      return;
    }

    // Phase 3: cross-fade into the duke & princess image (no text)
    if (s.phase === 'princessFade') {
      const progress = Math.min((ts - s.phaseStart) / fadeMs, 1);
      this._clearBlack();
      if (progress < 1) {
        this.ctx.save();
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.drawImage(step.horseImage, 0, 0);
        this.ctx.restore();
      }
      if (progress > 0) {
        this.ctx.save();
        this.ctx.globalAlpha = progress;
        this.ctx.drawImage(step.princessImage, 0, 0);
        this.ctx.restore();
      }
      if (progress >= 1) {
        s.phase = 'princessScroll';
        s.phaseStart = ts;
        s.scroll = 0;
        s.scrollTs = ts;
      }
      return;
    }

    // Phase 4: the duke & princess image holds while PORT_CREDITS scrolls
    // smoothly (sub-pixel) right to left along the curve.  The phase ends only
    // when the whole text has fully crossed the left boundary (x = 10).
    if (s.phase === 'princessScroll') {
      const delta = ts - s.scrollTs;
      s.scrollTs = ts;
      s.scroll += (delta * PORT_CREDITS_SPEED) / 1000;

      this._clearBlack();
      this.ctx.drawImage(step.princessImage, 0, 0);
      this._drawPortCreditsScroll(s);

      if (s.scroll >= s.endScroll) {
        s.phase = 'balconyFade';
        s.phaseStart = ts;
      }
      return;
    }

    // Phase 5: cross-fade into the princess-on-balcony image
    if (s.phase === 'balconyFade') {
      const progress = Math.min((ts - s.phaseStart) / fadeMs, 1);
      this._clearBlack();
      if (progress < 1) {
        this.ctx.save();
        this.ctx.globalAlpha = 1 - progress;
        this.ctx.drawImage(step.princessImage, 0, 0);
        this.ctx.restore();
      }
      if (progress > 0) {
        this.ctx.save();
        this.ctx.globalAlpha = progress;
        this.ctx.drawImage(step.balconyImage, 0, 0);
        this.ctx.restore();
      }
      if (progress >= 1) {
        s.phase = 'balconyText';
        s.phaseStart = ts;
        this._initCreditsState(s, CREDITS_THANKS_SCREENS);
      }
      return;
    }

    // Phase 6: type the special-thanks + serving-monsters credits (55 s)
    if (s.phase === 'balconyText') {
      this._clearBlack();
      this.ctx.drawImage(step.balconyImage, 0, 0);
      this._drawCreditsTextBox(s, true);
      this._typeCreditsScreen(s, ts);
      if (ts - s.phaseStart >= CREDITS_BALCONY_MS) {
        s.phase = 'copyright';
        s.phaseStart = ts;
        this._initCreditsState(s, CREDITS_COPYRIGHT_SCREENS);
      }
      return;
    }

    // Phase 7: clear to black and type the copyright notice, then finish
    this._clearBlack();
    this._drawCreditsTextBox(s, false);
    this._typeCreditsScreen(s, ts);
    if (
      s.screenTypedAt !== 0 &&
      s.screenIndex === s.screens.length - 1 &&
      ts - s.screenTypedAt >= CREDITS_COPYRIGHT_HOLD_MS
    ) {
      this._nextStep();
    }
  }

  _initCreditsState(s, screens) {
    s.screens = screens;
    s.screenIndex = 0;
    s.rowIndex = 0;
    s.charCount = 0;
    s.lineStartTime = 0;
    s.screenTypedAt = 0;
  }

  // Advances the credits typewriter: types the current row char-by-char, moves
  // to the next row when one finishes, and (after the screen's hold) advances
  // to the next screen.  The last screen stays on screen until the phase ends.
  _typeCreditsScreen(s, ts) {
    if (s.screenIndex >= s.screens.length) return;

    const screen = s.screens[s.screenIndex];
    const row = screen.rows[s.rowIndex];
    const rowText = this._creditsRowFull(row);

    if (s.screenTypedAt === 0) {
      if (!s.lineStartTime) s.lineStartTime = ts;
      s.charCount = Math.min(
        Math.floor((ts - s.lineStartTime) / ENDING_CREDITS_CHAR_DELAY_MS),
        rowText.length,
      );

      if (s.charCount >= rowText.length) {
        if (s.rowIndex + 1 < screen.rows.length) {
          s.rowIndex++;
          s.charCount = 0;
          s.lineStartTime = 0;
        } else {
          s.screenTypedAt = ts;
        }
      }
    }

    if (s.screenTypedAt !== 0) {
      const hold = screen.hold ?? 0;
      if (hold && ts - s.screenTypedAt >= hold && s.screenIndex + 1 < s.screens.length) {
        s.screenIndex++;
        s.rowIndex = 0;
        s.charCount = 0;
        s.lineStartTime = 0;
        s.screenTypedAt = 0;
      }
    }
  }

  _creditsRowFull(row) {
    return typeof row === 'object' ? row.left + row.right : row;
  }

  // Draws the credits box (if requested) and the partially-typed current
  // screen, including the solid white square block cursor at the position of
  // the next character.
  _drawCreditsTextBox(s, drawBox) {
    if (drawBox) {
      const box = CREDITS_BOX_RECT;
      this.ctx.fillStyle = CREDITS_BOX_BG;
      this.ctx.fillRect(box.x, box.y, box.w, box.h);
    }

    const screen = s.screens[s.screenIndex];
    if (!screen) return;

    this.ctx.save();
    this.ctx.font = ENDING_CREDITS_FONT;
    this.ctx.textBaseline = 'top';
    this.ctx.textAlign = 'left';
    this.ctx.fillStyle = CREDITS_TEXT_COLOR;

    for (let r = 0; r <= s.rowIndex && r < screen.rows.length; r++) {
      const row = screen.rows[r];
      const isPair = typeof row === 'object';
      const full = this._creditsRowFull(row);
      const visible = r < s.rowIndex ? full.length : s.charCount;
      if (visible <= 0) continue;

      const y = CREDITS_TEXT_Y + r * ENDING_CREDITS_LINE_HEIGHT;
      if (isPair) {
        const leftVisible = Math.min(visible, row.left.length);
        if (leftVisible > 0) this.ctx.fillText(row.left.slice(0, leftVisible), CREDITS_LEFT_X, y);
        const rightVisible = Math.min(visible - leftVisible, row.right.length);
        if (rightVisible > 0) this.ctx.fillText(row.right.slice(0, rightVisible), CREDITS_RIGHT_X, y);
      } else {
        const x = this._creditsCenteredX(row);
        this.ctx.fillText(row.slice(0, visible), x, y);
      }
    }

    // Solid white square cursor at the position of the next character
    if (s.charCount > 0) {
      const cur = this._currentCreditsRow(s);
      if (cur) {
        const row = cur.row;
        const y = CREDITS_TEXT_Y + cur.index * ENDING_CREDITS_LINE_HEIGHT;
        let cx;
        if (typeof row === 'object') {
          if (s.charCount <= row.left.length) {
            cx = CREDITS_LEFT_X + this.ctx.measureText(row.left.slice(0, s.charCount)).width;
          } else {
            cx = CREDITS_RIGHT_X + this.ctx.measureText(row.right.slice(0, s.charCount - row.left.length)).width;
          }
        } else {
          cx = this._creditsCenteredX(row) + this.ctx.measureText(row.slice(0, s.charCount)).width;
        }
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(Math.round(cx), Math.round(y), CREDITS_CURSOR_SIZE, CREDITS_CURSOR_SIZE);
      }
    }

    this.ctx.restore();
  }

  _currentCreditsRow(s) {
    if (s.screenIndex >= s.screens.length) return null;
    const screen = s.screens[s.screenIndex];
    if (s.rowIndex >= screen.rows.length) return null;
    return { row: screen.rows[s.rowIndex], index: s.rowIndex };
  }

  _creditsCenteredX(text) {
    const w = this.ctx.measureText(text).width;
    return Math.round((CREDITS_BOX_RECT.x + CREDITS_BOX_RECT.w / 2) - w / 2);
  }

  // ── Port-credits smooth scroller ──────────────────────────────────────────
  // Phase 4 scrolls PORT_CREDITS right to left along the curve
  // y = 343 - 0.8·e^(0.0067x)·sin(0.05154x), one character at a time with a
  // sub-pixel offset.  The braces {…} are control codes only – they are never
  // drawn and take no space; characters they enclose are drawn cyan, all
  // others white.  Monospace widths are measured once per character so x
  // positions never drift.
  _buildPortCreditsLayout() {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = PORT_CREDITS_FONT;
    const text = PORT_CREDITS;
    const glyphs = [];
    let total = 0;
    let inBraces = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '{') { inBraces = true; continue; }
      if (ch === '}') { inBraces = false; continue; }
      const w = ctx.measureText(ch).width;
      glyphs.push({ ch, w, cyan: inBraces });
      total += w;
    }
    ctx.restore();
    return { glyphs, total, startX: this.canvas.width };
  }

  _drawPortCreditsScroll(s) {
    if (!s.portLayout) {
      s.portLayout = this._buildPortCreditsLayout();
      s.endScroll = this.canvas.width + s.portLayout.total - PORT_CREDITS_LEFT_BOUNDARY;
    }
    const { glyphs } = s.portLayout;
    const startX = s.portLayout.startX;

    this.ctx.save();
    this.ctx.font = PORT_CREDITS_FONT;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    let x = startX - s.scroll;   // left edge of the first drawn character
    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i];
      if (x + g.w < 0) { x += g.w; continue; }  // off the left edge (later chars are further right)
      if (x > this.canvas.width) break;         // past the right edge – the rest is off-screen

      const cy = PORT_CREDITS_CURVE_Y(x);
      if (cy >= -32 && cy <= this.canvas.height) {
        this.ctx.fillStyle = g.cyan ? PORT_CREDITS_HIGHLIGHT_COLOR : PORT_CREDITS_COLOR;
        this.ctx.fillText(g.ch, x, cy);
      }
      x += g.w;
    }
    this.ctx.restore();
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
