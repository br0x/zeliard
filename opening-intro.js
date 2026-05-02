const INTRO_FADE_IN_MS = 2000;
const INTRO_FADE_OUT_MS = 2000;
const INTRO_LOGO_SRC = 'assets/images/opdemo/ttl3_logo.png';
const INTRO_NEC_SRC = 'assets/images/opdemo/nec.png';
const INTRO_NEC_GOLD_SRC = 'assets/images/opdemo/nec_gold.png';
const INTRO_NEC_BROKEN_SRC = 'assets/images/opdemo/nec_broken.png';
const INTRO_BLUE_GEM_SRC = 'assets/images/opdemo/blue.png';
const INTRO_RED_GEM_SRC = 'assets/images/opdemo/red.png';
const INTRO_NECKLACE_SRC = 'assets/images/opdemo/necklace.png';
const INTRO_LOGO_TRANSP_SRC = 'assets/images/opdemo/logo_transp.png';
const INTRO_PANNO_SRC = 'assets/images/opdemo/panno.png';
const INTRO_DEMON_SRCS = [
  'assets/images/opdemo/dmaou0.png',
  'assets/images/opdemo/dmaou1.png',
  'assets/images/opdemo/dmaou2.png',
  'assets/images/opdemo/dmaou3.png',
  'assets/images/opdemo/dmaou4.png',
  'assets/images/opdemo/dmaou5.png'
];
const INTRO_COPYRIGHT_LINES = [
  'Copyright (C)1987,1990 GAME ARTS',
  'Copyright (C)1990 Sierra On-Line',
  'Web port 2026, brox//THIRTEEN'
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
  '                    The Age of Darkness.'
];
const DEMON_SPEECH_LINES = [
  'Beware, for I shall wake',
  'from my sleep of 2,000 years',
  'and once again reign over the world.'
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
  '  GAME ARTS Co.,Ltd./ Tomoyuki Shimada  '
];

const PAGE_LOGO = 'logo';
const PAGE_STORY = 'story';
const PAGE_BROKEN_NEC = 'brokenNec';
const PAGE_DEMON = 'demon';
const PAGE_DEMON_SPEECH = 'demonSpeech';
const PAGE_NECKLACE = 'necklace';
const PAGE_CREDITS = 'credits';
const STORY_IMAGE_FADE_IN_MS = 2000;
const STORY_CROSSFADE_MS = 4000;
const STORY_FONT = '16px "Press Start 2P", monospace';
const STORY_FONT_SAMPLE = 'The Age of Darkness.';
const STORY_LINE_HEIGHT = 20;
const STORY_START_Y = 400;
const STORY_SCROLL_SPEED = 28;
const NEC_FLASH_IN_MS = 200;
const NEC_FLASH_OUT_MS = 500;
const NEC_GEM_EXPLODE_MS = 1000;
const NEC_BROKEN_FADE_OUT_MS = 1000;
const NEC_BROKEN_AUTO_ADVANCE_MS = 3000;
const NEC_GEM_EXPLOSION_CENTER = { x: 325, y: 240 };
const NEC_GEM_COORDS = [
  { image: 'blue', x: 280, y: 215 },
  { image: 'blue', x: 284, y: 224 },
  { image: 'blue', x: 293, y: 232 },
  { image: 'blue', x: 303, y: 238 },
  { image: 'blue', x: 321, y: 238 },
  { image: 'blue', x: 331, y: 232 },
  { image: 'blue', x: 340, y: 224 },
  { image: 'blue', x: 344, y: 215 },
  { image: 'red',  x: 299, y: 172 }
];
const DEMON_FRAME_DELAY_MS = 500;
const DEMON_SEQUENCE = [0, 1, 0, 1, 2, 3];
const DEMON_SPEECH_FONT = '16px "Press Start 2P", monospace';
const DEMON_SPEECH_LINE_HEIGHT = 20;
const DEMON_SPEECH_START_Y = 298;
const DEMON_SPEECH_CHAR_DELAY_MS = 45;
const DEMON_MOUTH_FRAME_DELAY_MS = 120;
const DIRECT_SPEECH_TEXT_COLOR = '#fbfbfb';
const DIRECT_SPEECH_SHADOW_COLOR = '#0000fb';
const DIRECT_SPEECH_SHADOW_OFFSET = 2;
const DEMON_SPEECH_FADE_OUT_MS = 1000;
const DEMON_SPEECH_AUTO_ADVANCE_MS = 3000;
const NECKLACE_FADE_IN_MS = 1000;
const NECKLACE_LAYER_DELAY_MS = 3000;
const NECKLACE_FADE_OUT_MS = 1000;
const CREDITS_FONT = '16px "Press Start 2P", monospace';
const CREDITS_LINE_HEIGHT = 20;
const CREDITS_START_Y = 400;
const CREDITS_SCROLL_SPEED = 28;

const PAGE_BALCONY = 'balcony';
const INTRO_BALCONY_SRC = 'assets/images/opdemo/balcony.png';
const INTRO_BALCONY_SAND_SRC = 'assets/images/opdemo/balcony_sand.png';
const INTRO_PRINCESS_SRC = 'assets/images/opdemo/princess.png';
const BALCONY_FADE_IN_MS = 2000;
const BALCONY_CROSSFADE_MS = 2000;
const BALCONY_FONT = '14px "Press Start 2P", monospace';
const BALCONY_TEXT_MAX_WIDTH = 624; // canvas width (640) minus 2 * BALCONY_TEXT_X (8)
const BALCONY_LINE_HEIGHT = 20;
const BALCONY_CHAR_DELAY_MS = 45;
const BALCONY_AUTO_ADVANCE_MS = 3000;

