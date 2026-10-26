"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { DonateModal } from "@/components/DonateModal";
import { PnlTicker } from "@/components/AnimatedNumber";
import { UnverifiedBadge, VerifiedBadge } from "@/components/VerifiedBadge";
import { avatarInk, avatarTint, formatDate, initials, pnlTone } from "@/lib/format";
import { publicApi } from "@/lib/api";
import type { DonateEligibility, LeaderboardEntry } from "@/lib/types";

export type LeaderboardFilter = "all" | "verified" | "unverified";
export type LeaderboardSort = "worst" | "best";

interface HallOfPainProps {
  entries: LeaderboardEntry[];
  loading?: boolean;
  filter: LeaderboardFilter;
  sort: LeaderboardSort;
  onFilterChange: (filter: LeaderboardFilter) => void;
  onSortChange: (sort: LeaderboardSort) => void;
  total?: number;
  emptyHint?: string;
  lastUpdated?: number | null;
  refreshing?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: string | null;
  onLoadMore?: () => void;
  mode?: "today" | "cumulative";
}

const FILTERS: { key: LeaderboardFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "verified", label: "Verified" },
  { key: "unverified", label: "Unverified" },
];

const SORTS: { key: LeaderboardSort; label: string }[] = [
  { key: "worst", label: "Worst first" },
  { key: "best", label: "Best first" },
];

// Cache-backed hook so many leaderboard rows don't refetch the same user.
const donateCache = new Map<string, DonateEligibility | null>();
const donatePending = new Map<string, Promise<DonateEligibility>>();

function useDonateEligibility(username: string, enabled: boolean = true) {
  const [data, setData] = useState<DonateEligibility | null>(
    donateCache.get(username) ?? null,
  );

  useEffect(() => {
    if (!enabled) return;
    if (donateCache.has(username)) {
      setData(donateCache.get(username) ?? null);
      return;
    }
    if (donatePending.has(username)) return;
    const p = publicApi
      .donateEligibility(username)
      .then((d) => {
        donateCache.set(username, d);
        setData(d);
        donatePending.delete(username);
        return d;
      })
      .catch(() => {
        donatePending.delete(username);
        const fallback: DonateEligibility = {
          eligible: false,
          upi_id: null,
          resolved_name: null,
          reason: null,
        };
        setData(fallback);
        return fallback;
      });
    donatePending.set(username, p);
  }, [username, enabled]);

  return data;
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-8 w-8 shrink-0 animate-pulse rounded bg-surface-sunken" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-40 animate-pulse rounded bg-surface-sunken" />
        <div className="h-2.5 w-24 animate-pulse rounded bg-surface-sunken" />
      </div>
      <div className="h-4 w-20 animate-pulse rounded bg-surface-sunken" />
    </div>
  );
}

