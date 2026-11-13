/**
 * Global state engine mengubah WebSocket stream menjadi UI-ready state.
 * React hanya baca state; seluruh analisis dilakukan oleh Rust/WASM.
 */

import { useEffect, useRef, useState } from "react";
import type { DepthLevel, OrderbookState, AnalyticResult, BinanceTrade } from "./useBinanceOrderbook";
import { useBinanceOrderbook } from "./useBinanceOrderbook";
import { AnalyticsEngine } from "../lib/analyticsStore";

export interface AppAnalyticsState {
  // Kontrak UI tunggal: nama kanonik snake_case dari analitik WASM.
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

  // delta1m = jendela 60s di sisi JS; cumulative_delta = jendela 120s di WASM.
  delta1m: number;
  bidLevels: DepthLevel[];
  askLevels: DepthLevel[];
  updated: Date | null;
  isConnected: boolean;
  isSimulated: boolean;
}

export function useBtcAnalytics(symbol = "BTCUSDT") {
  const analyticsEngineRef = useRef<AnalyticsEngine | null>(null);
  const [state, setState] = useState<AppAnalyticsState>({
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
  });

  // Init analytics engine singleton
  useEffect(() => {
    analyticsEngineRef.current = AnalyticsEngine.getInstance();
  }, []);

  useBinanceOrderbook({
    symbol,
    onDepth: (depthState: OrderbookState, analyticsResult: AnalyticResult, isSim: boolean) => {
      if (!analyticsEngineRef.current) return;
      const engine = analyticsEngineRef.current;
      engine.pushDepth(
        depthState.bids,
        depthState.asks,
        depthState.microPrice,
        depthState.spreadBps
      );
      engine.pushAnalytics(analyticsResult);
      engine.setSimulated(isSim);
      setState(engine.getState());
    },
    onTrade: (trade: BinanceTrade) => {
      if (!analyticsEngineRef.current) return;
      const engine = analyticsEngineRef.current;
      engine.pushTrade({
        price: parseFloat(trade.p),
        volume: parseFloat(trade.q),
        isBuyerMaker: trade.m,
        timestamp: trade.T ?? Date.now(),
      });
      // Catatan: Tidak memanggil setState di sini.
      // Di Binance, trade tiba 20-60 kali/detik. Memanggil setState tiap trade
      // memicu puluhan re-render React DOM per detik yang membebani GPU Three.js.
      // Batch depth 100ms (10 FPS) sudah mengonsumsi akumulasi trade buffer
      // dan memperbarui state dengan mulus tanpa stutter.
    },
  });

  return state;
}

