// Player profile, economy, themes, daily reward and daily missions.
(() => {
  'use strict';
  const SA = (window.SA = window.SA || {});

  // ---------- Analytics stub (swap for Firebase/GA later) ----------
  SA.track = (event, data = {}) => {
    try { window.dispatchEvent(new CustomEvent('sa:track', { detail: { event, ...data } })); } catch { /* ignore */ }
  };

  // ---------- Themes ----------
  SA.THEMES = [
    {
      id: 'klasik', name: 'Klasik', price: 0,
      bg: ['#fff3dc', '#ffe2b8'], dots: 'rgba(255,170,90,.12)', floor: '#e8b57a', guide: 'rgba(120,70,40,.25)',
      colors: ['#ff6b81', '#ff9f43', '#fecb3e', '#9ee04a', '#1dd1a1', '#38c6f4', '#4d7cfe', '#8e6cff', '#d66bff', '#ff7eb6', '#ffc233'],
    },
    {
      id: 'permen', name: 'Permen', price: 400,
      bg: ['#ffeef6', '#ffd6ea'], dots: 'rgba(255,120,180,.12)', floor: '#f5a3c7', guide: 'rgba(160,60,110,.25)',
      colors: ['#ff9aa2', '#ffb7b2', '#ffdac1', '#e2f0cb', '#b5ead7', '#a0e7e5', '#b4c8ff', '#c7b3ff', '#f1b3ff', '#ffb3de', '#ffe08a'],
    },
    {
      id: 'malam', name: 'Malam Neon', price: 800,
      bg: ['#1f1a40', '#2e2163'], dots: 'rgba(255,255,255,.06)', floor: '#5b4bb5', guide: 'rgba(255,255,255,.22)',
      colors: ['#ff4d8d', '#ff8a3d', '#ffe14d', '#7dff5c', '#2bffc6', '#2bd9ff', '#5c8dff', '#a66bff', '#ff5cf0', '#ff7aa8', '#fff26b'],
    },
    {
      id: 'laut', name: 'Laut', price: 1200,
      bg: ['#e3f7ff', '#b6e5fb'], dots: 'rgba(40,140,200,.1)', floor: '#7cc3e6', guide: 'rgba(20,80,130,.25)',
      colors: ['#ff8f70', '#ffbf69', '#f9e07f', '#9be3a2', '#4fd1c5', '#38b2ff', '#3b82f6', '#6366f1', '#14b8a6', '#0ea5e9', '#fcd34d'],
    },
  ];
  SA.themeById = (id) => SA.THEMES.find((t) => t.id === id) || SA.THEMES[0];

  // ---------- Game modes ----------
  // Each challenge mode tests a different skill: balance (glass), speed (blitz), adapting (quake).
  SA.MODES = [
    { id: 'casual', name: 'Santai', icon: 'leaf', color: 't-green', stars: 1, coinMult: 1, desc: 'Mode klasik. Jaga tumpukan di bawah garis merah.' },
    { id: 'glass', name: 'Gelas', icon: 'cup', color: 't-blue', stars: 2, coinMult: 1.5, desc: 'Gelas tanpa tutup. Kalah kalau ada bola yang tumpah.' },
    { id: 'blitz', name: 'Kilat', icon: 'timer', color: 't-orange', stars: 2, coinMult: 1.5, desc: '60 detik! Gabung angka besar untuk tambah waktu.' },
    { id: 'quake', name: 'Goyang', icon: 'quake', color: 't-pink', stars: 3, coinMult: 2, desc: 'Toples terus miring dan sesekali gempa. Makin lama makin kencang.' },
  ];
  SA.modeById = (id) => SA.MODES.find((m) => m.id === id) || SA.MODES[0];

  // ---------- Power-ups ----------
  SA.POWERS = {
    hammer: { name: 'Palu', icon: 'hammer', price: 60, desc: 'Pecahkan satu bola mana pun.' },
    shake: { name: 'Guncang', icon: 'shake', price: 40, desc: 'Guncang toples supaya tumpukan teracak.' },
    swap: { name: 'Tukar', icon: 'swap', price: 25, desc: 'Tukar bola sekarang dengan bola berikutnya.' },
  };

  // ---------- Dates ----------
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yesterdayKey = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayKey(d); };
  SA.dayKey = dayKey;

  // ---------- Profile ----------
  const KEY = 'suika.profile.v1';
  const defaults = () => ({
    coins: 100,
    best: 0,
    bestLevel: 0,
    games: 0,
    totalMerges: 0,
    owned: ['klasik'],
    theme: 'klasik',
    power: { hammer: 1, shake: 1, swap: 2 },
    settings: { sound: true, music: true, vibe: true },
    tutorialDone: false,
    daily: { last: '', streak: 0 },
    missions: { date: '', list: [] },
    freeCoins: { date: '', count: 0 },
    noAds: false,
    mode: 'casual',
    bests: {},          // best score per mode
    modesPlayed: [],
  });

  function load() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(KEY)); } catch { /* ignore */ }
    const d = defaults();
    if (!p) {
      // migrate from the first release
      try {
        d.best = JSON.parse(localStorage.getItem('suika.best')) || 0;
        d.bestLevel = JSON.parse(localStorage.getItem('suika.bestLevel')) || 0;
        const muted = JSON.parse(localStorage.getItem('suika.muted'));
        if (muted) d.settings.sound = d.settings.music = false;
        if (d.best > 0) d.tutorialDone = true;
      } catch { /* ignore */ }
      if (d.best) d.bests.casual = d.best;
      return d;
    }
    const out = { ...d, ...p, power: { ...d.power, ...p.power }, settings: { ...d.settings, ...p.settings }, bests: { ...d.bests, ...p.bests } };
    if (!out.bests.casual && out.best) out.bests.casual = out.best; // scores before modes existed
    return out;
  }

  const profile = load();
  SA.profile = profile;
  SA.save = () => { try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* ignore */ } };
  SA.addCoins = (n) => { profile.coins = Math.max(0, profile.coins + n); SA.save(); SA.emit('coins'); };

  // tiny event bus for UI refreshes
  const handlers = {};
  SA.on = (ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); };
  SA.emit = (ev, data) => { (handlers[ev] || []).forEach((fn) => fn(data)); };

  // ---------- Daily reward ----------
  SA.DAILY_REWARDS = [20, 30, 40, 50, 70, 90, 150];
  SA.dailyAvailable = () => profile.daily.last !== dayKey();
  SA.dailyNextStreak = () => (profile.daily.last === yesterdayKey() ? (profile.daily.streak % 7) + 1 : 1);
  SA.claimDaily = (mult = 1) => {
    if (!SA.dailyAvailable()) return 0;
    const streak = SA.dailyNextStreak();
    const amount = SA.DAILY_REWARDS[streak - 1] * mult;
    profile.daily = { last: dayKey(), streak };
    SA.addCoins(amount);
    SA.track('daily_claim', { streak, mult });
    return amount;
  };

  // ---------- Daily missions ----------
  const POOL = [
    { type: 'reach', targets: [6, 7, 8], text: (t) => `Buat angka ${t}`, reward: (t) => 20 + t * 5 },
    { type: 'score', targets: [800, 1500, 2500], text: (t) => `Skor ${t} dalam satu game`, reward: (t) => Math.round(t / 40) },
    { type: 'combo', targets: [3, 4], text: (t) => `Raih combo x${t}`, reward: (t) => t * 12 },
    { type: 'merges', targets: [30, 60, 100], text: (t) => `Gabungkan ${t} kali`, reward: (t) => Math.round(t * 0.6) },
    { type: 'games', targets: [2, 3], text: (t) => `Main ${t} game`, reward: (t) => t * 12 },
    { type: 'power', targets: [1, 2], text: (t) => `Pakai ${t} power-up`, reward: (t) => t * 20 },
  ];

  function seeded(seed) {
    let s = 0;
    for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  SA.ensureMissions = () => {
    const today = dayKey();
    if (profile.missions.date === today && profile.missions.list.length) return;
    const rnd = seeded(today);
    const types = POOL.slice().sort(() => rnd() - 0.5).slice(0, 3);
    profile.missions = {
      date: today,
      list: types.map((m) => {
        const target = m.targets[Math.floor(rnd() * m.targets.length)];
        return { type: m.type, target, text: m.text(target), reward: m.reward(target), progress: 0, claimed: false };
      }),
    };
    SA.save();
  };

  SA.missionDone = (m) => m.progress >= m.target;
  SA.missionsClaimable = () => { SA.ensureMissions(); return profile.missions.list.filter((m) => SA.missionDone(m) && !m.claimed).length; };

  // event: { type, value } — 'reach' and 'score' and 'combo' track a best value, the others accumulate
  SA.missionEvent = (type, value = 1) => {
    SA.ensureMissions();
    let changed = false;
    for (const m of profile.missions.list) {
      if (m.type !== type || m.claimed) continue;
      const wasDone = SA.missionDone(m);
      if (type === 'reach' || type === 'score' || type === 'combo') m.progress = Math.max(m.progress, value);
      else m.progress += value;
      m.progress = Math.min(m.progress, m.target);
      if (!wasDone && SA.missionDone(m)) SA.emit('mission-done', m);
      changed = true;
    }
    if (changed) SA.save();
  };

  SA.claimMission = (i, mult = 1) => {
    const m = profile.missions.list[i];
    if (!m || m.claimed || !SA.missionDone(m)) return 0;
    m.claimed = true;
    const amount = m.reward * mult;
    SA.addCoins(amount);
    SA.track('mission_claim', { type: m.type, mult });
    return amount;
  };

  // ---------- Free coins from the shop (rewarded ad, capped per day) ----------
  SA.FREE_COINS = 50;
  SA.FREE_COINS_PER_DAY = 5;
  SA.freeCoinsLeft = () => (profile.freeCoins.date === dayKey() ? SA.FREE_COINS_PER_DAY - profile.freeCoins.count : SA.FREE_COINS_PER_DAY);
  SA.takeFreeCoins = () => {
    if (profile.freeCoins.date !== dayKey()) profile.freeCoins = { date: dayKey(), count: 0 };
    profile.freeCoins.count++;
    SA.addCoins(SA.FREE_COINS);
  };
})();
