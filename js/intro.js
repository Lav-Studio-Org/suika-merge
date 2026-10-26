// Launch intro: Lav Studio card, then the title card where two 1s drop and merge into a 2, then home.
// The markup and the decision to show it live at the top of index.html.
(function () {
  const el = document.getElementById('intro');
  if (!el) return;

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const LAV_MS = reduce ? 900 : 1700;   // Lav Studio card
  const GAME_MS = reduce ? 1200 : 2100; // title card
  const t0 = window.__introT0 || performance.now();
  let stage = 'lav', done = false, raf = 0;

  const cv = document.getElementById('intro-cv');
  const c = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = 260 * dpr; cv.height = 170 * dpr;

  const easeOutBack = (t) => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
  const easeOutBounce = (t) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  };
  const clamp = (v) => Math.max(0, Math.min(1, v));

  // the merge, in ms from the start of the title card
  const FALL = 520, SLIDE = 180, POP = 320;
  const sparks = Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * Math.PI * 2 + 0.2, d: 52 + (i % 3) * 10 }));

  function drawMerge(t) {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, 260, 170);
    const floorY = 112, r1 = 30;
    if (t < FALL + SLIDE) {
      const f = easeOutBounce(clamp(t / FALL));
      const s = clamp((t - FALL) / SLIDE);
      const gap = 44 * (1 - s * s);
      const y = -40 + (floorY - -40) * f;
      SA.drawOrb(c, 0, r1, false, 130 - gap, y);
      SA.drawOrb(c, 0, r1, false, 130 + gap, y - (1 - f) * 30);
      return;
    }
    const p = clamp((t - FALL - SLIDE) / POP);
    const r2 = 44 * (reduce ? 1 : easeOutBack(p));
    // ring of sparkles flying out of the merge
    if (p < 1 || t < FALL + SLIDE + POP + 260) {
      const q = clamp((t - FALL - SLIDE) / (POP + 260));
      c.fillStyle = 'rgba(255,230,128,' + (1 - q) + ')';
      sparks.forEach((sp) => {
        const d = sp.d * Math.sqrt(q), x = 130 + Math.cos(sp.a) * d, y = floorY - 12 + Math.sin(sp.a) * d;
        star(x, y, 7 * (1 - q * 0.6));
      });
    }
    SA.drawOrb(c, 1, Math.max(1, r2), t > FALL + SLIDE + POP + 900 && t < FALL + SLIDE + POP + 1040, 130, floorY - 12);
  }
  function star(x, y, r) {
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.32 : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.fill();
  }

  function frame(now) {
    if (done) return;
    const t = now - t0;
    if (stage === 'lav' && t >= LAV_MS) { stage = 'game'; el.classList.add('game'); }
    if (stage === 'game') {
      drawMerge(t - LAV_MS);
      if (t >= LAV_MS + GAME_MS) return finish();
    }
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    el.classList.add('out');
    document.body.classList.add('home-enter');
    setTimeout(() => el.remove(), 380);
    setTimeout(() => document.body.classList.remove('home-enter'), 1400);
  }

  // a tap skips the rest; show the hint only after the logo has settled
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); finish(); });
  setTimeout(() => el.classList.add('can-skip'), 900);

  const start = () => { raf = requestAnimationFrame(frame); };
  // wait for Fredoka so the title doesn't swap fonts mid-animation (never longer than a moment)
  if (document.fonts && document.fonts.load) {
    Promise.race([document.fonts.load('700 64px Fredoka'), new Promise((r) => setTimeout(r, 400))]).then(start, start);
  } else start();
})();
