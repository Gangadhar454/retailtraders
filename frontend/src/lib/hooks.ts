"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface PolledState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
  lastUpdated: number | null;
}

/**
 * Polls an async loader on an interval with sensible pause/resume behaviour:
 * polling stops while the tab is hidden and resumes (with an immediate fetch)
 * when it becomes visible again.
 *
 * `requestKey` identifies the query behind `loader`. When it changes the hook
 * refetches straight away and drops the previous result, so the UI never shows
 * the answer to the previous question while the new one is in flight. Pass the
 * query inputs (filter, sort, username, ...) as a stable string; the loader
 * itself stays in a ref, so it may be re-created on every render without
 * restarting the poll.
 */
export function usePolling<T>(
  loader: () => Promise<T>,
  intervalMs = 30_000,
  enabled = true,
  requestKey = "",
): PolledState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Keep the latest loader without re-running the effect on every render.
  const loaderRef = useRef(loader);
  useEffect(() => {
    loaderRef.current = loader;
  }, [loader]);

  const requestKeyRef = useRef(requestKey);

  useEffect(() => {
    if (!enabled) return;

    // The query changed underneath us: discard the stale answer and show a
    // loading state until the new one lands.
    if (requestKeyRef.current !== requestKey) {
      requestKeyRef.current = requestKey;
      setData(null);
      setError(null);
      setPending(true);
    }

    let cancelled = false;

    const run = async (isRefresh: boolean) => {
      if (isRefresh) setRefreshing(true);
      try {
        const result = await loaderRef.current();
        if (cancelled) return;
        setData(result);
        setError(null);
        setLastUpdated(Date.now());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        if (cancelled) return;
        setPending(false);
        setRefreshing(false);
      }
    };

    void run(nonce > 0);

    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void run(true);
    }, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") void run(true);
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled, nonce, requestKey]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data,
    error,
    loading: enabled && pending,
    refreshing,
    refresh,
    lastUpdated,
  };
}
