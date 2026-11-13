import { useRef, useEffect, useCallback } from "react";
import { MarketSimulator } from "../lib/simulator";
import {
  BINANCE_ENDPOINTS,
  wsUrl as buildWsUrl,
  fetchDepthSnapshot,
} from "../lib/endpoints";

let wasmEngine: any = null;

async function loadWasmEngine() {
  if (wasmEngine) return wasmEngine;
  const module = await import("../wasm/btc_engine.js");
  // wasm-pack --target web auto-init via default export
  const initFn = (module as any).default ?? (module as any).initWasm;
  if (typeof initFn === "function") await initFn();
  const JsOrderBookEngine = (module as any).JsOrderBookEngine;
  wasmEngine = new JsOrderBookEngine();
  return wasmEngine;
}

export interface DepthLevel {
  price: number;
  volume: number;
}

export interface AnalyticResult {
  best_bid: number;
  best_ask: number;
  spread_bps: number;
  micro_price: number;
  ofi: number;
  bid_ask_volume_ratio: number;
  cumulative_delta: number;
  direction_score: number; // -1 .. 1
  confidence: number;
  signal: string;
}

export interface OrderbookState {
  bids: DepthLevel[];
  asks: DepthLevel[];
  lastUpdateId: number | null;
  microPrice: number;
  spreadBps: number;
}

export interface BinanceTrade {
  t: number;      // tradeId
  T?: number;     // trade execution timestamp in ms
  p: string;      // price
  q: string;      // quantity
  m: boolean;     // is buyer maker
}

/** Payload mentah Binance: bids/asks = [ [price, qty], ... ] (string) */
export interface RawDepthLevel {
  0: string;
  1: string;
}
export interface BinanceDepth {
  lastUpdateId: number;
  bids: RawDepthLevel[];
  asks: RawDepthLevel[];
}

/** Konversi payload mentah Binance ke DepthLevel UI-ready */
export function normalizeLevels(levels: RawDepthLevel[] | DepthLevel[]): DepthLevel[] {
  if (!Array.isArray(levels)) return [];
  return levels
    .map((lvl: any) => ({
      price: parseFloat(Array.isArray(lvl) ? lvl[0] : lvl.price),
      volume: parseFloat(Array.isArray(lvl) ? lvl[1] : lvl.volume),
    }))
    .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.volume));
}

interface WssHookOptions {
  symbol: string;
  onDepth: (state: OrderbookState, analytics: AnalyticResult, isSimulated: boolean) => void;
  onTrade?: (trade: BinanceTrade, analytics: AnalyticResult, isSimulated: boolean) => void;
  depthBatchMs?: number; // batch depth events
}

/**
 * Hook: connect to Binance public WS, run WASM analytics,
 * emit batched analytics + depth state every N ms.
 */
