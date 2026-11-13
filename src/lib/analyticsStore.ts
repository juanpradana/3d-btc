/**
 * In-memory store: aggreasi data dari Rust WASM + buffer trade.
 * Singleton; UI berlangganan via useBtcAnalytics.
 */

import type { DepthLevel } from "../hooks/useBinanceOrderbook";

export interface TradeEvent {
  price: number;
  volume: number;
  isBuyerMaker: boolean;
  timestamp: number;
}

export interface AnalyticsState {
  // Kanonik: hasil analitik Rust/WASM (snake_case agar cocok dengan serde).
  best_bid: number;
  best_ask: number;
  spread_bps: number;
  micro_price: number;
  ofi: number;
  bid_ask_volume_ratio: number;
  cumulative_delta: number;
  direction_score: number;
  confidence: number;
  signal: string;

  // UI extras (bukan duplikat): delta1m memakai jendela 60s milik JS,
  // sedangkan cumulative_delta memakai jendela 120s milik WASM — keduanya
  // memang berbeda dan tidak boleh disatukan.
  delta1m: number;
  bidLevels: DepthLevel[];
  askLevels: DepthLevel[];
  updated: Date | null;
  isConnected: boolean;
  isSimulated: boolean;
}

class AnalyticsEngine {
  private static instance: AnalyticsEngine | null = null;
  private tradeBuffer: TradeEvent[] = [];
  public state: AnalyticsState = {
    best_bid: 0,
    best_ask: 0,
    spread_bps: 0,
    micro_price: 0,
    ofi: 0,
    bid_ask_volume_ratio: 1,
    cumulative_delta: 0,
    direction_score: 0,
    confidence: 0,
    signal: "NEUTRAL",
    delta1m: 0,
    bidLevels: [],
    askLevels: [],
    updated: null,
    isConnected: false,
    isSimulated: false,
  };

  private constructor() {}

  static getInstance(): AnalyticsEngine {
    if (!AnalyticsEngine.instance) {
      AnalyticsEngine.instance = new AnalyticsEngine();
    }
    return AnalyticsEngine.instance;
  }

  pushDepth(
    bids: DepthLevel[],
    asks: DepthLevel[],
    microPrice: number,
    spreadBps: number
  ) {
    const now = Date.now();
    this.state.bidLevels = bids;
    this.state.askLevels = asks;
    this.state.spread_bps = spreadBps;
    this.state.micro_price = microPrice;
    this.state.best_bid = bids[0]?.price ?? 0;
    this.state.best_ask = asks[0]?.price ?? 0;
    this.state.updated = new Date(now);
    this.state.isConnected = true;
  }

  pushTrade(trade: TradeEvent) {
    this.tradeBuffer.push(trade);
  }

  /** 1-minute CVD + cap buffer (prune lazy saat array melewati ambang). */
  computeDelta1m(): number {
    // Prune lazy: sekali per N trade, bukan setiap push (BTC ~30 trade/detik,
    // filter O(n) tiap push = O(n^2) per detik dan GC churn yang sia-sia).
    if (this.tradeBuffer.length > 2000) {
      const cutoff60 = Date.now() - 60_000;
      this.tradeBuffer = this.tradeBuffer.filter((t) => t.timestamp > cutoff60);
    }
    const cutoff = Date.now() - 60_000;
    const recent = this.tradeBuffer.filter((t) => t.timestamp > cutoff);
    return recent.reduce(
      (acc, t) => acc + (t.isBuyerMaker ? -t.volume : t.volume),
      0
    );
  }

  getState(): AnalyticsState {
    return {
      ...this.state,
      delta1m: this.computeDelta1m(),
    };
  }

  /** Called from WASM analytics result */
  pushAnalytics(wasmResult: Partial<AnalyticsState>) {
    this.state = {
      ...this.state,
      ...wasmResult,
      direction_score: wasmResult.direction_score ?? this.state.direction_score,
      confidence: wasmResult.confidence ?? this.state.confidence,
      signal: wasmResult.signal ?? this.state.signal,
      ofi: wasmResult.ofi ?? this.state.ofi,
      bid_ask_volume_ratio:
        wasmResult.bid_ask_volume_ratio ?? this.state.bid_ask_volume_ratio,
      cumulative_delta: wasmResult.cumulative_delta ?? this.state.cumulative_delta,
      best_bid: wasmResult.best_bid ?? this.state.best_bid,
      best_ask: wasmResult.best_ask ?? this.state.best_ask,
      spread_bps: wasmResult.spread_bps ?? this.state.spread_bps,
      micro_price: wasmResult.micro_price ?? this.state.micro_price,
    };
  }

  setConnected(connected: boolean) {
    this.state.isConnected = connected;
  }

  setSimulated(simulated: boolean) {
    this.state.isSimulated = simulated;
    this.state.isConnected = simulated ? true : this.state.isConnected;
  }
}

export { AnalyticsEngine };