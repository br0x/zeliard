const INTRO_FADE_IN_MS = 2000;
const INTRO_FADE_OUT_MS = 2000;
const INTRO_LOGO_SRC = 'assets/images/opdemo/ttl3_logo.png';
const INTRO_NEC_SRC = 'assets/images/opdemo/nec.png';
const INTRO_NEC_GOLD_SRC = 'assets/images/opdemo/nec_gold.png';
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
const STORY_IMAGE_FADE_IN_MS = 2000;
const STORY_CROSSFADE_MS = 2000;
const STORY_FONT = '14px "Press Start 2P", monospace';
const STORY_LINE_HEIGHT = 20;
const STORY_START_Y = 400;
const STORY_SCROLL_SPEED = 28;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    image.src = src;
  });
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
    this.storyTextCanvas = null;
  }

  async start() {
    this.active = true;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.page = PAGE_LOGO;
    this.storyStartTime = 0;
    this.storyCrossfadeStartTime = 0;
    this.ctx.imageSmoothingEnabled = false;
    this.screen.classList.remove('hidden');

    try {
      [this.logoImage, this.necImage, this.necGoldImage] = await Promise.all([
        loadImage(INTRO_LOGO_SRC),
        loadImage(INTRO_NEC_SRC),
        loadImage(INTRO_NEC_GOLD_SRC),
        document.fonts.ready
      ]).then(([logo, nec, necGold]) => [logo, nec, necGold]);
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

    if (this.page === PAGE_STORY && this.isStoryWaitingForInput()) {
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

    this.drawStoryPage(timestamp);
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

    const x = 24;

    for (let i = 0; i < STORY_LINES.length; i++) {
      textCtx.fillText(STORY_LINES[i], x, i * STORY_LINE_HEIGHT);
    }

    return textCanvas;
  }

  isStoryWaitingForInput() {
    if (this.page !== PAGE_STORY || !this.storyCrossfadeStartTime) {
      return false;
    }

    return performance.now() - this.storyCrossfadeStartTime >= STORY_CROSSFADE_MS;
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
