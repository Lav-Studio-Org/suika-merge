// Renders app icons, Android splash screens and Play Store art from the game's own orb drawing.
// Usage: node scripts/make-art.cjs   (needs Playwright + Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const RES = path.join(ROOT, 'android/app/src/main/res');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 800 } });
  await page.goto('file://' + path.join(ROOT, 'index.html'));
  await page.waitForFunction(() => window.SA && SA.drawOrb);
  await page.evaluate(() => document.fonts.ready);

  const render = (kind, w, h, opts = {}) => page.evaluate(({ kind, w, h, opts }) => {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const S = Math.min(w, h);
    const bg = () => {
      const g = c.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      g.addColorStop(0, '#6b46a8'); g.addColorStop(1, '#2b1d4e');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    };
    const sparkle = (x, y, r) => {
      c.fillStyle = '#ffe680';
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.3 : r;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      c.fill();
    };
    // the mark: "1 + 1 -> 2" squeezed into one cluster
    const mark = (cx, cy, s) => {
      SA.drawOrb(c, 0, s * 0.2, false, cx - s * 0.27, cy - s * 0.2, SA.THEMES[0].colors);
      SA.drawOrb(c, 0, s * 0.2, false, cx + s * 0.27, cy - s * 0.24, SA.THEMES[0].colors);
      SA.drawOrb(c, 1, s * 0.31, false, cx, cy + s * 0.13, SA.THEMES[0].colors);
      sparkle(cx + s * 0.4, cy + s * 0.3, s * 0.07);
      sparkle(cx - s * 0.42, cy + s * 0.2, s * 0.05);
    };
    if (kind === 'icon') {
      bg();
      mark(w / 2, h / 2, S * 0.92);
      if (opts.round) {
        c.globalCompositeOperation = 'destination-in';
        c.beginPath(); c.arc(w / 2, h / 2, S / 2, 0, Math.PI * 2); c.fill();
      }
    } else if (kind === 'foreground') {
      mark(w / 2, h / 2, S * 0.56); // keep inside the adaptive icon safe zone
    } else if (kind === 'splash') {
      c.fillStyle = '#2b1d4e'; c.fillRect(0, 0, w, h);
      mark(w / 2, h / 2, S * 0.38);
    } else if (kind === 'feature') {
      bg();
      const cols = SA.THEMES[0].colors;
      [[0, 60, 420, 30], [2, 950, 80, 44], [4, 985, 480, 55], [6, 80, 80, 40], [3, 1010, 300, 26]].forEach(([l, x, y, r]) =>
        SA.drawOrb(c, l, r, false, x, y, cols));
      mark(250, 250, 330);
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.font = '700 110px Fredoka';
      c.lineWidth = 14; c.strokeStyle = '#fff';
      c.strokeText('Suika', 450, 185); c.fillStyle = '#ff6b81'; c.fillText('Suika', 450, 185);
      c.strokeText('Angka', 450, 300); c.fillStyle = '#4d7cfe'; c.fillText('Angka', 450, 300);
      c.font = '600 34px Fredoka'; c.fillStyle = '#fff7e8';
      c.fillText('Gabungkan angka, raih angka 11!', 455, 395);
    }
    return cv.toDataURL('image/png');
  }, { kind, w, h, opts });

  const save = async (file, kind, w, h, opts) => {
    const url = await render(kind, w, h, opts);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  };

  // launcher icons
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    await save(`${RES}/mipmap-${d}/ic_launcher.png`, 'icon', 48 * k, 48 * k);
    await save(`${RES}/mipmap-${d}/ic_launcher_round.png`, 'icon', 48 * k, 48 * k, { round: true });
    await save(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, 'foreground', 108 * k, 108 * k);
  }
  fs.writeFileSync(`${RES}/values/ic_launcher_background.xml`,
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#3D2766</color>\n</resources>\n');

  // splash screens: keep each existing file's size
  const { execSync } = require('child_process');
  for (const dir of fs.readdirSync(RES).filter((d) => d.startsWith('drawable'))) {
    const f = `${RES}/${dir}/splash.png`;
    if (!fs.existsSync(f)) continue;
    const m = execSync(`file "${f}"`).toString().match(/(\d+) x (\d+)/);
    await save(f, 'splash', +m[1], +m[2]);
  }

  // web + store art
  await save(`${ROOT}/icon-512.png`, 'icon', 512, 512);
  await save(`${ROOT}/icon-180.png`, 'icon', 180, 180);
  await save(`${ROOT}/store/icon-512.png`, 'icon', 512, 512);
  await save(`${ROOT}/store/feature-graphic.png`, 'feature', 1024, 500);

  await browser.close();
  console.log('art done');
})();
