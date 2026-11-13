use std::collections::VecDeque;

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Jendela rolling Cumulative Volume Delta (2 menit).
const CVD_WINDOW_MS: f64 = 120_000.0;
/// Batas keras entri trade agar memori tidak tumbuh tak terbatas.
const CVD_MAX_ENTRIES: usize = 20_000;

#[wasm_bindgen(start)]
pub fn init() {
    console_error_panic_hook::set_once();
}

/// Level orderbook tereduksi (20 level)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderLevel {
    pub price: f64,
    pub volume: f64,
}

/// Snapshot + diff dari Binance depth20
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepthEvent {
    #[serde(alias = "lastUpdateId")]
    pub last_update_id: i64,
    #[serde(rename = "bids")]
    pub bid_levels: Vec<OrderLevel>,
    #[serde(rename = "asks")]
    pub ask_levels: Vec<OrderLevel>,
}

/// Hasil analisis orderbook
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderBookAnalytics {
    pub best_bid: f64,
    pub best_ask: f64,
    pub spread_bps: f64,
    pub micro_price: f64,
    pub ofi: f64,
    pub bid_ask_volume_ratio: f64,
    pub cumulative_delta: f64,
    pub direction_score: f64, // -1 .. 1
    pub confidence: f64,
    pub signal: String,
}

/// Berapa banyak level teratas untuk tekanan volume (micro price).
const PRESSURE_LEVELS: usize = 5;

/// Engine orderbook internal
pub struct OrderBookEngine {
    pub best_bid: f64,
    pub best_ask: f64,
    pub bids: Vec<OrderLevel>,
    pub asks: Vec<OrderLevel>,
    pub prev_bids: Vec<OrderLevel>,
    pub prev_asks: Vec<OrderLevel>,
    /// Ringkasan trade agresif (timestamp_ms, delta) dalam jendela rolling.
    trades: VecDeque<(f64, f64)>,
    /// True setelah snapshot penuh pertama (orderbook ter-reconstruct).
    initialized: bool,
}

impl Default for OrderBookEngine {
    fn default() -> Self {
        Self::new()
    }
}

impl OrderBookEngine {
    pub fn new() -> Self {
        Self {
            best_bid: 0.0,
            best_ask: 0.0,
            bids: Vec::new(),
            asks: Vec::new(),
            prev_bids: Vec::new(),
            prev_asks: Vec::new(),
            trades: VecDeque::with_capacity(2048),
            initialized: false,
        }
    }

    /// Terapkan snapshot lengkap (snapshot Binance).
    /// Book dianggap valid setelah ini — snapshot TIDAK mereset CVD,
    /// karena trade adalah fakta historis yang sudah terjadi.
    pub fn apply_snapshot(&mut self, bids: Vec<OrderLevel>, asks: Vec<OrderLevel>) {
        // Snapshot pertama = baseline; OFI dihitung setelah ada perbandingan.
        if !self.initialized {
            self.prev_bids = bids.clone();
            self.prev_asks = asks.clone();
            self.initialized = true;
        } else {
            self.prev_bids = std::mem::replace(&mut self.bids, bids.clone());
            self.prev_asks = std::mem::replace(&mut self.asks, asks.clone());
        }
        self.bids = bids.clone();
        self.asks = asks.clone();
        self.best_bid = self.bids.first().map(|l| l.price).unwrap_or(0.0);
        self.best_ask = self.asks.first().map(|l| l.price).unwrap_or(0.0);
    }

    /// Terapkan diff / partial update (depthUpdate Binance)
    pub fn apply_update(&mut self, bids: Vec<OrderLevel>, asks: Vec<OrderLevel>) {
        if !self.initialized {
            self.apply_snapshot(bids, asks);
            return;
        }
        self.prev_bids = std::mem::replace(&mut self.bids, bids.clone());
        self.prev_asks = std::mem::replace(&mut self.asks, asks.clone());
        self.best_bid = self.bids.first().map(|l| l.price).unwrap_or(0.0);
        self.best_ask = self.asks.first().map(|l| l.price).unwrap_or(0.0);
    }

    /// Cumulative Volume Delta (aggressive buy vs sell).
    /// `timestamp_ms` = waktu eksekusi trade (waktu server/klien).
    pub fn cum_delta_step(&mut self, timestamp_ms: f64, buy_vol: f64, sell_vol: f64) {
        let delta = buy_vol - sell_vol;
        if delta == 0.0 {
            return;
        }
        self.trades.push_back((timestamp_ms, delta));
        // Batas keras supaya feed sangat lambat tetap terbatas.
        while self.trades.len() > CVD_MAX_ENTRIES {
            self.trades.pop_front();
        }
    }

