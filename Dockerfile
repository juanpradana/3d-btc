# syntax=docker/dockerfile:1

# ============================================================================
# Stage 1: Builder — kompilasi Rust -> WASM lalu bundle Vite
# ============================================================================
FROM rust:1.85-slim-bookworm AS builder

# Node.js 22 + wasm-pack (dari binary resmi), tanpa layer cache yang menyesatkan
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        curl \
        binutils \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -sSf https://rustwasm.github.io/wasm-pack/installer/init.sh | sh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build crate Rust -> WASM lebih dulu supaya layer ini di-cache terpisah
# dari perubahan kode frontend.
COPY crates/ crates/
RUN wasm-pack build --target web --release crates/engine --out-dir /app/src/wasm

# Dependency frontend: dipisah agar `npm ci` tidak jalan ulang saat kode berubah
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Arg build-time untuk base path (default "/" — aman untuk deploy di root domain).
ARG VITE_BASE=/
ENV VITE_BASE=$VITE_BASE

RUN npm run build

# ============================================================================
# Stage 2: Runtime — nginx alpine (image final < 30 MB)
# ============================================================================
FROM nginx:1.27-alpine-slim AS runtime

# Konfigurasi nginx custom (MIME wasm, SPA fallback, gzip, cache, CSP)
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

# Healthcheck memakai wget yang sudah tersedia di nginx:alpine
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
