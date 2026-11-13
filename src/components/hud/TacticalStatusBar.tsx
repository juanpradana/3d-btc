import { useEffect, useState } from "react";
import type { AppAnalyticsState } from "../../hooks/useBtcAnalytics";

interface TacticalStatusBarProps {
  state: AppAnalyticsState;
  mode: "battlefield" | "openmaps";
  className?: string;
}

export default function TacticalStatusBar({
  state,
  mode,
  className = "",
}: TacticalStatusBarProps) {
  const [utcTime, setUtcTime] = useState(() => new Date().toISOString().slice(11, 19));

  useEffect(() => {
    const tick = () => setUtcTime(new Date().toISOString().slice(11, 19));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const connectionStatus = state.isConnected ? "CONNECTED" : "DISCONNECTED";
  const feedStatus = state.isSimulated ? "SIMULATED" : "LIVE VISION";

  return (
    <footer
      className={`cockpit-footer safe-bottom fixed bottom-0 left-0 right-0 z-20 select-none hidden lg:block ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="max-w-[1920px] mx-auto px-3 sm:px-4 py-1.5 sm:py-2 flex flex-wrap items-center justify-between gap-2">
        {/* Left: Engine & Feed Status */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-1.5">
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                state.isConnected ? "bg-bid-400" : "bg-ask-500"
              }`}
            />
            <span className="text-[10px] font-mono text-zinc-300 uppercase tracking-wider">
              {connectionStatus}
            </span>
          </div>

          <div className="hidden sm:flex w-px h-4 bg-white/10" />

          <div className="flex items-center gap-1">
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
              Feed
            </span>
            <span className="text-[10px] font-mono font-medium text-zinc-300">
              {feedStatus}
            </span>
            {state.isSimulated && (
              <span className="text-[8px] font-mono text-amber-400 px-1 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                FALLBACK
              </span>
            )}
          </div>

          <div className="hidden sm:flex w-px h-4 bg-white/10" />

          <div className="flex items-center gap-1">
            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest">
              Mode
            </span>
            <span className="text-[10px] font-mono font-medium text-zinc-300 capitalize">
              {mode}
            </span>
          </div>
        </div>

        {/* Center: UTC Clock */}
        <div className="flex items-center justify-center">
          <span className="text-[11px] sm:text-[12px] font-mono tabular-nums text-zinc-200 font-medium">
            {utcTime} UTC
          </span>
        </div>

        {/* Right: Interaction Hints */}
        <div className="flex items-center justify-end gap-3 sm:gap-4">
          <div className="hidden md:flex items-center gap-1.5 text-[9px] font-mono text-zinc-500">
            <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px]">LMB</kbd>
            <span>Orbit</span>
            <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] ml-1">RMB</kbd>
            <span>Pan</span>
            <kbd className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] ml-1">Wheel</kbd>
            <span>Zoom</span>
          </div>

          <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-500">
            <span className="hidden lg:inline">Signal:</span>
            <span className="text-zinc-300 font-medium capitalize">{state.signal.toLowerCase()}</span>
            <span className="hidden lg:inline">| Conf</span>
            <span className="text-accent-400 font-medium">{(state.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>
    </footer>
  );
}