function LeaderboardRow({
  entry,
  onDonate,
  mode = "today",
}: {
  entry: LeaderboardEntry;
  onDonate?: (
    username: string,
    upiId: string | null,
    resolvedName: string | null,
  ) => void;
  mode?: "today" | "cumulative";
}) {
  const tone = pnlTone(entry.net_pnl);
  const seed = entry.user.avatar_seed || entry.user.username;
  const isLossVerified =
    mode !== "cumulative" && entry.is_verified && entry.net_pnl < 0;
  const eligible = useDonateEligibility(entry.user.username, isLossVerified);
  const canDonate =
    isLossVerified &&
    Boolean(eligible?.eligible) &&
    Boolean(eligible?.upi_id);

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{
        layout: { type: "spring", stiffness: 420, damping: 38 },
        opacity: { duration: 0.15 },
      }}
      className="row-hover grid grid-cols-[1fr_auto] items-center gap-4 px-4 py-3 sm:grid-cols-[2.5rem_1fr_5rem_8rem]"
    >
      <span className="numeric hidden text-[13px] text-muted sm:block">
        {entry.rank}
      </span>

      <div className="flex min-w-0 items-center gap-3">
        <Link href={`/u/${entry.user.username}`} className="shrink-0">
          <span
            className="grid h-8 w-8 place-items-center rounded text-[11px] font-bold"
            style={{
              background: avatarTint(seed),
              color: avatarInk(seed),
            }}
          >
            {initials(entry.user.display_name)}
          </span>
        </Link>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/u/${entry.user.username}`}
              className="truncate text-[13.5px] font-semibold text-foreground transition-colors hover:text-brand"
            >
              {entry.user.display_name}
            </Link>
            {entry.is_verified ? (
              <VerifiedBadge size="sm" label="Verified" />
            ) : (
              <UnverifiedBadge size="sm" />
            )}
            {canDonate && onDonate && (
              <button
                type="button"
                onClick={() =>
                  onDonate(
                    entry.user.username,
                    eligible?.upi_id ?? null,
                    eligible?.resolved_name ?? null,
                  )
                }
                className="group ml-2 inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 shadow-2xs transition-all hover:border-rose-500 hover:bg-rose-500 hover:text-white active:scale-95"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3 shrink-0 text-rose-500 transition-colors group-hover:text-white">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                Donate
              </button>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
            <span className="font-mono">@{entry.user.username}</span>
            <span aria-hidden>&middot;</span>
            <span className="numeric">
              {mode === "cumulative"
                ? `last active ${formatDate(entry.record_date)}`
                : formatDate(entry.record_date)}
            </span>
            {entry.note && (
              <span className="hidden truncate italic opacity-80 md:inline">
                &ldquo;{entry.note}&rdquo;
              </span>
            )}
          </div>
        </div>
      </div>

      <span className="numeric hidden text-right text-[13px] text-ink-soft sm:block">
        {entry.trade_count > 0 ? entry.trade_count : "—"}
      </span>

      <div className="text-right">
        <PnlTicker
          value={entry.net_pnl}
          className={`text-[15px] font-semibold ${
            tone === "loss"
              ? "text-loss"
              : tone === "profit"
                ? "text-profit"
                : "text-foreground"
          }`}
        />
        {entry.broker_source && (
          <p className="text-[11px] text-muted">via {entry.broker_source}</p>
        )}
      </div>
    </motion.div>
  );
}

function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  layoutId,
  label,
}: {
  items: { key: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex rounded border border-line-strong bg-surface p-0.5"
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onChange(item.key)}
          aria-pressed={value === item.key}
          className={`relative rounded-[3px] px-2.5 py-1 text-[12px] font-medium transition-colors ${
            value === item.key
              ? "text-brand"
              : "text-ink-soft hover:bg-surface-alt hover:text-foreground"
          }`}
        >
          {value === item.key && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-0 rounded-[3px] bg-brand-soft"
              transition={{ type: "spring", stiffness: 460, damping: 40 }}
            />
          )}
          <span className="relative z-10">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function HallOfPain({
  entries,
  loading = false,
  filter,
  sort,
  onFilterChange,
  onSortChange,
  total = 0,
  emptyHint,
  lastUpdated,
  refreshing = false,
  hasMore = false,
  loadingMore = false,
  loadMoreError = null,
  onLoadMore,
  mode = "today",
}: HallOfPainProps) {
  const resolvedEmptyHint =
    emptyHint ??
    (mode === "cumulative"
      ? "No traders have published any P&L yet."
      : "No traders have published for this session yet.");
  const [donateUser, setDonateUser] = useState<{
    username: string;
    upiId: string | null;
    resolvedName: string | null;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const loadMoreTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setTick(Date.now());
    const kick = window.setTimeout(update, 0);
    const id = window.setInterval(update, 5000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const target = loadMoreTarget.current;
    if (
      !target ||
      !hasMore ||
      loadingMore ||
      loadMoreError ||
      !onLoadMore ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMoreError, onLoadMore]);

  const secondsAgo =
    lastUpdated && tick
      ? Math.max(0, Math.floor((tick - lastUpdated) / 1000))
      : null;

  function handleDonate(
    username: string,
    upiId: string | null,
    resolvedName: string | null,
  ) {
    setDonateUser({ username, upiId, resolvedName });
  }
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">
            {mode === "cumulative" ? "All-time leaderboard" : "Live leaderboard"}
          </p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground">
            Hall of Pain
          </h2>
          <p className="mt-1 flex items-center gap-2 text-[13px] text-ink-soft">
            {loading
              ? "Loading the leaderboard…"
              : mode === "cumulative"
                ? `${total} ${total === 1 ? "trader" : "traders"} ranked by cumulative P&L`
                : `${total} ${total === 1 ? "trader" : "traders"} on the board today`}
            {mode !== "cumulative" && (
              <span className="hidden items-center gap-1.5 sm:flex">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-profit" />
                </span>
                <span className="text-[11px] uppercase tracking-[0.12em] text-muted">
                  Live
                </span>
                {refreshing ? (
                  <span className="text-[11px] text-muted">· updating…</span>
                ) : (
                  secondsAgo !== null && (
                    <span className="text-[11px] text-muted">
                      · {secondsAgo < 5 ? "just now" : `${secondsAgo}s ago`}
                    </span>
                  )
                )}
              </span>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            items={FILTERS}
            value={filter}
            onChange={onFilterChange}
            layoutId="hall-filter"
            label="Filter traders"
          />
          <SegmentedControl
            items={SORTS}
            value={sort}
            onChange={onSortChange}
            layoutId="hall-sort"
            label="Sort traders"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden grid-cols-[2.5rem_1fr_5rem_8rem] gap-4 border-b border-line bg-surface-alt px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted sm:grid">
          <span>#</span>
          <span>Trader</span>
          <span className="text-right">Trades</span>
          <span className="text-right">{mode === "cumulative" ? "Total P&L" : "Net P&L"}</span>
        </div>

        {loading && entries.length === 0 ? (
          <div className="divide-y divide-line">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        ) : (
          <div className="divide-y divide-line">
            <AnimatePresence initial={false}>
              {entries.map((entry) => (
                <LeaderboardRow
                  key={entry.user.user_id}
                  entry={entry}
                  onDonate={handleDonate}
                  mode={mode}
                />
              ))}
            </AnimatePresence>
          </div>
        )}

        {hasMore && (
          <div
            ref={loadMoreTarget}
            className="flex min-h-14 items-center justify-center border-t border-line px-4 py-3"
          >
            {loadingMore ? (
              <span className="text-[12px] text-muted">Loading more traders...</span>
            ) : loadMoreError ? (
              <button
                type="button"
                onClick={onLoadMore}
                className="text-[12px] font-semibold text-brand hover:underline"
              >
                {loadMoreError} Retry
              </button>
            ) : (
              <button
                type="button"
                onClick={onLoadMore}
                className="text-[12px] font-semibold text-brand hover:underline"
              >
                Load more traders
              </button>
            )}
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="px-6 py-14 text-center">
            <p className="text-[13px] text-ink-soft">{resolvedEmptyHint}</p>
            <Link href="/publish" className="btn-base btn-primary mt-4">
              Publish your P&amp;L
            </Link>
          </div>
        )}
      </div>

      {donateUser && (
        <DonateModal
          open={Boolean(donateUser)}
          onClose={() => setDonateUser(null)}
          upiId={donateUser.upiId}
          resolvedName={donateUser.resolvedName}
        />
      )}
    </section>
  );
}
