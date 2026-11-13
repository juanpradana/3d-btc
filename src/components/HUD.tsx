import type { AppAnalyticsState } from "../hooks/useBtcAnalytics";
import CommandTopBar from "./hud/CommandTopBar";
import TelemetryPanel from "./hud/TelemetryPanel";
import DepthLadderPanel from "./hud/DepthLadderPanel";
import TacticalStatusBar from "./hud/TacticalStatusBar";
import MobileCockpitSheet from "./hud/MobileCockpitSheet";

export interface HUDProps {
  state: AppAnalyticsState;
  mode?: "battlefield" | "openmaps";
  onModeChange?: (mode: "battlefield" | "openmaps") => void;
}

/**
 * Unified Tactical Cyber-Cockpit Orchestrator
 * Fully proportional, responsive layout with dual-dock symmetry and seamless mobile parity.
 */
export default function HUD({ state, mode = "battlefield", onModeChange }: HUDProps) {
  return (
    <div className="fixed inset-0 pointer-events-none z-20 flex flex-col justify-between overflow-hidden">
      {/* 1. Edge-to-Edge Top Command Bar */}
      <CommandTopBar state={state} mode={mode} onModeChange={onModeChange} />

      {/* 2. Main Desktop / Tablet Landscape Tactical Deck */}
      <main className="relative flex-1 max-w-[1920px] w-full mx-auto px-3 sm:px-4 lg:px-6 pointer-events-none flex items-start justify-between pt-14 pb-10 sm:pt-16 sm:pb-11">
        {/* Left Wing Dock: Telemetry & Flow Radar */}
        <div className="hidden lg:flex flex-col mt-2 mb-auto w-[320px] xl:w-[360px] 2xl:w-[400px] pointer-events-auto transition-all">
          <TelemetryPanel
            state={state}
            className="max-h-[calc(100vh-6.5rem)] overflow-y-auto shadow-glass-lg"
          />
        </div>

        {/* Center Space: Unobstructed 3D Arena (mouse/touch orbits pass through) */}
        <div className="flex-1 pointer-events-none" />

        {/* Right Wing Dock: L2 Depth Ladder Matrix */}
        <div className="hidden lg:flex flex-col mt-2 mb-auto w-[320px] xl:w-[360px] 2xl:w-[400px] pointer-events-auto transition-all">
          <DepthLadderPanel
            bids={state.bidLevels}
            asks={state.askLevels}
            microPrice={state.micro_price}
            spreadBps={state.spread_bps}
            levelsToShow={10}
            className="max-h-[calc(100vh-6.5rem)] shadow-glass-lg"
          />
        </div>
      </main>

      {/* 3. Mobile & Tablet Portrait Cockpit Drawer (< 1024px) */}
      <div className="lg:hidden">
        <MobileCockpitSheet
          state={state}
          mode={mode}
          onModeChange={onModeChange}
        />
      </div>

      {/* 4. Bottom Tactical Status Bar */}
      <TacticalStatusBar state={state} mode={mode} />
    </div>
  );
}
