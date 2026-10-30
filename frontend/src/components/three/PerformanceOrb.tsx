"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Line, OrbitControls, Html } from "@react-three/drei";
import { AnimatePresence, motion } from "motion/react";
import type { Group, Mesh } from "three";

import { formatDateLong, formatSignedINR } from "@/lib/format";
import type { PerformancePoint, ProfileStats } from "@/lib/types";

interface SceneProps {
  timeline: PerformancePoint[];
  stats: ProfileStats;
  hoveredIndex: number | null;
  onHoverIndex: (idx: number | null) => void;
}

const PROFIT = "#0f9960";
const LOSS = "#d64545";

/**
 * Normalises cumulative values while always anchoring to 0 (breakeven),
 * so the ₹0 plane serves as a permanent reference horizon in the 3D space.
 */
function normalise(values: number[]): { scale: number; offset: number; zeroY: number } {
  if (values.length <= 1) return { scale: 0, offset: values[0] ?? 0, zeroY: 0 };
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const scale = 1 / span;
  const offset = min;
  const zeroY = (0 - offset) * scale * 2.4 - 1.2;
  return { scale, offset, zeroY };
}

/**
 * Renders the trader's equity curve as an interactive 3D ribbon:
 *   X  -> session index over time
 *   Y  -> cumulative P&L relative to ₹0 breakeven
 *   Z  -> drawdown depth below running peak
 */