export function useBinanceOrderbook(options: WssHookOptions) {
  const { symbol, onDepth, onTrade, depthBatchMs = 100 } = options;

  const engineRef = useRef<any>(null);
  const depthWsRef = useRef<WebSocket | null>(null);
  const tradeWsRef = useRef<WebSocket | null>(null);
  const depthBuffer = useRef<DepthLevel[][]>([[], []]);
  const lastDepthIdRef = useRef<number>(0);
  const batchIntervalRef = useRef<number | null>(null);
  const depthPendingRef = useRef<DepthLevel[][] | null>(null);
  const fallbackTimerRef = useRef<number | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectingRef = useRef<boolean>(false);
  const curEndpointRef = useRef<string>(BINANCE_ENDPOINTS.ws[0]);
  const endpointFailCountRef = useRef<number>(0);

  // Simulator fallback
  const simulatorRef = useRef<MarketSimulator | null>(null);
  const isSimulatedRef = useRef<boolean>(false);
  const gotMessageRef = useRef<boolean>(false);

  const connectDepth = useCallback(
    (engine: any, epIndex = 0) => {
      const base = BINANCE_ENDPOINTS.ws[epIndex % BINANCE_ENDPOINTS.ws.length];
      const url = buildWsUrl(base, symbol, "depth20@100ms");
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        nextEndpointFor(epIndex, engine);
        return;
      }

      ws.onopen = () => {
        gotMessageRef.current = true;
        if (fallbackTimerRef.current !== null) {
          window.clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }
        curEndpointRef.current = base;
        console.log(`[BinanceWS] depth connected: ${url}`);
        depthWsRef.current = ws;
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          gotMessageRef.current = true;
          const data: BinanceDepth = JSON.parse(event.data);
          const bids = normalizeLevels(data.bids).slice(0, 20);
          const asks = normalizeLevels(data.asks).slice(0, 20);
          depthBuffer.current = [bids, asks];
          lastDepthIdRef.current = data.lastUpdateId;
          depthPendingRef.current = [bids, asks];
          engine.apply_snapshot(
            JSON.stringify({ lastUpdateId: data.lastUpdateId, bids, asks })
          );
        } catch (e) {
          console.error("[BinanceWS] depth parse error", e);
        }
      };

      ws.onerror = () => {
        console.warn(`[BinanceWS] depth error @ ${base} → coba endpoint lain`);
        nextEndpointFor(epIndex, engine);
      };
      ws.onclose = () => {
        if (isSimulatedRef.current) return;
        console.log(`[BinanceWS] depth closed @ ${base}`);
        nextEndpointFor(epIndex, engine);
      };

      depthWsRef.current = ws;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol]
  );

  const connectTrades = useCallback(
    (engine: any, epIndex = 0) => {
      const base = BINANCE_ENDPOINTS.ws[epIndex % BINANCE_ENDPOINTS.ws.length];
      const url = buildWsUrl(base, symbol, "trade");
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        nextEndpointFor(epIndex, engine);
        return;
      }

      ws.onopen = () => {
        console.log(`[BinanceWS] trade connected: ${url}`);
      };

      ws.onerror = () => {
        console.warn(`[BinanceWS] trade error @ ${base} → coba endpoint lain`);
        nextEndpointFor(epIndex, engine);
      };
      ws.onclose = () => {
        if (isSimulatedRef.current) return;
        nextEndpointFor(epIndex, engine);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          gotMessageRef.current = true;
          const data: BinanceTrade = JSON.parse(event.data);
          const vol = Math.abs(parseFloat(data.q));
          const isBuyerMaker = data.m;
          // aggressive buyer = not maker
          const side = isBuyerMaker ? "sell" : "buy";
          // `T` = exchange execution time (ms) — dipakai untuk window CVD 2 menit.
          // Jangan pakai `t` (tradeId, integer ~50 juta) — itu akan membuat
          // prune_cvd membuang semua trade karena timestampnya di masa lalu.
          engine.record_trade(data.T ?? Date.now(), side, vol);

          if (onTradeRef.current) {
            onTradeRef.current(data, {} as AnalyticResult, isSimulatedRef.current);
          }
        } catch (e) {
          console.error("[BinanceWS] trade parse error", e);
        }
      };

      tradeWsRef.current = ws;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol]
  );

  /** Coba endpoint WebSocket berikutnya; jika semua gagal, fallback simulator */
  const nextEndpointFor = useCallback(
    (failedIndex: number, engine: any) => {
      if (reconnectingRef.current || isSimulatedRef.current) return;
      reconnectingRef.current = true;
      endpointFailCountRef.current++;
      const nextIdx = (failedIndex + 1) % BINANCE_ENDPOINTS.ws.length;
      if (endpointFailCountRef.current >= BINANCE_ENDPOINTS.ws.length * 2) {
        // Semua mirror/host telah dicoba setidaknya 2x dan gagal
        reconnectingRef.current = false;
        startSimulatorRef.current(engine);
        return;
      }
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectingRef.current = false;
        if (!isSimulatedRef.current) {
          connectDepth(engine, nextIdx);
          connectTrades(engine, nextIdx);
        }
      }, 1500);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol]
  );

  /**
   * Fallback ke simulator saat koneksi bursa gagal (geo-block / offline).
   * Live WS tetap diprioritaskan bila berhasil terhubung.
   */
  const startSimulator = useCallback(
    (engine: any) => {
      if (isSimulatedRef.current) return;
      isSimulatedRef.current = true;
      console.warn("[DataFeed] Binance unreachable → switching to MarketSimulator (demo data)");

      // Tutup WS yang gagal agar tidak reconnect loop
      depthWsRef.current?.close();
      tradeWsRef.current?.close();
      depthWsRef.current = null;
      tradeWsRef.current = null;

      const sim = new MarketSimulator();
      simulatorRef.current = sim;
      sim.on({
        onDepth: (bids, asks) => {
          depthPendingRef.current = [bids, asks];
          lastDepthIdRef.current = Date.now();
          try {
            engine.apply_snapshot(JSON.stringify({ lastUpdateId: Date.now(), bids, asks }));
          } catch (e) {
            console.error("[Sim] apply_snapshot error", e);
          }
        },
        onTrade: (trade) => {
          const side = trade.isBuyerMaker ? "sell" : "buy";
          engine.record_trade(trade.timestamp, side, trade.volume);
          // Feed analytics store (Δ1m CVD, trade buffer) same as live path
          if (onTradeRef.current) {
            onTradeRef.current(
              { t: trade.timestamp, T: trade.timestamp, p: String(trade.price), q: String(trade.volume), m: trade.isBuyerMaker },
              {} as AnalyticResult,
              true
            );
          }
        },
      });
      sim.start(depthBatchMs);
    },
    [depthBatchMs]
  );

  const startSimulatorRef = useRef<(engine: any) => void>(() => {});
  startSimulatorRef.current = startSimulator;

  // Simpan callback terbaru di ref supaya useEffect tidak re-run tiap render
  const onDepthRef = useRef(onDepth);
  const onTradeRef = useRef(onTrade);
  onDepthRef.current = onDepth;
  onTradeRef.current = onTrade;

  const flushBatchRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;
    loadWasmEngine().then(async (engine) => {
      if (cancelled) return;
      engineRef.current = engine;

      // 1. Hydrate orderbook via REST snapshot (instant first paint < 500ms)
      const snap = await fetchDepthSnapshot(symbol, 20);
      if (snap && !cancelled) {
        const bids = normalizeLevels(snap.bids).slice(0, 20);
        const asks = normalizeLevels(snap.asks).slice(0, 20);
        lastDepthIdRef.current = snap.lastUpdateId;
        depthPendingRef.current = [bids, asks];
        engine.apply_snapshot(
          JSON.stringify({ lastUpdateId: snap.lastUpdateId, bids, asks })
        );
      }

      // 2. Connect live WS (depth + trades)
      connectDepth(engine);
      connectTrades(engine);
    });

    // Batch interval untuk WASM batch — sekali saja (baca callback via ref)
    batchIntervalRef.current = window.setInterval(() => flushBatchRef.current(), depthBatchMs);

    // Fallback proaktif: jika 5s tidak ada pesan WS masuk, pakai simulator.
    // (WS error/close juga memicu fallback; timer ini menutup kasus
    //  "connect hang" di jaringan yang memblokir egress.)
    // Lebih lama dari 2.5s karena REST hydrate bisa butuh waktu pada jaringan lambat.
    const fallbackTimer = window.setTimeout(() => {
      if (!gotMessageRef.current && !isSimulatedRef.current && engineRef.current) {
        startSimulatorRef.current(engineRef.current);
      }
    }, 5000);
    fallbackTimerRef.current = fallbackTimer;

    return () => {
      cancelled = true;
      if (batchIntervalRef.current) {
        window.clearInterval(batchIntervalRef.current);
      }
      if (fallbackTimerRef.current !== null) {
        window.clearTimeout(fallbackTimerRef.current);
      }
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectingRef.current = false;
      }
      depthWsRef.current?.close();
      tradeWsRef.current?.close();
      depthWsRef.current = null;
      tradeWsRef.current = null;
      simulatorRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depthBatchMs]);

  // Bind flushBatch (terbaru) ke ref
  flushBatchRef.current = () => {
    const engine = engineRef.current;
    if (!engine) return;

    // Pakai depth pending bila ada; jika tidak ada paket depth dalam tick 100ms
    // ini, pakai yang terakhir agar UI tidak berkedip kosong.
    const pending = depthPendingRef.current;
    if (pending) {
      depthBuffer.current = pending;
      depthPendingRef.current = null;
    }
    const [bids, asks] = depthBuffer.current;

    try {
      const analytics = engine.analyze(Date.now());
      const parsed = analytics ? JSON.parse(analytics) : {};
      const result = parsed as AnalyticResult;

      onDepthRef.current(
        {
          bids,
          asks,
          lastUpdateId: lastDepthIdRef.current,
          microPrice: (result.micro_price as number) || 0,
          spreadBps: (result.spread_bps as number) || 0,
        },
        result,
        isSimulatedRef.current
      );
    } catch (e) {
      console.error("[BinanceWS] analyze error", e);
    }
  };

  return {
    isSimulated: isSimulatedRef.current,
    microPrice: 0,
    signal: "LOADING",
    directionScore: 0,
    confidence: 0,
    spreadBps: 0,
  };
}
