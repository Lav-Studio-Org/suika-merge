# Suika Angka 🍉🔢

Game merge ala **Suika Game**: jatuhkan bola angka ke dalam toples, gabungkan dua angka yang sama untuk jadi angka berikutnya.
`1 + 1 = 2`, `2 + 2 = 3`, ... sampai `11`. Dua angka 11 yang bertemu akan lenyap dengan bonus besar.

**Main sekarang:** https://lavaruz.github.io/suika-merge/

## Fitur
- Fisika nyata (Matter.js): bola menggelinding, menumpuk, dan saling dorong.
- 11 level angka dengan wajah lucu yang berkedip.
- Efek merge: partikel, gelombang cincin, teks skor melayang, guncangan layar untuk merge besar.
- Sistem combo: merge beruntun dalam 1 detik melipatgandakan skor.
- Suara disintesis langsung di browser (Web Audio), bisa dimatikan.
- Skor terbaik dan angka tertinggi tersimpan di browser.
- Kontrol: geser lalu lepas (HP), gerak mouse lalu klik (desktop), atau ←/→ + Spasi. `P`/`Esc` untuk jeda.
- Bisa dipasang ke layar utama HP (PWA manifest).

## Aturan
Kalau ada tumpukan yang bertahan di atas garis merah lebih dari ~2 detik, game over.

## Jalankan lokal
Tidak perlu build. Buka `index.html` langsung di browser, atau:

```sh
npx serve .
```

## Deploy
Setiap push ke `main` otomatis dideploy ke GitHub Pages lewat `.github/workflows/pages.yml`.
