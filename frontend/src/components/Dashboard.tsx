"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HallOfPain, type LeaderboardFilter, type LeaderboardSort } from "@/components/HallOfPain";
import { LiveTape } from "@/components/LiveTape";
import { SentimentBanner } from "@/components/SentimentBanner";
import { publicApi } from "@/lib/api";
import { usePolling } from "@/lib/hooks";
import type { LeaderboardEntry, LeaderboardResponse, Sentiment } from "@/lib/types";

const LEADERBOARD_PAGE_SIZE = 50;

interface LeaderboardPages {
  queryKey: string;
  entries: LeaderboardEntry[];
  fetchedCount: number;
  error: string | null;
}

export function Dashboard() {
  const [filter, setFilter] = useState<LeaderboardFilter>("all");
  const [sort, setSort] = useState<LeaderboardSort>("worst");
  const queryKey = `${filter}:${sort}`;
  const queryKeyRef = useRef(queryKey);
  const loadMoreRequestRef = useRef(0);
  const loadingMoreKeyRef = useRef<string | null>(null);
  const [loadingMoreKey, setLoadingMoreKey] = useState<string | null>(null);
  const [pages, setPages] = useState<LeaderboardPages>({
    queryKey,
    entries: [],
    fetchedCount: 0,
    error: null,
  });

  useEffect(() => {
    queryKeyRef.current = queryKey;
    loadMoreRequestRef.current += 1;
    loadingMoreKeyRef.current = null;
  }, [queryKey]);

  const loadSentiment = useCallback(() => publicApi.sentiment(), []);
  const loadLeaderboard = useCallback(
    () =>
      publicApi.leaderboard({
        scope: "today",
        verifiedOnly:
          filter === "all" ? undefined : filter === "verified",
        sort,
        limit: LEADERBOARD_PAGE_SIZE,
      }),
    [filter, sort],
  );

  const sentiment = usePolling<Sentiment>(loadSentiment, 10_000);
  const board = usePolling<LeaderboardResponse>(
    loadLeaderboard,
    10_000,
    true,
    queryKey,
  );

  const firstPage = useMemo(() => board.data?.entries ?? [], [board.data]);
  const currentPages =
    pages.queryKey === queryKey
      ? pages
      : { queryKey, entries: [], fetchedCount: 0, error: null };
  const additionalEntries = currentPages.entries;
  const additionalCount = currentPages.fetchedCount;
  const loadingMore = loadingMoreKey === queryKey;
  const loadMoreError = currentPages.error;

  const loadMore = useCallback(async () => {
    if (
      !board.data ||
      board.loading ||
      board.refreshing ||
      loadingMoreKeyRef.current === queryKey
    ) {
      return;
    }
    const offset = firstPage.length + additionalCount;
    if (offset >= board.data.total) return;

    loadingMoreKeyRef.current = queryKey;
    const requestId = ++loadMoreRequestRef.current;
    setLoadingMoreKey(queryKey);
    setPages((current) =>
      current.queryKey === queryKey
        ? { ...current, error: null }
        : { queryKey, entries: [], fetchedCount: 0, error: null },
    );
    try {
      const result = await publicApi.leaderboard({
        scope: "today",
        verifiedOnly: filter === "all" ? undefined : filter === "verified",
        sort,
        limit: LEADERBOARD_PAGE_SIZE,
        offset,
      });
      if (
        queryKeyRef.current !== queryKey ||
        loadMoreRequestRef.current !== requestId
      ) {
        return;
      }
      setPages((current) => ({
        queryKey,
        entries:
          current.queryKey === queryKey
            ? [...current.entries, ...result.entries]
            : result.entries,
        fetchedCount:
          (current.queryKey === queryKey ? current.fetchedCount : 0) +
          result.entries.length,
        error: null,
      }));
    } catch {
      setPages((current) =>
        current.queryKey === queryKey
          ? { ...current, error: "Could not load more traders." }
          : current,
      );
    } finally {
      if (
        queryKeyRef.current === queryKey &&
        loadMoreRequestRef.current === requestId
      ) {
        loadingMoreKeyRef.current = null;
        setLoadingMoreKey(null);
      }
    }
  }, [
    additionalCount,
    board.data,
    board.loading,
    board.refreshing,
    filter,
    firstPage.length,
    queryKey,
    sort,
  ]);

  const entries = useMemo(() => {
    const seenUsers = new Set<string>();
    return [...firstPage, ...additionalEntries].filter((entry) => {
      if (seenUsers.has(entry.user.user_id)) return false;
      seenUsers.add(entry.user.user_id);
      return true;
    });
  }, [additionalEntries, firstPage]);

  const hasMore =
    board.data !== null &&
    firstPage.length + additionalCount < board.data.total;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <SentimentBanner
        sentiment={sentiment.data}
        loading={sentiment.loading}
        refreshing={sentiment.refreshing}
        onRefresh={sentiment.refresh}
      />

      {sentiment.error && (
        <div className="rounded border border-loss/25 bg-loss-soft px-4 py-3 text-[13px] text-loss">
          Couldn&apos;t reach the API: {sentiment.error}
        </div>
      )}

      <LiveTape />

      <HallOfPain
        entries={entries}
        loading={board.loading}
        filter={filter}
        sort={sort}
        onFilterChange={setFilter}
        onSortChange={setSort}
        total={board.data?.total ?? entries.length}
        lastUpdated={board.lastUpdated}
        refreshing={board.refreshing}
        hasMore={hasMore}
        loadingMore={loadingMore}
        loadMoreError={loadMoreError}
        onLoadMore={loadMore}
      />

      <HowItWorks />
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Publish",
      body: "Enter your daily P&L manually, or link Upstox or Zerodha and let the platform read the realised number straight from your account.",
      icon: (
        <path
          d="M12 5v14M5 12h14"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      ),
    },
    {
      title: "Verify",
      body: "Linked accounts carry a Verified P&L badge fetched from the broker — never self-reported.",
      icon: (
        <path
          d="M12 2.5l7.5 3v5.6c0 4.7-3.2 8.6-7.5 10.4-4.3-1.8-7.5-5.7-7.5-10.4V5.5l7.5-3zM8.6 12l2.4 2.4 4.4-4.8"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ),
    },
    {
      title: "Tip",
      body: "Supporters send a voluntary UPI gift straight to your verified UPI ID. The platform never holds funds.",
      icon: (
        <path
          d="M12 21s-7-4.6-7-10a7 7 0 1114 0c0 5.4-7 10-7 10z M12 8.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      ),
    },
  ];

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-[15px] font-bold tracking-tight text-foreground">
          How it works
        </h2>
      </div>
      <div className="card overflow-hidden">
        <div className="grid gap-px bg-line md:grid-cols-3">
          {steps.map((step, index) => (
            <div key={step.title} className="bg-surface p-5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 place-items-center rounded border border-brand/20 bg-brand-soft text-brand">
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                    {step.icon}
                  </svg>
                </span>
                <h3 className="text-[14px] font-semibold text-foreground">
                  {step.title}
                </h3>
                <span className="numeric ml-auto text-[11px] font-medium text-muted">
                  0{index + 1}
                </span>
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">
                {step.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
