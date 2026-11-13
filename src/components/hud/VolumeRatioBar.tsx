import type { DepthLevel } from "../../hooks/useBinanceOrderbook";

interface VolumeRatioBarProps {
  bids: DepthLevel[];
  asks: DepthLevel[];
  compact?: boolean;
}

/**
 * Visual split bar showing the proportion of Bid liquidity vs Ask liquidity
 * across the top 20 levels.
 */
export default function VolumeRatioBar({ bids, asks, compact = false }: VolumeRatioBarProps) {
  const totalBid = bids.reduce((acc, b) => acc + (Number.isFinite(b.volume) ? b.volume : 0), 0);
  const totalAsk = asks.reduce((acc, a) => acc + (Number.isFinite(a.volume) ? a.volume : 0), 0);
  const total = Math.max(totalBid + totalAsk, 0.001);
  const bidPct = Math.min(100, Math.max(0, Math.round((totalBid / total) * 100)));
  const askPct = 100 - bidPct;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex justify-between items-center text-[10px] sm:text-[11px] font-mono tabular-nums">
        <span className="text-bid-400 font-semibold flex items-center gap-1">
          <span>BUY</span>
          <span>{bidPct}%</span>
          <span className="text-zinc-500 font-normal hidden sm:inline">({totalBid.toFixed(2)} BTC)</span>
        </span>
        <span className="text-[9px] uppercase tracking-widest text-zinc-500 font-sans">
          Depth Ratio
        </span>
        <span className="text-ask-400 font-semibold flex items-center gap-1">
          <span className="text-zinc-500 font-normal hidden sm:inline">({totalAsk.toFixed(2)} BTC)</span>
          <span>{askPct}%</span>
          <span>SELL</span>
        </span>
      </div>

      <div className="h-2 w-full bg-zinc-900/90 rounded-full overflow-hidden flex border border-white/5">
        <div
          className="h-full bg-bid-500 transition-all duration-300"
          style={{
            width: `${bidPct}%`,
            boxShadow: "0 0 8px rgba(16, 185, 129, 0.35)",
          }}
        />
        <div
          className="h-full bg-ask-500 transition-all duration-300"
          style={{
            width: `${askPct}%`,
            boxShadow: "0 0 8px rgba(239, 68, 68, 0.35)",
          }}
        />
      </div>
    </div>
  );
}
