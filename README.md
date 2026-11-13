# BTC/USDT 3D Real-Time Order Flow & Macro Topography

> 🌐 **Live Production**: [https://btc.farzani.my.id](https://btc.farzani.my.id)

Visualisasi 3D real-time interaktif kedalaman pasar (order book) dan aliran pesanan agresif (order flow) Bitcoin (BTC/USDT) bertenaga **Rust → WebAssembly (WASM)** langsung di browser dengan biaya server **nol (zero server cost)**.

Aplikasi terhubung langsung ke public data mirror resmi **Binance Vision** (`data-api.binance.vision` dan `data-stream.binance.vision`) tanpa memerlukan API Key, VPN, maupun proxy tambahan, sehingga dapat diakses secara global dan bebas blokir regional.

Demo aktif dapat langsung dicoba di **[btc.farzani.my.id](https://btc.farzani.my.id)**.

---

## 🚀 Fitur Utama

- **WASM High-Performance Analytics Engine (`crates/engine`)**:
  - **OFI (Order Flow Imbalance)**: Menghitung selisih tekanan beli vs jual berdasarkan perubahan harga tiap level kedalaman.
  - **Micro-Price (Stoikov-Manley)**: Harga kesetimbangan berbobot volume order book di dalam rentang *bid-ask spread*.
  - **CVD (Cumulative Volume Delta) Rolling Window (2 Menit)**: Agregasi volume agresif buy vs sell yang akurat menggunakan timestamp eksekusi bursa (`T`).
  - **Direction Score (-1 .. +1) & Confidence Index (0 .. 100%)**: Skoring kuantitatif sentimen pasar secara real-time.
- **Mode Visualisasi 3D Taktis — Macro Topography (Open Maps)**:
  - Peta topografi kedalaman pasar dari *bird's-eye* dengan kamera atas 20 level order book.
  - Aliran partikel order flow **seamless & tak terbatas** (800 partikel) dengan fade halus di batas panggung — tanpa garis patah.
  - *Whale wall* sonar halo (amber) pada limit order besar (≥1.5× volume rata-rata buku).
  - Kontur topografi berlapis, penanda level kedalaman −20..+20, dan kompas taktis hologram.
  - Palet sentimen dinamis (Bullish hijau, Bearish rose, Neutral teal/orange).
- **Zero Memory Leak & 60 FPS Stabil**:
  - Buffer partikel GPU dialokasikan sekali saat inisialisasi (`Float32Array`), dimutasi *in-place* di `useFrame` tanpa memicu garbage collector.
  - Geometri pilar menggunakan unit box terukur skala (*scaled unit geometry*) untuk mencegah pembuatan ulang buffer WebGL.
  - Batching 100ms sinkron antara WebAssembly dan pembaruan antarmuka React.
- **Responsif di Seluruh Viewport**:
  - Panel telemetri, order book ladder, dan hud status dapat diakses di mobile portrait, mobile landscape, tablet, sampai desktop ultrawide.
  - FOV dan jarak kamera dinamis mengikuti rasio aspek layar browser.
- **Fallback Simulator Otomatis**:
  - Bila jaringan offline atau terputus, simulator pasar sintetis langsung aktif secara mulus dan beralih kembali ke feed live saat koneksi pulih.

---

## 🐳 Deployment Cepat via Docker Compose (Port 3857)

Aplikasi telah dikonfigurasi penuh dengan **multi-stage Docker build** (Rust builder + Node.js 22 + Nginx Alpine Runtime) dan siap dideploy dalam satu perintah pada **port 3857**:

### 1. Jalankan Kontainer

```bash
docker compose up -d --build
```

Setelah build selesai, aplikasi dapat langsung diakses melalui browser:

```text
http://localhost:3857
```

### 2. Konfigurasi Port Kustom (Opsional)

Jika Anda ingin mengubah port host, salin `.env.example` ke `.env` dan sesuaikan nilainya:

```bash
cp .env.example .env
# Edit PORT=3857 sesuai kebutuhan Anda
docker compose up -d
```

### 3. Perintah Operasional Docker

```bash
# Cek log kontainer
docker compose logs -f

# Cek status kesehatan kontainer (Nginx Healthcheck)
docker compose ps

# Hentikan kontainer
docker compose down
```

---

## 🌐 Panduan Reverse Proxy (Port 3857)

Kontainer mengekspos aplikasi pada port host `3857`. Anda dapat mengarahkan domain/subdomain melalui reverse proxy favorit Anda:

### Contoh Nginx Standar / Nginx Proxy Manager (NPM)

```nginx
server {
    listen 80;
    server_name btc-flow.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3857;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket support (bila reverse proxy meneruskan WS lokal)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### Contoh Caddyfile

```caddy
btc-flow.yourdomain.com {
    reverse_proxy 127.0.0.1:3857
}
```

### Contoh Cloudflare Tunnel (`config.yml`)

```yaml
ingress:
  - hostname: btc-flow.yourdomain.com
    service: http://localhost:3857
  - service: http_status:404
```

### Contoh Nyata: Deployment di `btc.farzani.my.id` (Server Ubuntu + Nginx `web-proxy`)

Server di `43.173.40.121` menggunakan pola **standalone host-port + reverse proxy terpisah** (container `web-proxy` di `/home/ubuntu/web-proxy/`). Container aplikasi **tidak** join network proxy, hanya mem-publish port host `3857`:

```bash
# 1. Clone & jalankan standalone (tanpa butuh stack lain)
git clone https://github.com/juanpradana/3d-btc.git
cd 3d-btc
docker compose up -d --build   # publish 0.0.0.0:3857→80
```

```nginx
# 2. /home/ubuntu/web-proxy/nginx/conf.d/btc.farzani.my.id.conf
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name btc.farzani.my.id;

    ssl_certificate     /etc/nginx/ssl/server.crt;
    ssl_certificate_key /etc/nginx/ssl/server.key;

    # ... security headers ...

    location / {
        # Routing lewat host gateway (bukan Docker network!)
        proxy_pass http://host.docker.internal:3857;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
# 3. Reload proxy
docker exec web-proxy nginx -s reload
```

Kelebihan pola ini:
- ✅ Aplikasi **100% standalone** — `docker compose up` jalan di mana saja tanpa dependency eksternal
- ✅ Reverse proxy terpisah (`web-proxy`) bisa di-*update* tanpa restart aplikasi
- ✅ Pola yang sama dipakai untuk `bdlcctv.farzani.my.id` (port 3447), `pdf.farzani.my.id` (port 3001)

---

## 🛠️ Pengembangan Lokal (Local Development)

### Prasyarat
- [Node.js](https://nodejs.org/) v20+ atau v22+
- [Rust](https://rustup.rs/) (versi 1.80+)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)

### Langkah Menjalankan

1. **Kompilasi Engine Rust ke WebAssembly**:
   ```bash
   cd crates/engine
   cargo test --release
   wasm-pack build --target web --release --out-dir ../../src/wasm
   cd ../..
   ```

2. **Jalankan Frontend Dev Server**:
   ```bash
   npm install
   npm run dev
   ```

3. **Buka di browser**:
   Akses `http://localhost:5173`

---

## 🧪 Pengujian Unit & Integritas

Engine Rust dilengkapi pengujian unit lengkap:

```bash
cd crates/engine
cargo test --release
```

Hasil uji:
- `test_micro_price_between_bid_ask`: Memastikan micro-price selalu berada dalam interval `[best_bid, best_ask]`.
- `test_micro_price_weighted_toward_heavier_side`: Memastikan bobot volume menarik micro-price ke sisi yang lebih tebal.
- `test_cvd_window_rolling`: Verifikasi pemangkasan trade di luar jendela waktu 2 menit.
- `test_snapshot_does_not_reset_cvd`: Menjaga akumulasi CVD tidak hilang saat depth snapshot di-refresh.
- `test_ofi_positive_when_bid_pressure`: Validasi sinyal positif saat buy pressure bertambah.
- `test_ofi_negative_when_ask_pressure`: Validasi sinyal negatif saat ask pressure bertambah.

---

## 📄 Lisensi

MIT License. Bebas digunakan untuk keperluan pribadi, riset kuantitatif, maupun produksi.
