const INTRO_FADE_IN_MS = 2000;
const INTRO_FADE_OUT_MS = 2000;
const INTRO_LOGO_SRC = 'assets/images/opdemo/ttl3_logo.png';
const INTRO_NEC_SRC = 'assets/images/opdemo/nec.png';
const INTRO_NEC_GOLD_SRC = 'assets/images/opdemo/nec_gold.png';
const INTRO_NEC_BROKEN_SRC = 'assets/images/opdemo/nec_broken.png';
const INTRO_BLUE_GEM_SRC = 'assets/images/opdemo/blue.png';
const INTRO_RED_GEM_SRC = 'assets/images/opdemo/red.png';
const INTRO_DMAO_SRCS = [
  'assets/images/opdemo/dmao0.png',
  'assets/images/opdemo/dmao1.png',
  'assets/images/opdemo/dmao2.png',
  'assets/images/opdemo/dmao3.png'
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

const PAGE_LOGO = 'logo';
const PAGE_STORY = 'story';
const PAGE_BROKEN_NEC = 'brokenNec';
const PAGE_DMAO = 'dmao';
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
  { image: 'red', x: 299, y: 172 }
];
const DMAO_FRAME_DELAY_MS = 500;
const DMAO_SEQUENCE = [0, 1, 0, 1, 2, 3];

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
    this.dmaoImages = [];
    this.storyTextCanvas = null;
    this.brokenNecStartTime = 0;
    this.brokenNecFadeOutStartTime = 0;
    this.dmaoStartTime = 0;
    this.explosionGems = [];
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
    this.dmaoStartTime = 0;
    this.explosionGems = [];
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
        ...this.dmaoImages
      ] = await Promise.all([
        loadImage(INTRO_LOGO_SRC),
        loadImage(INTRO_NEC_SRC),
        loadImage(INTRO_NEC_GOLD_SRC),
        loadImage(INTRO_NEC_BROKEN_SRC),
        loadImage(INTRO_BLUE_GEM_SRC),
        loadImage(INTRO_RED_GEM_SRC),
        ...INTRO_DMAO_SRCS.map((src) => loadImage(src)),
        loadStoryFont()
      ]).then(([logo, nec, necGold, necBroken, blueGem, redGem, ...dmaoImages]) => [
        logo,
        nec,
        necGold,
        necBroken,
        blueGem,
        redGem,
        ...dmaoImages.slice(0, INTRO_DMAO_SRCS.length)
      ]);
      this.storyTextCanvas = this.createStoryTextCanvas();
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
      if (this.isStoryWaitingForInput()) {
        return;
      }

      this.skipStoryScroll();
      return;
    }

    if (this.page === PAGE_BROKEN_NEC) {
      if (this.isBrokenNecWaitingForInput()) {
        this.startBrokenNecFadeOut();
      }
      return;
    }

    if (this.page === PAGE_DMAO && this.isDmaoWaitingForInput()) {
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

    this.drawDmaoPage(timestamp);
  }

  drawLogoPage(timestamp) {
    if (!this.startTime) {
      this.startTime = timestamp;
    }

    const elapsed = timestamp - this.startTime;
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

  startDmaoPage(timestamp) {
    this.page = PAGE_DMAO;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.dmaoStartTime = timestamp;
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
      this.startDmaoPage(timestamp);
      return;
    }

    if (!this.brokenNecFadeOutStartTime && this.shouldAutoAdvanceBrokenNec(timestamp)) {
      this.brokenNecFadeOutStartTime = timestamp;
    }

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
  }

  drawDmaoPage(timestamp) {
    const elapsed = timestamp - this.dmaoStartTime;
    const sequenceIndex = Math.min(
      Math.floor(elapsed / DMAO_FRAME_DELAY_MS),
      DMAO_SEQUENCE.length - 1
    );
    const image = this.dmaoImages[DMAO_SEQUENCE[sequenceIndex]];

    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(image, 0, 0);

    this.frameId = requestAnimationFrame((nextTimestamp) => this.draw(nextTimestamp));
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

  isDmaoWaitingForInput() {
    if (this.page !== PAGE_DMAO) {
      return false;
    }

    return performance.now() - this.dmaoStartTime >= DMAO_SEQUENCE.length * DMAO_FRAME_DELAY_MS;
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
