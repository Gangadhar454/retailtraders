"use client";

import { motion } from "motion/react";

interface VerifiedBadgeProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
}

/**
 * The "Verified P&L" badge. A quiet, static chip so broker-backed claims read
 * as a matter of record rather than as a spectacle.
 */
export function VerifiedBadge({
  size = "md",
  label = "Verified P&L",
  className = "",
}: VerifiedBadgeProps) {
  const dimensions = {
    sm: { box: "h-3.5 w-3.5", text: "text-[11px]", gap: "gap-1" },
    md: { box: "h-4 w-4", text: "text-[11px]", gap: "gap-1.5" },
    lg: { box: "h-5 w-5", text: "text-[13px]", gap: "gap-2" },
  }[size];

  return (
    <span
      className={`inline-flex items-center ${dimensions.gap} rounded border border-brand/25 bg-brand-soft px-1.5 py-0.5 ${dimensions.text} font-medium text-brand ${className}`}
      title="This P&L was fetched directly from the linked broker account"
    >
      <svg viewBox="0 0 24 24" fill="none" className={`${dimensions.box} shrink-0`}>
        <path
          d="M12 2.5l7.5 3v5.6c0 4.7-3.2 8.6-7.5 10.4-4.3-1.8-7.5-5.7-7.5-10.4V5.5l7.5-3z"
          fill="#387ed1"
          fillOpacity="0.12"
          stroke="#387ed1"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <motion.path
          d="M8.4 12.1l2.5 2.5 4.7-4.9"
          stroke="#387ed1"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </svg>
      <span className="whitespace-nowrap">{label}</span>
    </span>
  );
}

interface UnverifiedBadgeProps {
  size?: "sm" | "md";
  className?: string;
}

/** Muted counterpart so unverified claims are never mistaken for broker data. */
export function UnverifiedBadge({
  size = "sm",
  className = "",
}: UnverifiedBadgeProps) {
  const dimensions = {
    sm: "text-[11px] px-1.5 py-0.5",
    md: "text-[11px] px-1.5 py-0.5",
  }[size];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-line bg-surface-alt text-muted ${dimensions} font-medium ${className}`}
      title="Self-reported P&L — not verified against a broker account"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 shrink-0">
        <path
          d="M12 3.5c4.7 0 8.5 3.8 8.5 8.5s-3.8 8.5-8.5 8.5S3.5 16.7 3.5 12 7.3 3.5 12 3.5z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="2.5 2.5"
        />
        <path
          d="M9.3 12.2l1.9 1.9 3.6-3.9"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
        />
      </svg>
      Self-reported
    </span>
  );
}
