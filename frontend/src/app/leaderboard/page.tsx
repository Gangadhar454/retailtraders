"use client";

import { useCallback, useState } from "react";

import { HallOfPain, type LeaderboardFilter, type LeaderboardSort } from "@/components/HallOfPain";
import { publicApi } from "@/lib/api";
import { usePolling } from "@/lib/hooks";
import type { LeaderboardResponse } from "@/lib/types";

export default function LeaderboardPage() {
  const [filter, setFilter] = useState<LeaderboardFilter>("all");
  const [sort, setSort] = useState<LeaderboardSort>("worst");

  const load = useCallback(
    () =>
      publicApi.leaderboard({
        scope: "cumulative",
        verifiedOnly:
          filter === "all" ? undefined : filter === "verified",
        sort,
        limit: 100,
      }),
    [filter, sort],
  );

  const { data, loading, lastUpdated, refreshing } = usePolling<LeaderboardResponse>(
    load,
    12_000,
    true,
    `cumulative:${filter}:${sort}`,
  );

  const entries = (data?.entries ?? []).filter((entry) => {
    if (filter === "verified") return entry.is_verified;
    if (filter === "unverified") return !entry.is_verified;
    return true;
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <p className="eyebrow">Leaderboard</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
          The Hall of Pain
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-ink-soft">
          Ranked by each trader&apos;s cumulative lifetime P&amp;L across all published sessions.
          Broker-verified figures carry a blue Verified badge — self-reported claims are marked
          so you always know which is which.
        </p>
      </header>

      <HallOfPain
        mode="cumulative"
        entries={entries}
        loading={loading}
        filter={filter}
        sort={sort}
        onFilterChange={setFilter}
        onSortChange={setSort}
        total={data?.total ?? entries.length}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
      />
    </div>
  );
}