    /// Buang trade di luar jendela (`now_ms` = waktu event terbaru yang terlihat).
    fn prune_cvd(&mut self, now_ms: f64) {
        while let Some(&(ts, _)) = self.trades.front() {
            if now_ms - ts > CVD_WINDOW_MS {
                self.trades.pop_front();
            } else {
                break;
            }
        }
    }

    /// CVD dalam jendela rolling.
    pub fn cumulative_delta_of(&mut self, now_ms: f64) -> f64 {
        self.prune_cvd(now_ms);
        self.trades.iter().map(|(_, d)| d).sum()
    }

    /// Timestamp terakhir yang diketahui engine (untuk menjaga CVD konsisten).
    pub fn last_trade_time(&self) -> f64 {
        self.trades.back().map(|(ts, _)| *ts).unwrap_or(0.0)
    }

    /// Order Flow Imbalance: selisih volume bid/ask top level terhadap snapshot sebelumnya.
    /// Bid/ask dicocokkan BERDASARKAN HARGA (bukan index array), agar orderbook yang
    /// terpotong / berbeda depth di awal tetap dihitung OFI-nya dengan benar.
    fn compute_ofi(&self) -> f64 {
        if self.bids.is_empty() || self.prev_bids.is_empty() || self.asks.is_empty() || self.prev_asks.is_empty() {
            return 0.0;
        }
        let top = 5.min(self.bids.len().min(self.asks.len()));
        let mut ofi = 0.0;

        // Linear search untuk matching harga (top <= 5, jadi O(n^2) kecil).
        for i in 0..top {
            let bid_price = self.bids[i].price;
            let ask_price = self.asks[i].price;

            let prev_bid_vol = self.prev_bids.iter()
                .find(|l| (l.price - bid_price).abs() < f64::EPSILON)
                .map(|l| l.volume)
                .unwrap_or(self.bids[i].volume);
            let prev_ask_vol = self.prev_asks.iter()
                .find(|l| (l.price - ask_price).abs() < f64::EPSILON)
                .map(|l| l.volume)
                .unwrap_or(self.asks[i].volume);

            let b_vol = self.bids[i].volume - prev_bid_vol;
            let a_vol = self.asks[i].volume - prev_ask_vol;
            ofi += b_vol - a_vol;
        }
        ofi
    }

    /// Micro price: harga penyeimbang berbobot volume di level teratas.
    ///
    /// Rumus standar: micro = (bid_px * ask_vol + ask_px * bid_vol) / (bid_vol + ask_vol)
    /// Nilai selalu berada di dalam [best_bid, best_ask].
    fn micro_price(&self) -> f64 {
        if self.best_bid <= 0.0 || self.best_ask <= 0.0 || self.best_ask < self.best_bid {
            return 0.0;
        }
        let top = PRESSURE_LEVELS.min(self.bids.len().min(self.asks.len()));
        if top == 0 {
            return (self.best_bid + self.best_ask) / 2.0;
        }
        let bid_vol: f64 = self.bids.iter().take(top).map(|l| l.volume).sum();
        let ask_vol: f64 = self.asks.iter().take(top).map(|l| l.volume).sum();
        let total = bid_vol + ask_vol;
        if total <= 0.0 {
            return (self.best_bid + self.best_ask) / 2.0;
        }
        // Micro-price standar: bobot ask_vol di bid_px, bobot bid_vol di ask_px
        (self.best_bid * ask_vol + self.best_ask * bid_vol) / total
    }

    fn spread_bps(&self) -> f64 {
        if self.best_bid == 0.0 || self.best_ask == 0.0 {
            return 0.0;
        }
        let mid = (self.best_bid + self.best_ask) / 2.0;
        (self.best_ask - self.best_bid) / mid * 10_000.0
    }

    fn bid_ask_volume_ratio(&self) -> f64 {
        let bid_vol = self.bids.iter().map(|l| l.volume).sum::<f64>();
        let ask_vol = self.asks.iter().map(|l| l.volume).sum::<f64>();
        if ask_vol <= 0.0 {
            return 1.0;
        }
        bid_vol / ask_vol
    }

    fn direction_score(&self, ofi: f64, ratio: f64, cum_delta: f64) -> f64 {
        let mut score = 0.0;
        // OFI component (normalized)
        score += (ofi / 100.0).clamp(-0.4, 0.4);
        // volume ratio component
        score += ((ratio - 1.0) * 0.5).clamp(-0.35, 0.35);
        // cum delta component
        score += (cum_delta / 10.0).clamp(-0.25, 0.25);
        score.clamp(-1.0, 1.0)
    }