const PAGE_PRINCESS_DEMON = 'princessDemon';
// The curtain rect in canvas coords
const CURTAIN_X1 = 92;
const CURTAIN_Y1 = 53;
const CURTAIN_X2 = 544;
const CURTAIN_Y2 = 219;
const CURTAIN_COLOR = '#56040a';
const CURTAIN_MS = 1000;       // time for curtain to fully close
const PRINCESS_CROSSFADE_MS = 1000; // crossfade from sand to princess once curtain closed
const PRINCESS_DEMON_LINES = [
  '"How can this be?" she cried, "What evil power could cause such a terrible thing to happen?"'
];
// Y position of the text area below the image (image occupies roughly top 75% of canvas)
const BALCONY_TEXT_Y = 310;
const BALCONY_TEXT_X = 8;
const BALCONY_LINES_PART1 = [
  'Once, long ago, a terrible storm came to the land of Zeliard. ',
  'Dark clouds filled the sky; lightning flashed and thunder crashed. ',
  'Day after day, rain poured from the heavens as if in lament.',
  'On the seventh day of rain, a beautiful young girl stood on her balcony watching this dark, sad rain.',
  'The girl was Princess Felicia la Felishika.  She was the only daughter of King Felishika, and the light of his life.',
  'Her smiles were like sunshine, her voice as beautiful as that of an angel.  She was adored by the people of the kingdom.',
  '"What a dreadful storm!  Will it never end?"',
  'Just as the princess spoke these words, the raindrops turned to grains of sand which covered the ground below her. '
];
const BALCONY_LINES_PART2 = [
  'As she watched, a startling transformation began to take place.',
  'In an instant, the green hills and plains turned a dusty brown. ',
  'Trees and flowers crumpled and were buried. ',
  'Rivers and lakes disappeared beneath the sand.',
  'This ever-green land was turning to desert before her very eyes.'
];

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
}

async function loadStoryFont() {
  if (!document.fonts?.load) {
    return;
  }

  try {
    await document.fonts.load(STORY_FONT, STORY_FONT_SAMPLE);
    await document.fonts.ready;
  } catch (error) {
    console.warn('Failed to load intro font; using fallback font.', error);
  }
}

export class OpeningIntro {
  constructor({ screen, canvas, onComplete }) {
    this.screen = screen;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onComplete = onComplete;
    this.active = false;
    this.frameId = 0;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.page = PAGE_LOGO;
    this.storyStartTime = 0;
    this.storyCrossfadeStartTime = 0;
    this.logoImage = null;
    this.necImage = null;
    this.necGoldImage = null;
    this.necBrokenImage = null;
    this.blueGemImage = null;
    this.redGemImage = null;
    this.demonImages = [];
    this.necklaceImage = null;
    this.logoTranspImage = null;
    this.pannoImage = null;
    this.storyTextCanvas = null;
    this.brokenNecStartTime = 0;
    this.brokenNecFadeOutStartTime = 0;
    this.demonStartTime = 0;
    this.demonSpeechStartTime = 0;
    this.demonSpeechFadeOutStartTime = 0;
    this.demonSpeechFullyTypedTime = 0;
    this.necklaceStartTime = 0;
    this.necklaceFadeOutStartTime = 0;
    this.creditsStartTime = 0;
    this.creditsX = 0;
    this.explosionGems = [];
    this.balconyImage = null;
    this.balconySandImage = null;
    this.princessImage = null;
    this.balconyStartTime = 0;
    this.balconyLineIndex = 0;
    this.balconyLineStartTime = 0;
    this.balconyLineFullyTypedTime = 0;
    this.balconyCrossfadeStartTime = 0;
    this.balconyPart = 1;
    this.princessDemonStartTime = 0;
    this.princessDemonLineIndex = 0;
    this.princessDemonLineStartTime = 0;
    this.princessDemonLineFullyTypedTime = 0;
  }

  async start() {
    this.active = true;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.page = PAGE_LOGO;
    this.storyStartTime = 0;
    this.storyCrossfadeStartTime = 0;
    this.brokenNecStartTime = 0;
    this.brokenNecFadeOutStartTime = 0;
    this.demonStartTime = 0;
    this.demonSpeechStartTime = 0;
    this.demonSpeechFadeOutStartTime = 0;
    this.demonSpeechFullyTypedTime = 0;
    this.necklaceStartTime = 0;
    this.necklaceFadeOutStartTime = 0;
    this.creditsStartTime = 0;
    this.creditsX = 0;
    this.explosionGems = [];
    this.balconyStartTime = 0;
    this.balconyLineIndex = 0;
    this.balconyLineStartTime = 0;
    this.balconyLineFullyTypedTime = 0;
    this.balconyCrossfadeStartTime = 0;
    this.balconyPart = 1;
    this.princessDemonStartTime = 0;
    this.princessDemonLineIndex = 0;
    this.princessDemonLineStartTime = 0;
    this.princessDemonLineFullyTypedTime = 0;
    this.ctx.imageSmoothingEnabled = false;
    this.screen.classList.remove('hidden');

    try {
      [
        this.logoImage,
        this.necImage,
        this.necGoldImage,
        this.necBrokenImage,
        this.blueGemImage,
        this.redGemImage,
        this.necklaceImage,
        this.logoTranspImage,
        this.pannoImage,
        this.balconyImage,
        this.balconySandImage,
        this.princessImage,
        ...this.demonImages
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
        ...INTRO_DEMON_SRCS.map((src) => loadImage(src)),
        loadStoryFont()
      ]).then(([
        logo,
        nec,
        necGold,
        necBroken,
        blueGem,
        redGem,
        necklace,
        logoTransp,
        panno,
        balcony,
        balconySand,
        princess,
        ...demonImages
      ]) => [
        logo,
        nec,
        necGold,
        necBroken,
        blueGem,
        redGem,
        necklace,
        logoTransp,
        panno,
        balcony,
        balconySand,
        princess,
        ...demonImages.slice(0, INTRO_DEMON_SRCS.length)
      ]);
      this.storyTextCanvas = this.createStoryTextCanvas();
      this.creditsX = this.getCreditsTextX();
    } catch (error) {
      console.error(error);
      this.finish();
      return;
    }

