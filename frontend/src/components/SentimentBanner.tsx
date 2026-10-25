"use client";

import { motion } from "motion/react";

import { AnimatedNumber } from "@/components/AnimatedNumber";
import { formatCompact, formatDateLong, pnlTone } from "@/lib/format";
import type { Sentiment } from "@/lib/types";

interface SentimentBannerProps {
  sentiment: Sentiment | null;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}

function toneClass(tone: "profit" | "loss" | "flat"): string {
  if (tone === "profit") return "text-profit";
  if (tone === "loss") return "text-loss";
  return "text-foreground";
}

function StatCell({
  label,
  value,
  tone = "flat",
  hint,
}: {
  label: string;
  value: string;
  tone?: "profit" | "loss" | "flat";
  hint?: string;
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className={`numeric mt-1 text-[15px] font-semibold ${toneClass(tone)}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function SentimentBanner({
  sentiment,
  loading = false,
  refreshing = false,
  onRefresh,
}: SentimentBannerProps) {
  const tone = pnlTone(sentiment?.net_pnl_total ?? 0);
  const total = sentiment?.net_pnl_total ?? 0;
  const sinceLaunchTotal = sentiment?.since_launch_net_pnl ?? 0;
  const sinceLaunchVerifiedTotal = sentiment?.since_launch_verified_pnl ?? 0;
  const traderCount = sentiment?.trader_count ?? 0;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2" aria-hidden>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-soft">
            India&apos;s Retail Net P&amp;L Today
          </p>
        </div>

        <div className="flex items-center gap-2">
          {sentiment && (
            <span className="rounded border border-line bg-surface-alt px-2 py-0.5 text-[11px] text-ink-soft">
              {formatDateLong(sentiment.date)} &middot; IST
            </span>
          )}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="grid h-7 w-7 place-items-center rounded border border-line bg-surface text-muted transition-colors hover:bg-surface-alt hover:text-foreground disabled:opacity-50"
              aria-label="Refresh sentiment"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              >
                <path
                  d="M20 11a8 8 0 10-2.34 5.66M20 4v7h-7"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 lg:grid-cols-3 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Today
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <AnimatedNumber
              value={total}
              signed
              className={`text-[30px] font-semibold leading-none tracking-tight sm:text-[34px] ${toneClass(tone)}`}
            />
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 }}
              className="text-[13px] text-ink-soft"
            >
              {loading && !sentiment
                ? "Aggregating retail P&L…"
                : `across ${traderCount} retail ${
                    traderCount === 1 ? "trader" : "traders"
                  } today`}
            </motion.p>
          </div>
        </div>

        <div className="border-t border-line pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
            Total P&amp;L since Oct 25, 2026
          </p>
          <AnimatedNumber
            value={sinceLaunchTotal}
            signed
            className={`numeric mt-1 block text-[24px] font-semibold leading-none tracking-tight sm:text-[28px] ${toneClass(pnlTone(sinceLaunchTotal))}`}
          />
          <p className="mt-1 text-[11px] text-muted">All published trades</p>
        </div>

        <div className="border-t border-line pt-3 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand/15 text-brand" title="Broker-verified">
              <svg viewBox="0 0 16 16" fill="none" className="h-2.5 w-2.5 stroke-brand stroke-2">
                <path d="M3.5 8.5L6.5 11.5L12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
              Verified P&amp;L since Oct 25, 2026
            </p>
          </div>
          <AnimatedNumber
            value={sinceLaunchVerifiedTotal}
            signed
            className={`numeric mt-1 block text-[24px] font-semibold leading-none tracking-tight sm:text-[28px] ${toneClass(pnlTone(sinceLaunchVerifiedTotal))}`}
          />
          <p className="mt-1 text-[11px] text-muted">100% broker-verified trades</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-px border-t border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
        <div className="bg-surface">
          <StatCell
            label="Verified"
            value={formatCompact(sentiment?.verified_net_pnl ?? 0)}
            tone={pnlTone(sentiment?.verified_net_pnl ?? 0)}
            hint={`${sentiment?.verified_count ?? 0} broker-linked`}
          />
        </div>
        <div className="bg-surface">
          <StatCell
            label="Unverified"
            value={formatCompact(sentiment?.unverified_net_pnl ?? 0)}
            tone={pnlTone(sentiment?.unverified_net_pnl ?? 0)}
            hint={`${sentiment?.unverified_count ?? 0} self-reported`}
          />
        </div>
        <div className="bg-surface">
          <StatCell
            label="Avg / trader"
            value={`₹${formatCompact(sentiment?.average_pnl ?? 0)}`}
            tone={pnlTone(sentiment?.average_pnl ?? 0)}
          />
        </div>
        <div className="bg-surface">
          <StatCell
            label="Biggest loss"
            value={`₹${formatCompact(Math.abs(sentiment?.biggest_loss ?? 0))}`}
            tone="loss"
          />
        </div>
        <div className="bg-surface">
          <StatCell
            label="Biggest gain"
            value={`₹${formatCompact(sentiment?.biggest_gain ?? 0)}`}
            tone="profit"
          />
        </div>
        <div className="bg-surface">
          <StatCell
            label="In profit / loss"
            value={`${sentiment?.profitable_count ?? 0} / ${sentiment?.losing_count ?? 0}`}
            hint="traders in profit vs loss"
          />
        </div>
      </div>
    </section>
  );
}
