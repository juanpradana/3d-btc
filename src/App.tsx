import { useState, useEffect, useRef, Suspense } from "react";
import { ACESFilmicToneMapping, Vector3 } from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { EffectComposer, Bloom, Noise, Vignette } from "@react-three/postprocessing";
import OrderBook3D from "./components/OrderBook3D";
import HUD from "./components/HUD";
import { useBtcAnalytics } from "./hooks/useBtcAnalytics";

type Mode = "battlefield" | "openmaps";

/** Target kamera dan look-at per mode — Battlefield low-pitch, Open Maps bird's-eye. */
function targetsFor(mode: Mode, aspect: number) {
  if (mode === "openmaps") {
    return { position: new Vector3(0, 22, 14), target: new Vector3(0, 0, 0), fov: 54 };
  }
  if (aspect < 0.75) {
    return { position: new Vector3(0, 8, 22), target: new Vector3(0, 1.2, 0), fov: 58 };
  }
  if (aspect < 1.3) {
    return { position: new Vector3(0, 7.2, 19), target: new Vector3(0, 1.2, 0), fov: 50 };
  }
  return { position: new Vector3(0, 6.5, 17), target: new Vector3(0, 1.2, 0), fov: 46 };
}

/**
 * Transisi kamera sinematik: kamera melerp menuju target mode saat ini.
 * Interpolasi cuma berjalan bila pengguna tidak sedang menggeser orbit,
 * sehingga kontrol manual tetap terasa natural tanpa di-countermand.
 */
function TacticalCameraRig({
  mode,
  aspect,
  controlsRef,
}: {
  mode: Mode;
  aspect: number;
  controlsRef: React.RefObject<OrbitControlsImpl | null>;
}) {
  const initialized = useRef(false);
  // Durasi transisi sinematik yang tersisa (detik). Kamera hanya bergerak
  // selama jendela ini, lalu kendali penuh kembali ke OrbitControls —
  // sehingga tidak pernah berkelahi dengan drag manual pengguna.
  const transitionRef = useRef(0);

  useEffect(() => {
    transitionRef.current = 1.4;
  }, [mode, aspect]);

  useFrame((state, delta) => {
    const cam = state.camera as unknown as {
      position: Vector3;
      lookAt: (v: Vector3) => void;
      fov: number;
      updateProjectionMatrix: () => void;
    };
    const goal = targetsFor(mode, aspect);

    if (!initialized.current) {
      cam.position.copy(goal.position);
      cam.lookAt(goal.target);
      cam.fov = goal.fov;
      cam.updateProjectionMatrix();
      initialized.current = true;
      return;
    }

    if (transitionRef.current <= 0) return;
    transitionRef.current -= delta;

    const lerpFactor = Math.min(1, delta * 2.8);
    cam.position.lerp(goal.position, lerpFactor);

    const controls = controlsRef.current;
    if (controls) {
      controls.target.lerp(goal.target, lerpFactor);
      controls.update();
    } else {
      cam.lookAt(goal.target);
    }

    if (Math.abs(cam.fov - goal.fov) > 0.05) {
      cam.fov += (goal.fov - cam.fov) * lerpFactor;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}

export default function App() {
  const [mode, setMode] = useState<Mode>("battlefield");
  const [aspect, setAspect] = useState(() =>
    typeof window === "undefined"
      ? 1.78
      : window.innerWidth / Math.max(window.innerHeight, 1)
  );

  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  const state = useBtcAnalytics("BTCUSDT");
  const {
    bidLevels,
    askLevels,
    direction_score: directionScore,
    delta1m,
  } = state;

  // Kamera FOV responsif terhadap orientasi/rotasi perangkat.
  useEffect(() => {
    const handleResize = () =>
      setAspect(window.innerWidth / Math.max(window.innerHeight, 1));
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-zinc-950 select-none">
      <HUD state={state} mode={mode} onModeChange={setMode} />

      {/* 3D Canvas — berada di bawah canvas HUD; panel HUD menghentikan propagasi. */}
      <Canvas
        dpr={[1, 2]}
        gl={{
          antialias: true,
          toneMapping: ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        style={{ position: "fixed", inset: 0, zIndex: 0 }}
      >
        <PerspectiveCamera makeDefault fov={46} position={[0, 6.5, 17]} />
        <Suspense fallback={null}>
          <OrderBook3D
            bids={bidLevels}
            asks={askLevels}
            directionScore={directionScore}
            delta1m={delta1m}
            mode={mode}
          />
          <TacticalCameraRig mode={mode} aspect={aspect} controlsRef={controlsRef} />
          <OrbitControls
            ref={controlsRef}
            enablePan={false}
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2.1}
            enableZoom={true}
            zoomSpeed={0.7}
            enableDamping
            dampingFactor={0.08}
          />
          <EffectComposer>
            <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.2} radius={0.5} />
            <Noise opacity={0.05} />
            <Vignette eskil={false} offset={0.1} darkness={1.3} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}