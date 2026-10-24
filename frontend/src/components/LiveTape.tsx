"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback } from "react";

import { publicApi } from "@/lib/api";
import { formatRelative, formatSignedINR } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import type { FeedResponse } from "@/lib/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * A live strip of the most recent publishes. It re-polls quickly and animates
 * new entries in, so the page reads as an ongoing stream rather than a static
 * snapshot. Nothing is fabricated: every chip is a real publish from the feed.
 */
export function LiveTape() {
  const load = useCallback(() => publicApi.feed({ sort: "recent" }), []);
  const { data, loading, refreshing, lastUpdated } = usePolling<FeedResponse>(
    load,
    10_000,
  );

  const entries = (data?.entries ?? []).slice(0, 8);

  return (
    <section className="card px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-profit" />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">
            Live tape
          </span>
        </span>
        <span className="text-[11px] text-muted">
          {loading
            ? "connecting…"
            : refreshing
              ? "updating…"
              : lastUpdated
                ? `updated ${formatRelative(new Date(lastUpdated).toISOString())}`
                : "waiting for activity"}
        </span>
      </div>

      <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {loading && entries.length === 0 ? (
          <>
            <div className="h-10 w-40 shrink-0 animate-pulse rounded border border-line bg-surface-alt" />
            <div className="h-10 w-44 shrink-0 animate-pulse rounded border border-line bg-surface-alt" />
            <div className="h-10 w-36 shrink-0 animate-pulse rounded border border-line bg-surface-alt" />
          </>
        ) : entries.length === 0 ? (
          <p className="py-1 text-[12px] text-muted">
            Waiting for the first publish of the session…
          </p>
        ) : (
          <AnimatePresence initial={false} mode="popLayout">
            {entries.map((entry) => (
              <motion.div
                key={entry.record.record_id}
                layout
                initial={{ opacity: 0, y: 6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
                className="shrink-0"
              >
                <Link
                  href={`/u/${entry.user.username}`}
                  className="row-hover flex items-center gap-2 rounded border border-line bg-surface px-2.5 py-1.5 transition-colors hover:border-brand/30 hover:bg-brand-soft/40"
                >
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-brand-soft text-[9px] font-bold text-brand">
                    {initials(entry.user.display_name)}
                  </span>
                  <span className="min-w-0">
                    <span className="block max-w-[7.5rem] truncate text-[12px] font-semibold text-foreground">
                      {entry.user.display_name}
                    </span>
                    <span className="block text-[10.5px] text-muted">
                      {formatRelative(entry.record.created_at)}
                    </span>
                  </span>
                  <span
                    className={`numeric text-[12px] font-semibold ${
                      entry.record.net_pnl < 0 ? "text-loss" : "text-profit"
                    }`}
                  >
                    {formatSignedINR(entry.record.net_pnl)}
                  </span>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
    </section>
  );
}
