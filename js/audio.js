// Synthesized sound effects and background music (Web Audio, no asset files).
(() => {
  'use strict';
  const SA = (window.SA = window.SA || {});

  const Sfx = {
    ac: null,
    sfxGain: null,
    musicGain: null,
    soundOn: true,
    musicOn: true,
    ducked: false,

    unlock() {
      if (!this.ac) this.build();
      if (!this.ac) return;
      // 'interrupted' is what iOS reports after a call or another app takes audio
      if (this.ac.state === 'suspended' || this.ac.state === 'interrupted') this.ac.resume().catch(() => {});
    },
    build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ac = new AC();
      const comp = this.ac.createDynamicsCompressor();
      comp.connect(this.ac.destination);
      this.sfxGain = this.ac.createGain();
      this.musicGain = this.ac.createGain();
      this.sfxGain.connect(comp);
      this.musicGain.connect(comp);
      this.apply();
      Music.resync();
    },
    // Call when the page comes back from the background or from a full-screen ad.
    // Android WebView can leave the old context "running" but silent after another
    // activity held the audio output, so in the app we start a fresh context.
    recover() {
      if (!this.ac) return;
      const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      if (native) {
        const old = this.ac;
        this.ac = null;
        old.close().catch(() => {});
        this.build();
      }
      this.unlock();
    },
    configure({ sound, music }) {
      this.soundOn = sound;
      this.musicOn = music;
      this.apply();
    },
    // mute everything while an ad is on screen
    duck(on) {
      this.ducked = on;
      this.apply();
    },
    apply() {
      if (!this.ac) return;
      const t = this.ac.currentTime;
      this.sfxGain.gain.setTargetAtTime(this.soundOn && !this.ducked ? 0.6 : 0, t, 0.02);
      this.musicGain.gain.setTargetAtTime(this.musicOn && !this.ducked ? 0.5 : 0, t, 0.1);
    },

    tone(freq, dur, { type = 'sine', vol = 0.3, slide = 1, delay = 0, attack = 0.005, out } = {}) {
      if (!this.ac) return;
      if (!out && !this.soundOn) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(out || this.sfxGain);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur, { vol = 0.2, freq = 1200, delay = 0 } = {}) {
      if (!this.ac || !this.soundOn) return;
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
      src.connect(f).connect(g).connect(this.sfxGain);
      src.start(t);
    },

    drop() { this.tone(330, 0.09, { type: 'triangle', vol: 0.18, slide: 0.55 }); },
    land(v) { this.tone(140 + Math.random() * 40, 0.06, { vol: Math.min(0.2, v * 0.03), slide: 0.7 }); },
    merge(level, combo) {
      const base = 260 * Math.pow(2, (level + Math.min(combo, 6)) / 7);
      this.tone(base, 0.14, { vol: 0.32, slide: 1.9 });
      this.tone(base * 1.5, 0.12, { type: 'triangle', vol: 0.12, slide: 1.6, delay: 0.02 });
      this.noise(0.06, { vol: 0.12, freq: 2500 });
      if (level >= 6) {
        this.tone(base / 2, 0.35, { vol: 0.3, slide: 0.5 });
        this.noise(0.25, { vol: 0.18, freq: 500 });
      }
    },
    combo(n) {
      const notes = [523, 659, 784, 1047, 1319];
      for (let i = 0; i < Math.min(n, 5); i++) this.tone(notes[i], 0.12, { type: 'square', vol: 0.06, delay: i * 0.05 });
    },
    record() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.18, delay: i * 0.09 })); },
    coin() { this.tone(988, 0.08, { type: 'square', vol: 0.07 }); this.tone(1319, 0.18, { type: 'square', vol: 0.07, delay: 0.07 }); },
    warn() { this.tone(880, 0.08, { type: 'square', vol: 0.05 }); },
    over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.16, slide: 0.97 })); },
    pop() { this.tone(500 + Math.random() * 400, 0.08, { vol: 0.15, slide: 1.8 }); },
    click() { this.tone(700, 0.05, { type: 'triangle', vol: 0.12 }); },
    smash() { this.noise(0.3, { vol: 0.35, freq: 300 }); this.tone(120, 0.3, { vol: 0.3, slide: 0.4 }); },
    whoosh() { this.noise(0.4, { vol: 0.25, freq: 900 }); },
    swap() { this.tone(500, 0.08, { type: 'triangle', vol: 0.15, slide: 1.5 }); this.tone(750, 0.08, { type: 'triangle', vol: 0.15, slide: 0.66, delay: 0.08 }); },
    revive() { [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.15, { type: 'triangle', vol: 0.18, delay: i * 0.06 })); },
  };

  // Gentle generative loop: pentatonic plucks over a I-V-vi-IV bass line.
  const Music = {
    timer: 0,
    nextT: 0,
    step: 0,
    playing: false,
    bpm: 96,
    start() {
      if (this.playing || !Sfx.ac) return;
      this.playing = true;
      this.nextT = Sfx.ac.currentTime + 0.1;
      this.timer = setInterval(() => this.schedule(), 100);
    },
    stop() {
      this.playing = false;
      clearInterval(this.timer);
    },
    // keep the schedule in step with the (possibly new) audio clock
    resync() {
      if (Sfx.ac) this.nextT = Sfx.ac.currentTime + 0.1;
    },
    schedule() {
      const ac = Sfx.ac;
      if (!ac) return;
      const eighth = 60 / this.bpm / 2;
      // after a stall (timers throttled, context swapped) skip ahead instead of
      // firing every missed note at once
      if (this.nextT < ac.currentTime - 0.5 || this.nextT > ac.currentTime + 2) this.nextT = ac.currentTime + 0.05;
      const roots = [130.81, 196.0, 220.0, 174.61]; // C G A F
      const scale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33];
      while (this.nextT < ac.currentTime + 0.3) {
        const bar = Math.floor(this.step / 8) % 4;
        const delay = Math.max(0, this.nextT - ac.currentTime);
        if (this.step % 8 === 0 || this.step % 8 === 4) {
          Sfx.tone(roots[bar], eighth * 3.5, { vol: 0.09, delay, attack: 0.02, out: Sfx.musicGain });
        }
        if (Math.random() < (this.step % 2 ? 0.25 : 0.55)) {
          const f = scale[Math.floor(Math.random() * scale.length)];
          Sfx.tone(f, eighth * 1.6, { type: 'triangle', vol: 0.045, delay, out: Sfx.musicGain });
        }
        this.nextT += eighth;
        this.step++;
      }
    },
  };

  SA.Sfx = Sfx;
  SA.Music = Music;

  // any touch anywhere can (re)start audio, and returning to the page restores it
  document.addEventListener('pointerdown', () => Sfx.unlock(), { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Sfx.recover(); });
})();
