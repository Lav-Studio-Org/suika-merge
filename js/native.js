// Native (Capacitor / Android) bridge: real AdMob ads, hardware back button, app pause.
// On the website this file does nothing and the game uses the mock ads in ads.js.
(() => {
  'use strict';
  const SA = (window.SA = window.SA || {});
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;

  const { AdMob, App } = Cap.Plugins;
  const CFG = SA.ADMOB;

  // ---------- Back button & lifecycle ----------
  if (App) {
    App.addListener('backButton', () => {
      if (!(SA.handleBack && SA.handleBack())) App.exitApp();
    });
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive && SA.pause) SA.pause();
      if (isActive && SA.Sfx) SA.Sfx.recover();
    });
  }

  if (!AdMob) return;

  // ---------- AdMob ----------
  let ready = null;          // init promise
  let rewardedLoaded = false;
  let interLoaded = false;

  function once(event, fails, timeoutMs) {
    // resolves when `event` fires, or with false on any of the `fails` events / timeout
    return new Promise((resolve) => {
      const handles = [];
      const done = (v) => { handles.forEach((h) => h.then((x) => x.remove())); clearTimeout(t); resolve(v); };
      handles.push(AdMob.addListener(event, () => done(true)));
      fails.forEach((f) => handles.push(AdMob.addListener(f, () => done(false))));
      const t = setTimeout(() => done(false), timeoutMs);
    });
  }

  async function loadRewarded() {
    try { await AdMob.prepareRewardVideoAd({ adId: CFG.rewarded, isTesting: CFG.testing }); rewardedLoaded = true; }
    catch { rewardedLoaded = false; }
  }
  async function loadInterstitial() {
    try { await AdMob.prepareInterstitial({ adId: CFG.interstitial, isTesting: CFG.testing }); interLoaded = true; }
    catch { interLoaded = false; }
  }

  async function init() {
    try {
      // UMP consent (shows Google's consent form in the EEA/UK when required)
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === 'REQUIRED') await AdMob.showConsentForm();
    } catch { /* consent is optional outside regulated regions */ }
    await AdMob.initialize({ initializeForTesting: CFG.testing });
    loadRewarded();
    loadInterstitial();
  }
  ready = init().catch(() => {});

  SA.nativeAdProvider = {
    async showRewarded() {
      await ready;
      if (!rewardedLoaded) await loadRewarded();
      if (!rewardedLoaded) return false;
      rewardedLoaded = false;
      let earned = false;
      const rewardH = AdMob.addListener('onRewardedVideoAdReward', () => { earned = true; });
      const closed = once('onRewardedVideoAdDismissed', ['onRewardedVideoAdFailedToShow'], 120000);
      try { await AdMob.showRewardVideoAd(); } catch { /* reported through events */ }
      await closed;
      (await rewardH).remove();
      loadRewarded();
      return earned;
    },
    async showInterstitial() {
      await ready;
      if (!interLoaded) { loadInterstitial(); return false; } // never block the player waiting for one
      interLoaded = false;
      const closed = once('interstitialAdDismissed', ['interstitialAdFailedToShow'], 120000);
      try { await AdMob.showInterstitial(); } catch { /* reported through events */ }
      const ok = await closed;
      loadInterstitial();
      return ok;
    },
  };
})();
