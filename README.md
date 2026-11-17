# Silungkang FriedChicken

Dashboard penjualan dan manajemen stok dengan bot WhatsApp Baileys.

- `npm start` menjalankan dashboard dan bot.
- `npm run start:dashboard` menjalankan dashboard saja.
- `npm run start:bot` menjalankan bot saja.
- `RAILWAY.md` berisi panduan deployment dan environment variables.
- `.env.example` contoh variabel konfigurasi.

Runtime bot hanya memuat plugin terpilih di `Perangkat_Lunak/index/`: fitur toko, status bot, dan kalkulator. Plugin bot lain yang tidak relevan dengan operasional toko tidak disertakan pada paket deploy.
