import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Group, Points } from "three";

export interface OrderBook3DProps {
  bids: { price: number; volume: number }[];
  asks: { price: number; volume: number }[];
  directionScore: number;
  delta1m: number;
}

/**
 * Palet warna Open Maps (topografi makro).
 * Adaptif terhadap sentimen order flow (bull / bear / neutral).
 */
const PALETTES = {
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
};

/**
 * Generator data partikel awal untuk aliran order flow tak terbatas (infinite).
 * Menggunakan LCG deterministik agar inisialisasi awal murni dan stabil.
 */
function createInitialParticleData(count = 800) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const sides = new Uint8Array(count); // 0 = Bid (mengalir ke +X), 1 = Ask (mengalir ke -X)
  const zTargets = new Float32Array(count);

  let seed = 42;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let i = 0; i < count; i++) {
    const isBid = rnd() < 0.5;
    sides[i] = isBid ? 0 : 1;

    // Sebar merata di seluruh rentang panggung -18..+18
    const x = (rnd() - 0.5) * 36;
    const y = rnd() * 4.2 + 0.2;
    const z = (rnd() - 0.5) * 11;

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    zTargets[i] = z;

    colors[i * 3] = isBid ? 0.08 : 0.95;
    colors[i * 3 + 1] = isBid ? 0.75 : 0.35;
    colors[i * 3 + 2] = isBid ? 0.55 : 0.15;

    // Variasi kecepatan alami agar aliran tidak kaku/berbaris
    speeds[i] = rnd() * 0.06 + 0.045;
  }

  return { positions, colors, speeds, sides, zTargets };
}

