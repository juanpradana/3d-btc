import type { AppAnalyticsState } from "../../hooks/useBtcAnalytics";

interface CommandTopBarProps {
  state: AppAnalyticsState;
  mode: "battlefield" | "openmaps";
  onModeChange?: (mode: "battlefield" | "openmaps") => void;
}

const fmtPrice = (p: number) =>
  p > 0 ? p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--.--";

const fmtWholePrice = (p: number) =>
  p > 0 ? p.toLocaleString(undefined, { maximumFractionDigits: 0 }) : "---";

/** Penjelasan fungsi tiap mode — dipakai pada tooltip tombol. */
const MODE_INFO = {
  battlefield: {
    icon: "⚔️",
    name: "Battlefield",
    subtitle: "Frontline Clash",
    tooltip:
      "Battlefield — Sudut rendah di garis depan spread. Fokus pada tabrakan bid/ask Level 1-5, tekanan OFI, dan kecepatan trade tape. Untuk scalper & eksekusi instan.",
  },
  openmaps: {
    icon: "🗺️",
    name: "Open Maps",
    subtitle: "Macro Topography",
    tooltip:
      "Open Maps — Sudut tinggi bird's-eye atas seluruh 20 level. Menyorot whale wall, kontur kedalaman kumulatif, dan struktur support/resistance. Untuk swing trader & manajemen risiko.",
  },
} as const;

export default function CommandTopBar({ state, mode, onModeChange }: CommandTopBarProps) {
  const dir = state.direction_score;
  const isBull = dir > 0.15;
  const isBear = dir < -0.15;

  const signalBadgeClass = isBull
    ? "bg-bid-500/15 border-bid-500/40 text-bid-400"
    : isBear
      ? "bg-ask-500/15 border-ask-500/40 text-ask-400"
      : "bg-accent-500/15 border-accent-500/40 text-accent-400";

  const quickMetrics = [
    { label: "Spread", value: `${state.spread_bps.toFixed(1)} bps`, tone: "text-zinc-100" },
    { label: "Micro-Price", value: fmtPrice(state.micro_price), tone: "text-accent-400" },
    {
      label: "Δ 1m CVD",
      value: `${state.delta1m >= 0 ? "+" : ""}${state.delta1m.toFixed(2)}`,
      tone: state.delta1m >= 0 ? "text-bid-400" : "text-ask-400",
    },
  ];

  return (
    <header className="cockpit-header safe-top fixed top-0 left-0 right-0 z-30 select-none pointer-events-auto">
      <div className="max-w-[1920px] mx-auto h-12 sm:h-[54px] px-3 sm:px-4 flex items-center justify-between gap-3">
        {/* ── Bay 1: Identity & Live Ticker ───────────────────────────── */}
        <div className="flex items-center gap-2.5 min-w-0 shrink">
          <div className="relative flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-500/30 shrink-0">
            <span className="text-amber-400 font-bold text-xs sm:text-sm">₿</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="font-bold text-white tracking-tight text-xs sm:text-sm font-mono">
                BTC/USDT
              </span>
              <span className="hidden md:inline text-[9px] font-mono uppercase tracking-wider text-zinc-500">
                L2 3D Flow
              </span>
            </div>
            <div className="text-[10px] font-mono flex items-center gap-1 leading-tight">
              <span className="text-bid-400 font-semibold">{fmtWholePrice(state.best_bid)}</span>
              <span className="text-zinc-600">/</span>
              <span className="text-ask-400 font-semibold">{fmtWholePrice(state.best_ask)}</span>
            </div>
          </div>
        </div>

        {/* ── Bay 2: Quick Metrics Capsule ────────────────────────────── */}
        <div className="hidden lg:flex items-center gap-4 px-3.5 py-1.5 bg-black/40 border border-white/[0.07] rounded-xl shrink-0">
          {quickMetrics.map((m, i) => (
            <div key={m.label} className="flex items-center gap-4">
              {i > 0 && <span className="w-px h-6 bg-white/[0.07]" />}
              <div className="leading-tight">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500">{m.label}</div>
                <div className={`text-[11px] font-mono font-semibold tabular-nums ${m.tone}`}>
                  {m.value}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Bay 3: Modes, Signal & Health ───────────────────────────── */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onModeChange && (
            <div className="flex bg-black/50 border border-white/[0.08] rounded-xl p-0.5">
              {(["battlefield", "openmaps"] as const).map((m) => {
                const info = MODE_INFO[m];
                const active = mode === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onModeChange(m)}
                    title={info.tooltip}
                    aria-pressed={active}
                    className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-[9px] text-[11px] font-medium transition-colors ${
                      active
                        ? m === "battlefield"
                          ? "bg-bid-600 text-white"
                          : "bg-accent-600 text-white"
                        : "text-zinc-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <span className="text-xs leading-none">{info.icon}</span>
                    <span className="hidden sm:flex flex-col items-start leading-none">
                      <span>{info.name}</span>
                      <span className="hidden xl:block text-[8px] font-normal opacity-70 mt-0.5 uppercase tracking-wider">
                        {info.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {state.isSimulated && (
            <div
              className="px-1.5 py-1 rounded-md text-[9px] font-mono font-bold border bg-amber-500/20 border-amber-500/40 text-amber-300"
              title="Live feed tidak terjangkau — menampilkan data simulasi"
            >
              SIM
            </div>
          )}

          <div
            className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold border leading-none ${signalBadgeClass}`}
            title={`Sinyal arah pasar dari engine WASM · skor ${(dir * 100).toFixed(0)}`}
          >
            <span>{state.signal}</span>
            <span className="ml-1 opacity-75">{(dir * 100).toFixed(0)}%</span>
          </div>

          <div
            className="flex items-center gap-1.5 px-2 py-1.5 bg-white/5 border border-white/10 rounded-lg"
            title={state.isConnected ? "WebSocket live tersambung (Binance Vision L2)" : "Terputus"}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                state.isConnected ? "bg-bid-400 shadow-[0_0_8px_#34d399]" : "bg-ask-500"
              }`}
            />
            <span className="text-[9px] font-mono text-zinc-400 hidden xl:inline leading-none">
              {state.isConnected ? "LIVE" : "OFF"}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