    fn confidence(&self, ofi: f64, ratio: f64, micro_price: f64) -> f64 {
        let ofi_conf = ofi.abs().min(100.0) / 100.0;
        let ratio_conf = (ratio - 1.0).abs().min(1.0);
        let price_conf = if micro_price > 0.0 {
            1.0 - ((micro_price - (self.best_bid + self.best_ask) / 2.0) / self.best_bid).abs().min(0.5)
        } else {
            0.0
        };
        (ofi_conf * 0.4 + ratio_conf * 0.3 + price_conf * 0.3).clamp(0.0, 1.0)
    }

    pub fn snapshot_size(&self) -> (usize, usize) {
        (self.bids.len(), self.asks.len())
    }

    pub fn best_bid(&self) -> f64 {
        self.best_bid
    }

    pub fn best_ask(&self) -> f64 {
        self.best_ask
    }

    /// Hitung analytics lengkap dari snapshot terakhir.
    /// `now_ms` = waktu "now" untuk pruning CVD window (pakai timestamp trade terakhir / Date.now()).
    pub fn analyze(&mut self, now_ms: f64) -> OrderBookAnalytics {
        let ofi = self.compute_ofi();
        let ratio = self.bid_ask_volume_ratio();
        let micro_price = self.micro_price();
        let cum_delta = self.cumulative_delta_of(now_ms);
        let direction = self.direction_score(ofi, ratio, cum_delta);
        let confidence = self.confidence(ofi, ratio, micro_price);
        let signal = match direction {
            s if s > 0.15 => "BULLISH".to_string(),
            s if s < -0.15 => "BEARISH".to_string(),
            _ => "NEUTRAL".to_string(),
        };
        OrderBookAnalytics {
            best_bid: self.best_bid,
            best_ask: self.best_ask,
            spread_bps: self.spread_bps(),
            micro_price,
            ofi,
            bid_ask_volume_ratio: ratio,
            cumulative_delta: cum_delta,
            direction_score: direction,
            confidence,
            signal,
        }
    }
}

#[wasm_bindgen]
pub struct JsOrderBookEngine {
    engine: OrderBookEngine,
}