function PerformanceScene({
  timeline,
  stats,
  hoveredIndex,
  onHoverIndex,
}: SceneProps) {
  const group = useRef<Group>(null);
  const beads = useRef<Mesh[]>([]);

  const geometry = useMemo(() => {
    if (timeline.length === 0) {
      return {
        points: [],
        curve: [],
        drawdown: [],
        peak: [],
        zeroY: 0,
        colors: [] as string[],
      };
    }

    const cumulative = timeline.map((p) => p.cumulative);
    const { scale, offset, zeroY } = normalise(cumulative);

    // Running high-water mark starting from breakeven (0)
    const runningPeaks = cumulative.map((_, index) =>
      Math.max(0, ...cumulative.slice(0, index + 1)),
    );

    const spanX = 4.4;
    const stepX = timeline.length > 1 ? spanX / (timeline.length - 1) : 0;

    const points = timeline.map((point, index) => {
      const dd = runningPeaks[index] - point.cumulative;
      const x = timeline.length > 1 ? -spanX / 2 + index * stepX : 0;
      const y =
        timeline.length > 1
          ? (point.cumulative - offset) * scale * 2.4 - 1.2
          : 0;
      const z = -Math.min(dd * (scale || 1) * 2.4, 1.4);
      return [x, y, z] as [number, number, number];
    });

    const peakPoints = timeline.map((point, index) => {
      const x = timeline.length > 1 ? -spanX / 2 + index * stepX : 0;
      const y =
        timeline.length > 1
          ? (runningPeaks[index] - offset) * scale * 2.4 - 1.2
          : 0;
      return [x, y, 0] as [number, number, number];
    });

    const drawdown = timeline.flatMap((_, index) => [
      [points[index][0], points[index][1], points[index][2]] as [
        number,
        number,
        number,
      ],
      [peakPoints[index][0], peakPoints[index][1], 0] as [
        number,
        number,
        number,
      ],
    ]);

    return {
      points,
      curve: points,
      peak: peakPoints,
      drawdown,
      zeroY,
      colors: timeline.map((p) => (p.net_pnl >= 0 ? PROFIT : LOSS)),
    };
  }, [timeline]);

  const lineColor = useMemo(() => {
    const total = stats.total_pnl;
    if (total > 0) return PROFIT;
    if (total < 0) return LOSS;
    return "#387ed1";
  }, [stats.total_pnl]);

  useFrame((state, delta) => {
    // Only auto-rotate if user is not hovering a bead
    if (group.current && hoveredIndex === null) {
      group.current.rotation.y += delta * 0.1;
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.25) * 0.05;
    }
    beads.current.forEach((bead, index) => {
      if (!bead) return;
      if (index === hoveredIndex) {
        bead.scale.setScalar(1.4);
        return;
      }
      const phase = state.clock.elapsedTime * 1.6 + index * 0.35;
      const pulse = 1 + Math.sin(phase) * 0.18;
      bead.scale.setScalar(pulse);
    });
  });

  if (timeline.length === 0) {
    return (
      <group>
        <mesh>
          <sphereGeometry args={[1.1, 32, 32]} />
          <meshStandardMaterial
            color="#e8edf2"
            emissive="#387ed1"
            emissiveIntensity={0.08}
            roughness={0.55}
            metalness={0.2}
            wireframe
          />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={group} position={[0, 0, 0]}>
      <Float
        speed={hoveredIndex === null ? 1.0 : 0}
        rotationIntensity={0.08}
        floatIntensity={0.16}
      >
        {/* Soft halo behind the curve */}
        <Line
          points={geometry.curve}
          color={lineColor}
          lineWidth={8}
          transparent
          opacity={0.12}
        />
        {/* Main equity curve */}
        <Line points={geometry.curve} color={lineColor} lineWidth={2.4} />

        {/* ₹0 Breakeven Horizon Reference Line */}
        {timeline.length > 1 && (
          <>
            <Line
              points={[
                [-2.4, geometry.zeroY, 0],
                [2.4, geometry.zeroY, 0],
              ]}
              color="#94a3b8"
              lineWidth={1.2}
              transparent
              opacity={0.5}
              dashed
              dashSize={0.16}
              gapSize={0.12}
            />
            <Html position={[2.55, geometry.zeroY, 0]} center>
              <span className="pointer-events-none select-none rounded border border-line bg-surface/85 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold text-muted shadow-xs backdrop-blur-xs">
                ₹0
              </span>
            </Html>
          </>
        )}

        {/* High-water mark */}
        {geometry.peak.length > 1 && (
          <Line
            points={geometry.peak}
            color="#9aa4b0"
            lineWidth={1}
            transparent
            opacity={0.7}
            dashed
            dashSize={0.12}
            gapSize={0.1}
          />
        )}

        {/* Drawdown curtain */}
        {geometry.drawdown.length > 1 && (
          <Line
            points={geometry.drawdown}
            color={LOSS}
            lineWidth={1.2}
            transparent
            opacity={0.4}
          />
        )}

        {/* Session beads */}
        {geometry.points.map((point, index) => {
          const isHovered = hoveredIndex === index;
          return (
            <mesh
              key={index}
              position={point}
              ref={(node) => {
                if (node) beads.current[index] = node;
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                onHoverIndex(index);
              }}
              onPointerOut={() => onHoverIndex(null)}
            >
              <sphereGeometry args={[isHovered ? 0.08 : 0.055, 16, 16]} />
              <meshStandardMaterial
                color={isHovered ? "#ffffff" : geometry.colors[index]}
                emissive={geometry.colors[index]}
                emissiveIntensity={isHovered ? 1.0 : 0.35}
                roughness={0.3}
                metalness={0.2}
              />
            </mesh>
          );
        })}
      </Float>

      {/* Floor grid for depth cues */}
      <gridHelper
        args={[12, 24, "#cbd5e1", "#e2e8f0"]}
        position={[0, -1.8, 0]}
      />
    </group>
  );
}

interface PerformanceOrbProps {
  timeline: PerformancePoint[];
  stats: ProfileStats;
  className?: string;
}

