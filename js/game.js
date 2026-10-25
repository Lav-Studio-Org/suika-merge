(() => {
  'use strict';

  const { Engine, Bodies, Body, Composite, Events } = Matter;
  const { Sfx, Music, Ads, profile } = SA;

  // ---------- Config ----------
  const W = 400;            // world width
  // world height adapts to the screen shape (taller phones get a taller jar)
  const H = (() => {
    const st = document.getElementById('stage');
    const ratio = st && st.clientWidth ? st.clientHeight / st.clientWidth : 1.5;
    return Math.round(Math.max(560, Math.min(720, ratio * W)));
  })();
  const DROP_Y = 52;        // where the held orb sits
  const LINE_Y = 96;        // danger line
  const DROP_COOLDOWN = 420;
  const OVER_TIME = 2200;   // ms an orb may sit above the line
  const STEP = 1000 / 60;
  const IS_TOUCH = matchMedia('(pointer: coarse)').matches;
  const MAX_PARTICLES = IS_TOUCH ? 220 : 400;
  const REVIVE_SECONDS = 6;
  // Kilat balance: a slower drop cooldown makes spam-tapping fill the jar instead of scoring,
  // and only merges to 5+ buy time, so planned stacking beats fast tapping.
  const BLITZ_TIME = 75000;  // Kilat: round length
  const BLITZ_REVIVE = 15000;
  const BLITZ_AUTODROP = 4000; // Kilat: the held ball drops by itself after this
  const BLITZ_COOLDOWN = 700;
  const BLITZ_DROP_COST = 500; // every drop costs a little time, so tapping fast drains the clock

  const RADII = [17, 23, 30, 37, 45, 54, 63, 74, 86, 99, 114];
  const MAX_LEVEL = RADII.length - 1;
  const DROPPABLE = 5;      // levels 1..5 can be dropped

  let theme = SA.themeById(profile.theme);
  let mode = SA.modeById(profile.mode);

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const nextCanvas = $('next');
  const nextCtx = nextCanvas.getContext('2d');
  const evoCanvas = $('evo');
  const evoCtx = evoCanvas.getContext('2d');
  const scoreEl = $('score');
  const toastEl = $('toast');
  const stageEl = $('stage');

  // ---------- Helpers ----------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function easeOutBack(t) {
    t = clamp(t, 0, 1);
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
  function vibrate(ms) {
    if (!profile.settings.vibe) return;
    try { navigator.vibrate && navigator.vibrate(ms); } catch { /* ignore */ }
  }
  const coinHTML = '<span class="coin"></span>';
  const ic = (id) => `<svg class="ic" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const MISSION_ICON = { reach: ['star', 't-orange'], score: ['trophy', 't-pink'], combo: ['flame', 't-pink'], merges: ['merge', 't-blue'], games: ['pad', 't-purple'], power: ['bolt', 't-green'] };

  // ---------- Orb drawing ----------
  function drawOrb(c, level, r, blink, x = 0, y = 0, colors = theme.colors) {
    const col = colors[level];
    c.save();
    c.translate(x, y);

    const g = c.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    g.addColorStop(0, shade(col, 0.45));
    g.addColorStop(0.55, col);
    g.addColorStop(1, shade(col, -0.22));
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = g;
    c.fill();
    c.lineWidth = Math.max(1.5, r * 0.07);
    c.strokeStyle = shade(col, -0.38);
    c.stroke();

    if (level === MAX_LEVEL) {
      c.lineWidth = r * 0.05;
      c.strokeStyle = 'rgba(255,255,255,.7)';
      c.beginPath();
      c.arc(0, 0, r * 0.86, 0, Math.PI * 2);
      c.stroke();
    }

    // shine
    c.fillStyle = 'rgba(255,255,255,.45)';
    c.beginPath();
    c.ellipse(-r * 0.42, -r * 0.5, r * 0.22, r * 0.12, -0.7, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath();
    c.arc(-r * 0.66, -r * 0.2, r * 0.06, 0, Math.PI * 2);
    c.fill();

    // cheeks
    c.fillStyle = 'rgba(255,150,170,.45)';
    c.beginPath();
    c.ellipse(-r * 0.56, r * 0.08, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
    c.ellipse(r * 0.56, r * 0.08, r * 0.13, r * 0.08, 0, 0, Math.PI * 2);
    c.fill();

    // eyes
    const ey = -r * 0.5, ex = r * 0.26, es = Math.max(1.6, r * 0.1);
    c.fillStyle = '#2a1840';
    c.strokeStyle = '#2a1840';
    if (blink) {
      c.lineWidth = Math.max(1.2, r * 0.05);
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(-ex - es, ey); c.quadraticCurveTo(-ex, ey + es * 0.8, -ex + es, ey);
      c.moveTo(ex - es, ey); c.quadraticCurveTo(ex, ey + es * 0.8, ex + es, ey);
      c.stroke();
    } else {
      c.beginPath();
      c.ellipse(-ex, ey, es * 0.8, es, 0, 0, Math.PI * 2);
      c.ellipse(ex, ey, es * 0.8, es, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(-ex + es * 0.25, ey - es * 0.35, es * 0.32, 0, Math.PI * 2);
      c.arc(ex + es * 0.25, ey - es * 0.35, es * 0.32, 0, Math.PI * 2);
      c.fill();
    }

    // number
    const label = String(level + 1);
    const fs = r * (label.length > 1 ? 0.78 : 0.92);
    c.font = `700 ${fs}px Fredoka, ui-rounded, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = Math.max(2, r * 0.12);
    c.strokeStyle = shade(col, -0.5);
    c.strokeText(label, 0, r * 0.2);
    c.fillStyle = '#fff';
    c.fillText(label, 0, r * 0.2);

    c.restore();
  }

  // pre-rendered sprites (eyes open / closed) at the current pixel scale
  let pxScale = 1;
  const sprites = [];
  function buildSprites() {
    sprites.length = 0;
    RADII.forEach((r, i) => {
      const pair = [false, true].map((blink) => {
        const pad = 4;
        const size = Math.ceil((r * 2 + pad * 2) * pxScale);
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const c = cv.getContext('2d');
        c.scale(pxScale, pxScale);
        drawOrb(c, i, r, blink, r + pad, r + pad);
        return cv;
      });
      sprites.push({ open: pair[0], closed: pair[1], half: r + 4 });
    });
  }

  // ---------- Physics ----------
  const engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1.35;
  const world = engine.world;

  const wallOpts = { isStatic: true, friction: 0.2, restitution: 0.1, label: 'wall' };

  // Gelas: an open, tapered glass. Nothing outside it, so a ball that rolls over the rim falls away.
  const GLASS = (() => {
    const rimY = Math.round(H * 0.4), bottomY = H - 6;
    return { rimY, bottomY, bottomHalf: 116, topHalf: 176, wall: 14 };
  })();
  // inner x range of the glass at height y
  function glassSpan(y) {
    const t = clamp((GLASS.bottomY - y) / (GLASS.bottomY - GLASS.rimY), 0, 1);
    const half = GLASS.bottomHalf + (GLASS.topHalf - GLASS.bottomHalf) * t;
    return [W / 2 - half, W / 2 + half];
  }

  function buildArena() {
    Composite.remove(world, Composite.allBodies(world).filter((b) => b.label === 'wall'));
    if (mode.id !== 'glass') {
      Composite.add(world, [
        Bodies.rectangle(W / 2, H + 50, W + 400, 100, wallOpts),
        Bodies.rectangle(-50, H / 2 - 400, 100, H + 1200, wallOpts),
        Bodies.rectangle(W + 50, H / 2 - 400, 100, H + 1200, wallOpts),
      ]);
      return;
    }
    // physics walls are much thicker than the drawn glass, so a fast ball can't tunnel through
    const g = GLASS, T = 80;
    const glassOpts = { ...wallOpts, friction: 0.06 };
    const parts = [Bodies.rectangle(W / 2, g.bottomY + T / 2, g.bottomHalf * 2 + T * 2, T, glassOpts)];
    for (const side of [-1, 1]) {
      const ax = W / 2 + side * g.bottomHalf, ay = g.bottomY;
      const bx = W / 2 + side * g.topHalf, by = g.rimY;
      const len = Math.hypot(bx - ax, by - ay);
      const nx = (by - ay) / len * -side, ny = -(bx - ax) / len * -side; // outward normal
      const ang = Math.atan2(by - ay, bx - ax);
      parts.push(Bodies.rectangle((ax + bx) / 2 + nx * T / 2, (ay + by) / 2 + ny * T / 2, len, T, { ...glassOpts, angle: ang }));
      const rim = g.wall / 2;
      parts.push(Bodies.circle(bx + nx * rim, by + ny * rim, rim, glassOpts)); // rounded rim
    }
    Composite.add(world, parts);
  }

  // ---------- State ----------
  let state = 'home'; // home | playing | revive | dying | over
  let score = 0;
  let gameMaxLevel = 0;
  let gameTime = 0;
  let aimX = W / 2;
  let current = 0;
  let nextLevel = 0;
  let heldAt = 0;
  let canDrop = true;
  let combo = 0;
  let lastMergeAt = -9999;
  let overTimer = 0;
  let dangerLevel = 0;
  let shake = 0;
  let flash = 0;
  let warned = false;
  let pointerDown = false;
  let tool = null;          // 'hammer' while aiming the hammer
  let revived = false;
  let earned = 0;
  let doubled = false;
  let tutorial = -1;        // -1 off, 0 waiting for first drop, 1 waiting for first merge
  let attractNext = 0;
  let mergeQueue = [];
  let timeLeft = 0;         // Kilat
  let lastTick = 0;
  let dropFlash = 0;
  let loseReason = 'line';  // line | spill | time
  const particles = [];
  const rings = [];
  const texts = [];

  function randDroppable() {
    const max = gameTime < 15000 ? 3 : DROPPABLE;
    const w = [5, 4, 3, 2, 1].slice(0, max);
    let t = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { if ((t -= w[i]) < 0) return i; }
    return 0;
  }

  function orbs() { return Composite.allBodies(world).filter((b) => b.label === 'orb'); }

  function makeOrb(level, x, y) {
    const b = Bodies.circle(x, y, RADII[level], {
      label: 'orb',
      restitution: 0.18,
      friction: 0.08,
      frictionStatic: 0.3,
      frictionAir: 0.004,
      density: 0.0012,
      slop: 0.03,
    });
    b.level = level;
    b.born = gameTime;
    b.merging = false;
    b.blinkAt = gameTime + 1500 + Math.random() * 4000;
    b.landed = false;
    Composite.add(world, b);
    return b;
  }

  const quiet = () => state === 'home';

  Events.on(engine, 'collisionStart', (e) => {
    for (const p of e.pairs) {
      collide(p);
      for (const o of [p.bodyA, p.bodyB]) {
        if (o.label === 'orb' && !o.landed) {
          o.landed = true;
          const v = Math.hypot(o.velocity.x, o.velocity.y);
          if (v > 2 && !quiet()) Sfx.land(v);
        }
      }
    }
  });
  Events.on(engine, 'collisionActive', (e) => { for (const p of e.pairs) collide(p); });

  function collide(p) {
    const a = p.bodyA, b = p.bodyB;
    if (a.label !== 'orb' || b.label !== 'orb') return;
    if (a.level !== b.level || a.merging || b.merging) return;
    a.merging = b.merging = true;
    mergeQueue.push([a, b]);
  }

  function processMerges() {
    if (!mergeQueue.length) return;
    const q = mergeQueue;
    mergeQueue = [];
    for (const [a, b] of q) {
      const level = a.level;
      const x = (a.position.x + b.position.x) / 2;
      const y = (a.position.y + b.position.y) / 2;
      const vx = (a.velocity.x + b.velocity.x) / 2;
      const vy = (a.velocity.y + b.velocity.y) / 2;
      Composite.remove(world, [a, b]);

      if (quiet()) {
        if (level < MAX_LEVEL) { const n = makeOrb(level + 1, x, y); n.landed = true; }
        burst(x, y, theme.colors[Math.min(level + 1, MAX_LEVEL)], 8, 0.6);
        continue;
      }

      combo = gameTime - lastMergeAt < 1100 ? combo + 1 : 1;
      lastMergeAt = gameTime;
      SA.missionEvent('merges', 1);
      if (combo >= 2) SA.missionEvent('combo', combo);
      profile.totalMerges++;

      let gained;
      if (level === MAX_LEVEL) {
        gained = 500 * combo;
        burst(x, y, theme.colors[level], 80, 1.6);
        burst(x, y, '#ffffff', 40, 1.2);
        rings.push({ x, y, r: RADII[level], life: 0, max: 700, color: '#fff' });
        floatText(x, y, `+${gained}`, '#fff', 34);
        toast('Sempurna! 11 + 11 lenyap', 'sparkle');
        shake = 18; flash = 0.6;
        Sfx.merge(level, combo);
        Sfx.record();
      } else {
        const nl = level + 1;
        const n = makeOrb(nl, x, y);
        Body.setVelocity(n, { x: vx * 0.5, y: vy * 0.5 - 1 });
        n.landed = true;
        gained = ((nl + 1) * (nl + 2) / 2) * combo;
        const col = theme.colors[nl];
        burst(x, y, col, 10 + nl * 3, 0.6 + nl * 0.08);
        rings.push({ x, y, r: RADII[nl], life: 0, max: 380, color: col });
        floatText(x, y - RADII[nl] * 0.3, `+${gained}`, '#fff', 16 + nl * 1.6);
        if (nl >= 6) shake = Math.max(shake, 4 + nl * 1.2);
        if (nl >= 8) flash = 0.25;
        Sfx.merge(nl, combo);
        SA.missionEvent('reach', nl + 1);
        if (nl > gameMaxLevel) {
          gameMaxLevel = nl;
          if (nl > profile.bestLevel) {
            profile.bestLevel = nl;
            SA.save();
            drawEvo();
            if (nl >= 4) toast(`Angka baru ditemukan: ${nl + 1}!`, 'star');
          } else if (nl >= 6) toast(`Angka ${nl + 1}!`, 'flame');
        }
      }
      if (mode.id === 'blitz') {
        const nl = level + 1;
        // the merged number (nl + 1): 6 = +1s, 7 = +2s, 8 = +3s, 9+ = +4s, clearing two 11s = +8s
        const bonus = level === MAX_LEVEL ? 8000 : nl >= 5 ? Math.min(4, nl - 4) * 1000 : 0;
        if (bonus) { timeLeft += bonus; floatText(x, y - 30, `+${bonus / 1000} dtk`, '#7df9ff', 17); }
      }
      if (tutorial === 1) endTutorial();
      if (combo >= 2) {
        floatText(x, y + 26, `Combo x${combo}`, '#ffd23f', 18);
        Sfx.combo(combo);
      }
      addScore(gained);
      vibrate(level >= 5 ? 25 : 8);
    }
  }

  function addScore(n) {
    score += n;
    scoreEl.textContent = score;
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');
    setTimeout(() => scoreEl.classList.remove('bump'), 120);
    SA.missionEvent('score', score);
  }

  // ---------- FX ----------
  function burst(x, y, color, n, power) {
    n = Math.min(n, MAX_PARTICLES - particles.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (1 + Math.random() * 4) * power;
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 1.5 * power,
        life: 0,
        max: 450 + Math.random() * 450,
        size: 2 + Math.random() * 4 * power,
        color: Math.random() < 0.25 ? '#ffffff' : color,
        star: Math.random() < 0.3,
      });
    }
  }
  function floatText(x, y, str, color, size) {
    texts.push({ x, y, str, color, size, life: 0, max: 900 });
  }
  let toastTimer = 0;
  function toast(msg, icon = null, ms = 1700) {
    if (typeof icon === 'number') { ms = icon; icon = null; }
    toastEl.innerHTML = (icon ? ic(icon) : '') + '<span></span>';
    toastEl.lastChild.textContent = msg;
    toastEl.classList.toggle('plain', !icon);
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
  }

  function updateFx(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      if (p.life >= p.max) { particles.splice(i, 1); continue; }
      p.vy += 0.12 * dt / 16;
      p.vx *= 0.985;
      p.x += p.vx * dt / 16;
      p.y += p.vy * dt / 16;
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      rings[i].life += dt;
      if (rings[i].life >= rings[i].max) rings.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.life += dt;
      t.y -= 0.6 * dt / 16;
      if (t.life >= t.max) texts.splice(i, 1);
    }
    shake *= Math.pow(0.86, dt / 16);
    if (shake < 0.2) shake = 0;
    flash = Math.max(0, flash - dt / 600);
  }

  // ---------- Overlays ----------
  const overlays = () => document.querySelectorAll('.overlay');
  function show(id) { $(id).classList.add('show'); onPanelOpen(id); }
  function hide(id) { $(id).classList.remove('show'); }
  function hidePanels() { overlays().forEach((o) => { if (o.id !== 'ov-home') o.classList.remove('show'); }); }
  function panelOpen() {
    for (const o of overlays()) if (o.id !== 'ov-home' && o.classList.contains('show')) return o.id;
    return null;
  }

  // ---------- Game flow ----------
  function clearWorld() {
    for (const b of orbs()) Composite.remove(world, b);
    mergeQueue = [];
  }

  function resetGame() {
    clearWorld();
    particles.length = rings.length = texts.length = 0;
    score = 0; gameTime = 0; combo = 0; overTimer = 0; gameMaxLevel = 0;
    revived = false; doubled = false; tool = null; dangerLevel = 0;
    timeLeft = BLITZ_TIME; lastTick = 0; loseReason = 'line';
    scoreEl.textContent = '0';
    current = randDroppable();
    nextLevel = randDroppable();
    canDrop = true; heldAt = 0;
    aimX = W / 2;
    tutorial = profile.tutorialDone ? -1 : 0;
    drawNext();
    syncPowerbar();
  }

  function startGame() {
    Sfx.unlock();
    Sfx.click();
    resetGame();
    state = 'playing';
    if (!profile.modesPlayed.includes(mode.id)) { profile.modesPlayed.push(mode.id); SA.save(); }
    document.body.classList.remove('at-home');
    hidePanels();
    hide('ov-home');
    if (profile.settings.music) Music.start();
    SA.track('game_start', { games: profile.games, mode: mode.id });
  }

  function goHome() {
    state = 'home';
    tool = null;
    $('tool-hint').classList.remove('show');
    hidePanels();
    clearWorld();
    gameTime = 0;
    document.body.classList.add('at-home');
    show('ov-home');
    Music.stop();
    refreshHome();
  }

  // where the held ball can be aimed (inside the glass rim in Gelas)
  function aimRange(r) {
    if (mode.id === 'glass') { const [l, rr] = glassSpan(GLASS.rimY); return [l + r + 2, rr - r - 2]; }
    return [r + 1, W - r - 1];
  }
  function drop() {
    if (state !== 'playing' || !canDrop || panelOpen() || tool) return;
    const r = RADII[current];
    const x = clamp(aimX, ...aimRange(r));
    const b = makeOrb(current, x, DROP_Y);
    Body.setAngle(b, (Math.random() - 0.5) * 0.6);
    Body.setVelocity(b, { x: 0, y: 2 });
    Sfx.drop();
    if (mode.id === 'blitz') {
      timeLeft = Math.max(0, timeLeft - BLITZ_DROP_COST);
      dropFlash = 1;
      lastMergeAt = -9999; // combos only come from chain reactions, not from tapping fast
    }
    canDrop = false;
    current = nextLevel;
    nextLevel = randDroppable();
    drawNext();
    if (tutorial === 0) tutorial = 1;
    setTimeout(() => { canDrop = true; heldAt = gameTime; }, mode.id === 'blitz' ? BLITZ_COOLDOWN : DROP_COOLDOWN);
  }

  function endTutorial() {
    tutorial = -1;
    profile.tutorialDone = true;
    SA.save();
    toast('Mantap! Terus gabungkan', 'check');
  }

  function checkOver(dt) {
    if (mode.id === 'blitz') {
      timeLeft -= dt;
      const sec = Math.ceil(timeLeft / 1000);
      if (sec <= 10 && sec !== lastTick && sec > 0) { lastTick = sec; Sfx.warn(); }
      if (timeLeft <= 0) { timeLeft = 0; loseReason = 'time'; onLose(); return; }
      if (canDrop && !tool && gameTime - heldAt > BLITZ_AUTODROP) drop();
    }
    if (mode.id === 'glass') {
      let high = false;
      for (const b of orbs()) {
        if (b.position.y - RADII[b.level] > H + 10 || b.position.x < -RADII[b.level] || b.position.x > W + RADII[b.level]) {
          // fell out of the glass
          burst(clamp(b.position.x, 10, W - 10), H - 10, theme.colors[b.level], 24, 1);
          Composite.remove(world, b);
          shake = 10; vibrate(60);
          loseReason = 'spill';
          onLose();
          return;
        }
        if (!b.merging && gameTime - b.born > 1200 && b.position.y - RADII[b.level] < GLASS.rimY) high = true;
      }
      dangerLevel = high ? 0.6 : 0;
      return;
    }
    let above = false, near = false;
    for (const b of orbs()) {
      if (b.merging || gameTime - b.born < 1200) continue;
      const top = b.position.y - RADII[b.level];
      if (top < LINE_Y) above = true;
      if (top < LINE_Y + 70) near = true;
    }
    if (above) {
      overTimer += dt;
      if (!warned) { Sfx.warn(); warned = true; }
    } else {
      overTimer = Math.max(0, overTimer - dt * 2);
      warned = false;
    }
    dangerLevel = above ? 1 : near ? 0.4 : 0;
    if (overTimer > OVER_TIME) { loseReason = 'line'; onLose(); }
  }

  function onLose() {
    overTimer = 0;
    tool = null;
    $('tool-hint').classList.remove('show');
    // one second chance per game, via rewarded ad
    if (!revived && score > 0) {
      state = 'revive';
      offerRevive();
    } else {
      gameOver();
    }
  }

  let reviveTimer = 0;
  function offerRevive() {
    $('revive-text').textContent = loseReason === 'time'
      ? 'Tonton iklan singkat untuk tambahan 15 detik.'
      : loseReason === 'spill'
        ? 'Tonton iklan singkat untuk lanjut. Bola paling atas di gelas akan dibersihkan.'
        : 'Tonton iklan singkat untuk lanjut. Bola paling atas akan dibersihkan.';
    show('ov-revive');
    const bar = $('revive-bar');
    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = `width ${REVIVE_SECONDS}s linear`;
    bar.style.width = '0%';
    clearTimeout(reviveTimer);
    reviveTimer = setTimeout(() => { if (state === 'revive') { hide('ov-revive'); gameOver(); } }, REVIVE_SECONDS * 1000);
  }

  function doRevive() {
    revived = true;
    hide('ov-revive');
    if (loseReason === 'time') {
      timeLeft = BLITZ_REVIVE;
      lastTick = 0;
      state = 'playing';
      Sfx.revive();
      toast('+15 detik!', 'timer');
      return;
    }
    // clear everything that pokes into the top part of the jar
    const cut = mode.id === 'glass' ? GLASS.rimY + 90 : LINE_Y + 170;
    const list = orbs().filter((b) => b.position.y - RADII[b.level] < cut).sort((a, b) => a.position.y - b.position.y);
    list.forEach((b, i) => {
      setTimeout(() => {
        burst(b.position.x, b.position.y, theme.colors[b.level], 16, 0.9);
        Composite.remove(world, b);
        Sfx.pop();
      }, i * 70);
    });
    setTimeout(() => {
      state = 'playing';
      overTimer = 0;
      Sfx.revive();
      toast('Lanjut!', 'bolt');
    }, list.length * 70 + 200);
  }

  function gameOver() {
    state = 'dying';
    clearTimeout(reviveTimer);
    Sfx.over();
    Music.stop();
    const list = orbs().sort((a, b) => a.position.y - b.position.y);
    let i = 0;
    const step = () => {
      if (i >= list.length) { setTimeout(showOver, 350); return; }
      const b = list[i++];
      burst(b.position.x, b.position.y, theme.colors[b.level], 14, 0.8);
      Composite.remove(world, b);
      Sfx.pop();
      setTimeout(step, Math.max(30, 110 - i * 4));
    };
    setTimeout(step, 500);
  }

  function showOver() {
    state = 'over';
    const prevBest = profile.bests[mode.id] || 0;
    const isRecord = score > prevBest;
    if (isRecord) profile.bests[mode.id] = score;
    if (mode.id === 'casual' && score > profile.best) profile.best = score;
    profile.games++;
    earned = Math.round((Math.floor(score / 25) + Math.max(0, gameMaxLevel - 4) * 5) * mode.coinMult);
    SA.addCoins(earned);
    SA.missionEvent('games', 1);
    SA.missionEvent('score', score);
    if (tutorial !== -1) { profile.tutorialDone = true; tutorial = -1; }
    SA.save();
    Ads.gameFinished();
    SA.track('game_over', { score, maxLevel: gameMaxLevel + 1, revived, mode: mode.id });
    $('over-title').textContent = loseReason === 'time' ? 'Waktu habis!' : loseReason === 'spill' ? 'Tumpah!' : 'Game Over';
    $('over-mode').innerHTML = `${ic(mode.icon)}<span>Mode ${mode.name}${mode.coinMult > 1 ? ` · koin x${mode.coinMult}` : ''}</span>`;

    $('final-score').textContent = score;
    $('final-best').innerHTML = isRecord && score > 0
      ? `${ic('trophy')}<span class="new">Rekor baru!</span>`
      : `Terbaik: <b>${Math.max(prevBest, score)}</b>`;
    $('final-max').innerHTML = `Angka tertinggi: <b>${gameMaxLevel + 1}</b>`;
    $('earned').textContent = `+${earned}`;
    const dbl = $('btn-double');
    dbl.disabled = earned <= 0;
    dbl.style.display = earned > 0 ? '' : 'none';
    dbl.innerHTML = `${ic('video')}<span>Gandakan</span>`;
    if (isRecord && score > 0) Sfx.record();
    show('ov-over');
  }

  // ---------- Power-ups ----------
  function syncPowerbar() {
    document.querySelectorAll('.pw').forEach((btn) => {
      const id = btn.dataset.power;
      const n = profile.power[id] || 0;
      const pc = btn.querySelector('.pc');
      pc.className = 'pc';
      if (n > 0) pc.textContent = n;
      else { pc.innerHTML = ic('video'); pc.classList.add('ad'); }
      btn.classList.toggle('active', tool === id);
    });
  }

  function usePower(id) {
    if (state !== 'playing' || panelOpen()) return;
    Sfx.unlock();
    if (tool === id) { cancelTool(); return; }
    if ((profile.power[id] || 0) <= 0) { openPowerOffer(id); return; }
    if (id === 'hammer') {
      if (!orbs().length) { toast('Belum ada bola'); return; }
      tool = 'hammer';
      $('tool-hint').classList.add('show');
      Sfx.click();
      syncPowerbar();
      return;
    }
    if (id === 'shake') {
      if (!orbs().length) { toast('Belum ada bola'); return; }
      for (const b of orbs()) {
        Body.setVelocity(b, { x: (Math.random() - 0.5) * 9, y: -4 - Math.random() * 7 });
        Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.3);
      }
      shake = 14;
      Sfx.whoosh();
      vibrate(40);
    }
    if (id === 'swap') {
      if (current === nextLevel) { toast('Bolanya sama'); return; }
      [current, nextLevel] = [nextLevel, current];
      heldAt = gameTime;
      drawNext();
      Sfx.swap();
    }
    consumePower(id);
  }

  function consumePower(id) {
    profile.power[id]--;
    SA.save();
    SA.missionEvent('power', 1);
    SA.track('power_use', { id });
    syncPowerbar();
  }

  function cancelTool() {
    tool = null;
    $('tool-hint').classList.remove('show');
    syncPowerbar();
  }

  function smashAt(wx, wy) {
    let hit = null, bestD = Infinity;
    for (const b of orbs()) {
      const d = Math.hypot(b.position.x - wx, b.position.y - wy);
      if (d < RADII[b.level] + 8 && d < bestD) { hit = b; bestD = d; }
    }
    if (!hit) return;
    burst(hit.position.x, hit.position.y, theme.colors[hit.level], 30, 1.1);
    rings.push({ x: hit.position.x, y: hit.position.y, r: RADII[hit.level], life: 0, max: 400, color: '#fff' });
    Composite.remove(world, hit);
    shake = 10;
    Sfx.smash();
    vibrate(35);
    cancelTool();
    consumePower('hammer');
  }

  let offerId = null;
  function openPowerOffer(id) {
    offerId = id;
    const p = SA.POWERS[id];
    $('offer-icon').innerHTML = ic(p.icon);
    $('offer-title').textContent = `${p.name} habis`;
    $('offer-text').textContent = p.desc;
    const buy = $('offer-buy');
    buy.innerHTML = `Beli dengan ${coinHTML} ${p.price}`;
    buy.disabled = profile.coins < p.price;
    buy.style.opacity = buy.disabled ? 0.4 : 1;
    show('ov-offer');
  }

  // ---------- Rendering ----------
  let cssW = 0, cssH = 0, dpr = 1;

  function resize() {
    const sw = stageEl.clientWidth, sh = stageEl.clientHeight;
    const scale = Math.min(sw / W, sh / H);
    cssW = Math.floor(W * scale);
    cssH = Math.floor(H * scale);
    dpr = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 2 : 2.5);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    overlays().forEach((o) => {
      o.style.width = cssW + 'px';
      o.style.height = cssH + 'px';
    });
    pxScale = (cssW / W) * dpr;
    buildSprites();
    drawNext();
    drawEvo();
  }

  function drawBackground(c) {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, theme.bg[0]);
    g.addColorStop(1, theme.bg[1]);
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    c.fillStyle = theme.dots;
    for (let y = 20; y < H; y += 40) {
      for (let x = (y / 40) % 2 ? 20 : 40; x < W; x += 40) {
        c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
      }
    }
    if (mode.id === 'glass') { drawGlass(c); return; }
    c.fillStyle = theme.floor;
    c.fillRect(0, H - 6, W, 6);

    if (state === 'home') return;
    const t = performance.now() / 1000;
    const a = 0.35 + dangerLevel * (0.4 + 0.25 * Math.sin(t * 12));
    c.save();
    c.strokeStyle = `rgba(255,70,100,${a})`;
    c.lineWidth = 2.5;
    c.setLineDash([10, 8]);
    c.lineDashOffset = -t * 20;
    c.beginPath(); c.moveTo(0, LINE_Y); c.lineTo(W, LINE_Y); c.stroke();
    c.restore();
    if (dangerLevel >= 1) {
      c.fillStyle = `rgba(255,60,90,${0.08 + 0.06 * Math.sin(t * 12)})`;
      c.fillRect(0, 0, W, LINE_Y);
    }
  }

  function glassPath(c, inset, fresh = true) {
    const g = GLASS;
    const [bl, br] = [W / 2 - g.bottomHalf - inset, W / 2 + g.bottomHalf + inset];
    const [tl, tr] = [W / 2 - g.topHalf - inset, W / 2 + g.topHalf + inset];
    if (fresh) c.beginPath();
    c.moveTo(tl, g.rimY);
    c.lineTo(bl, g.bottomY + inset);
    c.lineTo(br, g.bottomY + inset);
    c.lineTo(tr, g.rimY);
  }
  function drawGlass(c) {
    const g = GLASS, T = g.wall;
    // the drop zone outside the glass is dimmed: anything that lands there is lost
    c.save();
    c.fillStyle = 'rgba(42,24,64,.22)';
    c.beginPath(); c.rect(-20, -20, W + 40, H + 40);
    glassPath(c, T, false); c.lineTo(W / 2 + g.topHalf + T, -20); c.lineTo(W / 2 - g.topHalf - T, -20); c.closePath();
    c.fill('evenodd');
    // falling-off arrows on both sides
    c.fillStyle = 'rgba(255,70,100,.22)';
    for (const side of [-1, 1]) {
      const x = side < 0 ? 12 : W - 12;
      for (let i = 0; i < 3; i++) {
        const y = g.rimY + 60 + i * 26 + ((performance.now() / 30) % 26);
        c.beginPath(); c.moveTo(x - 7, y); c.lineTo(x + 7, y); c.lineTo(x, y + 9); c.closePath(); c.fill();
      }
    }
    // glass body: tinted inside, thick translucent walls, bright rim
    glassPath(c, 0); c.closePath();
    c.fillStyle = 'rgba(255,255,255,.28)'; c.fill();
    glassPath(c, T / 2);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = 'rgba(42,24,64,.35)'; c.lineWidth = T + 5; c.stroke();
    c.strokeStyle = 'rgba(235,248,255,.95)'; c.lineWidth = T; c.stroke();
    glassPath(c, T / 2);
    c.strokeStyle = 'rgba(110,170,230,.6)'; c.lineWidth = 3; c.stroke();
    const t = performance.now() / 1000;
    const a = state === 'home' ? 0 : dangerLevel * (0.55 + 0.35 * Math.sin(t * 10));
    for (const side of [-1, 1]) {
      c.fillStyle = a ? `rgba(255,70,100,${0.5 + a * 0.5})` : 'rgba(255,255,255,.95)';
      c.beginPath(); c.arc(W / 2 + side * (g.topHalf + T / 2), g.rimY, T / 2 + 1, 0, Math.PI * 2); c.fill();
    }
    // glint
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(W / 2 - g.topHalf + 22, g.rimY + 26); c.lineTo(W / 2 - g.bottomHalf + 16, g.bottomY - 40); c.stroke();
    c.restore();
  }

  // per-mode overlay: Kilat timer
  function drawModeHud(c, now) {
    if (mode.id === 'blitz') {
      const p = clamp(timeLeft / BLITZ_TIME, 0, 1);
      const low = timeLeft < 10000;
      c.fillStyle = 'rgba(42,24,64,.15)';
      c.fillRect(0, 0, W, 7);
      c.fillStyle = low ? `rgba(255,77,109,${0.75 + 0.25 * Math.sin(now / 90)})` : '#ff9f43';
      c.fillRect(0, 0, W * Math.min(1, p), 7);
      if (dropFlash > 0) { // the slice a drop just cost
        c.fillStyle = `rgba(255,77,109,${dropFlash})`;
        c.fillRect(W * Math.min(1, p), 0, W * BLITZ_DROP_COST / BLITZ_TIME, 7);
        dropFlash = Math.max(0, dropFlash - 0.05);
      }
      const sec = Math.ceil(timeLeft / 1000);
      c.font = `700 ${low ? 26 : 22}px Fredoka, ui-rounded, system-ui, sans-serif`;
      c.textAlign = 'left'; c.textBaseline = 'middle'; c.lineJoin = 'round';
      c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,.9)';
      c.strokeText(`${sec} dtk`, 12, 30);
      c.fillStyle = low ? '#e11d48' : '#2a1840';
      c.fillText(`${sec} dtk`, 12, 30);
    }
  }

  function drawSprite(c, level, x, y, angle, scale, blink) {
    const s = sprites[level];
    if (!s) return;
    const img = blink ? s.closed : s.open;
    c.save();
    c.translate(x, y);
    if (angle) c.rotate(angle);
    if (scale !== 1) c.scale(scale, scale);
    c.drawImage(img, -s.half, -s.half, s.half * 2, s.half * 2);
    c.restore();
  }

  function render() {
    const c = ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, canvas.width, canvas.height);
    const k = cssW / W * dpr;
    let sx = 0, sy = 0;
    if (shake) { sx = (Math.random() - 0.5) * shake; sy = (Math.random() - 0.5) * shake; }
    c.setTransform(k, 0, 0, k, sx * k, sy * k);

    drawBackground(c);
    const now = performance.now();

    // aim guide + held orb
    if (state === 'playing' && !tool) {
      const r = RADII[current];
      const x = clamp(aimX, ...aimRange(r));
      if (canDrop) {
        c.save();
        c.strokeStyle = theme.guide;
        c.lineWidth = 2;
        c.setLineDash([4, 8]);
        c.beginPath(); c.moveTo(x, DROP_Y + r); c.lineTo(x, H); c.stroke();
        c.restore();
        const s = easeOutBack(Math.min(1, (gameTime - heldAt) / 180));
        drawSprite(c, current, x, DROP_Y + Math.sin(now / 300) * 2, 0, Math.max(0.01, s), false);
        if (mode.id === 'blitz') {
          // auto-drop countdown ring around the held ball
          const p = clamp((gameTime - heldAt) / BLITZ_AUTODROP, 0, 1);
          c.strokeStyle = p > 0.7 ? '#ff4d6d' : 'rgba(42,24,64,.45)';
          c.lineWidth = 3;
          c.beginPath(); c.arc(x, DROP_Y, r + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p)); c.stroke();
        }
      }
    }

    // orbs
    for (const b of orbs()) {
      const age = gameTime - b.born;
      const s = age < 220 ? 0.6 + 0.4 * easeOutBack(age / 220) : 1;
      let blink = false;
      if (gameTime > b.blinkAt) {
        blink = true;
        if (gameTime > b.blinkAt + 130) b.blinkAt = gameTime + 2000 + Math.random() * 4000;
      }
      drawSprite(c, b.level, b.position.x, b.position.y, b.angle, s, blink || state === 'dying');
      if (tool === 'hammer') {
        c.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * Math.sin(now / 150)})`;
        c.lineWidth = 3;
        c.beginPath(); c.arc(b.position.x, b.position.y, RADII[b.level] + 3, 0, Math.PI * 2); c.stroke();
      }
    }

    // rings
    for (const r of rings) {
      const t = r.life / r.max;
      c.strokeStyle = r.color;
      c.globalAlpha = 1 - t;
      c.lineWidth = 6 * (1 - t) + 1;
      c.beginPath(); c.arc(r.x, r.y, r.r * (0.9 + t * 0.8), 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;

    // particles
    for (const p of particles) {
      const t = 1 - p.life / p.max;
      c.globalAlpha = Math.min(1, t * 1.5);
      c.fillStyle = p.color;
      const sz = p.size * (0.4 + 0.6 * t);
      if (p.star) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.life / 120);
        star(c, sz * 1.4);
        c.restore();
      } else {
        c.beginPath(); c.arc(p.x, p.y, sz, 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;

    // floating texts
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    for (const t of texts) {
      const p = t.life / t.max;
      const s = p < 0.15 ? easeOutBack(p / 0.15) : 1;
      c.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
      c.font = `700 ${t.size * s}px Fredoka, ui-rounded, system-ui, sans-serif`;
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(42,24,64,.85)';
      c.strokeText(t.str, t.x, t.y);
      c.fillStyle = t.color;
      c.fillText(t.str, t.x, t.y);
    }
    c.globalAlpha = 1;

    if (state !== 'home') drawModeHud(c, now);

    // first-game coach marks
    if (state === 'playing' && tutorial >= 0 && !panelOpen()) drawTutorial(c, now);

    if (flash > 0) {
      c.fillStyle = `rgba(255,255,255,${flash})`;
      c.fillRect(-20, -20, W + 40, H + 40);
    }
  }

  function drawTutorial(c, now) {
    const msg = tutorial === 0 ? 'Geser untuk membidik, lepas untuk jatuhkan' : 'Gabungkan dua angka yang sama!';
    c.font = '600 17px Fredoka, ui-rounded, system-ui, sans-serif';
    const w = c.measureText(msg).width + 28;
    const y = H * 0.42;
    c.fillStyle = 'rgba(42,24,64,.85)';
    roundRect(c, W / 2 - w / 2, y - 18, w, 36, 18);
    c.fill();
    c.fillStyle = '#fff';
    c.fillText(msg, W / 2, y + 1);
    if (tutorial === 0) {
      const hx = W / 2 + Math.sin(now / 500) * 110;
      // touch indicator: a fingertip dot with an expanding ripple
      const t = (now % 1000) / 1000;
      c.strokeStyle = `rgba(42,24,64,${0.5 * (1 - t)})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(hx, y + 62, 14 + t * 18, 0, Math.PI * 2); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.95)';
      c.strokeStyle = 'rgba(42,24,64,.85)';
      c.beginPath(); c.arc(hx, y + 62, 14, 0, Math.PI * 2); c.fill(); c.stroke();
      if (canDrop && !pointerDown) aimX = hx;
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function star(c, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? r * 0.45 : r;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fill();
  }

  function drawNext() {
    const size = 128;
    nextCanvas.width = nextCanvas.height = size;
    nextCtx.clearRect(0, 0, size, size);
    const r = RADII[nextLevel];
    const target = 24 + nextLevel * 4.5;
    nextCtx.save();
    nextCtx.translate(size / 2, size / 2);
    nextCtx.scale(target / r, target / r);
    drawOrb(nextCtx, nextLevel, r, false);
    nextCtx.restore();
  }

  function drawEvo() {
    const w = evoCanvas.clientWidth || 400, h = evoCanvas.clientHeight || 40;
    const d = Math.min(window.devicePixelRatio || 1, 2.5);
    evoCanvas.width = Math.round(w * d);
    evoCanvas.height = Math.round(h * d);
    const c = evoCtx;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, w, h);
    const n = RADII.length;
    const gap = w / n;
    for (let i = 0; i < n; i++) {
      const rr = Math.min(gap * 0.46, h * 0.46) * (0.62 + 0.38 * (i / (n - 1)));
      c.globalAlpha = i <= profile.bestLevel ? 1 : 0.28;
      drawOrb(c, i, rr, false, gap * (i + 0.5), h / 2);
    }
    c.globalAlpha = 1;
  }

  function drawHero() {
    const el = $('hero');
    const hc = el.getContext('2d');
    el.width = 600; el.height = 180;
    hc.scale(2, 2);
    hc.font = '700 28px Fredoka, ui-rounded, system-ui, sans-serif';
    hc.textAlign = 'center'; hc.textBaseline = 'middle';
    hc.fillStyle = '#2a1840';
    drawOrb(hc, 0, 24, false, 40, 50);
    hc.fillText('+', 88, 50);
    drawOrb(hc, 0, 24, false, 136, 50);
    hc.fillText('=', 186, 50);
    drawOrb(hc, 1, 34, false, 246, 48);
  }

  // ---------- Menus: home, daily, missions, shop, settings ----------
  function setCoins() {
    document.querySelectorAll('.coins-val').forEach((el) => {
      el.textContent = profile.coins;
      const chip = el.parentElement;
      chip.classList.remove('bump'); void chip.offsetWidth; chip.classList.add('bump');
    });
  }
  SA.on('coins', setCoins);
  SA.on('ad-unavailable', () => toast('Iklan belum tersedia, coba lagi sebentar'));
  SA.on('mission-done', (m) => { if (state === 'playing') toast(`Misi selesai: ${m.text}`, 'target', 2200); refreshBadges(); });

  function refreshBadges() {
    const d = $('badge-daily');
    d.classList.toggle('on', SA.dailyAvailable());
    d.textContent = '!';
    const n = SA.missionsClaimable();
    const m = $('badge-missions');
    m.classList.toggle('on', n > 0);
    m.textContent = n;
  }

  function renderModes() {
    $('modes').innerHTML = SA.MODES.map((m) => `
      <button class="mode-btn ${m.color}${m.id === mode.id ? ' on' : ''}" data-mode="${m.id}" role="radio" aria-checked="${m.id === mode.id}">
        <span class="ni">${ic(m.icon)}</span><span class="mn">${m.name}</span>
        <span class="stars" aria-label="Kesulitan ${m.stars} dari 3">${'<i></i>'.repeat(m.stars)}</span>
        ${m.id !== 'casual' && !profile.modesPlayed.includes(m.id) ? '<em class="new">Baru</em>' : ''}
      </button>`).join('');
    $('mode-desc').textContent = mode.desc + (mode.coinMult > 1 ? ` Koin x${mode.coinMult}.` : '');
  }
  function setMode(id) {
    if (id === mode.id) return;
    mode = SA.modeById(id);
    profile.mode = mode.id;
    SA.save();
    clearWorld();
    buildArena();
    refreshHome();
  }
  $('modes').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    Sfx.unlock(); Sfx.click();
    setMode(b.dataset.mode);
  });

  function refreshHome() {
    $('home-best').textContent = profile.bests[mode.id] || 0;
    renderModes();
    setCoins();
    refreshBadges();
    drawEvo();
  }

  function onPanelOpen(id) {
    if (id === 'ov-daily') renderDaily();
    if (id === 'ov-missions') renderMissions();
    if (id === 'ov-shop') renderShop();
    if (id === 'ov-settings' || id === 'ov-pause') syncSettings();
  }

  function renderDaily() {
    const grid = $('daily-grid');
    const available = SA.dailyAvailable();
    const today = available ? SA.dailyNextStreak() : profile.daily.streak;
    grid.innerHTML = SA.DAILY_REWARDS.map((amt, i) => {
      const day = i + 1;
      const cls = ['day'];
      if (day < today || (!available && day === today)) cls.push('got');
      if (available && day === today) cls.push('today');
      if (day === 7) cls.push('big');
      const tick = cls.includes('got') ? `<span class="tick">${ic('check')}</span>` : '';
      return `<div class="${cls.join(' ')}">${tick}Hari ${day}${coinHTML}<b>${amt}</b></div>`;
    }).join('');
    $('ov-daily').classList.toggle('daily-claimed', !available);
  }

  async function claimDaily(withAd) {
    if (!SA.dailyAvailable()) return;
    if (withAd && !(await Ads.rewarded('daily_double'))) return;
    const amt = SA.claimDaily(withAd ? 2 : 1);
    Sfx.coin();
    toast(`+${amt} koin!`, 'sparkle');
    renderDaily();
    refreshBadges();
  }

  function renderMissions() {
    SA.ensureMissions();
    $('mission-list').innerHTML = profile.missions.list.map((m, i) => {
      const done = SA.missionDone(m);
      const pct = Math.round((m.progress / m.target) * 100);
      let acts = '';
      if (done && !m.claimed) {
        acts = `<div class="acts"><button class="claim" data-claim="${i}">Ambil</button><button class="claim2" data-claim2="${i}">${ic('video')}Ambil 2x</button></div>`;
      }
      const [mic, mcol] = MISSION_ICON[m.type] || ['target', 't-orange'];
      return `<li class="mission${m.claimed ? ' claimed' : ''}">
        <span class="mi ${mcol}">${ic(mic)}</span>
        <div class="mt"><span>${m.text}</span>${m.claimed ? ic('check') : ''}<span class="mr">${coinHTML}${m.reward}</span></div>
        <div class="bar"><i style="width:${pct}%"></i></div>
        <div class="mp">${m.claimed ? 'Sudah diambil' : `${m.progress} / ${m.target}`}</div>
        ${acts}
      </li>`;
    }).join('');
  }

  $('mission-list').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const withAd = b.dataset.claim2 !== undefined;
    const i = withAd ? b.dataset.claim2 : b.dataset.claim;
    if (withAd && !(await Ads.rewarded('mission_double'))) return;
    const amt = SA.claimMission(+i, withAd ? 2 : 1);
    if (amt) { Sfx.coin(); toast(`+${amt} koin!`, 'sparkle'); }
    renderMissions();
    refreshBadges();
  });

  function themePreview(t) {
    const cv = document.createElement('canvas');
    cv.width = 240; cv.height = 120;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 120);
    g.addColorStop(0, t.bg[0]); g.addColorStop(1, t.bg[1]);
    c.fillStyle = g; c.fillRect(0, 0, 240, 120);
    c.fillStyle = t.floor; c.fillRect(0, 112, 240, 8);
    drawOrb(c, 0, 18, false, 34, 92, t.colors);
    drawOrb(c, 2, 26, false, 84, 84, t.colors);
    drawOrb(c, 5, 38, false, 154, 72, t.colors);
    drawOrb(c, 1, 21, false, 214, 89, t.colors);
    return cv;
  }

  function renderShop() {
    const left = SA.freeCoinsLeft();
    $('free-left').textContent = `${left}/${SA.FREE_COINS_PER_DAY}`;
    $('btn-free-coins').disabled = left <= 0;

    const list = $('theme-list');
    list.innerHTML = '';
    SA.THEMES.forEach((t) => {
      const owned = profile.owned.includes(t.id);
      const using = profile.theme === t.id;
      const btn = document.createElement('button');
      btn.className = 'theme' + (using ? ' using' : '') + (owned ? '' : ' locked');
      btn.appendChild(themePreview(t));
      const name = document.createElement('span');
      name.textContent = t.name;
      btn.appendChild(name);
      const tag = document.createElement('span');
      tag.className = 'tp';
      if (using) tag.textContent = 'Dipakai';
      else if (owned) tag.textContent = 'Pakai';
      else {
        tag.innerHTML = `${coinHTML}${t.price}`;
        if (profile.coins < t.price) tag.classList.add('cant');
      }
      btn.appendChild(tag);
      btn.addEventListener('click', () => {
        if (using) return;
        if (!owned) {
          if (profile.coins < t.price) { toast(`Koin kurang ${t.price - profile.coins}`); return; }
          SA.addCoins(-t.price);
          profile.owned.push(t.id);
          Sfx.coin();
          SA.track('theme_buy', { id: t.id });
        }
        profile.theme = t.id;
        SA.save();
        setTheme(t.id);
        Sfx.click();
        renderShop();
      });
      list.appendChild(btn);
    });

    $('power-shop').innerHTML = Object.entries(SA.POWERS).map(([id, p]) => `
      <div class="pshop">
        <span class="pi">${ic(p.icon)}</span>
        <span class="pd"><b>${p.name} <small>(punya ${profile.power[id] || 0})</small></b>${p.desc}</span>
        <button data-buy="${id}" ${profile.coins < p.price ? 'disabled' : ''}>${coinHTML}${p.price}</button>
      </div>`).join('');
  }

  $('power-shop').addEventListener('click', (e) => {
    const b = e.target.closest('[data-buy]');
    if (!b) return;
    const id = b.dataset.buy;
    const p = SA.POWERS[id];
    if (profile.coins < p.price) return;
    SA.addCoins(-p.price);
    profile.power[id] = (profile.power[id] || 0) + 1;
    SA.save();
    Sfx.coin();
    toast(`+1 ${p.name}`, p.icon);
    renderShop();
    syncPowerbar();
  });

  $('btn-free-coins').addEventListener('click', async () => {
    if (SA.freeCoinsLeft() <= 0) return;
    if (!(await Ads.rewarded('free_coins'))) return;
    SA.takeFreeCoins();
    Sfx.coin();
    toast(`+${SA.FREE_COINS} koin!`, 'sparkle');
    renderShop();
  });

  function setTheme(id) {
    theme = SA.themeById(id);
    buildSprites();
    drawNext();
    drawEvo();
    drawHero();
  }

  function syncSettings() {
    document.querySelectorAll('[data-setting]').forEach((el) => { el.checked = !!profile.settings[el.dataset.setting]; });
  }
  document.querySelectorAll('[data-setting]').forEach((el) => {
    el.addEventListener('change', () => {
      profile.settings[el.dataset.setting] = el.checked;
      SA.save();
      syncSettings();
      Sfx.unlock();
      Sfx.configure(profile.settings);
      if (el.dataset.setting === 'music' && !el.checked) Music.stop();
      Sfx.click();
    });
  });

  $('btn-reset').addEventListener('click', () => {
    if (!confirm('Hapus semua data? Skor, koin, dan tema akan hilang.')) return;
    try { localStorage.removeItem('suika.profile.v1'); } catch { /* ignore */ }
    location.reload();
  });

  // ---------- Buttons ----------
  document.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { Sfx.unlock(); Sfx.click(); show(open.dataset.open); return; }
    const close = e.target.closest('[data-close]');
    if (close) { Sfx.click(); hide(close.closest('.overlay').id); }
  });

  $('btn-play').addEventListener('click', startGame);
  $('btn-pause').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); togglePause(); });
  $('btn-resume').addEventListener('click', () => { Sfx.click(); resume(); });
  $('btn-restart').addEventListener('click', startGame);
  $('btn-quit').addEventListener('click', () => { Sfx.click(); goHome(); });
  $('btn-revive').addEventListener('click', async () => {
    clearTimeout(reviveTimer);
    if (await Ads.rewarded('revive')) doRevive();
    else { hide('ov-revive'); gameOver(); }
  });
  $('btn-revive-skip').addEventListener('click', () => { clearTimeout(reviveTimer); hide('ov-revive'); gameOver(); });
  $('btn-double').addEventListener('click', async () => {
    if (doubled || earned <= 0) return;
    if (!(await Ads.rewarded('double_coins'))) return;
    doubled = true;
    SA.addCoins(earned);
    $('earned').textContent = `+${earned * 2}`;
    const b = $('btn-double');
    b.disabled = true;
    b.innerHTML = `${ic('check')}<span>Digandakan</span>`;
    Sfx.coin();
  });
  $('btn-again').addEventListener('click', async () => { await Ads.maybeInterstitial('game_over'); startGame(); });
  $('btn-menu').addEventListener('click', async () => { await Ads.maybeInterstitial('game_over'); goHome(); });
  $('btn-daily').addEventListener('click', () => claimDaily(false));
  $('btn-daily-2x').addEventListener('click', () => claimDaily(true));
  $('offer-ad').addEventListener('click', async () => {
    const id = offerId;
    if (!(await Ads.rewarded('power_' + id))) return;
    profile.power[id] = (profile.power[id] || 0) + 1;
    SA.save();
    hide('ov-offer');
    syncPowerbar();
    toast(`+1 ${SA.POWERS[id].name}!`, SA.POWERS[id].icon);
  });
  $('offer-buy').addEventListener('click', () => {
    const id = offerId, p = SA.POWERS[id];
    if (profile.coins < p.price) return;
    SA.addCoins(-p.price);
    profile.power[id] = (profile.power[id] || 0) + 1;
    SA.save();
    hide('ov-offer');
    syncPowerbar();
    Sfx.coin();
  });
  document.querySelectorAll('.pw').forEach((b) => b.addEventListener('click', () => usePower(b.dataset.power)));
  $('tool-cancel').addEventListener('click', (e) => { e.stopPropagation(); cancelTool(); });
  $('tool-cancel').addEventListener('pointerdown', (e) => e.stopPropagation());
  $('btn-share').addEventListener('click', async () => {
    const text = `Aku dapat skor ${score} di Suika Angka mode ${mode.name} (angka tertinggi ${gameMaxLevel + 1})! Coba kalahkan:`;
    const url = 'https://lavaruz.github.io/suika-merge/';
    try {
      if (navigator.share) { await navigator.share({ title: 'Suika Angka', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast('Link disalin!');
    } catch { /* cancelled */ }
  });

  function pause() {
    if (state !== 'playing' || panelOpen()) return;
    show('ov-pause');
    Music.stop();
  }
  function resume() {
    hide('ov-pause');
    if (state === 'playing' && profile.settings.music) Music.start();
    last = performance.now();
  }
  function togglePause() { if (panelOpen() === 'ov-pause') resume(); else pause(); }

  // Android back button / browser back
  SA.handleBack = () => {
    const p = panelOpen();
    if (p === 'ov-pause') { resume(); return true; }
    if (p === 'ov-revive') { $('btn-revive-skip').click(); return true; }
    if (p === 'ov-over') { $('btn-menu').click(); return true; }
    if (p) { hide(p); return true; }
    if (tool) { cancelTool(); return true; }
    if (state === 'playing') { pause(); return true; }
    return false; // at home: let the app exit
  };
  if (!window.Capacitor) {
    try {
      history.pushState({ g: 1 }, '');
      window.addEventListener('popstate', () => { SA.handleBack(); history.pushState({ g: 1 }, ''); });
    } catch { /* ignore */ }
  }
  SA.pause = pause;

  // ---------- Input ----------
  function toWorld(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  }
  stageEl.addEventListener('pointerdown', (e) => {
    Sfx.unlock();
    if (state !== 'playing' || panelOpen()) return;
    if (e.target.closest('#tool-hint')) return;
    const p = toWorld(e);
    if (tool === 'hammer') { smashAt(p.x, p.y); return; }
    pointerDown = true;
    aimX = p.x;
    try { stageEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  });
  stageEl.addEventListener('pointermove', (e) => {
    if (state !== 'playing' || tool) return;
    if (e.pointerType === 'mouse' || pointerDown) aimX = toWorld(e).x;
  });
  stageEl.addEventListener('pointerup', (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    aimX = toWorld(e).x;
    drop();
  });
  stageEl.addEventListener('pointercancel', () => { pointerDown = false; });

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.target.closest && e.target.closest('button')) return;
      e.preventDefault();
      if (state === 'home' && !panelOpen()) startGame();
      else if (state === 'playing') { if (panelOpen() === 'ov-pause') resume(); else drop(); }
    }
    if (e.key === 'Escape' || e.key === 'p') SA.handleBack();
    if (state === 'playing' && !panelOpen()) {
      if (e.key === '1') usePower('hammer');
      if (e.key === '2') usePower('shake');
      if (e.key === '3') usePower('swap');
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('blur', pause);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  let resizeT = 0;
  const queueResize = () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 60); };
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', queueResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', queueResize);

  // ---------- Loop ----------
  // the home screen plays a silent demo in the jar behind the menu
  function attract(dt) {
    for (const b of orbs()) if (b.position.y > H + 150) Composite.remove(world, b);
    attractNext -= dt;
    if (attractNext <= 0) {
      attractNext = 650 + Math.random() * 500;
      const [l, r] = mode.id === 'glass' ? glassSpan(GLASS.rimY) : [0, W];
      makeOrb(Math.floor(Math.random() * 4), l + 40 + Math.random() * (r - l - 80), -30);
    }
    if (orbs().some((b) => !b.merging && gameTime - b.born > 1500 && b.position.y - RADII[b.level] < H * 0.45)) {
      for (const b of orbs()) { burst(b.position.x, b.position.y, theme.colors[b.level], 6, 0.6); Composite.remove(world, b); }
    }
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    let dt = now - last;
    last = now;
    if (dt > 100) dt = 100;

    const blocked = !!panelOpen();
    const running = (state === 'playing' && !blocked) || state === 'dying' || (state === 'home' && !blocked);
    if (running) {
      if (state === 'home') attract(dt);
      const kb = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      if (kb) aimX = clamp(aimX + kb * dt * 0.35, 0, W);
      acc += dt;
      while (acc >= STEP) {
        Engine.update(engine, STEP);
        processMerges();
        gameTime += STEP;
        acc -= STEP;
      }
      if (state === 'playing') checkOver(dt);
    } else {
      acc = 0;
    }
    updateFx(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- Boot ----------
  buildArena();
  Sfx.configure(profile.settings);
  SA.ensureMissions();
  current = randDroppable();
  nextLevel = randDroppable();
  resize();
  drawHero();
  refreshHome();
  syncPowerbar();
  syncSettings();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { buildSprites(); drawNext(); drawEvo(); drawHero(); });
  }
  // returning players get the daily reward popup
  if (profile.tutorialDone && SA.dailyAvailable()) setTimeout(() => { if (state === 'home' && !panelOpen()) show('ov-daily'); }, 600);
  requestAnimationFrame(frame);

  SA.drawOrb = drawOrb; // used by scripts that render store art

  // debug hook for automated tests
  window.__suika = {
    get state() { return state; },
    get score() { return score; },
    orbs: () => orbs().map((b) => ({ level: b.level, x: b.position.x, y: b.position.y })),
    drop: (x) => { aimX = x; drop(); },
    spawn: (level, x, y) => makeOrb(level, x, y),
    setMode: (id) => setMode(id),
    get timeLeft() { return timeLeft; },
    get current() { return current; },
    engine,
    profile,
  };
})();
