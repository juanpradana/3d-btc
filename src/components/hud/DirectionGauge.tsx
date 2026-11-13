interface DirectionGaugeProps {
  score: number; // -1.0 (extreme bearish) to +1.0 (extreme bullish)
  confidence?: number; // 0.0 to 1.0
  compact?: boolean;
}

/**
 * Bipolar direction meter anchored at the 50% center line.
 * Fill grows from center outward, colored by sentiment.
 */
export default function DirectionGauge({ score, confidence, compact = false }: DirectionGaugeProps) {
  const clamped = Math.max(-1, Math.min(1, Number.isFinite(score) ? score : 0));
  const isBull = clamped >= 0;
  const pct = Math.abs(clamped) * 50;
  const label = clamped > 0.15 ? "BULLISH" : clamped < -0.15 ? "BEARISH" : "NEUTRAL";
  const colorClass = isBull ? "text-bid-400" : "text-ask-400";

  // Format eksplisit: hindari rendering "+-45" saat nilai negatif.
  const scorePct = Math.round(clamped * 100);
  const scoreLabel = scorePct > 0 ? `+${scorePct}%` : scorePct < 0 ? `${scorePct}%` : "0%";
  const arrow = scorePct > 1 ? "▲" : scorePct < -1 ? "▼" : "◆";

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center justify-between text-[11px] font-mono">
        <span className="text-ask-400">BEAR -100</span>
        <span className="text-[9px] uppercase tracking-widest text-zinc-500">
          Direction Vector
        </span>
        <span className="text-bid-400">BULL +100</span>
      </div>

      <div className="relative h-2.5 bg-zinc-900/90 rounded-full border border-white/10 overflow-hidden">
        {/* Zero tick */}
        <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/40 -translate-x-1/2 z-10" />
        {/* Center-aligned fill */}
        <div
          className="absolute top-0 bottom-0 transition-all duration-300 ease-out"
          style={{
            left: isBull ? "50%" : `${50 - pct}%`,
            width: `${pct}%`,
            background: isBull
              ? "linear-gradient(90deg, #059669 0%, #34d399 100%)"
              : "linear-gradient(90deg, #f87171 0%, #dc2626 100%)",
            boxShadow: isBull
              ? "0 0 10px rgba(16, 185, 129, 0.5)"
              : "0 0 10px rgba(239, 68, 68, 0.5)",
          }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono">
        <span className={`${colorClass} font-semibold flex items-center gap-1`}>
          <span>{arrow}</span>
          {label}
        </span>
        <span className="text-zinc-400">
          {scoreLabel}
          {confidence !== undefined && (
            <span className="text-zinc-500 ml-2">CONF {(confidence * 100).toFixed(0)}%</span>
          )}
        </span>
      </div>
    </div>
  );
}
