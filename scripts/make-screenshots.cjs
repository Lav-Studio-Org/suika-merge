// Captures 1080x1920 Play Store screenshots from the web build.
// Usage: serve the repo on :8765 (python3 -m http.server 8765), then node scripts/make-screenshots.cjs
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.resolve(__dirname, '../store/screenshots');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('suika.profile.v1', JSON.stringify({
      coins: 1240, best: 4820, bestLevel: 8, games: 12, tutorialDone: true, owned: ['klasik', 'permen'],
      daily: { last: new Date().toISOString().slice(0, 10), streak: 3 },
    }));
  });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/1-home.png` });

  await page.locator('#btn-play').tap({ force: true });
  await page.waitForTimeout(400);
  // build a pleasing mid-game board
  await page.evaluate(() => {
    const L = [[7, 90, 540], [6, 300, 560], [5, 200, 470], [4, 340, 440], [3, 60, 420], [2, 130, 390], [1, 260, 400], [0, 300, 380], [2, 360, 360], [1, 40, 360]];
    L.forEach(([l, x, y]) => window.__suika.spawn(l, x, y - 200));
  });
  await page.waitForTimeout(2500);
  for (const x of [120, 230]) { await page.evaluate((x) => window.__suika.drop(x), x); await page.waitForTimeout(900); }
  await page.screenshot({ path: `${OUT}/2-play.png` });

  await page.evaluate(() => document.querySelector('[data-open="ov-shop"]').click());
  await page.locator('#btn-pause').tap({ force: true });
  await page.waitForTimeout(100);
  await page.evaluate(() => { document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show')); document.getElementById('ov-shop').classList.add('show'); });
  await page.evaluate(() => document.querySelector('[data-open="ov-shop"]').click());
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/3-shop.png` });

  await page.evaluate(() => { document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show')); document.querySelector('[data-open="ov-missions"]').click(); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/4-missions.png` });
  await browser.close();
  console.log('screenshots done');
})();
