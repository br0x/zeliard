// ─────────────────────────────────────────────────────────────────────────────
// Assets
// ─────────────────────────────────────────────────────────────────────────────

const INTRO_LOGO_SRC            = 'assets/images/opdemo/ttl3_logo.png';
const INTRO_NEC_SRC             = 'assets/images/opdemo/nec.png';
const INTRO_NEC_GOLD_SRC        = 'assets/images/opdemo/nec_gold.png';
const INTRO_NEC_BROKEN_SRC      = 'assets/images/opdemo/nec_broken.png';
const INTRO_BLUE_GEM_SRC        = 'assets/images/opdemo/blue.png';
const INTRO_RED_GEM_SRC         = 'assets/images/opdemo/red.png';
const INTRO_NECKLACE_SRC        = 'assets/images/opdemo/necklace.png';
const INTRO_LOGO_TRANSP_SRC     = 'assets/images/opdemo/logo_transp.png';
const INTRO_PANNO_SRC           = 'assets/images/opdemo/panno.png';
const INTRO_BALCONY_SRC         = 'assets/images/opdemo/balcony.png';
const INTRO_BALCONY_SAND_SRC    = 'assets/images/opdemo/balcony_sand.png';
const INTRO_PRINCESS_SRC        = 'assets/images/opdemo/princess.png';
const INTRO_PRINCESS_VS_DEMON_SRC = 'assets/images/opdemo/princess_vs_demon.png';
const INTRO_DEMON_FINAL_SRC     = 'assets/images/opdemo/demon.png';
const INTRO_STONED_SRC          = 'assets/images/opdemo/stoned.png';
const INTRO_KING_PRINCESS_SRC   = 'assets/images/opdemo/king_princess.png';
const INTRO_SPIRIT_SRC          = 'assets/images/opdemo/spirit.png';
const INTRO_DEMON_SRCS = [
  'assets/images/opdemo/dmaou0.png',
  'assets/images/opdemo/dmaou1.png',
  'assets/images/opdemo/dmaou2.png',
  'assets/images/opdemo/dmaou3.png',
  'assets/images/opdemo/dmaou4.png',
  'assets/images/opdemo/dmaou5.png',
];

// ─────────────────────────────────────────────────────────────────────────────
// Text content
// ─────────────────────────────────────────────────────────────────────────────

const INTRO_COPYRIGHT_LINES = [
  'Copyright (C)1987,1990 GAME ARTS',
  'Copyright (C)1990 Sierra On-Line',
  'Web port 2026, brox//THIRTEEN',
];

const STORY_LINES = [
  '           Two thousand years, ',
  'from the dark reaches of another galaxy,',
  '        a demon with not a shred',
  '      of compassion for humankind,',
  '         descended upon earth.',
  '',
  '          He defiled the land,',
  '  sending vile creatures to live in it,',
  '   and thus became ruler of the world.',
  '',
  '         The King of Felishika,',
  '     appalled by what had happened,',
  '          prayed to the Spirit',
  '      of the Holy Land of Zeliard',
  '    for help in defeating this monster.',
  '',
  '    With the help of the holy crystals',
  '       called Tears of Esmesanti,',
  '    the King managed to wrest power',
  '    from the fiend and seal him deep',
  '     within the bowels of the earth.',
  '',
  '            And once again,',
  ' the light of peace came to shine upon',
  '              the earth.',
  '',
  '',
  'However, it is written in',
  '       the Sixth Book of Esmesanti:',
  '                    The Age of Darkness.',
];

const DEMON_SPEECH_LINES = [
  'Beware, for I shall wake',
  'from my sleep of 2,000 years',
  'and once again reign over the world.',
];

const CREDITS_LINES = [
  '               ZELIARD                  ',
  '',
  '             -- STAFF --                ',
  '',
  'Producer -- Japanese Version',
  '                      Mitsuhiro Mazda   ',
  '',
  'Producer -- English Version',
  '                        Josh Mandel     ',
  '',
  'Lead Programmer      Tomoyuki Shimada   ',
  '',
  'Graphic Designers     Akihiko Yoshida   ',
  '                      Masatoshi Azumi   ',
  '',
  'English Text Translation by',
  '                       Marti McKenna    ',
  '',
  'Music Composers  -- MECANO ASSOCIATES --',
  '                    Fumihito Kasatani   ',
  '                    Nobuyuki Aoshima    ',
  '',
  'Story Maker           Masaru Takeuchi   ',
  '',
  'Sound Effects by     Tomoyuki Shimada   ',
  '',
  'Advisers               Osamu Harada     ',
  '                       Hiromi Ohba      ',
  '                       Greg Miyaji      ',
  '',
  'System Designer      Rocky Cave Maker   ',
  '',
  'Special Thanks to',
  '                    Toshiyuki Uchida    ',
  '                       Yuzo Sunaga      ',
  '                     Takeshi Miyaji     ',
  '                     Naozumi Honma      ',
  '                     Toshi Masubuchi    ',
  '                     Ray E. Nakazato    ',
  '                     Hiroyuki Koyama    ',
  '                     Satoshi Uesaka     ',
  '              Sierra On-Line Japan, Inc.',
  '                    Eiji (Ed) Nagano    ',
  '',
  '',
  '',
  '    Copyright (C)1987,1990 GAME ARTS    ',
  '    Copyright (C)1990 Sierra On-Line    ',
  '  This edition first published 1987 by  ',
  '  GAME ARTS Co.,Ltd./ Tomoyuki Shimada  ',
];

const BALCONY_LINES_PART1 = [
  'Once, long ago, a terrible storm came to the land of Zeliard. ',
  'Dark clouds filled the sky; lightning flashed and thunder crashed. ',
  'Day after day, rain poured from the heavens as if in lament.',
  'On the seventh day of rain, a beautiful young girl stood on her balcony watching this dark, sad rain.',
  'The girl was Princess Felicia la Felishika.  She was the only daughter of King Felishika, and the light of his life.',
  'Her smiles were like sunshine, her voice as beautiful as that of an angel.  She was adored by the people of the kingdom.',
  '"What a dreadful storm!  Will it never end?"',
  'Just as the princess spoke these words, the raindrops turned to grains of sand which covered the ground below her. ',
];