export default function PerformanceOrb({
  timeline,
  stats,
  className = "",
}: PerformanceOrbProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const hoveredPoint = hoveredIndex !== null ? timeline[hoveredIndex] : null;

  const runningPeaks = useMemo(() => {
    const cumulative = timeline.map((p) => p.cumulative);
    return cumulative.map((_, i) => Math.max(0, ...cumulative.slice(0, i + 1)));
  }, [timeline]);

  const allTimePeak = useMemo(() => {
    if (timeline.length === 0) return 0;
    return Math.max(0, ...timeline.map((p) => p.cumulative));
  }, [timeline]);

  const hoveredDrawdown =
    hoveredIndex !== null && hoveredPoint
      ? runningPeaks[hoveredIndex] - hoveredPoint.cumulative
      : 0;

  return (
    <div className={`relative ${className}`}>
      {/* Top Left Stats Badge */}
      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-0.5 rounded-lg border border-line bg-surface/85 px-3 py-2 shadow-xs backdrop-blur-md">
        <span className="eyebrow text-[10px]">Net Realised P&amp;L</span>
        <span
          className={`numeric text-[15px] font-bold ${
            stats.total_pnl < 0 ? "text-loss" : "text-profit"
          }`}
        >
          {formatSignedINR(stats.total_pnl)}
        </span>
        <span className="text-[11px] text-muted">
          {timeline.length} {timeline.length === 1 ? "session" : "sessions"} ·{" "}
          {stats.win_rate}% win rate
        </span>
      </div>

      {/* Top Right Peak & Drawdown Badges */}
      <div className="pointer-events-none absolute right-3 top-3 z-10 flex flex-col items-end gap-1">
        <div className="flex items-center gap-1.5 rounded border border-line bg-surface/85 px-2.5 py-1 text-[11px] font-medium shadow-xs backdrop-blur-md">
          <span className="text-muted">Peak:</span>
          <span className="numeric font-semibold text-profit">
            {formatSignedINR(allTimePeak)}
          </span>
        </div>
        {stats.max_drawdown > 0 && (
          <div className="flex items-center gap-1.5 rounded border border-loss/20 bg-loss-soft/90 px-2.5 py-1 text-[11px] font-medium shadow-xs backdrop-blur-md">
            <span className="text-loss">Max DD:</span>
            <span className="numeric font-semibold text-loss">
              -{formatSignedINR(stats.max_drawdown).replace(/^[+-]/, "")}
            </span>
          </div>
        )}
      </div>

      {/* Interactive Tooltip Card when hovering a bead */}
      <AnimatePresence>
        {hoveredPoint && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-x-4 top-20 z-20 mx-auto max-w-sm rounded-xl border border-brand/35 bg-surface/95 p-3 shadow-xl backdrop-blur-md sm:top-3"
          >
            <div className="flex items-center justify-between border-b border-line pb-1.5">
              <span className="text-[12.5px] font-semibold text-foreground">
                {formatDateLong(hoveredPoint.date)}
              </span>
              <span className="badge">
                Session {hoveredIndex! + 1} of {timeline.length}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <div>
                <span className="eyebrow block text-[9.5px]">Session</span>
                <span
                  className={`numeric text-[13px] font-bold ${
                    hoveredPoint.net_pnl < 0 ? "text-loss" : "text-profit"
                  }`}
                >
                  {formatSignedINR(hoveredPoint.net_pnl)}
                </span>
              </div>
              <div className="border-x border-line px-1">
                <span className="eyebrow block text-[9.5px]">Cumulative</span>
                <span
                  className={`numeric text-[13px] font-bold ${
                    hoveredPoint.cumulative < 0 ? "text-loss" : "text-profit"
                  }`}
                >
                  {formatSignedINR(hoveredPoint.cumulative)}
                </span>
              </div>
              <div>
                <span className="eyebrow block text-[9.5px]">Drawdown</span>
                <span className="numeric text-[13px] font-bold text-loss">
                  {hoveredDrawdown > 0
                    ? `-${formatSignedINR(hoveredDrawdown).replace(/^[+-]/, "")}`
                    : "0 (At Peak)"}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Hint */}
      <div className="pointer-events-none absolute bottom-2 inset-x-0 z-10 text-center">
        <span className="rounded-full border border-line bg-surface/80 px-2.5 py-0.5 text-[10.5px] text-muted backdrop-blur-xs">
          Drag to inspect · Hover beads for session details
        </span>
      </div>

      <Canvas
        camera={{ position: [0, 0.4, 6.8], fov: 44 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={1.15} />
        <directionalLight position={[4, 5, 5]} intensity={1.6} color="#ffffff" />
        <pointLight position={[-5, -2, 3]} intensity={12} color="#d64545" />
        <pointLight position={[0, 3, -5]} intensity={10} color="#387ed1" />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          maxPolarAngle={Math.PI / 2 + 0.2}
          minPolarAngle={Math.PI / 4}
        />
        <PerformanceScene
          timeline={timeline}
          stats={stats}
          hoveredIndex={hoveredIndex}
          onHoverIndex={setHoveredIndex}
        />
      </Canvas>
    </div>
  );
}
