# Suika Angka 🍉🔢

Game merge ala **Suika Game**: jatuhkan bola angka ke dalam toples, gabungkan dua angka yang sama untuk jadi angka berikutnya.
`1 + 1 = 2`, `2 + 2 = 3`, ... sampai `11`. Dua angka 11 yang bertemu akan lenyap dengan bonus besar.

- **Main di browser:** https://lavaruz.github.io/suika-merge/
- **APK Android (build test):** https://github.com/Lavaruz/suika-merge/releases/tag/android-latest
- **Panduan rilis Play Store dan strategi iklan:** [docs/PLAY_STORE.md](docs/PLAY_STORE.md)

## Fitur
- Fisika nyata (Matter.js), 11 level angka berwajah lucu, partikel, combo, screen shake.
- Menu utama dengan demo hidup, tutorial di game pertama, musik dan efek suara yang disintesis.
- Koin, 3 power-up (Palu, Guncang, Tukar), hadiah harian 7 hari, 3 misi harian, toko tema (4 tema).
- Titik iklan yang tidak mengganggu: revive, 2x koin, power-up gratis, koin gratis, dan interstitial yang dibatasi frekuensinya.
- Optimal di HP: kontrol sentuh, layar kecil, tombol back Android, bisa offline, bisa dipasang sebagai PWA.

## Struktur
| Path | Isi |
|---|---|
| `index.html`, `style.css` | Tampilan dan layar menu |
| `js/game.js` | Fisika, render, alur game, UI |
| `js/meta.js` | Profil pemain, koin, tema, misi, hadiah harian |
| `js/ads.js` | Semua titik iklan dan aturan frekuensinya |
| `js/native.js`, `js/ads-config.js` | AdMob dan tombol back di aplikasi Android |
| `js/audio.js` | Efek suara dan musik |
| `android/` | Proyek Android (Capacitor) |
| `store/` | Ikon dan feature graphic untuk Play Store |

## Jalankan lokal
Web tidak perlu build: buka `index.html` lewat server statis, misalnya `npx serve .`.
Android: `npm ci && npm run android:debug` (butuh Android SDK dan JDK 21), atau biarkan GitHub Actions yang membangunnya.

## Lisensi aset
Font Fredoka (SIL Open Font License). Matter.js (MIT).