/** Cincin kontur topografi + penanda level kedalaman. */
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
}: OrderBook3DProps) {
  const rootRef = useRef<Group>(null);
  const ring1Ref = useRef<Group>(null);
  const ring2Ref = useRef<Group>(null);
  const arrowRef = useRef<Group>(null);
  const particlesRef = useRef<Points>(null);

  // Palet adaptif berdasarkan sentimen pasar (OFI & Direction Score)
  const palette = useMemo(() => {
    if (directionScore > 0.15) return PALETTES.bull;
    if (directionScore < -0.15) return PALETTES.bear;
    return PALETTES.neutral;
  }, [directionScore]);

  // Normalisasi volume orderbook untuk ketinggian pilar (max 6.5 unit tinggi)
  const maxVol = useMemo(() => {
    const all = [...bids.map((b) => b.volume), ...asks.map((a) => a.volume)];
    return Math.max(...all, 0.1);
  }, [bids, asks]);

  // Ambang dinding paus: 1.5x rata-rata volume buku
  const whaleThreshold = useMemo(() => {
    const all = [...bids.map((b) => b.volume), ...asks.map((a) => a.volume)];
    if (all.length === 0) return Infinity;
    const avg = all.reduce((acc, v) => acc + v, 0) / all.length;
    return avg * 1.5;
  }, [bids, asks]);

  // Partikel proyektil / aliran order flow tak terbatas (800 partikel)
  const particleData = useMemo(() => createInitialParticleData(800), []);

  // LCG pseudo-random generator runtime untuk respawn partikel organik tanpa GC/alokasi
  const rngRef = useRef(1337);
  const nextRnd = () => {
    rngRef.current = (rngRef.current * 1664525 + 1013904223) % 4294967296;
    return rngRef.current / 4294967296;
  };

  useFrame((_state, delta) => {
    // 1. Rotasi gyro cincin hologram tactical compass
    if (ring1Ref.current) ring1Ref.current.rotation.z += delta * 0.8;
    if (ring2Ref.current) ring2Ref.current.rotation.x -= delta * 0.6;

    // 2. Panah indikator arah: miring mengikuti Direction Score (-1..+1) dan momentum Δ1m
    if (arrowRef.current) {
      const targetRoll = -directionScore * 0.55;
      const targetPitch = (delta1m / 10) * 0.3;
      arrowRef.current.rotation.z += (targetRoll - arrowRef.current.rotation.z) * delta * 4;
      arrowRef.current.rotation.x += (targetPitch - arrowRef.current.rotation.x) * delta * 4;
    }

    // 3. Rotasi panggung lembut
    if (rootRef.current) {
      const yawTarget = directionScore * 0.12;
      rootRef.current.rotation.y += (yawTarget - rootRef.current.rotation.y) * delta * 1.5;
    }

    // 4. Update aliran partikel order flow tak terbatas (Seamless & Infinite)
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

        // Kecepatan adaptif: mengalir mulus dengan sedikit akselerasi saat sentimen kuat
        const flowSpeedMul = 2.2 + Math.abs(directionScore) * 0.8;
        const BOUNDARY = 18.0;
        const FADE_MARGIN = 3.5;

        for (let i = 0; i < speeds.length; i++) {
          const idx = i * 3;
          const isBid = sides[i] === 0;

          // Bid mengalir ke kanan (+X), Ask mengalir ke kiri (-X)
          const step = (isBid ? speeds[i] : -speeds[i]) * flowSpeedMul;
          posArr[idx] += step;

          // Seamless Wrap & Respawn:
          // Partikel respawn di luar batas pandang dengan posisi Y dan Z baru yang sedikit di-jitter
          // sehingga tidak pernah terjadi repetisi atau garis patah.
          if (isBid && posArr[idx] > BOUNDARY) {
            posArr[idx] = -BOUNDARY;
            posArr[idx + 1] = nextRnd() * 4.2 + 0.2;
            posArr[idx + 2] = (nextRnd() - 0.5) * 11;
          } else if (!isBid && posArr[idx] < -BOUNDARY) {
            posArr[idx] = BOUNDARY;
            posArr[idx + 1] = nextRnd() * 4.2 + 0.2;
            posArr[idx + 2] = (nextRnd() - 0.5) * 11;
          }

          // Kunci tampilan seamless: Fade-in / Fade-out halus dekat batas panggung.
          // Saat partikel mendekati batas X = ±18, intensitas warnanya memudar ke 0 (hitam total).
          // Sehingga saat ia berpindah/wrap ke sisi seberang, transisinya 100% tidak kasat mata!
          const distToEdge = BOUNDARY - Math.abs(posArr[idx]);
          const edgeAlpha = distToEdge < FADE_MARGIN ? Math.max(0, distToEdge / FADE_MARGIN) : 1.0;

          const targetColor = isBid ? bidC : askC;
          // Interpolasi warna sentimen + modulasi alpha visual via vertex color RGB
          colArr[idx] += (targetColor.r * edgeAlpha - colArr[idx]) * 0.12;
          colArr[idx + 1] += (targetColor.g * edgeAlpha - colArr[idx + 1]) * 0.12;
          colArr[idx + 2] += (targetColor.b * edgeAlpha - colArr[idx + 2]) * 0.12;
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
      }
    }
  });

  const levelCount = 18;
  const barSpacing = 0.85;

  return (
    <>
      <ambientLight intensity={0.62} />
      <directionalLight position={[0, 18, 12]} intensity={1.35} color="#ffffff" />
      <pointLight position={[-10, 8, 4]} intensity={0.8} color={palette.bid} />
      <pointLight position={[10, 8, 4]} intensity={0.8} color={palette.ask} />
      <spotLight
        position={[0, 24, 0]}
        angle={0.8}
        penumbra={0.7}
        intensity={1.4}
        color={palette.frontline}
      />

      <fog attach="fog" args={[palette.fog, 28, 74]} />
      <color attach="background" args={[palette.bg]} />

      <group ref={rootRef} position={[0, -2, 0]}>
        {/* ============================================================== */}
        {/* LANTAI KISI SIBER MAKRO (Topographic Grid Floor)               */}
        {/* ============================================================== */}
        <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[36, 24, 36, 24]} />
          <meshStandardMaterial
            color={palette.grid}
            wireframe={false}
            transparent
            opacity={0.24}
            roughness={0.4}
            metalness={0.8}
          />
        </mesh>

        {/* Kontur topografi makro & depth level ticks */}
        <TopographicRings color={palette.grid} />

        {/* FRONTLINE / ZERO-LINE (Garis ekuilibrium spread buy vs sell) */}
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
        {/* PILAR BIDS (Sisi Kiri, X < 0, Hijau/Teal)                      */}
        {/* ============================================================== */}
        <group position={[-1.2, 0, 0]}>
          {bids.slice(0, levelCount).map((bid, i) => {
            const h = Math.max(0.3, (bid.volume / maxVol) * 6.5);
            const xPos = -i * barSpacing;
            const isWhale = bid.volume >= whaleThreshold;
            return (
              <group key={`bid-tower-${i}`} position={[xPos, 0, 0]}>
                <mesh position={[0, h / 2, 0]} scale={[0.7, h, 0.7]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color={palette.bid}
                    emissive={palette.bidGlow}
                    emissiveIntensity={0.35}
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
                {/* Halo sonar dinding paus pada limit order besar */}
                {isWhale && (
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
        {/* PILAR ASKS (Sisi Kanan, X > 0, Merah/Rose/Orange)              */}
        {/* ============================================================== */}
        <group position={[1.2, 0, 0]}>
          {asks.slice(0, levelCount).map((ask, i) => {
            const h = Math.max(0.3, (ask.volume / maxVol) * 6.5);
            const xPos = i * barSpacing;
            const isWhale = ask.volume >= whaleThreshold;
            return (
              <group key={`ask-tower-${i}`} position={[xPos, 0, 0]}>
                <mesh position={[0, h / 2, 0]} scale={[0.7, h, 0.7]}>
                  <boxGeometry args={[1, 1, 1]} />
                  <meshStandardMaterial
                    color={palette.ask}
                    emissive={palette.askGlow}
                    emissiveIntensity={0.35}
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
                {/* Halo sonar dinding paus pada limit order besar */}
                {isWhale && (
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
        {/* SISTEM PARTIKEL ORDER FLOW SEAMLESS & INFINITE (800 Partikel)  */}
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
            size={0.24}
            vertexColors
            transparent
            opacity={0.8}
            sizeAttenuation
          />
        </points>

        {/* ============================================================== */}
        {/* HOLOGRAM TACTICAL COMPASS & PANAH ARAH (Pusat Frontline)       */}
        {/* ============================================================== */}
        <group position={[0, 9, 0]}>
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