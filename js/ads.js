// Ad layer. Every ad in the game goes through SA.Ads, so a real SDK
// (e.g. AdMob through Capacitor) only has to replace the two `provider` calls.
//
// Placements:
//   rewarded:      revive, double_coins, daily_double, mission_double, free_coins, power_<id>
//   interstitial:  game_over (only between rounds, frequency-capped)
(() => {
  'use strict';
  const SA = (window.SA = window.SA || {});

  const POLICY = {
    firstInterstitialAfterGames: 3, // new players never see one in their first 3 games
    gamesBetweenInterstitials: 2,   // at most every 2nd game over
    minSecondsBetweenAds: 90,       // and never within 90s of any other ad (incl. rewarded)
  };

  const state = { lastAdAt: 0, gamesSinceInterstitial: 0 };

  // ---------- Mock provider: a fake full-screen ad so the flow can be tested ----------
  function mockAd({ kind, placement }) {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'ad-mock';
      const secs = kind === 'rewarded' ? 5 : 3;
      el.innerHTML = `
        <div class="ad-box">
          <div class="ad-tag">IKLAN CONTOH</div>
          <div class="ad-title">${kind === 'rewarded' ? 'Iklan berhadiah' : 'Iklan'}</div>
          <div class="ad-sub">placement: <b>${placement}</b></div>
          <div class="ad-ring"><span>${secs}</span></div>
          <p class="ad-note">Di versi Play Store, di sini tampil iklan asli.</p>
          <button class="ad-close" disabled>${kind === 'rewarded' ? 'Tunggu...' : 'Lewati dalam ' + secs}</button>
        </div>`;
      document.body.appendChild(el);
      requestAnimationFrame(() => el.classList.add('show'));
      const btn = el.querySelector('.ad-close');
      const num = el.querySelector('.ad-ring span');
      let left = secs;
      const iv = setInterval(() => {
        left--;
        num.textContent = Math.max(0, left);
        if (left > 0) {
          if (kind !== 'rewarded') btn.textContent = 'Lewati dalam ' + left;
          return;
        }
        clearInterval(iv);
        btn.disabled = false;
        btn.textContent = kind === 'rewarded' ? 'Ambil hadiah ✓' : 'Tutup ✕';
      }, 1000);
      btn.addEventListener('click', () => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 250);
        resolve(true);
      });
    });
  }

  const provider = {
    // return Promise<boolean>: true when the ad was shown (and for rewarded: fully watched)
    showRewarded: (placement) => mockAd({ kind: 'rewarded', placement }),
    showInterstitial: (placement) => mockAd({ kind: 'interstitial', placement }),
  };

  async function run(kind, placement) {
    SA.track('ad_request', { kind, placement });
    SA.Sfx && SA.Sfx.duck(true);
    let ok = false;
    try {
      ok = kind === 'rewarded' ? await provider.showRewarded(placement) : await provider.showInterstitial(placement);
    } catch { ok = false; }
    SA.Sfx && SA.Sfx.duck(false);
    state.lastAdAt = Date.now();
    SA.track(ok ? 'ad_complete' : 'ad_failed', { kind, placement });
    return ok;
  }

  SA.Ads = {
    POLICY,
    rewarded(placement) { return run('rewarded', placement); },

    // call once per finished game
    gameFinished() { state.gamesSinceInterstitial++; },

    canInterstitial() {
      const p = SA.profile;
      if (p.noAds) return false;
      if (p.games < POLICY.firstInterstitialAfterGames) return false;
      if (state.gamesSinceInterstitial < POLICY.gamesBetweenInterstitials) return false;
      if (Date.now() - state.lastAdAt < POLICY.minSecondsBetweenAds * 1000) return false;
      return true;
    },

    async maybeInterstitial(placement) {
      if (!this.canInterstitial()) return false;
      state.gamesSinceInterstitial = 0;
      return run('interstitial', placement);
    },
  };
})();
