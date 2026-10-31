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
      if (result.entries.length === 0) {
        setPages((current) => ({
          ...current,
          fetchedCount: Math.max(
            current.fetchedCount,
            (board.data?.total ?? 0) - firstPage.length,
          ),
        }));
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
    </div>
  );
}