const BALCONY_LINES_PART2 = [
  'As she watched, a startling transformation began to take place.',
  'In an instant, the green hills and plains turned a dusty brown. ',
  'Trees and flowers crumpled and were buried. ',
  'Rivers and lakes disappeared beneath the sand.',
  'This ever-green land was turning to desert before her very eyes.',
];

const PRINCESS_DEMON_LINES = [
  '"How can this be?" she cried, "What evil power could cause such a terrible thing to happen?"',
];

const PRINCESS_VS_DEMON_LINES = [
  'Princess Felicia shivered as she felt a dark presence near her, and suddenly, a terrifying voice bellowed as loud as thunder...',
  '"I am Jashiin, the Emperor of Chaos.  The descendants of those who imprisoned me under the earth shall know that my wrath has smoldered for two thousand years!"',
];

const DEMON_FINAL_LINES = [
  '"Beautiful Princess Felicia, you will make a lovely and terrifying symbol of my awakening.  Your father will not make the mistakes of his ancestors!"',
  'As the words of the demon resounded over the land, Princess Felicia was turned to stone.',
];

const STONED_LINES = [
  'The rain of sand continued for 108 days and transformed the once-fertile land into desert.',
  'The people of the kingdom wept at the terrible fate of their country, and of their princess.',
];

const KING_PRINCESS_LINES = [
  'The King wept most of all. "Oh, my beloved Felicia!  I fear the Age of Darkness is upon us.  I am powerless to stop it ... and powerless to help you."',
  'But the tears of the King and his people soon awakened another power.',
  'As the King grieved, an apparition appeared before him.',
];

const SPIRIT_LINES = [
  '"I am the Guardian Spirit of the Holy Land of Zeliard.  The demon Jashiin has been resurrected, and indeed his evil magic will plunge this world into the Age of Darkness once again."',
  '"Heed my words, King Felishika: There is but one way to stop this demon.  A brave warrior must venture into the labyrinths and recover the nine Holy Crystals, the Tears of Esmesanti."',
  '"Many terrible creatures dwell within the labyrinths, all of them Jashiin\'s minions.  No mortal man could defeat these deadly beasts and wrest the crystals from them."',
  '"However, there is one with the power to oppose Jashiin. The man who is destined to fight him will soon arrive in your kingdom."',
  '"This man is the only being strong enough to banish Jashiin forever."',
  '"You must await the arrival of this brave and noble knight, and tell him everything.  Only with his help can you hope to restore this land to its former beauty, and free your daughter from her terrible curse."',
  'Having spoken these words, the Spirit disappeared.',
];

