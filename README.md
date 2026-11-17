# StockLab

Game papan investasi StockLab. Situs statis (GitHub Pages) dengan Firebase Auth anonim dan Cloud Firestore untuk real-time.

## Struktur

```
index.html      beranda: buat ruangan (bandar), gabung (pemain), buka papan
bank.html       meja bandar: kontrol permainan, lihat semua data
board.html      papan besar untuk layar bersama (publik)
player.html     tampilan pemain
js/firebase.js  konfigurasi Firebase dan login anonim
js/app.js       akses Firestore, transaksi, dan helper tampilan
js/engine.js    seluruh aturan permainan
firestore.rules aturan keamanan (dipasang di konsol Firebase)
test/sim.mjs    simulasi game penuh untuk memeriksa mesin
```

## Data di Firestore

- `rooms/{kode}`: data publik ruangan (pemain, koin, saham, harga, kartu di meja, log).
- `rooms/{kode}/secret/bank`: dek Ekonomi dan dek aksi. Hanya bandar yang bisa membaca.
- `rooms/{kode}/secret/{uid}`: tawaran lelang dan hasil Info Bursa. Hanya pemilik dan bandar.

## Menjalankan di komputer sendiri

Firebase tidak bisa dibuka dari `file://`, jadi jalankan server lokal:

```
cd StockLab
python3 -m http.server 8080
```

Buka `http://localhost:8080` di dua tab berbeda (satu sebagai bandar, satu sebagai pemain). Setiap tab mendapat identitas anonim sendiri.

## Deploy ke GitHub Pages

1. Buat repo `StockLab` di GitHub, lalu unggah seluruh isi folder ini (termasuk `js/`).
2. Buka **Settings → Pages**, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, lalu **Save**.
3. Situs akan tersedia di `https://USERNAME.github.io/StockLab/`.
4. Pastikan domain itu ada di **Firebase Console → Authentication → Settings → Authorized domains**.

## Memasang aturan Firestore

1. Buka **Firebase Console → Firestore Database → Rules**.
2. Hapus isi lama, tempel seluruh isi `firestore.rules`, lalu klik **Publish**.

Lakukan langkah ini sebelum membagikan tautan ke pemain.

## Cara bermain

1. Bandar membuka beranda, klik **Buat Ruangan**, dan mendapat kode 5 karakter.
2. Pemain membuka situs yang sama, pilih **Gabung**, lalu masukkan kode dan nama.
3. Bandar klik **Mulai Permainan** saat minimal 2 pemain sudah masuk.
4. Halaman bandar harus tetap terbuka selama permainan. Lelang dan intipan diselesaikan di sana.

## Batasan yang perlu diketahui

- Aturan permainan dijalankan di browser pemain, seperti pada UNO By OMEGA. Pemain yang mengutak-atik kode bisa mengubah data mereka sendiri. Untuk bermain dengan teman, ini biasanya cukup.
- Jika halaman bandar ditutup, lelang tidak akan selesai dan intipan tidak terisi sampai bandar kembali.
- Login akun belum ada. Identitas tiap perangkat hanya tersimpan di browser tersebut.
