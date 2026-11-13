import { useEffect, useState } from "react";
import type { AppAnalyticsState } from "../../hooks/useBtcAnalytics";
import DirectionGauge from "./DirectionGauge";
import VolumeRatioBar from "./VolumeRatioBar";
import DepthLadderPanel from "./DepthLadderPanel";

interface MobileCockpitSheetProps {
  state: AppAnalyticsState;
  mode: "battlefield" | "openmaps";
  onModeChange?: (mode: "battlefield" | "openmaps") => void;
}

type TabKey = "flow" | "book" | "view";

const TABS: { key: TabKey; label: string; short: string }[] = [
  { key: "flow", label: "Flow Radar", short: "Flow" },
  { key: "book", label: "Order Book", short: "Book" },
  { key: "view", label: "View & 3D", short: "3D" },
];

const fmtPrice = (p: number) =>
  p > 0 ? p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--.--";

export default function MobileCockpitSheet({
  state,
  mode,
  onModeChange,
}: MobileCockpitSheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("flow");
  const [utcTime, setUtcTime] = useState(() => new Date().toISOString().slice(11, 19));

  useEffect(() => {
    const id = setInterval(() => setUtcTime(new Date().toISOString().slice(11, 19)), 1000);
    return () => clearInterval(id);
  }, []);

  const dir = state.direction_score;
  const signalColor =
    dir > 0.15 ? "text-bid-400" : dir < -0.15 ? "text-ask-400" : "text-accent-400";

  return (
    <div
      className="fixed left-0 right-0 bottom-0 z-30 safe-bottom pointer-events-none select-none"
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <div className="cockpit-panel rounded-t-2xl border-x-0 border-b-0 overflow-hidden pointer-events-auto">
        {/* ── Collapsed summary strip / expand trigger ─────────────────── */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="w-full px-3 py-2 flex items-center justify-between gap-3 text-left active:bg-white/5 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                state.isConnected ? "bg-bid-400" : "bg-ask-500"
              }`}
            />
            <span className={`text-[11px] font-mono font-bold truncate ${signalColor}`}>
              {state.signal}
            </span>
            <span className="text-zinc-600 shrink-0">·</span>
            <span className="text-[11px] font-mono text-zinc-200 tabular-nums truncate">
              ${fmtPrice(state.micro_price)}
            </span>
            <span className="text-zinc-600 shrink-0">·</span>
            <span className="text-[10px] font-mono text-zinc-400 tabular-nums shrink-0">
              {state.spread_bps.toFixed(1)} bps
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] font-mono text-zinc-500 tabular-nums hidden sm:inline">
              {utcTime}Z
            </span>
            <span
              className={`text-[10px] text-zinc-300 transition-transform duration-200 ${
                isOpen ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            >
              ▲
            </span>
          </div>
        </button>

        {/* ── Expanded cockpit drawer ─────────────────────────────────── */}
        {isOpen && (
          <div className="px-3 pb-3 pt-0 border-t border-white/[0.07] space-y-2.5 max-h-[52vh] overflow-y-auto">
            <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-xl border border-white/[0.06]">
              {TABS.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    aria-pressed={active}
                    className={`min-h-[36px] py-1.5 rounded-lg text-[11px] font-mono font-medium transition-colors ${
                      active
                        ? t.key === "flow"
                          ? "bg-accent-600 text-white"
                          : t.key === "book"
                            ? "bg-bid-600 text-white"
                            : "bg-violet-600 text-white"
                        : "text-zinc-400 active:text-white"
                    }`}
                  >
                    <span className="hidden sm:inline">{t.label}</span>
                    <span className="sm:hidden">{t.short}</span>
                  </button>
                );
              })}
            </div>

            {activeTab === "flow" && (
              <div className="space-y-2.5">
                <div className="cockpit-card p-2.5">
                  <DirectionGauge
                    score={state.direction_score}
                    confidence={state.confidence}
                    compact
                  />
                </div>
                <div className="cockpit-card p-2.5">
                  <VolumeRatioBar bids={state.bidLevels} asks={state.askLevels} compact />
                </div>
                <div className="cockpit-card p-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                  {[
                    {
                      label: "OFI",
                      value: `${state.ofi >= 0 ? "+" : ""}${state.ofi.toFixed(2)}`,
                      tone: state.ofi >= 0 ? "text-bid-400" : "text-ask-400",
                    },
                    {
                      label: "Δ 1m CVD",
                      value: `${state.delta1m >= 0 ? "+" : ""}${state.delta1m.toFixed(2)}`,
                      tone: state.delta1m >= 0 ? "text-bid-400" : "text-ask-400",
                    },
                    {
                      label: "2m Cum Δ",
                      value: `${state.cumulative_delta >= 0 ? "+" : ""}${state.cumulative_delta.toFixed(2)}`,
                      tone: state.cumulative_delta >= 0 ? "text-bid-400" : "text-ask-400",
                    },
                    {
                      label: "Confidence",
                      value: `${(state.confidence * 100).toFixed(0)}%`,
                      tone: "text-accent-400",
                    },
                  ].map((c) => (
                    <div key={c.label} className="min-w-0">
                      <div className="text-[9px] uppercase tracking-wider text-zinc-500 truncate">
                        {c.label}
                      </div>
                      <div className={`text-[11px] font-mono font-semibold tabular-nums ${c.tone}`}>
                        {c.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === "book" && (
              <DepthLadderPanel
                bids={state.bidLevels}
                asks={state.askLevels}
                microPrice={state.micro_price}
                spreadBps={state.spread_bps}
                levelsToShow={7}
                className="p-2.5 border-0 bg-transparent shadow-none rounded-xl"
              />
            )}

            {activeTab === "view" && (
              <div className="space-y-2.5">
                {onModeChange && (
                  <div className="cockpit-card p-2.5 space-y-2">
                    <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">
                      Mode Visualisasi Arena 3D
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onModeChange("battlefield")}
                        className={`p-2 rounded-lg text-left transition-colors ${
                          mode === "battlefield"
                            ? "bg-bid-600/90 text-white"
                            : "bg-white/5 text-zinc-400"
                        }`}
                      >
                        <div className="text-[11px] font-semibold">⚔️ Battlefield</div>
                        <div className="text-[9px] opacity-75 mt-0.5">Frontline Clash</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onModeChange("openmaps")}
                        className={`p-2 rounded-lg text-left transition-colors ${
                          mode === "openmaps"
                            ? "bg-accent-600/90 text-white"
                            : "bg-white/5 text-zinc-400"
                        }`}
                      >
                        <div className="text-[11px] font-semibold">🗺️ Open Maps</div>
                        <div className="text-[9px] opacity-75 mt-0.5">Macro Topography</div>
                      </button>
                    </div>
                    <p className="text-[10px] text-zinc-400 leading-snug">
                      {mode === "battlefield"
                        ? "Kamera sudut rendah di garis spread — fokus tabrakan bid/ask Level 1-5, OFI, dan kecepatan trade tape."
                        : "Kamera bird's-eye atas 20 level — sorot whale wall, kontur kedalaman, dan struktur support/resistance."}
                    </p>
                  </div>
                )}

                <div className="cockpit-card p-2.5 space-y-1 text-[11px] font-mono">
                  <span className="text-[9px] uppercase tracking-wider text-zinc-500 block">
                    Navigasi Sentuh
                  </span>
                  {[
                    ["1 Jari Geser", "Orbit panggung 3D"],
                    ["Cubit (Pinch)", "Zoom kedalaman"],
                    ["2 Jari Geser", "Geser frontline"],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-2">
                      <span className="text-zinc-400">{k}</span>
                      <span className="text-zinc-200 text-right">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
