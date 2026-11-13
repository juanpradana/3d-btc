/**
 * Market Simulator: menghasilkan data bid/ask/trade realistis saat
 * koneksi bursa (Binance) tidak tersedia (geo-block / offline demo).
 */

import type { DepthLevel } from "../hooks/useBinanceOrderbook";

export interface SimTrade {
  price: number;
  volume: number;
  isBuyerMaker: boolean;
  timestamp: number;
}

export class MarketSimulator {
  private mid = 100000; // BTC starting price
  private tickSize = 1;
  private levelCount = 20;
  private drift = 0; // trend bias -1..1
  private driftTimer: ReturnType<typeof setInterval> | null = null;
  private priceTimer: ReturnType<typeof setInterval> | null = null;
  private tradeTimer: ReturnType<typeof setInterval> | null = null;
  private emitCount = 0;
  private listeners: {
    onDepth?: (bids: DepthLevel[], asks: DepthLevel[]) => void;
    onTrade?: (trade: SimTrade) => void;
  } = {};

  /** Debug: jumlah event yang dipancarkan */
  get debugEmitCount() {
    return this.emitCount;
  }

  start(intervalMs = 100) {
    this.stop();

    // Random walk drift berubah tiap 5 detik
    this.driftTimer = setInterval(() => {
      this.drift = (Math.random() - 0.5) * 1.6;
    }, 5000);

    this.priceTimer = setInterval(() => {
      const shock = (Math.random() - 0.5) * 8;
      this.mid = Math.max(1000, this.mid + shock + this.drift);
      this.emitDepth();
    }, intervalMs);

    // Trades ~10-40 per detik tergantung volatilitas
    this.tradeTimer = setInterval(() => {
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        this.emitTrade();
      }
    }, intervalMs);
  }

  stop() {
    if (this.driftTimer) clearInterval(this.driftTimer);
    if (this.priceTimer) clearInterval(this.priceTimer);
    if (this.tradeTimer) clearInterval(this.tradeTimer);
    this.driftTimer = this.priceTimer = this.tradeTimer = null;
  }

  on(handlers: typeof this.listeners) {
    this.listeners = handlers;
  }

  private emitDepth() {
    const bids: DepthLevel[] = [];
    const asks: DepthLevel[] = [];
    for (let i = 0; i < this.levelCount; i++) {
      const bidPx = Math.round((this.mid - (i + 1) * this.tickSize) / this.tickSize) * this.tickSize;
      const askPx = Math.round((this.mid + (i + 1) * this.tickSize) / this.tickSize) * this.tickSize;
      // Volume pyramid: besar di dekat mid, mengecil ke jauh
      const base = Math.exp(-i / 8);
      const noise = () => 0.5 + Math.random();
      bids.push({ price: bidPx, volume: +(base * noise() * (1 + Math.max(0, this.drift))).toFixed(3) });
      asks.push({ price: askPx, volume: +(base * noise() * (1 + Math.max(0, -this.drift))).toFixed(3) });
    }
    this.listeners.onDepth?.(bids, asks);
  }

  private emitTrade() {
    const side = Math.random() < 0.5 + this.drift * 0.15 ? "buy" : "sell";
    const px = Math.round((this.mid + (Math.random() - 0.5) * 4) / this.tickSize) * this.tickSize;
    const vol = +(Math.random() * Math.random() * 2).toFixed(4);
    this.listeners.onTrade?.({
      price: px,
      volume: vol,
      isBuyerMaker: side === "sell",
      timestamp: Date.now(),
    });
  }
}
