"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Line } from "@react-three/drei";
import type { Group, Mesh } from "three";

import type { PerformancePoint, ProfileStats } from "@/lib/types";

interface SceneProps {
  timeline: PerformancePoint[];
  stats: ProfileStats;
}

const PROFIT = "#0f9960";
const LOSS = "#d64545";

function normalise(values: number[]): { scale: number; offset: number } {
  if (values.length === 0) return { scale: 1, offset: 0 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return { scale: 1 / span, offset: -min };
}

/**
 * Renders the trader's equity curve as a 3D ribbon:
 *   X  -> session index over time
 *   Y  -> cumulative P&L
 *   Z  -> drawdown depth below the running peak
 * A glowing line traces the curve, beads mark individual sessions, and a red
 * curtain hangs wherever the curve sits under its high-water mark.
 */
function PerformanceScene({ timeline, stats }: SceneProps) {
  const group = useRef<Group>(null);
  const beads = useRef<Mesh[]>([]);

  const geometry = useMemo(() => {
    if (timeline.length === 0) {
      return { points: [], curve: [], drawdown: [], peak: [], colors: [] as string[] };
    }

    const cumulative = timeline.map((p) => p.cumulative);
    const { scale, offset } = normalise(cumulative);

    // Running high-water mark, derived purely from the prefix of the curve.
    const runningPeaks = cumulative.map(
      (_, index) => Math.max(...cumulative.slice(0, index + 1)),
    );

    const spanX = 4.4;
    const stepX =
      timeline.length > 1 ? spanX / (timeline.length - 1) : 0;

    const points = timeline.map((point, index) => {
      const dd = runningPeaks[index] - point.cumulative;
      const x = timeline.length > 1 ? -spanX / 2 + index * stepX : 0;
      const y = (point.cumulative - offset) * scale * 3.2 - 1.6;
      const z = -Math.min(dd * scale * 3.2, 1.4);
      return [x, y, z] as [number, number, number];
    });

    const peakPoints = timeline.map((point, index) => {
      const x = timeline.length > 1 ? -spanX / 2 + index * stepX : 0;
      const y = (runningPeaks[index] - offset) * scale * 3.2 - 1.6;
      return [x, y, 0] as [number, number, number];
    });

    const drawdown = timeline.flatMap((_, index) => [
      [points[index][0], points[index][1], points[index][2]] as [number, number, number],
      [peakPoints[index][0], peakPoints[index][1], 0] as [number, number, number],
    ]);

    return {
      points,
      curve: points,
      peak: peakPoints,
      drawdown,
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
    if (group.current) {
      group.current.rotation.y += delta * 0.12;
      group.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.25) * 0.12 - 0.12;
    }
    beads.current.forEach((bead, index) => {
      if (!bead) return;
      const phase = state.clock.elapsedTime * 1.6 + index * 0.35;
      const pulse = 1 + Math.sin(phase) * 0.22;
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
      <Float speed={1.1} rotationIntensity={0.12} floatIntensity={0.22}>
        {/* Soft halo behind the curve */}
        <Line
          points={geometry.curve}
          color={lineColor}
          lineWidth={8}
          transparent
          opacity={0.1}
        />
        {/* Main equity curve */}
        <Line points={geometry.curve} color={lineColor} lineWidth={2.2} />

        {/* High-water mark */}
        {geometry.peak.length > 1 && (
          <Line
            points={geometry.peak}
            color="#9aa4b0"
            lineWidth={1}
            transparent
            opacity={0.75}
            dashed
            dashSize={0.12}
            gapSize={0.1}
          />
        )}

        {/* Drawdown curtain */}
        {geometry.drawdown.length > 1 && (
          <Line points={geometry.drawdown} color={LOSS} lineWidth={1.2} transparent opacity={0.45} />
        )}

        {/* Session beads */}
        {geometry.points.map((point, index) => (
          <mesh
            key={index}
            position={point}
            ref={(node) => {
              if (node) beads.current[index] = node;
            }}
          >
            <sphereGeometry args={[0.055, 14, 14]} />
            <meshStandardMaterial
              color={geometry.colors[index]}
              emissive={geometry.colors[index]}
              emissiveIntensity={0.35}
              roughness={0.4}
              metalness={0.1}
            />
          </mesh>
        ))}
      </Float>

      {/* Floor grid for depth cues */}
      <gridHelper
        args={[12, 24, "#e5e8ec", "#eef1f4"]}
        position={[0, -2.2, 0]}
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
  return (
    <div className={className}>
      <Canvas
        camera={{ position: [0, 1.6, 7.2], fov: 48 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={1.15} />
        <directionalLight position={[4, 5, 5]} intensity={1.6} color="#ffffff" />
        <pointLight position={[-5, -2, 3]} intensity={12} color="#d64545" />
        <pointLight position={[0, 3, -5]} intensity={10} color="#387ed1" />
        <PerformanceScene timeline={timeline} stats={stats} />
      </Canvas>
    </div>
  );
}
