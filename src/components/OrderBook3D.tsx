import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Group, Mesh, Points } from "three";

export interface OrderBook3DProps {
  bids: { price: number; volume: number }[];
  asks: { price: number; volume: number }[];
  directionScore: number;
  delta1m: number;
  mode?: "battlefield" | "openmaps";
}

const PALETTES = {
  battlefield: {
    bull: {
      bid: new Color("#10b981"),
      bidGlow: new Color("#059669"),
      ask: new Color("#991b1b"),
      askGlow: new Color("#7f1d1d"),
      frontline: new Color("#34d399"),
      grid: new Color("#064e3b"),
      fog: "#040807",
      bg: "#030605",
      accent: new Color("#10b981"),
    },
    bear: {
      bid: new Color("#065f46"),
      bidGlow: new Color("#047857"),
      ask: new Color("#ef4444"),
      askGlow: new Color("#dc2626"),
      frontline: new Color("#f87171"),
      grid: new Color("#7f1d1d"),
      fog: "#080404",
      bg: "#060303",
      accent: new Color("#ef4444"),
    },
    neutral: {
      bid: new Color("#10b981"),
      bidGlow: new Color("#059669"),
      ask: new Color("#ef4444"),
      askGlow: new Color("#dc2626"),
      frontline: new Color("#38bdf8"),
      grid: new Color("#1e293b"),
      fog: "#05070a",
      bg: "#040508",
      accent: new Color("#0ea5e9"),
    },
  },
  openmaps: {
    bull: {
      bid: new Color("#22c55e"),
      bidGlow: new Color("#15803d"),
      ask: new Color("#475569"),
      askGlow: new Color("#334155"),
      frontline: new Color("#4ade80"),
      grid: new Color("#166534"),
      fog: "#030805",
      bg: "#020604",
      accent: new Color("#22c55e"),
    },
    bear: {
      bid: new Color("#475569"),
      bidGlow: new Color("#334155"),
      ask: new Color("#f43f5e"),
      askGlow: new Color("#e11d48"),
      frontline: new Color("#fb7185"),
      grid: new Color("#881337"),
      fog: "#080305",
      bg: "#060204",
      accent: new Color("#f43f5e"),
    },
    neutral: {
      bid: new Color("#14b8a6"),
      bidGlow: new Color("#0f766e"),
      ask: new Color("#f97316"),
      askGlow: new Color("#ea580c"),
      frontline: new Color("#a855f7"),
      grid: new Color("#312e81"),
      fog: "#05050d",
      bg: "#030308",
      accent: new Color("#a855f7"),
    },
  },
};

function createInitialParticleData(count = 400) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const sides = new Uint8Array(count);

  // Deterministic LCG pseudo-random generator untuk kemurnian render
  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const isBid = rnd() < 0.5;
    sides[i] = isBid ? 0 : 1;
    const x = isBid ? -(rnd() * 12 + 1) : rnd() * 12 + 1;
    const y = rnd() * 4 + 0.2;
    const z = (rnd() - 0.5) * 8;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    colors[i * 3] = isBid ? 0.06 : 0.93;
    colors[i * 3 + 1] = isBid ? 0.72 : 0.27;
    colors[i * 3 + 2] = isBid ? 0.51 : 0.27;

    speeds[i] = rnd() * 0.08 + 0.04;
  }

  return { positions, colors, speeds, sides };
}

