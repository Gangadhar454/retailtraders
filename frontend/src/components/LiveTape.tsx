"use client";

import Link from "next/link";
import { useCallback, useMemo } from "react";

import { publicApi } from "@/lib/api";
import { formatRelative, formatSignedINR } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import type { FeedEntry, FeedResponse } from "@/lib/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function TapeChip({
  entry,
  ariaHidden,
}: {
  entry: FeedEntry;
  ariaHidden?: boolean;
}) {
  return (
    <Link
      href={`/u/${entry.user.username}`}
      tabIndex={ariaHidden ? -1 : undefined}
      aria-hidden={ariaHidden}
      className="row-hover flex shrink-0 items-center gap-2 rounded border border-line bg-surface px-2.5 py-1.5 shadow-2xs transition-colors hover:border-brand/40 hover:bg-brand-soft/40"
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
  );
}

/**
 * A continuous live marquee ticker for the most recent publishes.
 * Glides smoothly from right to left in a seamless infinite loop,
 * pauses on hover so traders can easily read and click any card.
 */
export function LiveTape() {
  const load = useCallback(() => publicApi.feed({ sort: "recent" }), []);
  const { data, loading, refreshing, lastUpdated } = usePolling<FeedResponse>(
    load,
    10_000,
  );

  const rawEntries = useMemo(
    () => (data?.entries ?? []).slice(0, 20),
    [data?.entries],
  );

  // Marquee is only enabled when there are at least 4 publishes.
  // When there are 1 to 3 publishes, show them once statically with zero repetition.
  const isMarquee = rawEntries.length >= 4;

  const displayItems = useMemo(() => {
    if (rawEntries.length === 0) return [];
    if (!isMarquee) return rawEntries;
    let items = rawEntries;
    while (items.length < 8) {
      items = [...items, ...rawEntries];
    }
    return items;
  }, [rawEntries, isMarquee]);

  // Speed calibrated to ~3.5 seconds per chip for easy readability
  const durationSec = Math.max(28, displayItems.length * 3.5);

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

      <div className="relative mt-2.5 overflow-hidden">
        {/* Soft edge gradient fades only when marquee is scrolling */}
        {isMarquee && (
          <>
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-r from-surface to-transparent sm:w-12" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-surface to-transparent sm:w-12" />
          </>
        )}

        {loading && rawEntries.length === 0 ? (
          <div className="flex gap-2 py-0.5">
            <div className="h-10 w-40 shrink-0 animate-pulse rounded border border-line bg-surface-alt" />
            <div className="h-10 w-44 shrink-0 animate-pulse rounded border border-line bg-surface-alt" />
            <div className="h-10 w-36 shrink-0 animate-pulse rounded border border-line bg-surface-alt" />
            <div className="h-10 w-40 shrink-0 animate-pulse rounded border border-line bg-surface-alt" />
          </div>
        ) : rawEntries.length === 0 ? (
          <p className="py-1 text-[12px] text-muted">
            Waiting for the first publish of the session…
          </p>
        ) : isMarquee ? (
          <div
            className="animate-marquee flex gap-2 py-0.5"
            style={
              {
                "--marquee-duration": `${durationSec}s`,
              } as React.CSSProperties
            }
          >
            {/* Primary Track */}
            {displayItems.map((entry, idx) => (
              <TapeChip
                key={`track1-${entry.record.record_id}-${idx}`}
                entry={entry}
              />
            ))}
            {/* Duplicate Track for seamless infinite loop */}
            {displayItems.map((entry, idx) => (
              <TapeChip
                key={`track2-${entry.record.record_id}-${idx}`}
                entry={entry}
                ariaHidden
              />
            ))}
          </div>
        ) : (
          /* Static row: strictly 1 card per publish, zero repeating */
          <div className="flex flex-wrap gap-2 py-0.5">
            {rawEntries.map((entry) => (
              <TapeChip
                key={`static-${entry.record.record_id}`}
                entry={entry}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
