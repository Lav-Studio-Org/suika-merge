(() => {
  'use strict';

  const { Engine, Bodies, Body, Composite, Events } = Matter;

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

  const LEVELS = [
    { r: 17,  color: '#ff6b81' },
    { r: 23,  color: '#ff9f43' },
    { r: 30,  color: '#fecb3e' },
    { r: 37,  color: '#9ee04a' },
    { r: 45,  color: '#1dd1a1' },
    { r: 54,  color: '#38c6f4' },
    { r: 63,  color: '#4d7cfe' },
    { r: 74,  color: '#8e6cff' },
    { r: 86,  color: '#d66bff' },
    { r: 99,  color: '#ff7eb6' },
    { r: 114, color: '#ffc233' },
  ];
  const MAX_LEVEL = LEVELS.length - 1;
  const DROPPABLE = 5;      // levels 1..5 can be dropped

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const nextCanvas = $('next');
  const nextCtx = nextCanvas.getContext('2d');
  const evoCanvas = $('evo');
  const evoCtx = evoCanvas.getContext('2d');
  const scoreEl = $('score');
  const bestEl = $('best');
  const toastEl = $('toast');

  // ---------- Storage ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- Color helpers ----------
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
    else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }

  // ---------- Sound (synthesized, no assets) ----------
  const Sfx = {
    ac: null,
    master: null,
    muted: store.get('suika.muted', false),
    unlock() {
      if (!this.ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = this.muted ? 0 : 0.6;
        const comp = this.ac.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ac.destination);
      }
      if (this.ac.state === 'suspended') this.ac.resume();
    },
    setMuted(m) {
      this.muted = m;
      store.set('suika.muted', m);
      if (this.master) this.master.gain.value = m ? 0 : 0.6;
    },
    tone(freq, dur, { type = 'sine', vol = 0.3, slide = 1, delay = 0, attack = 0.005 } = {}) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur, { vol = 0.2, freq = 1200, delay = 0 } = {}) {
      if (!this.ac || this.muted) return;
      const t = this.ac.currentTime + delay;
      const len = Math.floor(this.ac.sampleRate * dur);
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ac.createBufferSource();
      src.buffer = buf;
      const f = this.ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      const g = this.ac.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(this.master);
      src.start(t);
    },
    drop() { this.tone(330, 0.09, { type: 'triangle', vol: 0.18, slide: 0.55 }); },
    land(v) { this.tone(140 + Math.random() * 40, 0.06, { type: 'sine', vol: Math.min(0.2, v * 0.03), slide: 0.7 }); },
    merge(level, combo) {
      const base = 260 * Math.pow(2, (level + Math.min(combo, 6)) / 7);
      this.tone(base, 0.14, { type: 'sine', vol: 0.32, slide: 1.9 });
      this.tone(base * 1.5, 0.12, { type: 'triangle', vol: 0.12, slide: 1.6, delay: 0.02 });
      this.noise(0.06, { vol: 0.12, freq: 2500 });
      if (level >= 6) {
        this.tone(base / 2, 0.35, { type: 'sine', vol: 0.3, slide: 0.5 });
        this.noise(0.25, { vol: 0.18, freq: 500 });
      }
    },
    combo(n) {
      const notes = [523, 659, 784, 1047, 1319];
      for (let i = 0; i < Math.min(n, 5); i++) this.tone(notes[i], 0.12, { type: 'square', vol: 0.06, delay: i * 0.05 });
    },
    record() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.18, delay: i * 0.09 }));
    },
    warn() { this.tone(880, 0.08, { type: 'square', vol: 0.05 }); },
    over() {
      [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.16, slide: 0.97 }));
    },
    pop() { this.tone(500 + Math.random() * 400, 0.08, { type: 'sine', vol: 0.15, slide: 1.8 }); },
    click() { this.tone(700, 0.05, { type: 'triangle', vol: 0.12 }); },
  };

  // ---------- Orb sprite cache ----------
  // Each level is pre-rendered (eyes open / closed) at the current pixel scale.
  let pxScale = 1;  // device px per world unit
  const sprites = [];

  function drawOrb(c, level, r, blink, x = 0, y = 0) {
    const L = LEVELS[level];
    const col = L.color;
    c.save();
    c.translate(x, y);

    // body
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

    // top level gets a sparkle ring
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

  function buildSprites() {
    sprites.length = 0;
    LEVELS.forEach((L, i) => {
      const pair = [false, true].map((blink) => {
        const pad = 4;
        const size = Math.ceil((L.r * 2 + pad * 2) * pxScale);
        const cv = document.createElement('canvas');
        cv.width = cv.height = size;
        const c = cv.getContext('2d');
        c.scale(pxScale, pxScale);
        drawOrb(c, i, L.r, blink, L.r + pad, L.r + pad);
        return cv;
      });
      sprites.push({ open: pair[0], closed: pair[1], half: L.r + 4 });
    });
  }

  // ---------- Physics ----------
  const engine = Engine.create({ positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1.35;
  const world = engine.world;

  const wallOpts = { isStatic: true, friction: 0.2, restitution: 0.1, label: 'wall' };
  Composite.add(world, [
    Bodies.rectangle(W / 2, H + 50, W + 400, 100, wallOpts),
    Bodies.rectangle(-50, H / 2 - 400, 100, H + 1200, wallOpts),
    Bodies.rectangle(W + 50, H / 2 - 400, 100, H + 1200, wallOpts),
  ]);

  // ---------- State ----------
  let state = 'start'; // start | playing | paused | dying | over
  let score = 0;
  let best = store.get('suika.best', 0);
  let bestLevel = store.get('suika.bestLevel', 0);
  let gameMaxLevel = 0;
  let gameTime = 0;
  let aimX = W / 2;
  let current = 0;
  let nextLevel = 0;
  let heldAt = 0;        // gameTime when current orb became available
  let canDrop = true;
  let combo = 0;
  let lastMergeAt = -9999;
  let overTimer = 0;
  let shake = 0;
  let flash = 0;
  let warned = false;
  let pointerDown = false;
  let showAim = false;
  let mergeQueue = [];
  const particles = [];
  const rings = [];
  const texts = [];

  function randDroppable() {
    // early game favours small numbers
    const max = gameTime < 15000 ? 3 : DROPPABLE;
    const w = [5, 4, 3, 2, 1].slice(0, max);
    let t = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < w.length; i++) { if ((t -= w[i]) < 0) return i; }
    return 0;
  }

  function orbs() { return Composite.allBodies(world).filter((b) => b.label === 'orb'); }

  function makeOrb(level, x, y) {
    const b = Bodies.circle(x, y, LEVELS[level].r, {
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
    b.pop = 0;
    b.blinkAt = gameTime + 1500 + Math.random() * 4000;
    b.landed = false;
    Composite.add(world, b);
    return b;
  }

  Events.on(engine, 'collisionStart', (e) => {
    for (const p of e.pairs) {
      collide(p);
      const a = p.bodyA, b = p.bodyB;
      for (const o of [a, b]) {
        if (o.label === 'orb' && !o.landed) {
          o.landed = true;
          const v = Math.hypot(o.velocity.x, o.velocity.y);
          if (v > 2) Sfx.land(v);
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

      combo = gameTime - lastMergeAt < 1100 ? combo + 1 : 1;
      lastMergeAt = gameTime;

      let gained;
      if (level === MAX_LEVEL) {
        gained = 500 * combo;
        burst(x, y, LEVELS[level].color, 80, 1.6);
        burst(x, y, '#ffffff', 40, 1.2);
        rings.push({ x, y, r: LEVELS[level].r, life: 0, max: 700, color: '#fff' });
        floatText(x, y, `+${gained}`, '#fff', 34);
        toast('Sempurna! 11 + 11 lenyap ✨');
        shake = 18; flash = 0.6;
        Sfx.merge(level, combo);
        Sfx.record();
      } else {
        const nl = level + 1;
        const n = makeOrb(nl, x, y);
        Body.setVelocity(n, { x: vx * 0.5, y: vy * 0.5 - 1 });
        n.landed = true;
        gained = ((nl + 1) * (nl + 2) / 2) * combo;
        const col = LEVELS[nl].color;
        burst(x, y, col, 10 + nl * 3, 0.6 + nl * 0.08);
        rings.push({ x, y, r: LEVELS[nl].r, life: 0, max: 380, color: col });
        floatText(x, y - LEVELS[nl].r * 0.3, `+${gained}`, '#fff', 16 + nl * 1.6);
        if (nl >= 6) { shake = Math.max(shake, 4 + nl * 1.2); }
        if (nl >= 8) flash = 0.25;
        Sfx.merge(nl, combo);
        if (nl > gameMaxLevel) {
          gameMaxLevel = nl;
          if (nl >= 5) toast(`Baru! Angka ${nl + 1} 🎉`);
        }
        if (nl > bestLevel) { bestLevel = nl; store.set('suika.bestLevel', bestLevel); drawEvo(); }
      }
      if (combo >= 2) {
        floatText(x, y + 26, `Combo x${combo}`, '#ffd23f', 18);
        Sfx.combo(combo);
      }
      addScore(gained);
      try { navigator.vibrate && navigator.vibrate(level >= 5 ? 25 : 8); } catch { /* ignore */ }
    }
  }

  function addScore(n) {
    score += n;
    scoreEl.textContent = score;
    scoreEl.classList.remove('bump');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('bump');
    setTimeout(() => scoreEl.classList.remove('bump'), 120);
    if (score > best) {
      best = score;
      bestEl.textContent = best;
    }
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
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
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

  // ---------- Game flow ----------
  function resetGame() {
    for (const b of orbs()) Composite.remove(world, b);
    particles.length = rings.length = texts.length = 0;
    mergeQueue = [];
    score = 0; gameTime = 0; combo = 0; overTimer = 0; gameMaxLevel = 0;
    scoreEl.textContent = '0';
    bestEl.textContent = best;
    current = randDroppable();
    nextLevel = randDroppable();
    canDrop = true; heldAt = 0;
    aimX = W / 2;
    drawNext();
  }

  function startGame() {
    Sfx.unlock();
    Sfx.click();
    resetGame();
    state = 'playing';
    hideOverlays();
  }

  function drop() {
    if (state !== 'playing' || !canDrop) return;
    const r = LEVELS[current].r;
    const x = clamp(aimX, r + 1, W - r - 1);
    const b = makeOrb(current, x, DROP_Y);
    Body.setAngle(b, (Math.random() - 0.5) * 0.6);
    Body.setVelocity(b, { x: 0, y: 2 });
    Sfx.drop();
    canDrop = false;
    current = nextLevel;
    nextLevel = randDroppable();
    drawNext();
    setTimeout(() => { canDrop = true; heldAt = gameTime; }, DROP_COOLDOWN);
  }

  function checkOver(dt) {
    let above = false, near = false;
    for (const b of orbs()) {
      if (b.merging || gameTime - b.born < 1200) continue;
      const top = b.position.y - LEVELS[b.level].r;
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
    if (overTimer > OVER_TIME) gameOver();
  }
  let dangerLevel = 0;

  function gameOver() {
    state = 'dying';
    Sfx.over();
    const list = orbs().sort((a, b) => a.position.y - b.position.y);
    let i = 0;
    const step = () => {
      if (i >= list.length) { setTimeout(showOver, 350); return; }
      const b = list[i++];
      burst(b.position.x, b.position.y, LEVELS[b.level].color, 14, 0.8);
      Composite.remove(world, b);
      Sfx.pop();
      setTimeout(step, Math.max(30, 110 - i * 4));
    };
    setTimeout(step, 500);
  }

  function showOver() {
    state = 'over';
    const prevBest = store.get('suika.best', 0);
    const isRecord = score > prevBest;
    if (isRecord) { store.set('suika.best', score); }
    $('final-score').textContent = score;
    $('final-best').innerHTML = isRecord && score > 0
      ? '<span class="new">Rekor baru!</span>'
      : `Terbaik: <b>${Math.max(prevBest, score)}</b>`;
    $('final-max').innerHTML = `Angka tertinggi: <b>${gameMaxLevel + 1}</b>`;
    if (isRecord && score > 0) Sfx.record();
    showOverlay('overlay-over');
  }

  // ---------- Overlays ----------
  function showOverlay(id) {
    hideOverlays();
    $(id).classList.add('show');
  }
  function hideOverlays() {
    document.querySelectorAll('.overlay').forEach((o) => o.classList.remove('show'));
  }

  function pause() {
    if (state !== 'playing') return;
    state = 'paused';
    showOverlay('overlay-pause');
  }
  function resume() {
    if (state !== 'paused') return;
    state = 'playing';
    hideOverlays();
    last = performance.now();
  }

  // ---------- Rendering ----------
  let cssW = 0, cssH = 0, dpr = 1;

  function resize() {
    const stage = $('stage');
    const sw = stage.clientWidth, sh = stage.clientHeight;
    const scale = Math.min(sw / W, sh / H);
    cssW = Math.floor(W * scale);
    cssH = Math.floor(H * scale);
    dpr = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 2 : 2.5);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    document.querySelectorAll('.overlay').forEach((o) => {
      o.style.inset = 'auto';
      o.style.width = cssW + 'px';
      o.style.height = cssH + 'px';
    });
    pxScale = (cssW / W) * dpr;
    buildSprites();
    drawNext();
    drawEvo();
  }

  function drawBackground(c) {
    // jar interior
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fff3dc');
    g.addColorStop(1, '#ffe2b8');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // soft dots pattern
    c.fillStyle = 'rgba(255,170,90,.12)';
    for (let y = 20; y < H; y += 40) {
      for (let x = (y / 40) % 2 ? 20 : 40; x < W; x += 40) {
        c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
      }
    }

    // floor
    c.fillStyle = '#e8b57a';
    c.fillRect(0, H - 6, W, 6);

    // danger line
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

    // aim guide + held orb
    if (state === 'playing') {
      const r = LEVELS[current].r;
      const x = clamp(aimX, r + 1, W - r - 1);
      if (canDrop) {
        c.save();
        c.strokeStyle = 'rgba(120,70,40,.25)';
        c.lineWidth = 2;
        c.setLineDash([4, 8]);
        c.beginPath(); c.moveTo(x, DROP_Y + r); c.lineTo(x, H); c.stroke();
        c.restore();
        const pop = Math.min(1, (gameTime - heldAt) / 180);
        const s = easeOutBack(pop);
        drawSprite(c, current, x, DROP_Y + Math.sin(performance.now() / 300) * 2, 0, Math.max(0.01, s), false);
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

    if (flash > 0) {
      c.fillStyle = `rgba(255,255,255,${flash})`;
      c.fillRect(-20, -20, W + 40, H + 40);
    }
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
    const size = 64 * 2;
    nextCanvas.width = nextCanvas.height = size;
    nextCtx.clearRect(0, 0, size, size);
    const r = LEVELS[nextLevel].r;
    const target = 24 + nextLevel * 4.5;
    nextCtx.save();
    nextCtx.translate(size / 2, size / 2);
    nextCtx.scale(target / r, target / r);
    drawOrb(nextCtx, nextLevel, r, false);
    nextCtx.restore();
  }

  function drawEvo() {
    const w = evoCanvas.clientWidth || 400, h = evoCanvas.clientHeight || 44;
    const d = Math.min(window.devicePixelRatio || 1, 2.5);
    evoCanvas.width = Math.round(w * d);
    evoCanvas.height = Math.round(h * d);
    const c = evoCtx;
    c.setTransform(d, 0, 0, d, 0, 0);
    c.clearRect(0, 0, w, h);
    const n = LEVELS.length;
    const gap = w / n;
    for (let i = 0; i < n; i++) {
      const rr = Math.min(gap * 0.46, h * 0.46) * (0.62 + 0.38 * (i / (n - 1)));
      c.globalAlpha = i <= bestLevel ? 1 : 0.28;
      drawOrb(c, i, rr, false, gap * (i + 0.5), h / 2);
    }
    c.globalAlpha = 1;
  }

  function drawHero() {
    const hc = $('hero').getContext('2d');
    const w = 300, h = 90;
    $('hero').width = w * 2; $('hero').height = h * 2;
    hc.scale(2, 2);
    hc.font = '700 26px Fredoka, ui-rounded, system-ui, sans-serif';
    hc.textAlign = 'center'; hc.textBaseline = 'middle';
    hc.fillStyle = '#2a1840';
    drawOrb(hc, 0, 24, false, 40, 50);
    hc.fillText('+', 88, 50);
    drawOrb(hc, 0, 24, false, 136, 50);
    hc.fillText('=', 186, 50);
    drawOrb(hc, 1, 34, false, 246, 48);
  }

  // ---------- Utils ----------
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeOutBack(t) {
    t = clamp(t, 0, 1);
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // ---------- Input ----------
  function toWorldX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }
  // listen on the whole stage so touches beside the jar still aim
  const stageEl = $('stage');
  stageEl.addEventListener('pointerdown', (e) => {
    Sfx.unlock();
    if (state !== 'playing') return;
    pointerDown = true;
    aimX = toWorldX(e.clientX);
    try { stageEl.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    e.preventDefault();
  });
  stageEl.addEventListener('pointermove', (e) => {
    if (state !== 'playing') return;
    if (e.pointerType === 'mouse' || pointerDown) aimX = toWorldX(e.clientX);
    showAim = true;
  });
  stageEl.addEventListener('pointerup', (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    aimX = toWorldX(e.clientX);
    drop();
  });
  stageEl.addEventListener('pointercancel', () => { pointerDown = false; });

  const keys = {};
  window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (state === 'start' || state === 'over') startGame();
      else if (state === 'playing') drop();
      else if (state === 'paused') resume();
    }
    if (e.key === 'Escape' || e.key === 'p') { state === 'paused' ? resume() : pause(); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  $('btn-start').addEventListener('click', startGame);
  $('btn-again').addEventListener('click', startGame);
  $('btn-resume').addEventListener('click', () => { Sfx.click(); resume(); });
  $('btn-restart').addEventListener('click', startGame);
  $('btn-pause').addEventListener('click', () => { Sfx.unlock(); Sfx.click(); state === 'paused' ? resume() : pause(); });
  const soundBtn = $('btn-sound');
  const syncSound = () => { soundBtn.textContent = Sfx.muted ? '🔇' : '🔊'; };
  syncSound();
  soundBtn.addEventListener('click', () => { Sfx.unlock(); Sfx.setMuted(!Sfx.muted); syncSound(); Sfx.click(); });
  $('btn-share').addEventListener('click', async () => {
    const text = `Aku dapat skor ${score} di Suika Angka (angka tertinggi ${gameMaxLevel + 1})! Coba kalahkan:`;
    const url = location.href.split('#')[0];
    try {
      if (navigator.share) { await navigator.share({ title: 'Suika Angka', text, url }); return; }
      await navigator.clipboard.writeText(`${text} ${url}`);
      toast('Link disalin!');
    } catch { /* cancelled */ }
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  let resizeT = 0;
  const queueResize = () => { clearTimeout(resizeT); resizeT = setTimeout(resize, 60); };
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', queueResize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', queueResize);
  window.addEventListener('blur', pause);
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  // stop iOS double-tap / pinch zoom
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // ---------- Loop ----------
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    let dt = now - last;
    last = now;
    if (dt > 100) dt = 100;

    if (state === 'playing' || state === 'dying') {
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
    }
    if (state !== 'paused') updateFx(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- Boot ----------
  bestEl.textContent = best;
  current = randDroppable();
  nextLevel = randDroppable();
  resize();
  drawHero();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => { buildSprites(); drawNext(); drawEvo(); drawHero(); });
  }
  requestAnimationFrame(frame);

  // debug hook for automated tests
  window.__suika = {
    get state() { return state; },
    get score() { return score; },
    orbs: () => orbs().map((b) => ({ level: b.level, x: b.position.x, y: b.position.y })),
    drop: (x) => { aimX = x; drop(); },
    spawn: (level, x, y) => makeOrb(level, x, y),
  };
})();
