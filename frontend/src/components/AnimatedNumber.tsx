"use client";

import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

import { formatINR, formatSignedINR } from "@/lib/format";

interface AnimatedNumberProps {
  value: number;
  /** Signed + prefixed output (e.g. "-₹12,450"). */
  signed?: boolean;
  precise?: boolean;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Spring stiffness. Lower = slower, heavier count-up. */
  stiffness?: number;
}

export function AnimatedNumber({
  value,
  signed = false,
  precise = false,
  prefix = "",
  suffix = "",
  className = "",
  stiffness = 85,
}: AnimatedNumberProps) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, {
    stiffness,
    damping: 22,
    mass: 0.9,
  });

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  const text = useTransform(spring, (latest) => {
    const safe = Number.isFinite(latest) ? latest : 0;
    const body = signed ? formatSignedINR(safe, precise) : formatINR(safe, precise);
    return `${prefix}${body}${suffix}`;
  });

  return (
    <motion.span className={`numeric tabular-nums ${className}`}>
      {text}
    </motion.span>
  );
}

interface PnlTickerProps {
  value: number;
  className?: string;
}

/**
 * Compact inline ticker used inside leaderboard rows. Small enough that a
 * long list of them still animates smoothly.
 */
export function PnlTicker({ value, className = "" }: PnlTickerProps) {
  const motionValue = useMotionValue(value);
  const spring = useSpring(motionValue, { stiffness: 120, damping: 24 });

  useEffect(() => {
    motionValue.set(value);
  }, [value, motionValue]);

  const text = useTransform(spring, (latest) =>
    formatSignedINR(Number.isFinite(latest) ? latest : 0),
  );

  return (
    <motion.span className={`numeric tabular-nums ${className}`}>
      {text}
    </motion.span>
  );
}
