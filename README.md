# BTC/USDT 3D Real-Time Order Flow & Market Battlefield

Visualisasi 3D real-time interaktif kedalaman pasar (order book) dan aliran pesanan agresif (order flow) Bitcoin (BTC/USDT) bertenaga **Rust → WebAssembly (WASM)** langsung di browser dengan biaya server **nol (zero server cost)**.

Aplikasi terhubung langsung ke public data mirror resmi **Binance Vision** (`data-api.binance.vision` dan `data-stream.binance.vision`) tanpa memerlukan API Key, VPN, maupun proxy tambahan, sehingga dapat diakses secara global dan bebas blokir regional.

---

## 🚀 Fitur Utama

- **WASM High-Performance Analytics Engine (`crates/engine`)**:
  - **OFI (Order Flow Imbalance)**: Menghitung selisih tekanan beli vs jual berdasarkan perubahan harga tiap level kedalaman.
  - **Micro-Price (Stoikov-Manley)**: Harga kesetimbangan berbobot volume order book di dalam rentang *bid-ask spread*.
  - **CVD (Cumulative Volume Delta) Rolling Window (2 Menit)**: Agregasi volume agresif buy vs sell yang akurat menggunakan timestamp eksekusi bursa (`T`).
  - **Direction Score (-1 .. +1) & Confidence Index (0 .. 100%)**: Skoring kuantitatif sentimen pasar secara real-time.
- **Dua Mode Visualisasi 3D Taktis**:
  - ⚔️ **Battlefield Mode**: Garis depan (*frontline*) perang buy vs sell dengan animasi proyektil aliran order flow, lantai kisi siber, dan pilar volume kristal.
  - 🗺️ **Open Maps Mode**: Peta topografi kedalaman pasar dengan kompas taktis hologram dan palet sentimen dinamis (Bullish hijau, Bearish merah, Neutral biru/ungu).
- **Zero Memory Leak & 60 FPS Stabil**:
  - Buffer partikel GPU dialokasikan sekali saat inisialisasi (`Float32Array`), dimutasi *in-place* di `useFrame` tanpa memicu garbage collector.
  - Geometri pilar menggunakan unit box terukur skala (*scaled unit geometry*) untuk mencegah pembuatan ulang buffer WebGL.
  - Batching 100ms sinkron antara WebAssembly dan pembaruan antarmuka React.
- **Responsif di Seluruh Viewport**:
  - Kontrol mode dan metrik dapat diakses di mobile portrait, mobile landscape, tablet, hingga desktop ultrawide.
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