/** Cincin kontur topografi + penanda level kedalaman (mode Open Maps). */
function TopographicRings({ color }: { color: Color }) {
  const radii = [3, 6, 9, 12, 15];
  return (
    <group>
      {radii.map((r, i) => (
        <mesh key={`iso-${r}`} position={[0, 0.03 + i * 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[r - 0.06, r + 0.06, 96]} />
          <meshBasicMaterial color={color} transparent opacity={0.28 - i * 0.04} />
        </mesh>
      ))}
      {/* Penanda level kedalaman -20 .. +20 */}
      {Array.from({ length: 21 }, (_, idx) => idx - 10).map((lvl) =>
        lvl === 0 ? null : (
          <mesh
            key={`tick-${lvl}`}
            position={[lvl * 0.85, 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.05, lvl % 5 === 0 ? 3.2 : 1.6]} />
            <meshBasicMaterial color={color} transparent opacity={0.22} />
          </mesh>
        )
      )}
    </group>
  );
}

export default function OrderBook3D({
  bids,
  asks,
  directionScore,
  delta1m,
  mode = "battlefield",
}: OrderBook3DProps) {
  const rootRef = useRef<Group>(null);
  const ring1Ref = useRef<Group>(null);
  const ring2Ref = useRef<Group>(null);
  const arrowRef = useRef<Group>(null);
  const particlesRef = useRef<Points>(null);
  const forcefieldRef = useRef<Mesh>(null);
  const chevronRef = useRef<Group>(null);

  const isBattlefield = mode === "battlefield";

  // Palet adaptif berdasarkan mode dan sentimen pasar
  const palette = useMemo(() => {
    const currentMode = PALETTES[mode] || PALETTES.battlefield;
    if (directionScore > 0.15) return currentMode.bull;
    if (directionScore < -0.15) return currentMode.bear;
    return currentMode.neutral;
  }, [mode, directionScore]);

  // Normalisasi volume orderbook untuk ketinggian pilar (max 7 unit tinggi)
  const maxVol = useMemo(() => {
    const all = [...bids.map((b) => b.volume), ...asks.map((a) => a.volume)];
    return Math.max(...all, 0.1);
  }, [bids, asks]);

  // Ambang dinding paus: 1.5x rata-rata volume buku (hanya bermakna di Open Maps)
  const whaleThreshold = useMemo(() => {
    const all = [...bids.map((b) => b.volume), ...asks.map((a) => a.volume)];
    if (all.length === 0) return Infinity;
    const avg = all.reduce((acc, v) => acc + v, 0) / all.length;
    return avg * 1.5;
  }, [bids, asks]);

  // Partikel proyektil / aliran order flow (400 partikel, dialokasikan 1x)
  const particleData = useMemo(() => createInitialParticleData(400), []);

  // Kecepatan partikel di-smooth di dalam frame loop
  const speedMultiplierRef = useRef(isBattlefield ? 3.2 : 1.0);

  useFrame((_state, delta) => {
    // 0. Update interpolasi kecepatan partikel sesuai mode
    speedMultiplierRef.current +=
      ((isBattlefield ? 3.2 : 1.0) - speedMultiplierRef.current) * delta * 4;

    // 1. Rotasi gyro cincin hologram
    if (ring1Ref.current) ring1Ref.current.rotation.z += delta * 0.8;
    if (ring2Ref.current) ring2Ref.current.rotation.x -= delta * 0.6;

    // 2. Panah indikator arah: miring mengikuti Direction Score (-1..+1)
    if (arrowRef.current) {
      const targetRoll = -directionScore * 0.55;
      const targetPitch = (delta1m / 10) * 0.3;
      arrowRef.current.rotation.z += (targetRoll - arrowRef.current.rotation.z) * delta * 4;
      arrowRef.current.rotation.x += (targetPitch - arrowRef.current.rotation.x) * delta * 4;
    }

    // 3. Forcefield frontline: denyut + tekukan mengikuti tekanan order flow
    if (forcefieldRef.current) {
      const lean = directionScore * 0.35;
      forcefieldRef.current.rotation.z += (lean - forcefieldRef.current.rotation.z) * delta * 3;
      const mat = forcefieldRef.current.material as { opacity: number };
      mat.opacity = 0.18 + Math.min(0.35, Math.abs(directionScore) * 0.35) + Math.sin(_state.clock.elapsedTime * 2.4) * 0.05;
    }

    // 4. Chevron arah arus di lantai (hanya Battlefield)
    if (chevronRef.current && isBattlefield) {
      chevronRef.current.position.x = directionScore >= 0 ? -3 - Math.abs(directionScore) * 2 : 3 + Math.abs(directionScore) * 2;
      chevronRef.current.rotation.z = directionScore >= 0 ? 0 : Math.PI;
    }

    // 5. Rotasi panggung lembut
    if (rootRef.current) {
      const yawTarget = directionScore * 0.15;
      rootRef.current.rotation.y += (yawTarget - rootRef.current.rotation.y) * delta * 1.5;
    }

    // 6. Update partikel (in-place zero allocation)
    if (particlesRef.current) {
      const geom = particlesRef.current.geometry;
      const posAttr = geom.attributes.position;
      const colAttr = geom.attributes.color;
      if (posAttr && colAttr) {
        const posArr = posAttr.array as Float32Array;
        const colArr = colAttr.array as Float32Array;
        const { speeds, sides } = particleData;
        const bidC = palette.bid;
        const askC = palette.ask;
        const speedMul = speedMultiplierRef.current;
        // Open Maps: aliran laminar lambat & seragam; Battlefield: proyektil cepat.
        const spreadMul = isBattlefield ? 1.0 : 0.55;

        for (let i = 0; i < speeds.length; i++) {
          const dir = sides[i] === 0 ? speeds[i] : -speeds[i];
          posArr[i * 3] += dir * speedMul * spreadMul;

          // Battlefield: z dikompresi ke koridor tipis; Open Maps: melebar
          const zTarget = isBattlefield
            ? Math.round(posArr[i * 3 + 2] / 2) * 2
            : posArr[i * 3 + 2];
          posArr[i * 3 + 2] += (zTarget - posArr[i * 3 + 2]) * 0.05;

          if (posArr[i * 3] > 14) posArr[i * 3] = -14;
          if (posArr[i * 3] < -14) posArr[i * 3] = 14;

          // Transisi warna halus saat sentimen/mode berubah tanpa alokasi baru
          const targetColor = sides[i] === 0 ? bidC : askC;
          const idx = i * 3;
          colArr[idx] += (targetColor.r - colArr[idx]) * 0.05;
          colArr[idx + 1] += (targetColor.g - colArr[idx + 1]) * 0.05;
          colArr[idx + 2] += (targetColor.b - colArr[idx + 2]) * 0.05;
        }
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
    }
  });

  const levelCount = 16;
  const barSpacing = 0.85;

  return (
    <>
      <ambientLight intensity={isBattlefield ? 0.45 : 0.62} />
      <directionalLight position={[0, 18, 12]} intensity={isBattlefield ? 1.1 : 1.35} color="#ffffff" />
      <pointLight position={[-10, 8, 4]} intensity={0.8} color={palette.bid} />
      <pointLight position={[10, 8, 4]} intensity={0.8} color={palette.ask} />
      <spotLight
        position={[0, isBattlefield ? 16 : 24, 0]}
        angle={isBattlefield ? 0.55 : 0.8}
        penumbra={0.7}
        intensity={1.4}
        color={palette.frontline}
      />

      <fog attach="fog" args={[palette.fog, isBattlefield ? 16 : 28, isBattlefield ? 50 : 74]} />
      <color attach="background" args={[palette.bg]} />

      <group ref={rootRef} position={[0, -2, 0]}>
        {/* ============================================================== */}
        {/* LANTAI KISI SIBER / MEDAN PERANG (Grid Floor)                 */}
        {/* ============================================================== */}
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[36, 24, 36, 24]} />
          <meshStandardMaterial
            color={palette.grid}
            wireframe={isBattlefield}
            transparent
            opacity={isBattlefield ? 0.35 : 0.24}
            roughness={0.4}
            metalness={0.8}
          />
        </mesh>

        {/* Kontur topografi (khusus Open Maps) */}
        {!isBattlefield && <TopographicRings color={palette.grid} />}

        {/* FRONTLINE / ZERO-LINE (Garis tengah bertabrakan buy vs sell) */}
        <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.35, 18]} />
          <meshStandardMaterial
            color={palette.frontline}
            emissive={palette.frontline}
            emissiveIntensity={1.2}
            transparent
            opacity={0.85}
          />
        </mesh>

        {/* Garis pulse lateral frontline */}
        {[-3, 0, 3].map((z, idx) => (
          <mesh key={`fl-cross-${idx}`} position={[0, 0.06, z]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[2.5, 0.12]} />
            <meshStandardMaterial
              color={palette.frontline}
              emissive={palette.frontline}
              emissiveIntensity={1.0}
            />
          </mesh>
        ))}

        {/* ============================================================== */}
        {/* FORCEFIELD FRONTLINE (khusus Battlefield)                     */}
        {/* ============================================================== */}
        {isBattlefield && (
          <mesh ref={forcefieldRef} position={[0, 3.2, 0]}>
            <planeGeometry args={[17, 6.4, 1, 1]} />
            <meshBasicMaterial
              color={palette.frontline}
              transparent
              opacity={0.22}
              side={2}
            />
          </mesh>
        )}

        {/* Chevron arah arus dominan (khusus Battlefield) */}
        {isBattlefield && (
          <group ref={chevronRef} position={[0, 0.08, 6.5]}>
            {[1, 0.7, 0.4].map((s, i) => (
              <mesh key={`chev-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[-i * 0.7, 0, 0]}>
                <coneGeometry args={[0.32 * s, 0.7 * s, 3]} />
                <meshBasicMaterial color={palette.accent} transparent opacity={0.45 - i * 0.1} />
              </mesh>
            ))}
          </group>
        )}

        {/* ============================================================== */}
        {/* PILAR BIDS (Sisi Kiri, X < 0, Hijau)                           */}
        {/* ============================================================== */}
        <group position={[-1.2, 0, 0]}>
          {bids.slice(0, levelCount).map((bid, i) => {
            const h = Math.max(0.3, (bid.volume / maxVol) * 6.5);
            const xPos = -i * barSpacing;
            const isWhale = bid.volume >= whaleThreshold;
            // Battlefield memfokuskan sorotan ke 5 level terdekat spread
            const focusBoost = isBattlefield ? Math.max(0, 1 - i / 5) : 0;
            return (
              <group key={`bid-tower-${i}`} position={[xPos, 0, 0]}>
                <mesh position={[0, h / 2, 0]} scale={[0.7, h, 0.7]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color={palette.bid}
                    emissive={palette.bidGlow}
                    emissiveIntensity={0.35 + focusBoost * 0.9}
                    roughness={0.25}
                    metalness={0.7}
                  />
                </mesh>
                <mesh position={[0, h + 0.08, 0]} scale={[0.74, 0.14, 0.74]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color="#ffffff"
                    emissive={palette.bid}
                    emissiveIntensity={1.2}
                  />
                </mesh>
                <mesh position={[0, 0.03, 0]} scale={[0.82, 0.06, 0.82]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color={palette.bid}
                    emissive={palette.bid}
                    emissiveIntensity={0.6}
                  />
                </mesh>
                {/* Halo sonar dinding paus (khusus Open Maps) */}
                {!isBattlefield && isWhale && (
                  <mesh position={[0, h + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.75, 0.95, 32]} />
                    <meshBasicMaterial color="#fbbf24" transparent opacity={0.65} />
                  </mesh>
                )}
              </group>
            );
          })}
        </group>

        {/* ============================================================== */}
        {/* PILAR ASKS (Sisi Kanan, X > 0, Merah)                          */}
        {/* ============================================================== */}
        <group position={[1.2, 0, 0]}>
          {asks.slice(0, levelCount).map((ask, i) => {
            const h = Math.max(0.3, (ask.volume / maxVol) * 6.5);
            const xPos = i * barSpacing;
            const isWhale = ask.volume >= whaleThreshold;
            const focusBoost = isBattlefield ? Math.max(0, 1 - i / 5) : 0;
            return (
              <group key={`ask-tower-${i}`} position={[xPos, 0, 0]}>
                <mesh position={[0, h / 2, 0]} scale={[0.7, h, 0.7]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color={palette.ask}
                    emissive={palette.askGlow}
                    emissiveIntensity={0.35 + focusBoost * 0.9}
                    roughness={0.25}
                    metalness={0.7}
                  />
                </mesh>
                <mesh position={[0, h + 0.08, 0]} scale={[0.74, 0.14, 0.74]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color="#ffffff"
                    emissive={palette.ask}
                    emissiveIntensity={1.2}
                  />
                </mesh>
                <mesh position={[0, 0.03, 0]} scale={[0.82, 0.06, 0.82]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color={palette.ask}
                    emissive={palette.ask}
                    emissiveIntensity={0.6}
                  />
                </mesh>
                {!isBattlefield && isWhale && (
                  <mesh position={[0, h + 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.75, 0.95, 32]} />
                    <meshBasicMaterial color="#fbbf24" transparent opacity={0.65} />
                  </mesh>
                )}
              </group>
            );
          })}
        </group>

        {/* ============================================================== */}
        {/* SISTEM PARTIKEL ORDER FLOW (Proyektil / Aliran Laminar)        */}
        {/* ============================================================== */}
        <points ref={particlesRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[particleData.positions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[particleData.colors, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            size={isBattlefield ? 0.16 : 0.22}
            vertexColors
            transparent
            opacity={isBattlefield ? 0.85 : 0.5}
            sizeAttenuation
          />
        </points>

        {/* ============================================================== */}
        {/* HOLOGRAM TACTICAL COMPASS & PANAH ARAH (Pusat Frontline)       */}
        {/* ============================================================== */}
        <group position={[0, isBattlefield ? 7.5 : 9, 0]}>
          <group ref={ring1Ref}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[1.6, 1.72, 32]} />
              <meshStandardMaterial
                color={palette.frontline}
                emissive={palette.frontline}
                emissiveIntensity={0.8}
                transparent
                opacity={0.75}
              />
            </mesh>
          </group>

          <group ref={ring2Ref}>
            <mesh rotation={[0, Math.PI / 4, 0]}>
              <ringGeometry args={[1.9, 2.0, 32]} />
              <meshStandardMaterial
                color={palette.accent}
                emissive={palette.accent}
                emissiveIntensity={0.6}
                transparent
                opacity={0.5}
              />
            </mesh>
          </group>

          <group ref={arrowRef}>
            <mesh position={[0, 0.4, 0]}>
              <cylinderGeometry args={[0.08, 0.08, 1.2, 12]} />
              <meshStandardMaterial
                color={palette.accent}
                emissive={palette.accent}
                emissiveIntensity={1.0}
              />
            </mesh>
            <mesh position={[0, 1.3, 0]}>
              <coneGeometry args={[0.38, 0.9, 16]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive={palette.accent}
                emissiveIntensity={1.5}
              />
            </mesh>
            <mesh position={[0, 0, 0]}>
              <octahedronGeometry args={[0.35]} />
              <meshStandardMaterial
                color="#ffffff"
                emissive={palette.frontline}
                emissiveIntensity={1.8}
              />
            </mesh>
          </group>
        </group>
      </group>
    </>
  );
}
