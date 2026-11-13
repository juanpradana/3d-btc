/**
 * Endpoint Binance publik (tanpa API key) + rantai fallback.
 *
 * Catatan penting soal wilayah / ISP:
 * Host utama `*.binance.com` diblokir di beberapa jaringan (dan beberapa negara),
 * sedangkan `*.binance.vision` adalah mirror data publik RESMI milik Binance
 * yang menyajikan stream & REST yang sama persis. Karena itu urutannya
 * mirror-resmi dulu, host utama sebagai fallback.
 *
 * Diuji 2026-11-13 dari jaringan yang memblokir binance.com:
 *   data-stream.binance.vision  -> WS handshake 101
 *   data-api.binance.vision     -> HTTP 200
 */

export const BINANCE_ENDPOINTS = {
  /** WebSocket urutan prioritas (depth + trade) */
  ws: [
    "wss://data-stream.binance.vision/ws",
    "wss://stream.binance.com:9443/ws",
    "wss://stream.binance.com/ws",
  ],
  /** REST urutan prioritas (snapshot orderbook + ticker) */
  rest: [
    "https://data-api.binance.vision",
    "https://api.binance.com",
    "https://api1.binance.com",
    "https://api-gw.binance.com",
  ],
} as const;

export function wsUrl(base: string, symbol: string, stream: string): string {
  return `${base}/${symbol.toLowerCase()}@${stream}`;
}

export function restUrl(base: string, path: string): string {
  return `${base}${path}`;
}

/**
 * Ambil snapshot orderbook via REST untuk hydrasi awal (agar HUD & 3D
 * langsung terisi sebelum pesan WS pertama tiba). Return null jika semua
 * endpoint gagal.
 */
export async function fetchDepthSnapshot(
  symbol: string,
  limit = 20
): Promise<{ lastUpdateId: number; bids: [string, string][]; asks: [string, string][] } | null> {
  for (const base of BINANCE_ENDPOINTS.rest) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(
        restUrl(base, `/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`),
        { signal: controller.signal }
      );
      clearTimeout(timeout);
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.bids?.length) continue;
      return data;
    } catch {
      // coba endpoint berikutnya
    }
  }
  return null;
}
