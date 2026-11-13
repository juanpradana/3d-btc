import { useMemo } from "react";
import type { DepthLevel } from "../../hooks/useBinanceOrderbook";

interface DepthLadderPanelProps {
  bids: DepthLevel[];
  asks: DepthLevel[];
  microPrice: number;
  spreadBps: number;
  className?: string;
  levelsToShow?: number;
}

const fmtPrice = (p: number) =>
  p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtWholePrice = (p: number) =>
  p.toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function DepthLadderPanel({
  bids,
  asks,
  microPrice,
  spreadBps,
  className = "",
  levelsToShow = 9,
}: DepthLadderPanelProps) {
  // Hitung volume maksimum untuk normalisasi bar kedalaman
  const maxVolume = useMemo(() => {
    const visibleAsks = asks.slice(0, levelsToShow).map((a) => a.volume);
    const visibleBids = bids.slice(0, levelsToShow).map((b) => b.volume);
    const all = [...visibleAsks, ...visibleBids];
    return Math.max(...all, 0.5);
  }, [asks, bids, levelsToShow]);

  const displayedAsks = useMemo(
    () => asks.slice(0, levelsToShow).reverse(),
    [asks, levelsToShow]
  );
  const displayedBids = useMemo(
    () => bids.slice(0, levelsToShow),
    [bids, levelsToShow]
  );

  return (
    <aside
      className={`cockpit-panel rounded-2xl p-3 sm:p-3.5 select-none flex flex-col pointer-events-auto ${className}`}
      aria-label="Order Book Depth Ladder"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-3 bg-bid-400 rounded-sm" />
          <h2 className="text-[11px] font-mono uppercase tracking-wider font-semibold text-zinc-300">
            L2 Depth Matrix
          </h2>
        </div>
        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
          {levelsToShow * 2} Levels
        </span>
      </div>

      {/* Column Titles */}
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-500 font-mono px-1 pb-1">
        <span>Price (USDT)</span>
        <span>Size (BTC)</span>
      </div>

      {/* Scrollable / Stacked Ladder Rows */}
      <div className="flex-1 overflow-y-auto space-y-0.5 text-xs font-mono pr-0.5">
        {/* Asks (Sells) - Reversed order so lowest ask is closest to spread */}
        <div className="space-y-0.5">
          {displayedAsks.map((ask, i) => {
            const rawPct = (ask.volume / maxVolume) * 100;
            // Tanpa batas bawah buatan: volume debu harus tampak tipis, jujur terhadap datanya.
            const widthPct = Math.min(100, Math.max(0.5, rawPct));
            const isWhale = ask.volume > maxVolume * 0.45;
            return (
              <div
                key={`ask-${ask.price}-${i}`}
                className={`relative flex justify-between items-center px-2 py-1 rounded transition-colors hover:bg-white/5 group ${
                  isWhale ? "ring-1 ring-ask-500/30" : ""
                }`}
              >
                <div
                  className={`absolute inset-y-0 right-0 rounded transition-all duration-150 ${
                    isWhale
                      ? "bg-ask-500/40 group-hover:bg-ask-500/55"
                      : "bg-ask-500/15 group-hover:bg-ask-500/25"
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
                <span className="relative z-10 text-ask-400 font-semibold tabular-nums text-[11px]">
                  {fmtWholePrice(ask.price)}
                  {isWhale && <span className="ml-1 text-[9px] text-amber-300/80">🐋</span>}
                </span>
                <span className="relative z-10 text-zinc-300 tabular-nums text-[11px]">
                  {ask.volume.toFixed(3)}
                </span>
              </div>
            );
          })}
        </div>

        {/* Center Spread & Micro-Price Indicator */}
        <div className="my-1.5 py-1 px-2 rounded-lg bg-zinc-900/90 border border-white/10 flex items-center justify-between shadow-inner">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulse" />
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-sans">
              Micro
            </span>
            <span className="text-accent-400 font-bold tabular-nums text-xs">
              ${fmtPrice(microPrice)}
            </span>
          </div>
          <div className="text-[10px] text-zinc-400 font-sans">
            Spread <span className="font-mono text-zinc-200 font-semibold">{spreadBps.toFixed(1)} bps</span>
          </div>
        </div>

        {/* Bids (Buys) */}
        <div className="space-y-0.5">
          {displayedBids.map((bid, i) => {
            const rawPct = (bid.volume / maxVolume) * 100;
            const widthPct = Math.min(100, Math.max(0.5, rawPct));
            const isWhale = bid.volume > maxVolume * 0.45;
            return (
              <div
                key={`bid-${bid.price}-${i}`}
                className={`relative flex justify-between items-center px-2 py-1 rounded transition-colors hover:bg-white/5 group ${
                  isWhale ? "ring-1 ring-bid-500/30" : ""
                }`}
              >
                <div
                  className={`absolute inset-y-0 right-0 rounded transition-all duration-150 ${
                    isWhale
                      ? "bg-bid-500/40 group-hover:bg-bid-500/55"
                      : "bg-bid-500/15 group-hover:bg-bid-500/25"
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
                <span className="relative z-10 text-bid-400 font-semibold tabular-nums text-[11px]">
                  {fmtWholePrice(bid.price)}
                  {isWhale && <span className="ml-1 text-[9px] text-amber-300/80">🐋</span>}
                </span>
                <span className="relative z-10 text-zinc-300 tabular-nums text-[11px]">
                  {bid.volume.toFixed(3)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
