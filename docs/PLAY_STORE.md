# Rilis ke Play Store: panduan dan checklist

Dokumen ini menjelaskan cara Suika Angka jadi aplikasi Android, bagaimana iklannya bekerja, dan apa saja yang perlu dilakukan pemilik akun sebelum rilis.

## Cara kerjanya

| Bagian | Isi |
|---|---|
| Game | HTML/JS biasa (folder root repo). Website: https://lav-studio-org.github.io/suika-merge/ |
| Aplikasi Android | [Capacitor](https://capacitorjs.com) membungkus game ke folder `android/` |
| Iklan | [AdMob](https://admob.google.com) lewat `@capacitor-community/admob`, kodenya di `js/native.js` |
| Build | GitHub Actions (`.github/workflows/android.yml`) di setiap push ke `main` |
| APK untuk dicoba | https://github.com/Lav-Studio-Org/suika-merge/releases/tag/android-latest |
| AAB untuk Play Store | Artifact di halaman run Actions, muncul setelah secret keystore dipasang |

Di website, iklan diganti "iklan contoh" supaya alurnya bisa dicoba. Di aplikasi Android, konfigurasi saat ini menggunakan AdMob production IDs. Jangan klik iklan live sendiri; verifikasi app-ads.txt dan kesiapan aplikasi AdMob masih harus diselesaikan sebelum mengandalkan penayangan iklan production.

## Strategi iklan: banyak tapi tidak mengganggu

Prinsipnya: hampir semua iklan **dipilih sendiri oleh pemain** (rewarded) dan selalu memberi hadiah yang jelas. Iklan paksa (interstitial) hanya muncul di jeda antar ronde dan dibatasi ketat.

| Titik iklan | Jenis | Kapan muncul | Hadiah |
|---|---|---|---|
| `revive` | Rewarded | Saat kalah, sekali per game, dengan hitungan mundur 6 detik | Bola teratas dibersihkan, lanjut main |
| `double_coins` | Rewarded | Layar Game Over | Koin hasil ronde jadi 2x |
| `power_hammer` / `power_shake` / `power_swap` | Rewarded | Saat power-up habis dan pemain menekannya | +1 power-up |
| `daily_double` | Rewarded | Hadiah harian | Hadiah harian 2x |
| `mission_double` | Rewarded | Klaim misi harian | Hadiah misi 2x |
| `free_coins` | Rewarded | Toko, maksimal 5x per hari | +50 koin |
| `game_over` | Interstitial | Saat menekan "Main lagi" atau "Menu" | - |

Aturan interstitial (`js/ads.js`, `POLICY`):
- Tidak pernah muncul di 3 game pertama pemain baru.
- Paling sering setiap 2 game.
- Tidak muncul kalau ada iklan lain (termasuk rewarded) dalam 90 detik terakhir.
- Tidak pernah muncul di tengah permainan.

Ekonomi koin dirancang supaya rewarded ad terasa berharga: koin dipakai untuk tema (400 sampai 1200) dan power-up (25 sampai 60), dan satu ronde biasa memberi sekitar 20 sampai 80 koin.

Ide berikutnya (belum dibuat): pembelian "Hapus iklan" (menghapus interstitial, rewarded tetap ada karena pilihan pemain), lewat Google Play Billing. Tombolnya sudah disiapkan di Toko dengan label "segera hadir".

## Yang perlu dilakukan pemilik akun

### 1. Pasang kunci tanda tangan (sekali saja)
File `upload-keystore.jks` dan `github-secrets.txt` sudah dibuatkan di folder proyek (bukan di repo). Buka `github-secrets.txt`, lalu tambahkan 4 secret di https://github.com/Lav-Studio-Org/suika-merge/settings/secrets/actions. Setelah itu setiap push otomatis menghasilkan file `.aab` yang sudah ditandatangani. Simpan keystore dan password-nya di tempat aman.

### 2. Akun Google Play Console
- Daftar di https://play.google.com/console (biaya sekali bayar USD 25) dan selesaikan verifikasi identitas.
- **Penting untuk akun pribadi baru:** Google mewajibkan *closed testing* dengan minimal **12 penguji selama 14 hari berturut-turut** sebelum bisa rilis ke publik. Siapkan 12 teman/keluarga dengan akun Google.

### 3. Akun AdMob
- Daftar di https://admob.google.com dengan akun Google yang sama.
- Tambah aplikasi: Android, pilih "belum dipublikasikan di toko", nama "Suika Angka".
- Buat 2 unit iklan: **Rewarded** dan **Interstitial**.
- ID yang saat ini dikonfigurasi: App ID `ca-app-pub-9324976595960819~1987457281`, Rewarded `ca-app-pub-9324976595960819/4809895897`, Interstitial `ca-app-pub-9324976595960819/2873997694`.
- Lengkapi data pembayaran dan pajak di AdMob supaya pendapatan bisa dicairkan.
- **Jangan pernah klik iklan asli di aplikasi sendiri**, karena akun AdMob bisa diblokir. Untuk mencoba, pakai build test.
- Setelah aplikasi live di Play Store, tautkan aplikasinya di AdMob (App settings > Add app store details).

### 4. Isi listing di Play Console
Bahan yang sudah ada di folder `store/`: ikon 512x512 dan feature graphic 1024x500. Yang masih perlu:
- Minimal 2 screenshot HP (bisa dibuatkan).
- Deskripsi singkat dan panjang (bisa dibuatkan).
- Link kebijakan privasi: https://lav-studio-org.github.io/suika-merge/privacy.html
- Kuesioner rating konten (IARC), target audiens (sarankan 13+ supaya aturan iklan anak tidak berlaku), formulir Data safety (sebut AdMob: ID iklan dan info perangkat untuk iklan), dan centang "aplikasi berisi iklan".

### 5. Konfigurasi AdMob production
ID production sudah dipasang di dua tempat:
- `js/ads-config.js`: Rewarded dan Interstitial ID, dengan `testing: false`.
- `android/app/src/main/res/values/strings.xml`: App ID.

Sebelum mengandalkan iklan production, selesaikan verifikasi `app-ads.txt` pada website developer yang tercantum di listing Google Play dan tunggu AdMob memverifikasi aplikasi. Jangan klik iklan live sendiri.

Upload `suika-angka-release.aab` dari Actions ke track Closed testing, undang 12 penguji, tunggu 14 hari, lalu ajukan akses Production.

## Catatan teknis
- `appId` aplikasi: `com.lavstudio.suikaangka`. **Tidak bisa diganti** setelah aplikasi pertama kali diupload ke Play Store.
- `versionCode` otomatis memakai nomor run GitHub Actions + 1000, jadi setiap build baru selalu lebih tinggi. File `suika-angka-release.aab` bertanda tangan ikut terbit di release `android-latest`.
- Build lokal (butuh Android SDK + JDK 21): `npm ci && npm run android:debug`.
- Gambar ikon, splash, dan store dibuat ulang dengan `node scripts/make-art.cjs` (butuh Playwright).
