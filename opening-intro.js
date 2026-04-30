const INTRO_FADE_IN_MS = 2000;
const INTRO_FADE_OUT_MS = 2000;
const INTRO_LOGO_SRC = 'assets/images/opdemo/ttl3_logo.png';
const INTRO_COPYRIGHT_LINES = [
  'Copyright (C)1987,1990 GAME ARTS',
  'Copyright (C)1990 Sierra On-Line',
  'Web port 2026, brox//THIRTEEN'
];

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
    this.logoImage = null;
  }

  async start() {
    this.active = true;
    this.startTime = 0;
    this.fadeOutStartTime = 0;
    this.ctx.imageSmoothingEnabled = false;
    this.screen.classList.remove('hidden');

    try {
      [this.logoImage] = await Promise.all([
        loadImage(INTRO_LOGO_SRC),
        document.fonts.ready
      ]).then(([logo]) => [logo]);
    } catch (error) {
      console.error(error);
      this.finish();
      return;
    }

    this.frameId = requestAnimationFrame((timestamp) => this.draw(timestamp));
  }

  skipPage() {
    if (!this.active || this.fadeOutStartTime) {
      return;
    }

    this.fadeOutStartTime = performance.now();
  }

  draw(timestamp) {
    if (!this.active) {
      return;
    }

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
      this.finish();
      return;
    }

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