const KING_SURPRISED_LINES = [
  'King Felishika could not believe what he had seen.  "Surely my mind is playing tricks on me!  I\'m afraid I have gone mad with grief."',
  'But the next day, a stranger appeared in the kingdom...',
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
const NEC_FLASH_IN_MS               = 200;
const NEC_FLASH_OUT_MS              = 500;
const NEC_GEM_EXPLODE_MS            = 1000;
const NEC_BROKEN_FADE_OUT_MS        = 1000;
const NEC_BROKEN_AUTO_ADVANCE_MS    = 3000;
const NEC_GEM_EXPLOSION_CENTER      = { x: 325, y: 240 };
const NEC_GEM_COORDS = [
  { image: 'blue', x: 280, y: 215 },
  { image: 'blue', x: 284, y: 224 },
  { image: 'blue', x: 293, y: 232 },
  { image: 'blue', x: 303, y: 238 },
  { image: 'blue', x: 321, y: 238 },
  { image: 'blue', x: 331, y: 232 },
  { image: 'blue', x: 340, y: 224 },
  { image: 'blue', x: 344, y: 215 },
  { image: 'red',  x: 299, y: 172 },
];
const DEMON_FRAME_DELAY_MS          = 500;
const DEMON_SEQUENCE                = [0, 1, 0, 1, 2, 3];
const DEMON_SPEECH_CHAR_DELAY_MS    = 45;
const DEMON_MOUTH_FRAME_DELAY_MS    = 120;
const DEMON_SPEECH_FADE_OUT_MS      = 1000;
const DEMON_SPEECH_AUTO_ADVANCE_MS  = 3000;
const NECKLACE_FADE_IN_MS           = 1000;
const NECKLACE_LAYER_DELAY_MS       = 3000;
const NECKLACE_FADE_OUT_MS          = 1000;
const CREDITS_FONT                  = '16px "Press Start 2P", monospace';
const CREDITS_LINE_HEIGHT           = 20;
const CREDITS_START_Y               = 400;
const CREDITS_SCROLL_SPEED          = 28;   // px / second
const BALCONY_FADE_IN_MS            = 2000;
const BALCONY_CROSSFADE_MS          = 2000;
const BALCONY_FONT                  = '14px "Press Start 2P", monospace';
const BALCONY_TEXT_X                = 8;
const BALCONY_TEXT_Y                = 290;
const BALCONY_TEXT_MAX_WIDTH        = 624;  // canvas width (640) − 2 × BALCONY_TEXT_X
const BALCONY_LINE_HEIGHT           = 20;
const BALCONY_CHAR_DELAY_MS         = 45;
const BALCONY_AUTO_ADVANCE_MS       = 3000;
const CURTAIN_X1                    = 33;
const CURTAIN_Y1                    = 33;
const CURTAIN_X2                    = 607;
const CURTAIN_Y2                    = 239;
const CURTAIN_COLOR                 = '#56040a';
const CURTAIN_MS                    = 1000;
const PRINCESS_CROSSFADE_MS         = 1000;
const PRINCESS_VS_DEMON_CROSSFADE_MS = 2000;
const DEMON_FINAL_CROSSFADE_MS      = 2000;
const STONED_CROSSFADE_MS           = 2000;
const KING_PRINCESS_CROSSFADE_MS    = 2000;
const SPIRIT_CROSSFADE_MS           = 2000;

// Text styling
const DIRECT_SPEECH_TEXT_COLOR      = '#fbfbfb';
const DIRECT_SPEECH_SHADOW_COLOR    = '#0000fb';
const DIRECT_SPEECH_SHADOW_OFFSET   = 2;
const JASHIIN_TEXT_COLOR            = '#fbfb00';
const JASHIIN_SHADOW_COLOR          = '#fb0000';

// Demon speech layout
const DEMON_SPEECH_FONT             = '16px "Press Start 2P", monospace';
const DEMON_SPEECH_LINE_HEIGHT      = 20;
const DEMON_SPEECH_START_Y          = 330;

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
//   gemExplosion   – flash, shatter gems, fade out, then advance
//   spriteAnim     – play a frame sequence from a sprite array, then advance
//   typeText       – type lines over an image with auto-advance; supports
//                    mouth animation and fade-out
//   layeredFadeIn  – stagger-fade multiple image layers, then advance
//   curtainThen    – close curtain over backgroundKey image, then advance
//   balcony        – two-part typed-text scene with crossfade between parts
//   typedScene     – sequence of (image, lines[]) sub-scenes with crossfades
// ─────────────────────────────────────────────────────────────────────────────

function buildTimeline(images) {
  return [
    // ── 1. Logo ──────────────────────────────────────────────────────────────
    {
      type: 'fadeInImage',
      image: images.logo,
      fadeInMs: INTRO_FADE_IN_MS,
      holdMs: 3000,
      fadeOutMs: INTRO_FADE_OUT_MS,
      // Extra overlay drawn on top of the image during this step
      overlay: (ctx, canvas, opacity) => {
        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.fillStyle = '#fff';
        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const startY = 290, lineHeight = 20;
        for (let i = 0; i < INTRO_COPYRIGHT_LINES.length; i++) {
          ctx.fillText(INTRO_COPYRIGHT_LINES[i], canvas.width / 2, startY + i * lineHeight);
        }
        ctx.restore();
      },
      // Custom opacity curve: image starts at 0.18 and ramps to 1
      opacityCurve: (fadeInProgress) => 0.18 + fadeInProgress * 0.82,
    },

    // ── 2. Story scroll (nec → nec_gold crossfade) ───────────────────────────
    {
      type: 'scrollText',
      backgroundImage: images.nec,
      crossfadeImage: images.necGold,
      textCanvas: null,          // built at runtime; see buildStepState()
      imagefadeInMs: STORY_IMAGE_FADE_IN_MS,
      crossfadeMs: STORY_CROSSFADE_MS,
      startY: STORY_START_Y,
      scrollSpeed: STORY_SCROLL_SPEED,
    },

    // ── 3. Broken necklace + gem explosion ───────────────────────────────────
    {
      type: 'gemExplosion',
      goldImage: images.necGold,
      brokenImage: images.necBroken,
      blueGemImage: images.blueGem,
      redGemImage: images.redGem,
      gemCoords: NEC_GEM_COORDS,
      explosionCenter: NEC_GEM_EXPLOSION_CENTER,
      flashInMs: NEC_FLASH_IN_MS,
      flashOutMs: NEC_FLASH_OUT_MS,
      explodeMs: NEC_GEM_EXPLODE_MS,
      fadeOutMs: NEC_BROKEN_FADE_OUT_MS,
      autoAdvanceMs: NEC_BROKEN_AUTO_ADVANCE_MS,
    },

    // ── 4. Demon entrance animation ──────────────────────────────────────────
    {
      type: 'spriteAnim',
      frames: images.demonFrames,
      sequence: DEMON_SEQUENCE,
      frameDelayMs: DEMON_FRAME_DELAY_MS,
    },

    // ── 5. Demon speech ──────────────────────────────────────────────────────
    {
      type: 'typeText',
      lines: DEMON_SPEECH_LINES,
      // Mouth animation while speaking; idle frame when done
      getImage: (elapsed, charsDone, totalChars) => {
        if (charsDone >= totalChars) return images.demonFrames[3];
        return images.demonFrames[[4, 5][Math.floor(elapsed / DEMON_MOUTH_FRAME_DELAY_MS) % 2]];
      },
      font: DEMON_SPEECH_FONT,
      textAlign: 'center',
      textX: (canvas) => canvas.width / 2,
      startY: DEMON_SPEECH_START_Y,
      lineHeight: DEMON_SPEECH_LINE_HEIGHT,
      charDelayMs: DEMON_SPEECH_CHAR_DELAY_MS,
      autoAdvanceMs: DEMON_SPEECH_AUTO_ADVANCE_MS,
      fadeOutMs: DEMON_SPEECH_FADE_OUT_MS,
      textColor: DIRECT_SPEECH_TEXT_COLOR,
      shadowColor: DIRECT_SPEECH_SHADOW_COLOR,
      shadowOffset: DIRECT_SPEECH_SHADOW_OFFSET,
    },

    // ── 6. Necklace layers ───────────────────────────────────────────────────
    {
      type: 'layeredFadeIn',
      layers: [
        { image: images.necklace,   delayMs: 0 },
        { image: images.logoTransp, delayMs: NECKLACE_FADE_IN_MS + NECKLACE_LAYER_DELAY_MS },
        { image: images.panno,      delayMs: NECKLACE_FADE_IN_MS * 2 + NECKLACE_LAYER_DELAY_MS * 2 },
      ],
      eachFadeInMs: NECKLACE_FADE_IN_MS,
      holdAfterMs: 2000,
      fadeOutMs: NECKLACE_FADE_OUT_MS,
    },

    // ── 7. Credits scroll ────────────────────────────────────────────────────
    {
      type: 'scrollText',
      backgroundImage: null,        // black background
      crossfadeImage: null,
      textCanvas: null,             // built at runtime
      imagefadeInMs: 0,
      crossfadeMs: 0,
      startY: CREDITS_START_Y,
      scrollSpeed: CREDITS_SCROLL_SPEED,
      isCredits: true,              // different font / alignment
    },

    // ── 8. Balcony (2 parts, curtain + crossfade between them) ───────────────
    {
      type: 'balcony',
      part1: {
        image: images.balcony,
        lines: BALCONY_LINES_PART1,
      },
      part2: {
        image: images.balconySand,
        lines: BALCONY_LINES_PART2,
      },
      fadeInMs: BALCONY_FADE_IN_MS,
      crossfadeMs: BALCONY_CROSSFADE_MS,
      charDelayMs: BALCONY_CHAR_DELAY_MS,
      autoAdvanceMs: BALCONY_AUTO_ADVANCE_MS,
    },

    // ── 9. Princess / Demon confrontation (3 sub-scenes) ─────────────────────
    {
      type: 'typedScene',
      // Sub-scene 1 starts with curtain-close + sand→princess crossfade
      curtainImage: images.balconySand,
      curtainMs: CURTAIN_MS,
      curtainCrossfadeMs: PRINCESS_CROSSFADE_MS,
      subScenes: [
        {
          image: images.princess,
          lines: PRINCESS_DEMON_LINES,
          crossfadeMs: PRINCESS_VS_DEMON_CROSSFADE_MS,
          textStyle: 'normal',
        },
        {
          image: images.princessVsDemon,
          lines: PRINCESS_VS_DEMON_LINES,
          crossfadeMs: DEMON_FINAL_CROSSFADE_MS,
          textStyle: 'jashiin',   // Jashiin lines use yellow/red colours
        },
        {
          image: images.demonFinal,
          lines: DEMON_FINAL_LINES,
          crossfadeMs: 0,
          textStyle: 'jashiin',
        },
      ],
      charDelayMs: BALCONY_CHAR_DELAY_MS,
      autoAdvanceMs: BALCONY_AUTO_ADVANCE_MS,
    },

    // ── 10. Stoned / King / Spirit (sub-scenes + curtain) ────────────────────
    {
      type: 'typedScene',
      curtainImage: null,
      curtainMs: 0,
      curtainCrossfadeMs: 0,
      // The entry to this step crossfades from demonFinal → stoned before any text
      entryFromImage: images.demonFinal,
      entryToImage:   images.stoned,
      entryCrossfadeMs: STONED_CROSSFADE_MS,
      subScenes: [
        {
          image: images.stoned,
          lines: STONED_LINES,
          crossfadeMs: KING_PRINCESS_CROSSFADE_MS,
          textStyle: 'normal',
        },
        {
          image: images.kingPrincess,
          lines: KING_PRINCESS_LINES,
          crossfadeMs: SPIRIT_CROSSFADE_MS,
          textStyle: 'normal',
        },
        {
          image: images.spirit,
          lines: SPIRIT_LINES,
          curtainAfter: true,
          curtainLines: KING_SURPRISED_LINES,
          textStyle: 'normal',
        },
      ],
      charDelayMs: BALCONY_CHAR_DELAY_MS,
      autoAdvanceMs: BALCONY_AUTO_ADVANCE_MS,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// OpeningIntro — timeline engine
// ─────────────────────────────────────────────────────────────────────────────

export class OpeningIntro {
  constructor({ screen, canvas, onComplete }) {
    this.screen     = screen;
    this.canvas     = canvas;
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
    const step = this.timeline[this.stepIndex];
    if (!step) return;
    this._skipStep(step, this.stepState);
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
      logo, nec, necGold, necBroken, blueGem, redGem,
      necklace, logoTransp, panno,
      balcony, balconySand, princess,
      princessVsDemon, demonFinal,
      stoned, kingPrincess, spirit,
      ...rest
    ] = await Promise.all([
      loadImage(INTRO_LOGO_SRC),
      loadImage(INTRO_NEC_SRC),
      loadImage(INTRO_NEC_GOLD_SRC),
      loadImage(INTRO_NEC_BROKEN_SRC),
      loadImage(INTRO_BLUE_GEM_SRC),
      loadImage(INTRO_RED_GEM_SRC),
      loadImage(INTRO_NECKLACE_SRC),
      loadImage(INTRO_LOGO_TRANSP_SRC),
      loadImage(INTRO_PANNO_SRC),
      loadImage(INTRO_BALCONY_SRC),
      loadImage(INTRO_BALCONY_SAND_SRC),
      loadImage(INTRO_PRINCESS_SRC),
      loadImage(INTRO_PRINCESS_VS_DEMON_SRC),
      loadImage(INTRO_DEMON_FINAL_SRC),
      loadImage(INTRO_STONED_SRC),
      loadImage(INTRO_KING_PRINCESS_SRC),
      loadImage(INTRO_SPIRIT_SRC),
      ...INTRO_DEMON_SRCS.map(loadImage),
      loadStoryFont(),
    ]);

    const demonFrames = rest.slice(0, INTRO_DEMON_SRCS.length);

    this.images = {
      logo, nec, necGold, necBroken, blueGem, redGem,
      necklace, logoTransp, panno,
      balcony, balconySand, princess,
      princessVsDemon, demonFinal,
      stoned, kingPrincess, spirit,
      demonFrames,
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
    this._enterStep(this.stepIndex + 1);
  }

  _buildStepState(step) {
    const base = { startTime: 0 };

    if (step.type === 'scrollText') {
      const canvas = step.isCredits
        ? this._createCreditsCanvas()
        : this._createStoryTextCanvas();
      // compute credits x-offset once
      const creditsX = step.isCredits ? this._measureCreditsX() : 0;
      return { ...base, textCanvas: canvas, creditsX, crossfadeStartTime: 0 };
    }

    if (step.type === 'gemExplosion') {
      return { ...base, explosionGems: [], fadeOutStartTime: 0 };
    }

    if (step.type === 'fadeInImage') {
      return { ...base, fadeOutStartTime: 0 };
    }

    if (step.type === 'typeText') {
      return { ...base, fullyTypedTime: 0, fadeOutStartTime: 0 };
    }

    if (step.type === 'layeredFadeIn') {
      return { ...base, fadeOutStartTime: 0 };
    }

    if (step.type === 'balcony') {
      return {
        ...base,
        part: 1,
        lineIndex: 0,
        lineStartTime: 0,   // set once fade-in completes
        lineFullyTypedTime: 0,
        crossfadeStartTime: 0,
      };
    }

    if (step.type === 'typedScene') {
      // Opening phase: curtain > entryCrossfade > text
      let initialPhase;
      if (step.curtainImage)     initialPhase = 'curtain';
      else if (step.entryFromImage) initialPhase = 'entryCrossfade';
      else                       initialPhase = 'text';

      return {
        ...base,
        subSceneIndex: 0,
        phase: initialPhase,
        crossfadeStartTime: 0,
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
      case 'fadeInImage':    return this._drawFadeInImage(step, s, ts);
      case 'scrollText':     return this._drawScrollText(step, s, ts);
      case 'gemExplosion':   return this._drawGemExplosion(step, s, ts);
      case 'spriteAnim':     return this._drawSpriteAnim(step, s, ts);
      case 'typeText':       return this._drawTypeText(step, s, ts);
      case 'layeredFadeIn':  return this._drawLayeredFadeIn(step, s, ts);
      case 'balcony':        return this._drawBalcony(step, s, ts);
      case 'typedScene':     return this._drawTypedScene(step, s, ts);
    }
  }

  // ── Generic skip dispatcher ────────────────────────────────────────────────

  _skipStep(step, s) {
    switch (step.type) {
      case 'fadeInImage':
        if (!s.fadeOutStartTime) s.fadeOutStartTime = performance.now();
        break;

      case 'scrollText':
        if (step.crossfadeMs && !s.crossfadeStartTime) {
          s.crossfadeStartTime = performance.now();
        } else if (!step.crossfadeMs) {
          this._nextStep();
        }
        break;

      case 'gemExplosion':
        this._nextStep();
        break;

      case 'spriteAnim':
        this._nextStep();
        break;

      case 'typeText':
        if (!s.fadeOutStartTime) {
          // snap to fully typed first, then fade
          s.fullyTypedTime = s.fullyTypedTime || performance.now();
          s.fadeOutStartTime = performance.now();
        }
        break;

      case 'layeredFadeIn':
        if (!s.fadeOutStartTime) s.fadeOutStartTime = performance.now();
        break;

      case 'balcony':
        this._advanceBalconyLine(step, s, performance.now());
        break;

      case 'typedScene':
        this._advanceTypedSceneLine(step, s, performance.now());
        break;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Step renderers
  // ─────────────────────────────────────────────────────────────────────────

  // ── fadeInImage ────────────────────────────────────────────────────────────

  _drawFadeInImage(step, s, ts) {
    const elapsed      = ts - s.startTime;
    const fadeInProg   = Math.min(elapsed / step.fadeInMs, 1);
    const rawOpacity   = step.opacityCurve ? step.opacityCurve(fadeInProg) : fadeInProg;

    if (!s.fadeOutStartTime && elapsed >= step.holdMs) {
      s.fadeOutStartTime = ts;
    }

    const fadeOutElapsed = s.fadeOutStartTime ? ts - s.fadeOutStartTime : 0;
    const pageOpacity    = s.fadeOutStartTime
      ? 1 - Math.min(fadeOutElapsed / step.fadeOutMs, 1)
      : 1;
    const finalOpacity   = pageOpacity * rawOpacity;

    this._clearBlack();
    this.ctx.save();
    this.ctx.globalAlpha = finalOpacity;
    this.ctx.drawImage(step.image, 0, 0);
    step.overlay?.(this.ctx, this.canvas, pageOpacity);
    this.ctx.restore();

    if (s.fadeOutStartTime && fadeOutElapsed >= step.fadeOutMs) {
      this._nextStep();
    }
  }

  // ── scrollText ─────────────────────────────────────────────────────────────

  _drawScrollText(step, s, ts) {
    const elapsed     = ts - s.startTime;
    const imageOpacity = step.imagefadeInMs
      ? Math.min(elapsed / step.imagefadeInMs, 1)
      : 1;
    const textY       = Math.round(step.startY - (elapsed / 1000) * step.scrollSpeed);

    const crossfadeElapsed = s.crossfadeStartTime ? ts - s.crossfadeStartTime : 0;
    const goldOpacity      = s.crossfadeStartTime
      ? Math.min(crossfadeElapsed / step.crossfadeMs, 1)
      : 0;

    this._clearBlack();
    this.ctx.save();

    if (step.isCredits) {
      this.ctx.globalAlpha = 1;
      this._drawCreditsText(s.creditsX, textY);
    } else {
      // Story: nec fades in, crossfades to nec_gold at end of scroll
      this.ctx.globalAlpha = imageOpacity * (1 - goldOpacity);
      this.ctx.drawImage(step.backgroundImage, 0, 0);

      if (s.crossfadeStartTime) {
        this.ctx.globalAlpha = imageOpacity * goldOpacity;
        this.ctx.drawImage(step.crossfadeImage, 0, 0);
      }

      if (!s.crossfadeStartTime) {
        this._drawStoryText(s.textCanvas, textY, imageOpacity);
      }
    }

    this.ctx.restore();

    // Trigger crossfade / advance
    if (step.isCredits) {
      if (textY + CREDITS_LINES.length * CREDITS_LINE_HEIGHT < 0) {
        this._nextStep();
      }
    } else {
      if (textY + s.textCanvas.height < 0 && !s.crossfadeStartTime) {
        s.crossfadeStartTime = ts;
      }
      if (s.crossfadeStartTime && crossfadeElapsed >= step.crossfadeMs) {
        this._nextStep();
      }
    }
  }

  // ── gemExplosion ───────────────────────────────────────────────────────────

  _drawGemExplosion(step, s, ts) {
    const elapsed     = ts - s.startTime;
    const gemElapsed  = Math.max(elapsed - step.flashInMs, 0);
    const gemProgress = Math.min(gemElapsed / step.explodeMs, 1);

    const fadeOutElapsed = s.fadeOutStartTime ? ts - s.fadeOutStartTime : 0;
    const pageOpacity    = s.fadeOutStartTime
      ? 1 - Math.min(fadeOutElapsed / step.fadeOutMs, 1)
      : 1;

    // Initialise gem trajectories on first frame
    if (!s.explosionGems.length) {
      s.explosionGems = this._createExplosionGems(step);
    }

    this._clearBlack();
    this.ctx.save();
    this.ctx.globalAlpha = pageOpacity;

    if (elapsed < step.flashInMs) {
      this.ctx.drawImage(step.goldImage, 0, 0);
    } else {
      this.ctx.drawImage(step.brokenImage, 0, 0);
      this._drawExplosionGems(s.explosionGems, gemProgress);
    }

    this.ctx.restore();

    // White flash overlay
    const flashOpacity = this._getBrokenNecFlashOpacity(elapsed, step) * pageOpacity;
    if (flashOpacity > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = flashOpacity;
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }

    if (s.fadeOutStartTime && fadeOutElapsed >= step.fadeOutMs) {
      this._nextStep();
      return;
    }

    if (!s.fadeOutStartTime && this._shouldAutoAdvanceGemExplosion(elapsed, step)) {
      s.fadeOutStartTime = ts;
    }
  }

  // ── spriteAnim ─────────────────────────────────────────────────────────────

  _drawSpriteAnim(step, s, ts) {
    const elapsed       = ts - s.startTime;
    const sequenceIndex = Math.min(
      Math.floor(elapsed / step.frameDelayMs),
      step.sequence.length - 1,
    );
    const image = step.frames[step.sequence[sequenceIndex]];

    this._clearBlack();
    this.ctx.drawImage(image, 0, 0);

    if (elapsed >= step.sequence.length * step.frameDelayMs) {
      this._nextStep();
    }
  }

  // ── typeText ───────────────────────────────────────────────────────────────

  _drawTypeText(step, s, ts) {
    const elapsed    = ts - s.startTime;
    const totalChars = step.lines.reduce((n, l) => n + l.length, 0);
    const charsDone  = Math.min(Math.floor(elapsed / step.charDelayMs), totalChars);
    const image      = step.getImage(elapsed, charsDone, totalChars);

    const fadeOutElapsed = s.fadeOutStartTime ? ts - s.fadeOutStartTime : 0;
    const pageOpacity    = s.fadeOutStartTime
      ? 1 - Math.min(fadeOutElapsed / step.fadeOutMs, 1)
      : 1;

    this._clearBlack();
    this.ctx.save();
    this.ctx.globalAlpha = pageOpacity;
    this.ctx.drawImage(image, 0, 0);
    this._drawTypeTextLines(step, charsDone);
    this.ctx.restore();

    if (s.fadeOutStartTime && fadeOutElapsed >= step.fadeOutMs) {
      this._nextStep();
      return;
    }

    if (!s.fadeOutStartTime && charsDone >= totalChars) {
      if (!s.fullyTypedTime) {
        s.fullyTypedTime = ts;
      } else if (ts - s.fullyTypedTime >= step.autoAdvanceMs) {
        s.fadeOutStartTime = ts;
      }
    }
  }

  // ── layeredFadeIn ──────────────────────────────────────────────────────────

  _drawLayeredFadeIn(step, s, ts) {
    const elapsed     = ts - s.startTime;
    const lastLayer   = step.layers[step.layers.length - 1];
    const totalTimeMs = lastLayer.delayMs + step.eachFadeInMs + step.holdAfterMs;

    const fadeOutElapsed = s.fadeOutStartTime ? ts - s.fadeOutStartTime : 0;
    const pageOpacity    = s.fadeOutStartTime
      ? 1 - Math.min(fadeOutElapsed / step.fadeOutMs, 1)
      : 1;

    this._clearBlack();
    this.ctx.save();

    for (const layer of step.layers) {
      const layerElapsed = elapsed - layer.delayMs;
      if (layerElapsed <= 0) break;
      this.ctx.globalAlpha = pageOpacity * Math.min(layerElapsed / step.eachFadeInMs, 1);
      this.ctx.drawImage(layer.image, 0, 0);
    }

    this.ctx.restore();

    if (s.fadeOutStartTime && fadeOutElapsed >= step.fadeOutMs) {
      this._nextStep();
      return;
    }

    if (!s.fadeOutStartTime && elapsed >= totalTimeMs) {
      s.fadeOutStartTime = ts;
    }
  }

  // ── balcony ────────────────────────────────────────────────────────────────

  _drawBalcony(step, s, ts) {
    // lineStartTime is derived once from s.startTime (set by _tick on first frame)
    if (!s.lineStartTime) {
      s.lineStartTime = s.startTime + step.fadeInMs;
    }

    const elapsed       = ts - s.startTime;
    const imageOpacity  = Math.min(elapsed / step.fadeInMs, 1);
    const part          = s.part === 1 ? step.part1 : step.part2;

    const crossfadeElapsed  = s.crossfadeStartTime ? ts - s.crossfadeStartTime : 0;
    const crossfadeProgress = s.crossfadeStartTime
      ? Math.min(crossfadeElapsed / step.crossfadeMs, 1)
      : 0;

    // Commit part-switch once crossfade completes
    if (s.crossfadeStartTime && crossfadeProgress >= 1 && s.part === 1) {
      s.part               = 2;
      s.lineIndex          = 0;
      s.lineStartTime      = ts;
      s.lineFullyTypedTime = 0;
    }

    this._clearBlack();
    this.ctx.save();

    this.ctx.globalAlpha = imageOpacity * (1 - crossfadeProgress);
    this.ctx.drawImage(step.part1.image, 0, 0);

    if (s.crossfadeStartTime) {
      this.ctx.globalAlpha = imageOpacity * crossfadeProgress;
      this.ctx.drawImage(step.part2.image, 0, 0);
    }

    this.ctx.restore();

    const isCrossfading = s.crossfadeStartTime && crossfadeProgress < 1;
    if (imageOpacity > 0 && !isCrossfading) {
      this._drawBalconyText(part.lines, s, ts);
    }

    if (!isCrossfading) {
      this._autoAdvanceBalcony(step, s, part.lines, ts);
    }
  }

  _advanceBalconyLine(step, s, ts) {
    if (!s.lineStartTime) return;   // fade-in not yet complete, nothing to advance
    const part  = s.part === 1 ? step.part1 : step.part2;
    const lines = part.lines;
    const line  = lines[s.lineIndex] ?? '';
    const elapsed    = ts - s.lineStartTime;
    const fullyTyped = elapsed >= line.length * step.charDelayMs;

    if (!fullyTyped) {
      s.lineStartTime      = ts - line.length * step.charDelayMs;
      s.lineFullyTypedTime = ts;
      return;
    }

    if (s.part === 1 && s.lineIndex >= lines.length - 1) {
      if (!s.crossfadeStartTime) s.crossfadeStartTime = ts;
      return;
    }

    if (s.part === 2 && s.lineIndex >= lines.length - 1) {
      this._nextStep();
      return;
    }

    s.lineIndex++;
    s.lineStartTime      = ts;
    s.lineFullyTypedTime = 0;
  }

  _autoAdvanceBalcony(step, s, lines, ts) {
    if (!s.lineStartTime) return;   // not yet initialised (fade still pending)
    const line       = lines[s.lineIndex] ?? '';
    const lineElapsed = ts - s.lineStartTime;
    const fullyTyped  = lineElapsed >= line.length * step.charDelayMs;

    if (!fullyTyped) { s.lineFullyTypedTime = 0; return; }

    if (!s.lineFullyTypedTime) {
      s.lineFullyTypedTime = ts;
    } else if (ts - s.lineFullyTypedTime >= step.autoAdvanceMs) {
      this._advanceBalconyLine(step, s, ts);
    }
  }

  // ── typedScene ─────────────────────────────────────────────────────────────
  //
  // Phases per sub-scene:
  //   'curtain'      – opening curtain + crossfade (first sub-scene only, optional)
  //   'crossfade'    – crossfade from previous image to this sub-scene image
  //   'text'         – show image, type lines, auto-advance
  //   'curtainAfter' – close curtain after last sub-scene, then type curtainLines
  //   'done'         – advance to next timeline step

  _drawTypedScene(step, s, ts) {
    const sub = step.subScenes[s.subSceneIndex];

    switch (s.phase) {
      case 'curtain':          return this._drawTypedSceneCurtain(step, s, sub, ts);
      case 'entryCrossfade':   return this._drawTypedSceneEntryCrossfade(step, s, sub, ts);
      case 'crossfade':        return this._drawTypedSceneCrossfade(step, s, sub, ts);
      case 'text':             return this._drawTypedSceneText(step, s, sub, ts);
      case 'curtainAfter':     return this._drawTypedSceneCurtainAfter(step, s, sub, ts);
      case 'curtainAfterText': return this._drawTypedSceneCurtainAfterText(step, s, sub, ts);
    }
  }

  _drawTypedSceneEntryCrossfade(step, s, sub, ts) {
    if (!s.crossfadeStartTime) s.crossfadeStartTime = ts;
    const progress = Math.min((ts - s.crossfadeStartTime) / step.entryCrossfadeMs, 1);

    this._clearBlack();
    this.ctx.save();
    this.ctx.globalAlpha = 1 - progress;
    this.ctx.drawImage(step.entryFromImage, 0, 0);
    this.ctx.globalAlpha = progress;
    this.ctx.drawImage(step.entryToImage, 0, 0);
    this.ctx.restore();

    if (progress >= 1) {
      s.phase              = 'text';
      s.crossfadeStartTime = 0;
      s.lineStartTime      = ts;
    }
  }

  _drawTypedSceneCurtain(step, s, sub, ts) {
    const elapsed          = ts - s.startTime;
    const curtainProgress  = Math.min(elapsed / step.curtainMs, 1);
    const crossfadeElapsed = Math.max(elapsed - step.curtainMs, 0);
    const crossfadeProgress = Math.min(crossfadeElapsed / step.curtainCrossfadeMs, 1);

    this._clearBlack();
    this.ctx.save();

    if (crossfadeProgress === 0) {
      this.ctx.globalAlpha = 1;
      this.ctx.drawImage(step.curtainImage, 0, 0);
    } else {
      // Offscreen: sand + closed curtain rect, crossfading to princess
      const off    = this._makeOffscreen();
      const offCtx = off.getContext('2d');
      offCtx.imageSmoothingEnabled = false;
      offCtx.drawImage(step.curtainImage, 0, 0);
      offCtx.fillStyle = CURTAIN_COLOR;
      offCtx.fillRect(CURTAIN_X1, CURTAIN_Y1, CURTAIN_X2 - CURTAIN_X1, CURTAIN_Y2 - CURTAIN_Y1);

      this.ctx.globalAlpha = 1 - crossfadeProgress;
      this.ctx.drawImage(off, 0, 0);
      this.ctx.globalAlpha = crossfadeProgress;
      this.ctx.drawImage(sub.image, 0, 0);
    }

    this.ctx.restore();

    if (curtainProgress > 0 && crossfadeProgress === 0) {
      this._drawCurtainClose(curtainProgress, step.curtainImage);
    }

    if (crossfadeProgress >= 1) {
      // First text frame
      s.phase         = 'text';
      s.lineStartTime = ts;
    }
  }

  _drawTypedSceneCrossfade(step, s, sub, ts) {
    const prevSub  = step.subScenes[s.subSceneIndex - 1];
    const outImage = prevSub?.image ?? sub.image;
    const inImage  = sub.image;
    const cfMs     = sub.crossfadeMs || 1;
    const progress = Math.min((ts - s.crossfadeStartTime) / cfMs, 1);

    this._clearBlack();
    this.ctx.save();
    this.ctx.globalAlpha = 1 - progress;
    this.ctx.drawImage(outImage, 0, 0);
    this.ctx.globalAlpha = progress;
    this.ctx.drawImage(inImage, 0, 0);
    this.ctx.restore();

    if (progress >= 1) {
      s.phase              = 'text';
      s.lineIndex          = 0;
      s.lineStartTime      = ts;
      s.lineFullyTypedTime = 0;
      s.crossfadeStartTime = 0;
    }
  }

  _drawTypedSceneText(step, s, sub, ts) {
    this._clearBlack();
    this.ctx.save();
    this.ctx.globalAlpha = 1;
    this.ctx.drawImage(sub.image, 0, 0);
    this.ctx.restore();

    // Prime the line timer on the very first text frame
    if (!s.lineStartTime) s.lineStartTime = ts;

    this._drawBalconyText(sub.lines, s, ts, sub.textStyle);
    this._autoAdvanceTypedScene(step, s, sub, ts);
  }

  _autoAdvanceTypedScene(step, s, sub, ts) {
    const lines  = sub.lines ?? [];
    const line   = lines[s.lineIndex] ?? '';
    const elapsed = ts - s.lineStartTime;
    const fullyTyped = elapsed >= line.length * step.charDelayMs;

    if (!fullyTyped) { s.lineFullyTypedTime = 0; return; }

    if (!s.lineFullyTypedTime) {
      s.lineFullyTypedTime = ts;
    } else if (ts - s.lineFullyTypedTime >= step.autoAdvanceMs) {
      this._advanceTypedSceneLine(step, s, ts);
    }
  }

  _advanceTypedSceneLine(step, s, ts) {
    const sub   = step.subScenes[s.subSceneIndex];
    const lines = sub.lines ?? [];
    const line  = lines[s.lineIndex] ?? '';
    const elapsed    = ts - (s.lineStartTime || ts);
    const fullyTyped = !line || elapsed >= line.length * step.charDelayMs;

    // Snap to full if still typing
    if (!fullyTyped) {
      s.lineStartTime      = ts - line.length * step.charDelayMs;
      s.lineFullyTypedTime = ts;
      return;
    }

    if (lines.length && s.lineIndex < lines.length - 1) {
      s.lineIndex++;
      s.lineStartTime      = ts;
      s.lineFullyTypedTime = 0;
      return;
    }

    // Last line of this sub-scene (or sub-scene has no lines)
    if (sub.curtainAfter) {
      s.phase              = 'curtainAfter';
      s.crossfadeStartTime = ts;
      s.lineIndex          = 0;
      s.lineStartTime      = 0;
      s.lineFullyTypedTime = 0;
      return;
    }

    const isLastSubScene = s.subSceneIndex >= step.subScenes.length - 1;
    if (isLastSubScene) {
      this._nextStep();
      return;
    }

    // Move to next sub-scene
    s.subSceneIndex++;
    s.lineIndex          = 0;
    s.lineStartTime      = 0;
    s.lineFullyTypedTime = 0;

    const nextSub = step.subScenes[s.subSceneIndex];
    if (nextSub.crossfadeMs > 0) {
      s.crossfadeStartTime = ts;
      s.phase              = 'crossfade';
    } else {
      s.crossfadeStartTime = 0;
      s.phase              = 'text';
    }
  }

  _drawTypedSceneCurtainAfter(step, s, sub, ts) {
    const elapsed  = ts - s.crossfadeStartTime;
    const progress = Math.min(elapsed / CURTAIN_MS, 1);

    this._clearBlack();
    this.ctx.save();
    this.ctx.globalAlpha = 1;
    this.ctx.drawImage(sub.image, 0, 0);
    this.ctx.restore();

    this._drawCurtainClose(progress, sub.image);

    if (progress >= 1 && !s.lineStartTime) {
      // Curtain fully closed — switch phase on next tick so text starts cleanly
      s.phase         = 'curtainAfterText';
      s.lineStartTime = ts;
    }
  }

  _drawTypedSceneCurtainAfterText(step, s, sub, ts) {
    const lines = sub.curtainLines ?? [];

    this._clearBlack();
    this.ctx.save();
    this.ctx.globalAlpha = 1;
    this.ctx.drawImage(sub.image, 0, 0);
    this.ctx.restore();

    this._drawCurtainClose(1, sub.image); // curtain fully closed
    this._drawBalconyText(lines, s, ts, sub.textStyle);

    const line       = lines[s.lineIndex] ?? '';
    const elapsed    = ts - s.lineStartTime;
    const fullyTyped = elapsed >= line.length * step.charDelayMs;

    if (fullyTyped) {
      if (!s.lineFullyTypedTime) {
        s.lineFullyTypedTime = ts;
      } else if (ts - s.lineFullyTypedTime >= step.autoAdvanceMs) {
        if (s.lineIndex < lines.length - 1) {
          s.lineIndex++;
          s.lineStartTime      = ts;
          s.lineFullyTypedTime = 0;
        } else {
          this.finish();
        }
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
      Math.floor(Math.max(elapsed, 0) / BALCONY_CHAR_DELAY_MS),
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

  // Draws lines for the demon-speech typeText step (centred)
  _drawTypeTextLines(step, charsDone) {
    this.ctx.font         = step.font;
    this.ctx.textAlign    = step.textAlign;
    this.ctx.textBaseline = 'top';

    let remaining = charsDone;
    const x       = step.textX(this.canvas);

    for (let i = 0; i < step.lines.length; i++) {
      const line        = step.lines[i];
      const visibleLine = line.slice(0, Math.min(remaining, line.length));

      if (visibleLine) {
        this._drawShadowedText(
          visibleLine, x,
          step.startY + i * step.lineHeight,
          step.textColor, step.shadowColor, step.shadowOffset,
        );
      }

      remaining -= line.length;
      if (remaining <= 0) break;
    }
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

  // ── Gem explosion helpers ──────────────────────────────────────────────────

  _createExplosionGems(step) {
    return step.gemCoords.map((gem) => {
      const image   = gem.image === 'red' ? step.redGemImage : step.blueGemImage;
      const centerX = gem.x + image.width  / 2;
      const centerY = gem.y + image.height / 2;
      const baseAngle = Math.atan2(
        centerY - step.explosionCenter.y,
        centerX - step.explosionCenter.x,
      );
      const angle = baseAngle + (Math.random() - 0.5) * 1.1;
      const ray   = this._getCanvasEdgeRay(centerX, centerY, angle);
      return { image, x: gem.x, y: gem.y, dx: ray.dx, dy: ray.dy };
    });
  }

  _drawExplosionGems(gems, progress) {
    if (progress >= 1) return;
    for (const gem of gems) {
      const x = gem.x + gem.dx * progress;
      const y = gem.y + gem.dy * progress;
      this.ctx.drawImage(gem.image, Math.round(x), Math.round(y));
    }
  }

  _getBrokenNecFlashOpacity(elapsed, step) {
    if (elapsed < step.flashInMs) return elapsed / step.flashInMs;
    const flashOutElapsed = elapsed - step.flashInMs;
    if (flashOutElapsed < step.flashOutMs) return 1 - flashOutElapsed / step.flashOutMs;
    return 0;
  }

  _shouldAutoAdvanceGemExplosion(elapsed, step) {
    const waitBeforeFade = Math.max(step.autoAdvanceMs - step.fadeOutMs, 0);
    return elapsed >= step.flashInMs + step.explodeMs + waitBeforeFade;
  }

  _getCanvasEdgeRay(x, y, angle) {
    const vx = Math.cos(angle), vy = Math.sin(angle);
    const distances = [];
    if (vx > 0)  distances.push((this.canvas.width  - x) / vx);
    else if (vx < 0) distances.push(-x / vx);
    if (vy > 0)  distances.push((this.canvas.height - y) / vy);
    else if (vy < 0) distances.push(-y / vy);
    const distance = Math.min(...distances.filter((v) => v >= 0));
    return { dx: vx * distance, dy: vy * distance };
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
