# Silungkang FriedChicken — Railway + WhatsApp Bot

## Yang dipertahankan dari ZIP bot
- Mesin koneksi WhatsApp Baileys dan sesi pairing dari `Perangkat_Keras`.
- Database internal bot, utilitas koneksi, dan sistem plugin.
- Plugin ringan yang masih relevan: status bot dan kalkulator.
- Plugin khusus toko: `.menu`, `.stok`, `.pesan`.
- Fitur grup umum yang tidak dibutuhkan toko tidak dimuat ke runtime. Plugin sumber lainnya tetap disimpan di `Perangkat_Lunak/` sebagai arsip sumber; yang dijalankan hanya `Perangkat_Lunak/index/`.

## Deploy
1. Upload semua isi ZIP ke repository GitHub.
2. Buat project Railway dari repository tersebut.
3. Tambahkan PostgreSQL service dan pastikan `DATABASE_URL` tersedia pada service aplikasi.
4. Tambahkan variable berikut di service aplikasi:
   - `JWT_SECRET` = string acak panjang.
   - `BOT_BRIDGE_KEY` = string acak yang sama untuk dashboard dan bot.
   - `BOT_PHONE` = nomor WhatsApp bot format internasional tanpa `+`, contoh `62812...`.
   - `OWNER_WHATSAPP` = nomor WhatsApp owner format internasional tanpa `+`.
   - `OWNER_NAME` = nama owner.
   - `WHATSAPP_GROUP_ID` = ID grup notifikasi, format `1203...@g.us`.
   - `DASHBOARD_URL` = URL domain dashboard Railway, contoh `https://nama-app.up.railway.app`.
   - `NODE_ENV=production`
5. Pada Railway Settings → Networking, generate domain.
6. Tambahkan Railway Volume pada mount path `/app/Cache` agar sesi WhatsApp dan database internal bot tidak hilang ketika container dibuat ulang.
7. Deploy. Start command adalah `node launcher.js`, yang menjalankan dashboard dan bot dalam satu service.

**Penting:** Karena dashboard dan bot berjalan dalam satu service, `DASHBOARD_URL` boleh memakai domain Railway yang sudah dibuat. Untuk proses pairing awal, buka deployment logs Railway dan ambil kode pairing yang dicetak bot. Masukkan kode tersebut di WhatsApp pada menu Perangkat Tertaut.

## Membuat admin owner pertama
Buka domain website, tekan **Admin**, lalu buat username dan password owner pada layar setup pertama. Setup terkunci otomatis setelah akun pertama dibuat.

## Sinkronisasi
- Stok Sawahlunto dan Sijunjung disimpan terpisah di dashboard/PostgreSQL.
- Setiap admin ditautkan ke satu cabang; admin hanya dapat mengubah stok dan pesanan cabangnya sendiri. Owner dapat memantau semua cabang.
- Setiap cabang memiliki nomor WhatsApp sendiri. Pesanan website/WhatsApp dikirim ke nomor cabang dan nomor admin yang ditautkan ke cabang itu.
- Perubahan stok dan pesanan masuk dikirim bot dari antrean dashboard. Event baru dihapus dari antrean setelah pengiriman berhasil.
- Pelanggan chat nomor bot secara pribadi akan menerima sambutan berisi lokasi cabang dan perintah toko.
- Perintah WhatsApp:
  - `.menu` — daftar menu dan harga dari dashboard.
  - `.stok` — stok terkini dari dashboard.
  - `.pesan sawahlunto|1|2|Nama|Alamat` — pesan 2 item menu nomor 1 untuk cabang Sawahlunto.
  - `.pesan sijunjung|1|2|Nama|Alamat` — format yang sama untuk cabang Sijunjung.
  - `.statusbot` / `.botstatus` (plugin status existing).
  - `.calc 2+2` (kalkulator existing).

## Menambahkan menu dan stok
Menu dan harga dikelola owner dari dashboard. Stok diatur per cabang. Isi nomor WhatsApp cabang dan nomor WhatsApp setiap admin saat menambah/mengelola cabang dan admin. Nomor cabang menjadi tujuan utama pesanan; nomor admin cabang juga menerima notifikasi. Nomor owner dan grup di tab Pengaturan hanya menjadi tujuan cadangan.

## Catatan Railway
- Gunakan PostgreSQL untuk state dashboard. Jangan mengandalkan filesystem container untuk data permanen.
- Volume `/app/Cache` penting untuk sesi WhatsApp Baileys dan JSON database bot.
- Jangan bagikan `JWT_SECRET` atau `BOT_BRIDGE_KEY`.
- Pastikan owner WhatsApp dan bot sudah melakukan pairing setelah deployment.
- Beberapa dependensi bot seperti `canvas`, `puppeteer`, dan modul media lama dapat memerlukan build tools tambahan pada Railway. Fitur toko sendiri tidak bergantung pada plugin-plugin media tersebut.
