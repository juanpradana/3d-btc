import type { AppAnalyticsState } from "../../hooks/useBtcAnalytics";
import DirectionGauge from "./DirectionGauge";
import VolumeRatioBar from "./VolumeRatioBar";

interface TelemetryPanelProps {
  state: AppAnalyticsState;
  className?: string;
}

export default function TelemetryPanel({ state, className = "" }: TelemetryPanelProps) {
  const totalBid = state.bidLevels.reduce((acc, b) => acc + (Number.isFinite(b.volume) ? b.volume : 0), 0);
  const totalAsk = state.askLevels.reduce((acc, a) => acc + (Number.isFinite(a.volume) ? a.volume : 0), 0);

  const signed = (v: number, digits = 2) => `${v > 0 ? "+" : ""}${v.toFixed(digits)}`;
  const toneFor = (v: number, eps = 0) =>
    v > eps ? "text-bid-400" : v < -eps ? "text-ask-400" : "text-zinc-300";

  const cells: { label: string; value: string; tone: string }[] = [
    { label: "OFI", value: signed(state.ofi), tone: toneFor(state.ofi, 0.05) },
    { label: "Confidence", value: `${(state.confidence * 100).toFixed(0)}%`, tone: "text-accent-400" },
    { label: "Δ 1m CVD", value: `${signed(state.delta1m)} BTC`, tone: toneFor(state.delta1m) },
    { label: "2m Cum Delta", value: `${signed(state.cumulative_delta)} BTC`, tone: toneFor(state.cumulative_delta) },
    { label: "Bid Depth 20L", value: `${totalBid.toFixed(2)} BTC`, tone: "text-bid-400" },
    { label: "Ask Depth 20L", value: `${totalAsk.toFixed(2)} BTC`, tone: "text-ask-400" },
  ];

  return (
    <aside
      className={`cockpit-panel rounded-2xl p-3 sm:p-3.5 select-none space-y-2.5 text-zinc-200 ${className}`}
      aria-label="Tactical Market Telemetry"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-1 h-3 bg-accent-400 rounded-sm" />
          <h2 className="text-[11px] font-mono uppercase tracking-wider font-semibold text-zinc-300">
            Order Flow Radar
          </h2>
        </div>
        <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
          WASM 10Hz
        </span>
      </div>

      {/* Direction Vector Meter */}
      <div className="cockpit-card p-2.5">
        <DirectionGauge score={state.direction_score} confidence={state.confidence} />
      </div>

      {/* Liquidity Split Bar */}
      <div className="cockpit-card p-2.5">
        <VolumeRatioBar bids={state.bidLevels} asks={state.askLevels} />
      </div>

      {/* Secondary Metrics — balanced 2-column grid */}
      <div className="cockpit-card p-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
        {cells.map((c) => (
          <div key={c.label} className="min-w-0">
            <div className="text-[9px] uppercase tracking-wider text-zinc-500 truncate">
              {c.label}
            </div>
            <div className={`text-[11px] font-mono font-semibold tabular-nums truncate ${c.tone}`}>
              {c.value}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