#[wasm_bindgen]
impl JsOrderBookEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> JsOrderBookEngine {
        JsOrderBookEngine {
            engine: OrderBookEngine::new(),
        }
    }

    /// Apply full snapshot from Binance `depth@20` event
    #[wasm_bindgen]
    pub fn apply_snapshot(&mut self, json: &str) -> Result<(), JsValue> {
        let ev: DepthEvent = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.engine.apply_snapshot(ev.bid_levels, ev.ask_levels);
        Ok(())
    }

    /// Apply partial depth update
    #[wasm_bindgen]
    pub fn apply_update(&mut self, json: &str) -> Result<(), JsValue> {
        let ev: DepthEvent = serde_json::from_str(json).map_err(|e| JsValue::from_str(&e.to_string()))?;
        self.engine.apply_update(ev.bid_levels, ev.ask_levels);
        Ok(())
    }

    /// Record an aggressive trade.
    /// `timestamp_ms` = waktu eksekusi (exchange time `T` atau Date.now()).
    #[wasm_bindgen]
    pub fn record_trade(&mut self, timestamp_ms: f64, side: &str, volume: f64) {
        if side == "buy" {
            self.engine.cum_delta_step(timestamp_ms, volume, 0.0);
        } else {
            self.engine.cum_delta_step(timestamp_ms, 0.0, volume);
        }
    }

    /// Hitung metrik lengkap. `now_ms` = waktu saat ini (Date.now()) untuk window CVD.
    #[wasm_bindgen]
    pub fn analyze(&mut self, now_ms: f64) -> Result<String, JsValue> {
        let analytics = self.engine.analyze(now_ms);
        serde_json::to_string(&analytics).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    #[wasm_bindgen]
    pub fn best_bid(&self) -> f64 {
        self.engine.best_bid()
    }

    #[wasm_bindgen]
    pub fn best_ask(&self) -> f64 {
        self.engine.best_ask()
    }

    #[wasm_bindgen]
    pub fn bid_count(&self) -> usize {
        self.engine.bids.len()
    }

    #[wasm_bindgen]
    pub fn ask_count(&self) -> usize {
        self.engine.asks.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_micro_price_between_bid_ask() {
        let mut eng = OrderBookEngine::new();
        eng.apply_snapshot(
            vec![OrderLevel { price: 100.0, volume: 10.0 }],
            vec![OrderLevel { price: 101.0, volume: 10.0 }],
        );
        let now = 1000.0;
        let res = eng.analyze(now);
        // Symmetric volume -> micro == mid
        assert!((res.micro_price - 100.5).abs() < 0.01);
        assert!(res.micro_price > res.best_bid);
        assert!(res.micro_price < res.best_ask);
    }

    #[test]
    fn test_micro_price_weighted_toward_heavier_side() {
        let mut eng = OrderBookEngine::new();
        // Heavy bid volume -> micro closer to ask (buyers aggressive, price pulled up)
        eng.apply_snapshot(
            vec![OrderLevel { price: 100.0, volume: 100.0 }],
            vec![OrderLevel { price: 101.0, volume: 1.0 }],
        );
        let now = 1000.0;
        let res = eng.analyze(now);
        // More bid volume -> micro price closer to ask
        assert!(res.micro_price > 100.5);
    }

    #[test]
    fn test_cvd_window_rolling() {
        let mut eng = OrderBookEngine::new();
        let now = 100_000.0;
        // Trade at t=0
        eng.cum_delta_step(now, 1.0, 0.0);
        // Trade at t=60s
        eng.cum_delta_step(now + 60_000.0, 1.0, 0.0);
        // Trade at t=119s (still in 2m window)
        eng.cum_delta_step(now + 119_000.0, 1.0, 0.0);
        // Query at t=119s -> 3.0
        assert!((eng.cumulative_delta_of(now + 119_000.0) - 3.0).abs() < 0.001);
        // Trade at t=121s (first trade expired)
        eng.cum_delta_step(now + 121_000.0, 1.0, 0.0);
        // Query at t=121s -> 3.0 (t=0 expired, t=60, t=119, t=121 remain)
        assert!((eng.cumulative_delta_of(now + 121_000.0) - 3.0).abs() < 0.001);
        // Query at t=241s -> only t=121s remains (241 - 121 = 120 -> boundary)
        // at t=242s only t=121s expired? No, 242 - 121 = 121 > 120 -> 0.
        // at t=181s: t=60 expired (181 - 60 = 121 > 120), t=119 (diff 62) and t=121 (diff 60) remain -> 2.0
        assert!((eng.cumulative_delta_of(now + 181_000.0) - 2.0).abs() < 0.001);
        // at t=242s: all expired -> 0.0
        assert!((eng.cumulative_delta_of(now + 242_000.0) - 0.0).abs() < 0.001);
    }

    #[test]
    fn test_snapshot_does_not_reset_cvd() {
        let mut eng = OrderBookEngine::new();
        let now = 100_000.0;
        // Build CVD
        eng.cum_delta_step(now, 5.0, 0.0);
        // Apply snapshot (new depth levels)
        eng.apply_snapshot(
            vec![OrderLevel { price: 100.0, volume: 1.0 }],
            vec![OrderLevel { price: 101.0, volume: 1.0 }],
        );
        // CVD should persist
        assert!((eng.cumulative_delta_of(now) - 5.0).abs() < 0.001);
    }

    #[test]
    fn test_ofi_positive_when_bid_pressure() {
        let mut eng = OrderBookEngine::new();
        // Initial snapshot
        eng.apply_snapshot(
            vec![OrderLevel { price: 100.0, volume: 10.0 }],
            vec![OrderLevel { price: 101.0, volume: 10.0 }],
        );
        // Next snapshot: bid volume up, ask volume down -> positive OFI
        eng.apply_snapshot(
            vec![OrderLevel { price: 100.0, volume: 15.0 }],
            vec![OrderLevel { price: 101.0, volume: 5.0 }],
        );
        let now = 1000.0;
        let res = eng.analyze(now);
        assert!(res.ofi > 0.0);
    }

    #[test]
    fn test_ofi_negative_when_ask_pressure() {
        let mut eng = OrderBookEngine::new();
        eng.apply_snapshot(
            vec![OrderLevel { price: 100.0, volume: 10.0 }],
            vec![OrderLevel { price: 101.0, volume: 10.0 }],
        );
        // Next snapshot: bid volume down, ask volume up -> negative OFI
        eng.apply_snapshot(
            vec![OrderLevel { price: 100.0, volume: 5.0 }],
            vec![OrderLevel { price: 101.0, volume: 15.0 }],
        );
        let now = 1000.0;
        let res = eng.analyze(now);
        assert!(res.ofi < 0.0);
    }
}