    this.frameId = requestAnimationFrame((timestamp) => this.draw(timestamp));
  }

  skipPage() {
    if (!this.active) {
      return;
    }

    if (this.page === PAGE_LOGO) {
      if (this.fadeOutStartTime) {
        return;
      }

      this.fadeOutStartTime = performance.now();
      return;
    }

    if (this.page === PAGE_STORY) {
      if (this.storyCrossfadeStartTime) {
        this.startBrokenNecPage(performance.now());
      } else {
        this.skipStoryScroll();
      }
      return;
    }

    if (this.page === PAGE_BROKEN_NEC) {
      this.startDemonPage(performance.now());
      return;
    }

    if (this.page === PAGE_DEMON) {
      this.startNecklacePage(performance.now());
      return;
    }

    if (this.page === PAGE_DEMON_SPEECH) {
      this.startNecklacePage(performance.now());
      return;
    }

    if (this.page === PAGE_NECKLACE && this.isNecklaceWaitingForInput()) {
      this.startNecklaceFadeOut();
      return;
    }

    if (this.page === PAGE_CREDITS) {
      this.startBalconyPage(performance.now());
      return;
    }

    if (this.page === PAGE_BALCONY) {
      this.advanceBalconyLine(performance.now());
    }

    if (this.page === PAGE_PRINCESS_DEMON) {
      this.finish();
    }
  }

  draw(timestamp) {
    if (!this.active) {
      return;
    }

    if (this.page === PAGE_LOGO) {
      this.drawLogoPage(timestamp);
      return;
    }

    if (this.page === PAGE_STORY) {
      this.drawStoryPage(timestamp);
      return;
    }

    if (this.page === PAGE_BROKEN_NEC) {
      this.drawBrokenNecPage(timestamp);
      return;
    }

    if (this.page === PAGE_DEMON) {
      this.drawDemonPage(timestamp);
      return;
    }

    if (this.page === PAGE_DEMON_SPEECH) {
      this.drawDemonSpeechPage(timestamp);
      return;
    }

    if (this.page === PAGE_NECKLACE) {
      this.drawNecklacePage(timestamp);
      return;
    }

    if (this.page === PAGE_BALCONY) {
      this.drawBalconyPage(timestamp);
      return;
    }

    if (this.page === PAGE_PRINCESS_DEMON) {
      this.drawPrincessDemonPage(timestamp);
      return;
    }

    this.drawCreditsPage(timestamp);
  }

  drawLogoPage(timestamp) {
    if (!this.startTime) {
      this.startTime = timestamp;
    }

    const elapsed = timestamp - this.startTime;
    if (!this.fadeOutStartTime && elapsed >= 3000) {
      this.fadeOutStartTime = timestamp;
    }
    const fadeInProgress = Math.min(elapsed / INTRO_FADE_IN_MS, 1);
    const fadeOutElapsed = this.fadeOutStartTime ? timestamp - this.fadeOutStartTime : 0;
    const pageOpacity = this.fadeOutStartTime
      ? 1 - Math.min(fadeOutElapsed / INTRO_FADE_OUT_MS, 1)
      : 1;
    const logoOpacity = 0.18 + fadeInProgress * 0.82;

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.globalAlpha = pageOpacity * logoOpacity;
    this.ctx.drawImage(this.logoImage, 0, 0);

    this.drawCopyrightText(pageOpacity);
    this.ctx.restore();

    if (this.fadeOutStartTime && fadeOutElapsed >= INTRO_FADE_OUT_MS) {
      this.startStoryPage();
      return;
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  startStoryPage() {
    this.page = PAGE_STORY;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.storyStartTime = 0;
    this.storyCrossfadeStartTime = 0;
    this.frameId = requestAnimationFrame((timestamp) => this.draw(timestamp));
  }

  startBrokenNecPage(timestamp) {
    this.page = PAGE_BROKEN_NEC;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.brokenNecStartTime = timestamp;
    this.brokenNecFadeOutStartTime = 0;
    this.explosionGems = this.createExplosionGems();
    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  startDemonPage(timestamp) {
    this.page = PAGE_DEMON;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.demonStartTime = timestamp;
    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  startDemonSpeechPage(timestamp) {
    this.page = PAGE_DEMON_SPEECH;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.demonSpeechStartTime = timestamp;
    this.demonSpeechFadeOutStartTime = 0;
    this.demonSpeechFullyTypedTime = 0;
    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  startNecklacePage(timestamp) {
    this.page = PAGE_NECKLACE;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.necklaceStartTime = timestamp;
    this.necklaceFadeOutStartTime = 0;
    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  startCreditsPage(timestamp) {
    this.page = PAGE_CREDITS;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.creditsStartTime = timestamp;
    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawStoryPage(timestamp) {
    if (!this.storyStartTime) {
      this.storyStartTime = timestamp;
    }

    const elapsed = timestamp - this.storyStartTime;
    const imageOpacity = Math.min(elapsed / STORY_IMAGE_FADE_IN_MS, 1);
    const textY = Math.round(STORY_START_Y - (elapsed / 1000) * STORY_SCROLL_SPEED);
    const textBottom = textY + this.storyTextCanvas.height;

    if (textBottom < 0 && !this.storyCrossfadeStartTime) {
      this.storyCrossfadeStartTime = timestamp;
    }

    const crossfadeElapsed = this.storyCrossfadeStartTime ? timestamp - this.storyCrossfadeStartTime : 0;
    const goldOpacity = this.storyCrossfadeStartTime
      ? Math.min(crossfadeElapsed / STORY_CROSSFADE_MS, 1)
      : 0;

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.globalAlpha = imageOpacity * (1 - goldOpacity);
    this.ctx.drawImage(this.necImage, 0, 0);

    this.ctx.globalAlpha = imageOpacity * goldOpacity;
    this.ctx.drawImage(this.necGoldImage, 0, 0);

    if (!this.storyCrossfadeStartTime) {
      this.drawStoryText(textY, imageOpacity);
    }

    this.ctx.restore();

    if (this.storyCrossfadeStartTime && crossfadeElapsed >= STORY_CROSSFADE_MS) {
      this.startBrokenNecPage(timestamp);
      return;
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawBrokenNecPage(timestamp) {
    const elapsed = timestamp - this.brokenNecStartTime;
    const gemElapsed = Math.max(elapsed - NEC_FLASH_IN_MS, 0);
    const gemProgress = Math.min(gemElapsed / NEC_GEM_EXPLODE_MS, 1);
    const fadeOutElapsed = this.brokenNecFadeOutStartTime
      ? timestamp - this.brokenNecFadeOutStartTime
      : 0;
    const pageOpacity = this.brokenNecFadeOutStartTime
      ? 1 - Math.min(fadeOutElapsed / NEC_BROKEN_FADE_OUT_MS, 1)
      : 1;

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.globalAlpha = pageOpacity;

    if (elapsed < NEC_FLASH_IN_MS) {
      this.ctx.drawImage(this.necGoldImage, 0, 0);
    } else {
      this.ctx.drawImage(this.necBrokenImage, 0, 0);
      this.drawExplosionGems(gemProgress);
    }

    this.ctx.restore();

    const flashOpacity = this.getBrokenNecFlashOpacity(elapsed) * pageOpacity;
    if (flashOpacity > 0) {
      this.ctx.save();
      this.ctx.globalAlpha = flashOpacity;
      this.ctx.fillStyle = '#fff';
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
    }

    if (this.brokenNecFadeOutStartTime && fadeOutElapsed >= NEC_BROKEN_FADE_OUT_MS) {
      this.startDemonPage(timestamp);
      return;
    }

    if (!this.brokenNecFadeOutStartTime && this.shouldAutoAdvanceBrokenNec(timestamp)) {
      this.brokenNecFadeOutStartTime = timestamp;
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawDemonPage(timestamp) {
    const elapsed = timestamp - this.demonStartTime;
    const sequenceIndex = Math.min(
      Math.floor(elapsed / DEMON_FRAME_DELAY_MS),
      DEMON_SEQUENCE.length - 1
    );
    const image = this.demonImages[DEMON_SEQUENCE[sequenceIndex]];

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(image, 0, 0);

    if (this.isDemonSequenceComplete(timestamp)) {
      this.startDemonSpeechPage(timestamp);
      return;
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawDemonSpeechPage(timestamp) {
    const elapsed = timestamp - this.demonSpeechStartTime;
    const characterCount = this.getVisibleDemonSpeechCharacterCount(elapsed);
    const image = this.getDemonSpeechImage(elapsed, characterCount);
    const fadeOutElapsed = this.demonSpeechFadeOutStartTime
      ? timestamp - this.demonSpeechFadeOutStartTime
      : 0;
    const pageOpacity = this.demonSpeechFadeOutStartTime
      ? 1 - Math.min(fadeOutElapsed / DEMON_SPEECH_FADE_OUT_MS, 1)
      : 1;

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.globalAlpha = pageOpacity;
    this.ctx.drawImage(image, 0, 0);
    this.drawDemonSpeechText(characterCount);
    this.ctx.restore();

    if (this.demonSpeechFadeOutStartTime && fadeOutElapsed >= DEMON_SPEECH_FADE_OUT_MS) {
      this.startNecklacePage(timestamp);
      return;
    }

    // Record the moment typing finishes (once), then auto-advance after the delay
    if (!this.demonSpeechFadeOutStartTime &&
        characterCount >= this.getDemonSpeechCharacterCount()) {
      if (!this.demonSpeechFullyTypedTime) {
        this.demonSpeechFullyTypedTime = timestamp;
      } else if (timestamp - this.demonSpeechFullyTypedTime >= DEMON_SPEECH_AUTO_ADVANCE_MS) {
        this.startDemonSpeechFadeOut();
      }
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawNecklacePage(timestamp) {
    const elapsed = timestamp - this.necklaceStartTime;
    const logoStartTime = NECKLACE_FADE_IN_MS + NECKLACE_LAYER_DELAY_MS;
    const pannoStartTime = logoStartTime + NECKLACE_FADE_IN_MS + NECKLACE_LAYER_DELAY_MS;
    const fadeOutElapsed = this.necklaceFadeOutStartTime
      ? timestamp - this.necklaceFadeOutStartTime
      : 0;
    const pageOpacity = this.necklaceFadeOutStartTime
      ? 1 - Math.min(fadeOutElapsed / NECKLACE_FADE_OUT_MS, 1)
      : 1;

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.globalAlpha = pageOpacity * Math.min(elapsed / NECKLACE_FADE_IN_MS, 1);
    this.ctx.drawImage(this.necklaceImage, 0, 0);

    if (elapsed >= logoStartTime) {
      this.ctx.globalAlpha = pageOpacity *
        Math.min((elapsed - logoStartTime) / NECKLACE_FADE_IN_MS, 1);
      this.ctx.drawImage(this.logoTranspImage, 0, 0);
    }

    if (elapsed >= pannoStartTime) {
      this.ctx.globalAlpha = pageOpacity *
        Math.min((elapsed - pannoStartTime) / NECKLACE_FADE_IN_MS, 1);
      this.ctx.drawImage(this.pannoImage, 0, 0);
    }

    this.ctx.restore();

    const totalNecklaceTime = pannoStartTime + NECKLACE_FADE_IN_MS + 2000;
    if (!this.necklaceFadeOutStartTime && elapsed >= totalNecklaceTime) {
      this.necklaceFadeOutStartTime = timestamp;
    }

    if (this.necklaceFadeOutStartTime && fadeOutElapsed >= NECKLACE_FADE_OUT_MS) {
      this.startCreditsPage(timestamp);
      return;
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawCreditsPage(timestamp) {
    const elapsed = timestamp - this.creditsStartTime;
    const textY = Math.round(CREDITS_START_Y - (elapsed / 1000) * CREDITS_SCROLL_SPEED);

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.drawCreditsText(textY);

    if (textY + CREDITS_LINES.length * CREDITS_LINE_HEIGHT < 0) {
      this.startBalconyPage(timestamp);
      return;
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  startBalconyPage(timestamp) {
    this.page = PAGE_BALCONY;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.balconyStartTime = timestamp;
    this.balconyLineIndex = 0;
    this.balconyLineStartTime = timestamp + BALCONY_FADE_IN_MS;
    this.balconyCrossfadeStartTime = 0;
    this.balconyPart = 1;
    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  // Returns all lines for the current part
  getBalconyLines() {
    return this.balconyPart === 1 ? BALCONY_LINES_PART1 : BALCONY_LINES_PART2;
  }

  // Returns true if the line is a princess quote (double-quoted)
  isBalconyPrincessLine(line) {
    return line.trimStart().startsWith('"');
  }

  // Splits text into segments: [{text, quoted}, ...] based on matched "..." pairs.
  // Unmatched opening quotes are treated as plain text.
  parseQuoteSegments(text) {
    const segments = [];
    let i = 0;
    let plain = '';
    while (i < text.length) {
      if (text[i] === '"') {
        const closeIdx = text.indexOf('"', i + 1);
        if (closeIdx !== -1) {
          // Flush any plain text before this quote
          if (plain) { segments.push({ text: plain, quoted: false }); plain = ''; }
          segments.push({ text: text.slice(i, closeIdx + 1), quoted: true });
          i = closeIdx + 1;
        } else {
          // No closing quote — treat as plain
          plain += text[i++];
        }
      } else {
        plain += text[i++];
      }
    }
    if (plain) segments.push({ text: plain, quoted: false });
    return segments;
  }

  // Advance to the next line or part; called on click/keypress or auto-advance timer
  advanceBalconyLine(timestamp) {
    const lines = this.getBalconyLines();
    const elapsed = timestamp - this.balconyLineStartTime;
    const currentLine = lines[this.balconyLineIndex] ?? '';
    const fullyTyped = elapsed >= currentLine.length * BALCONY_CHAR_DELAY_MS;

    // If still typing, snap to full line immediately
    if (!fullyTyped) {
      // force snap by setting lineStartTime to far in the past
      this.balconyLineStartTime = timestamp - currentLine.length * BALCONY_CHAR_DELAY_MS;
      this.balconyLineFullyTypedTime = timestamp;
      return;
    }

    // If part 1 is done and we just showed the last line, start crossfade then part 2
    if (this.balconyPart === 1 && this.balconyLineIndex >= lines.length - 1) {
      if (!this.balconyCrossfadeStartTime) {
        this.balconyCrossfadeStartTime = timestamp;
      }
      return;
    }

    // If part 2 is done, go to Princess and Demon scene
    if (this.balconyPart === 2 && this.balconyLineIndex >= lines.length - 1) {
      this.startPrincessDemonPage(timestamp);
      return;
    }

    // Advance to next line
    this.balconyLineIndex++;
    this.balconyLineStartTime = timestamp;
    this.balconyLineFullyTypedTime = 0;
  }

  drawBalconyPage(timestamp) {
    if (!this.balconyStartTime) {
      this.balconyStartTime = timestamp;
      this.balconyLineStartTime = timestamp + BALCONY_FADE_IN_MS;
    }

    const elapsed = timestamp - this.balconyStartTime;
    const imageOpacity = Math.min(elapsed / BALCONY_FADE_IN_MS, 1);

    // Crossfade from balcony to balcony_sand at end of part 1
    const crossfadeElapsed = this.balconyCrossfadeStartTime
      ? timestamp - this.balconyCrossfadeStartTime
      : 0;
    const crossfadeProgress = this.balconyCrossfadeStartTime
      ? Math.min(crossfadeElapsed / BALCONY_CROSSFADE_MS, 1)
      : 0;

    // Switch to part 2 once crossfade done
    if (this.balconyCrossfadeStartTime && crossfadeProgress >= 1 && this.balconyPart === 1) {
      this.balconyPart = 2;
      this.balconyLineIndex = 0;
      this.balconyLineStartTime = timestamp;
      this.balconyLineFullyTypedTime = 0;
    }

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();

    // Draw balcony image fading in, then crossfading to sand
    this.ctx.globalAlpha = imageOpacity * (1 - crossfadeProgress);
    this.ctx.drawImage(this.balconyImage, 0, 0);

    if (this.balconyCrossfadeStartTime) {
      this.ctx.globalAlpha = imageOpacity * crossfadeProgress;
      this.ctx.drawImage(this.balconySandImage, 0, 0);
    }

    this.ctx.restore();

    // Draw text: visible in part 1 (before crossfade) and part 2 (after crossfade)
    const isCrossfading = this.balconyCrossfadeStartTime && crossfadeProgress < 1;
    if (imageOpacity > 0 && !isCrossfading) {
      this.drawBalconyText(timestamp);
    }

    // Auto-advance balcony lines after BALCONY_AUTO_ADVANCE_MS once a line is fully typed
    // Runs in part 1 (before crossfade) and part 2 (after crossfade completes), not during crossfade
    if (!this.balconyCrossfadeStartTime || (this.balconyPart === 2 && !isCrossfading)) {
      const lines = this.getBalconyLines();
      const currentLine = lines[this.balconyLineIndex] ?? '';
      const lineElapsed = timestamp - this.balconyLineStartTime;
      const lineFullyTyped = lineElapsed >= currentLine.length * BALCONY_CHAR_DELAY_MS;

      if (lineFullyTyped) {
        if (!this.balconyLineFullyTypedTime) {
          this.balconyLineFullyTypedTime = timestamp;
        } else if (timestamp - this.balconyLineFullyTypedTime >= BALCONY_AUTO_ADVANCE_MS) {
          this.advanceBalconyLine(timestamp);
        }
      }
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawBalconyText(timestamp) {
    const lines = this.getBalconyLines();
    const line = lines[this.balconyLineIndex] ?? '';
    const elapsed = timestamp - this.balconyLineStartTime;
    const visibleCount = Math.min(
      Math.floor(Math.max(elapsed, 0) / BALCONY_CHAR_DELAY_MS),
      line.length
    );

    if (visibleCount === 0) {
      return;
    }

    this.ctx.save();
    this.ctx.globalAlpha = 1;
    this.ctx.font = BALCONY_FONT;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    const wrapped = this.wrapBalconyText(line, BALCONY_TEXT_MAX_WIDTH);
    const quotedMap = this.buildQuotedMap(line);

    for (let i = 0; i < wrapped.length; i++) {
      const { text: chunk, start: chunkStart } = wrapped[i];
      if (chunkStart >= visibleCount) break;
      const chunkVisible = Math.min(visibleCount - chunkStart, chunk.length);
      const y = BALCONY_TEXT_Y + i * BALCONY_LINE_HEIGHT;
      this.drawWrappedSegmentedText(line, quotedMap, chunkStart, chunkVisible, BALCONY_TEXT_X, y, DIRECT_SPEECH_TEXT_COLOR, DIRECT_SPEECH_SHADOW_COLOR, DIRECT_SPEECH_SHADOW_OFFSET);
    }

    this.ctx.restore();
  }

  // Draws `visibleCount` characters of `fullText` at (x,y), honouring matched "..." pairs.
  // Parsing is done on fullText so quote pairs aren't broken by the typing cursor.
  // Returns a boolean array: quotedMap[i] = true if char i of text is inside a matched "..." pair
  buildQuotedMap(text) {
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

  // Draws `visibleCount` characters of `fullLine` starting at char offset `chunkStart`,
  // using the quoted map built from the full line for correct styling.
  drawWrappedSegmentedText(fullLine, quotedMap, chunkStart, chunkVisible, x, y, plainColor, shadowColor, shadowOffset) {
    // Walk character by character, batching consecutive same-style chars for efficiency
    let curX = x;
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
      if (q !== batchQuoted) {
        flush(i);
        batchStart = i;
        batchQuoted = q;
      }
    }
    flush(chunkStart + chunkVisible);
  }

  drawSegmentedText(fullText, visibleCount, x, y, plainColor, shadowColor, shadowOffset) {
    const segments = this.parseQuoteSegments(fullText);
    let curX = x;
    let drawn = 0;
    for (const seg of segments) {
      if (drawn >= visibleCount) break;
      const visible = seg.text.slice(0, visibleCount - drawn);
      if (seg.quoted) {
        this.ctx.fillStyle = shadowColor;
        this.ctx.fillText(visible, curX + shadowOffset, y + shadowOffset);
        this.ctx.fillStyle = plainColor;
        this.ctx.fillText(visible, curX, y);
      } else {
        this.ctx.fillStyle = plainColor;
        this.ctx.fillText(visible, curX, y);
      }
      curX += this.ctx.measureText(visible).width;
      drawn += seg.text.length;
    }
  }

  // Returns [{text, start}] where start is the char offset in the original text
  wrapBalconyText(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let current = '';
    let currentStart = 0;
    let pos = 0;

    for (const word of words) {
      const candidate = current ? current + ' ' + word : word;
      if (this.ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        if (current) {
          lines.push({ text: current, start: currentStart });
          currentStart = pos;
        }
        current = word;
        currentStart = pos;
      }
      pos += word.length + 1; // +1 for the space
    }
    if (current) lines.push({ text: current, start: currentStart });
    return lines;
  }

  drawCopyrightText(opacity) {
    this.ctx.globalAlpha = opacity;
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '16px "Press Start 2P", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    const startY = 290;
    const lineHeight = 20;

    for (let i = 0; i < INTRO_COPYRIGHT_LINES.length; i++) {
      this.ctx.fillText(INTRO_COPYRIGHT_LINES[i], this.canvas.width / 2, startY + i * lineHeight);
    }
  }

  drawStoryText(y, opacity) {
    this.ctx.globalAlpha = opacity;
    this.ctx.drawImage(this.storyTextCanvas, 0, y);
  }

  drawDemonSpeechText(characterCount) {
    this.ctx.font = DEMON_SPEECH_FONT;
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'top';

    let remainingCharacters = characterCount;

    for (let i = 0; i < DEMON_SPEECH_LINES.length; i++) {
      const line = DEMON_SPEECH_LINES[i];
      const visibleLine = line.slice(0, Math.max(Math.min(remainingCharacters, line.length), 0));

      if (visibleLine) {
        this.drawShadowedText(
          visibleLine,
          this.canvas.width / 2,
          DEMON_SPEECH_START_Y + i * DEMON_SPEECH_LINE_HEIGHT
        );
      }

      remainingCharacters -= line.length;
    }
  }

  drawShadowedText(text, x, y) {
    this.ctx.fillStyle = DIRECT_SPEECH_SHADOW_COLOR;
    this.ctx.fillText(
      text,
      x + DIRECT_SPEECH_SHADOW_OFFSET,
      y + DIRECT_SPEECH_SHADOW_OFFSET
    );

    this.ctx.fillStyle = DIRECT_SPEECH_TEXT_COLOR;
    this.ctx.fillText(text, x, y);
  }

  drawCreditsText(y) {
    this.ctx.fillStyle = '#fff';
    this.ctx.font = CREDITS_FONT;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    for (let i = 0; i < CREDITS_LINES.length; i++) {
      this.ctx.fillText(CREDITS_LINES[i], this.creditsX, y + i * CREDITS_LINE_HEIGHT);
    }
  }

  drawExplosionGems(progress) {
    if (progress >= 1) {
      return;
    }

    for (const gem of this.explosionGems) {
      const x = gem.x + gem.dx * progress;
      const y = gem.y + gem.dy * progress;
      this.ctx.drawImage(gem.image, Math.round(x), Math.round(y));
    }
  }

  createStoryTextCanvas() {
    const textCanvas = document.createElement('canvas');
    textCanvas.width = this.canvas.width;
    textCanvas.height = STORY_LINES.length * STORY_LINE_HEIGHT;

    const textCtx = textCanvas.getContext('2d');
    textCtx.imageSmoothingEnabled = false;
    textCtx.clearRect(0, 0, textCanvas.width, textCanvas.height);
    textCtx.fillStyle = '#fff';
    textCtx.font = STORY_FONT;
    textCtx.textAlign = 'left';
    textCtx.textBaseline = 'top';

    const x = 6;

    for (let i = 0; i < STORY_LINES.length; i++) {
      textCtx.fillText(STORY_LINES[i], x, i * STORY_LINE_HEIGHT);
    }

    return textCanvas;
  }

  getCreditsTextX() {
    this.ctx.save();
    this.ctx.font = CREDITS_FONT;

    const textWidth = Math.max(...CREDITS_LINES.map((line) => this.ctx.measureText(line).width));

    this.ctx.restore();

    return Math.round((this.canvas.width - textWidth) / 2);
  }

  isStoryWaitingForInput() {
    return this.page === PAGE_STORY && !!this.storyCrossfadeStartTime;
  }

  isBrokenNecWaitingForInput() {
    if (this.page !== PAGE_BROKEN_NEC || this.brokenNecFadeOutStartTime) {
      return false;
    }

    return performance.now() - this.brokenNecStartTime >= NEC_FLASH_IN_MS + NEC_GEM_EXPLODE_MS;
  }

  startBrokenNecFadeOut() {
    if (this.brokenNecFadeOutStartTime) {
      return;
    }

    this.brokenNecFadeOutStartTime = performance.now();
  }

  shouldAutoAdvanceBrokenNec(timestamp) {
    const waitBeforeFadeMs = Math.max(NEC_BROKEN_AUTO_ADVANCE_MS - NEC_BROKEN_FADE_OUT_MS, 0);

    return timestamp - this.brokenNecStartTime >=
      NEC_FLASH_IN_MS + NEC_GEM_EXPLODE_MS + waitBeforeFadeMs;
  }

  isDemonSequenceComplete(timestamp = performance.now()) {
    if (this.page !== PAGE_DEMON) {
      return false;
    }

    return timestamp - this.demonStartTime >= DEMON_SEQUENCE.length * DEMON_FRAME_DELAY_MS;
  }

  isDemonSpeechWaitingForInput() {
    if (this.page !== PAGE_DEMON_SPEECH || this.demonSpeechFadeOutStartTime) {
      return false;
    }

    return this.getVisibleDemonSpeechCharacterCount(performance.now() - this.demonSpeechStartTime) >=
      this.getDemonSpeechCharacterCount();
  }

  startDemonSpeechFadeOut() {
    if (this.demonSpeechFadeOutStartTime) {
      return;
    }

    this.demonSpeechFadeOutStartTime = performance.now();
  }

  isNecklaceWaitingForInput() {
    if (this.page !== PAGE_NECKLACE || this.necklaceFadeOutStartTime) {
      return false;
    }

    const pannoStartTime = NECKLACE_FADE_IN_MS * 2 + NECKLACE_LAYER_DELAY_MS * 2;

    return performance.now() - this.necklaceStartTime >= 0;
  }

  startNecklaceFadeOut() {
    if (this.necklaceFadeOutStartTime) {
      return;
    }

    this.necklaceFadeOutStartTime = performance.now();
  }

  skipStoryScroll() {
    if (this.storyCrossfadeStartTime) {
      return;
    }

    this.storyCrossfadeStartTime = performance.now();
  }

  getBrokenNecFlashOpacity(elapsed) {
    if (elapsed < NEC_FLASH_IN_MS) {
      return elapsed / NEC_FLASH_IN_MS;
    }

    const flashOutElapsed = elapsed - NEC_FLASH_IN_MS;
    if (flashOutElapsed < NEC_FLASH_OUT_MS) {
      return 1 - flashOutElapsed / NEC_FLASH_OUT_MS;
    }

    return 0;
  }

  getVisibleDemonSpeechCharacterCount(elapsed) {
    return Math.min(
      Math.floor(elapsed / DEMON_SPEECH_CHAR_DELAY_MS),
      this.getDemonSpeechCharacterCount()
    );
  }

  getDemonSpeechCharacterCount() {
    return DEMON_SPEECH_LINES.reduce((total, line) => total + line.length, 0);
  }

  getDemonSpeechImage(elapsed, characterCount) {
    if (characterCount >= this.getDemonSpeechCharacterCount()) {
      return this.demonImages[3];
    }

    const mouthFrame = Math.floor(elapsed / DEMON_MOUTH_FRAME_DELAY_MS) % 2;
    return this.demonImages[[4, 5][mouthFrame]];
  }

  createExplosionGems() {
    return NEC_GEM_COORDS.map((gem) => {
      const image = gem.image === 'red' ? this.redGemImage : this.blueGemImage;
      const centerX = gem.x + image.width / 2;
      const centerY = gem.y + image.height / 2;
      const baseAngle = Math.atan2(
        centerY - NEC_GEM_EXPLOSION_CENTER.y,
        centerX - NEC_GEM_EXPLOSION_CENTER.x
      );
      const angle = baseAngle + (Math.random() - 0.5) * 1.1;
      const ray = this.getCanvasEdgeRay(centerX, centerY, angle);

      return {
        image,
        x: gem.x,
        y: gem.y,
        dx: ray.dx,
        dy: ray.dy
      };
    });
  }

  getCanvasEdgeRay(x, y, angle) {
    const vx = Math.cos(angle);
    const vy = Math.sin(angle);
    const distances = [];

    if (vx > 0) {
      distances.push((this.canvas.width - x) / vx);
    } else if (vx < 0) {
      distances.push(-x / vx);
    }

    if (vy > 0) {
      distances.push((this.canvas.height - y) / vy);
    } else if (vy < 0) {
      distances.push(-y / vy);
    }

    const distance = Math.min(...distances.filter((value) => value >= 0));

    return {
      dx: vx * distance,
      dy: vy * distance
    };
  }

  startPrincessDemonPage(timestamp) {
    this.page = PAGE_PRINCESS_DEMON;
    this.princessDemonStartTime = timestamp;
    this.princessDemonLineIndex = 0;
    this.princessDemonLineStartTime = 0; // set once crossfade completes
    this.princessDemonLineFullyTypedTime = 0;
    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawPrincessDemonPage(timestamp) {
    if (!this.princessDemonStartTime) {
      this.princessDemonStartTime = timestamp;
    }

    const elapsed = timestamp - this.princessDemonStartTime;

    // Phase 1: draw balcony_sand with curtain closing (0 → CURTAIN_MS)
    // Phase 2: crossfade sand→princess (CURTAIN_MS → CURTAIN_MS + PRINCESS_CROSSFADE_MS)
    const curtainProgress = Math.min(elapsed / CURTAIN_MS, 1);
    const crossfadeElapsed = Math.max(elapsed - CURTAIN_MS, 0);
    const crossfadeProgress = Math.min(crossfadeElapsed / PRINCESS_CROSSFADE_MS, 1);

    // Background
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();

    if (crossfadeProgress === 0) {
      // Phase 1: sand at full opacity; curtain animation draws on top below
      this.ctx.globalAlpha = 1;
      this.ctx.drawImage(this.balconySandImage, 0, 0);
    } else {
      // Phase 2: composite sand+closed-curtain as one layer fading out, princess fading in.
      // Draw to offscreen so sand and curtain rect share the same globalAlpha.
      const offscreen = document.createElement('canvas');
      offscreen.width = this.canvas.width;
      offscreen.height = this.canvas.height;
      const off = offscreen.getContext('2d');
      off.imageSmoothingEnabled = false;
      off.drawImage(this.balconySandImage, 0, 0);
      off.fillStyle = CURTAIN_COLOR;
      off.fillRect(CURTAIN_X1, CURTAIN_Y1, CURTAIN_X2 - CURTAIN_X1, CURTAIN_Y2 - CURTAIN_Y1);

      this.ctx.globalAlpha = 1 - crossfadeProgress;
      this.ctx.drawImage(offscreen, 0, 0);

      this.ctx.globalAlpha = crossfadeProgress;
      this.ctx.drawImage(this.princessImage, 0, 0);
    }

    this.ctx.restore();

    // Phase 1 curtain animation: inward-shrinking colored border over the rect
    if (curtainProgress > 0 && crossfadeProgress === 0) {
      const rx1 = CURTAIN_X1;
      const ry1 = CURTAIN_Y1;
      const rx2 = CURTAIN_X2;
      const ry2 = CURTAIN_Y2;
      const rw = rx2 - rx1;
      const rh = ry2 - ry1;

      // Maximum inset is half the smaller dimension so all 4 sides meet in the middle
      const maxInset = Math.floor(Math.min(rw, rh) / 2);
      // How many pixels of inset the curtain has reached so far
      const inset = Math.ceil(curtainProgress * maxInset);

      this.ctx.save();
      this.ctx.fillStyle = CURTAIN_COLOR;

      // Fill ring by ring from outside in up to current inset
      // Efficient: just fill the full rect and cut out the remaining uncovered interior
      // Outer rect fill (covers entire curtain area first)
      this.ctx.fillRect(rx1, ry1, rw, rh);

      // Cut out the still-uncovered interior by drawing black (background colour) over it
      const innerX = rx1 + inset;
      const innerY = ry1 + inset;
      const innerW = rw - inset * 2;
      const innerH = rh - inset * 2;

      if (innerW > 0 && innerH > 0 && curtainProgress < 1) {
        // Re-draw the sand (or princess) image clipped to the interior so it shows through
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(innerX, innerY, innerW, innerH);
        this.ctx.clip();
        this.ctx.globalAlpha = 1 - crossfadeProgress;
        this.ctx.drawImage(this.balconySandImage, 0, 0);
        if (crossfadeProgress > 0) {
          this.ctx.globalAlpha = crossfadeProgress;
          this.ctx.drawImage(this.princessImage, 0, 0);
        }
        this.ctx.restore();
      }

      this.ctx.restore();
    }

    if (crossfadeProgress >= 1) {
      // Hold on princess.png — start typing text, wait for user input (skipPage → finish())
      this.ctx.save();
      this.ctx.globalAlpha = 1;
      this.ctx.drawImage(this.princessImage, 0, 0);
      this.ctx.restore();

      // Start line timer on first frame after crossfade
      if (!this.princessDemonLineStartTime) {
        this.princessDemonLineStartTime = timestamp;
      }

      this.drawPrincessDemonText(timestamp);

      this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
      return;
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawPrincessDemonText(timestamp) {
    const line = PRINCESS_DEMON_LINES[this.princessDemonLineIndex] ?? '';
    const elapsed = timestamp - this.princessDemonLineStartTime;
    const visibleCount = Math.min(
      Math.floor(Math.max(elapsed, 0) / BALCONY_CHAR_DELAY_MS),
      line.length
    );

    if (visibleCount === 0) {
      return;
    }

    this.ctx.save();
    this.ctx.globalAlpha = 1;
    this.ctx.font = BALCONY_FONT;
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';

    const wrapped = this.wrapBalconyText(line, BALCONY_TEXT_MAX_WIDTH);
    const quotedMap = this.buildQuotedMap(line);

    for (let i = 0; i < wrapped.length; i++) {
      const { text: chunk, start: chunkStart } = wrapped[i];
      if (chunkStart >= visibleCount) break;
      const chunkVisible = Math.min(visibleCount - chunkStart, chunk.length);
      const y = BALCONY_TEXT_Y + i * BALCONY_LINE_HEIGHT;
      this.drawWrappedSegmentedText(line, quotedMap, chunkStart, chunkVisible, BALCONY_TEXT_X, y, DIRECT_SPEECH_TEXT_COLOR, DIRECT_SPEECH_SHADOW_COLOR, DIRECT_SPEECH_SHADOW_OFFSET);
    }

    this.ctx.restore();
  }

  finish() {
    if (!this.active) {
      return;
    }

    this.active = false;
    cancelAnimationFrame(this.frameId);
    this.screen.classList.add('hidden');
    this.onComplete();
  }
}
