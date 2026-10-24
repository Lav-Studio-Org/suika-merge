## Design Critique: Suika Angka (v1.0, sebelum perbaikan)

Konteks: game puzzle kasual untuk HP, target rilis Play Store, monetisasi lewat iklan rewarded. Tahap: polish akhir sebelum rilis. Fokus: UI/UX di layar HP (diaudit di 375x740 dan 320x568).

### Overall Impression
Inti gamenya sudah kuat: bola berwajah, fisika, dan efek merge terasa hidup. Peluang terbesar ada di lapisan UI di sekitarnya. Ikon emoji membuat game terlihat seperti prototipe dan tampil berbeda di setiap merek HP, dan aturan warna tombol iklan belum konsisten.

### Usability
| Finding | Severity | Recommendation |
|---------|----------|----------------|
| Semua ikon (menu, power-up, jeda, pengaturan, tutup) memakai emoji atau karakter teks. Tampilannya berbeda di Samsung, Xiaomi, dan Pixel, dan ⏸ / ⚙ kecil dan tipis | 🔴 Critical | Ganti dengan set ikon SVG custom dua warna yang konsisten (satu ketebalan garis, satu grid 24px) |
| Tombol iklan memakai 3 gaya berbeda: hijau (power-up), emas (2x koin, hadiah harian), dan teks ▶. Pemain tidak bisa menebak tombol mana yang memutar iklan | 🔴 Critical | Satu aturan: **hijau + ikon video = iklan**. Emas hanya untuk mata uang, pink untuk aksi utama game |
| Di Game Over, tombol "2x koin" (emas besar) lebih menonjol daripada "Main lagi" (garis tipis). Aksi utama pemain justru main lagi | 🟡 Moderate | "Main lagi" jadi tombol utama solid. Gandakan koin jadi tombol hijau di dalam kotak koin |
| Di menu utama ada area kosong ±70px di atas toples (ruang HUD yang disembunyikan), sementara koin dan pengaturan tertumpuk di dalam toples | 🟡 Moderate | Pakai baris HUD di menu untuk skor terbaik, koin, dan pengaturan, supaya toples lega untuk judul dan CTA |
| Badge jumlah power-up berwarna merah seperti notifikasi atau error | 🟡 Moderate | Badge netral (gelap). Saat habis, tampilkan pil hijau "+" dengan ikon video |
| Tutorial memakai emoji tangan 👆 yang bentuknya berbeda di tiap HP | 🟡 Moderate | Indikator sentuhan custom (lingkaran dengan riak) yang digambar di canvas |
| Toast muncul di tengah toples dan menutupi bola | 🟢 Minor | Pindahkan ke atas garis bahaya, tambahkan ikon, dan perkecil |
| Pratinjau "Next" terlalu kecil di dalam lingkaran besar | 🟢 Minor | Perbesar bola di pratinjau |
| Misi tanpa ikon jenis misi, dan progress bar kosong terlihat seperti nonaktif | 🟢 Minor | Ikon per jenis misi dan track progress yang lebih kontras |

### Visual Hierarchy
- **What draws the eye first**: Judul "Suika Angka", lalu tombol Main. Sudah benar.
- **Reading flow**: Judul, contoh 1+1=2, skor terbaik, Main, menu bawah. Tanda + dan = abu-abu pudar sehingga contohnya kurang terbaca.
- **Emphasis**: Di Game Over dan Hadiah Harian, tombol iklan emas lebih kuat daripada aksi utama. Dibalik sesuai prioritas pemain.

### Consistency
| Element | Issue | Recommendation |
|---------|-------|----------------|
| Ikon | Emoji, karakter teks (✕ ▶ ⏸ ⚙), dan CSS bercampur | Satu sprite SVG `#i-*` dipakai di semua layar |
| Warna tombol | Hijau dan emas sama-sama dipakai untuk iklan | Hijau = iklan, pink = utama, emas = koin, garis = sekunder |
| Tombol tutup | 36px, gaya berbeda dengan tombol ikon lain | 44px, komponen ikon yang sama |
| Teks sekunder | Pakai `opacity` sehingga kontras berubah tergantung latar | Warna solid `--ink-2` |
| Label HUD | Huruf kapital 12px dengan opacity .7 | Token warna tetap, ukuran minimal 12px, letter-spacing konsisten |

### Accessibility
- **Color contrast**: Teks petunjuk dan link (`opacity .6` di atas krem) sekitar 3:1, **gagal** AA. Diganti `#6b5a80` (sekitar 5.5:1). Teks utama tinta di atas krem lulus (sekitar 14:1).
- **Touch targets**: Tombol tutup 36px **gagal**, minimum 44px. Tombol power-up, menu, dan HUD 44px atau lebih sudah lulus.
- **Text readability**: Fredoka 15 sampai 17px di kartu sudah baik. Label 12px di HUD masih bisa diterima karena hanya label.
- **Alt text**: Tombol ikon perlu `aria-label`, dan SVG dekoratif perlu `aria-hidden`.
- **Motion**: `prefers-reduced-motion` sudah dihormati untuk animasi CTA dan badge.

### What Works Well
- Karakter bola dengan wajah dan angka sangat jelas dan langsung menjelaskan aturan main.
- Feedback merge (partikel, cincin, angka melayang, getar) terasa memuaskan.
- Kartu modal krem dengan bayangan tebal memberi kesan "mainan" yang hangat dan konsisten.
- Interstitial dibatasi dan sebagian besar iklan bersifat opsional, jadi sudah sesuai prinsip "banyak iklan tapi tidak mengganggu".

### Priority Recommendations
1. **Set ikon SVG custom** menggantikan semua emoji, karena ini yang paling membedakan prototipe dari game yang siap rilis.
2. **Satu bahasa visual untuk iklan** (hijau + ikon video + label jelas), supaya pemain selalu tahu kapan iklan akan diputar, dan kepercayaan terhadap tombol hadiah naik.
3. **Hierarki ulang Game Over dan menu utama**: "Main lagi" jadi aksi utama, dan HUD dipakai di menu untuk koin dan pengaturan.
4. **Perbaikan aksesibilitas**: kontras teks sekunder, target sentuh 44px, dan aria-label.
5. **Polish detail**: indikator sentuhan tutorial, toast dengan ikon, ikon misi, centang di hadiah harian, dan pratinjau Next yang lebih besar.
