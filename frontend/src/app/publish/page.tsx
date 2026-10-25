"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { UnverifiedBadge, VerifiedBadge } from "@/components/VerifiedBadge";
import { ApiError, publicApi, userApi } from "@/lib/api";
import { formatDate, formatRelative, formatSignedINR } from "@/lib/format";
import { usePolling } from "@/lib/hooks";
import type { BrokerOption, LinkedBroker, PublishDay, PublishItem } from "@/lib/types";

type Mode = "manual" | "broker";

const PAGE_SIZE = 10;

const FALLBACK_BROKERS: BrokerOption[] = [
  {
    key: "upstox",
    name: "Upstox",
    status: "available",
    detail: "Log in with Upstox and read today's realised P&L from your positions.",
  },
  {
    key: "zerodha",
    name: "Zerodha",
    status: "available",
    detail: "Log in with Zerodha and read today's realised P&L from your positions.",
  },
  {
    key: "angel_one",
    name: "Angel One",
    status: "available",
    detail: "Log in with Angel One and read today's realised P&L from your positions.",
  },
];

export default function PublishPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <div className="card h-72 animate-pulse" />
        </div>
      }
    >
      <PublishView />
    </Suspense>
  );
}

function PublishView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading, refresh } = useAuth();

  const [mode, setMode] = useState<Mode>("manual");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [trades, setTrades] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Day-by-day publish history (newest first, lazily paged).
  const [history, setHistory] = useState<PublishDay[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const historySentinel = useRef<HTMLDivElement | null>(null);
  const historyBusyRef = useRef(false);

  // The URL carries the broker choice, so the picker survives a redirect
  // back from the broker's consent screen.
  const requested = searchParams.get("broker");
  const selectedBroker = requested ?? "upstox";

  const catalogue = usePolling<BrokerOption[]>(
    () => publicApi.supportedBrokers(),
    300_000,
    true,
  );
  const linksPoll = usePolling<LinkedBroker[]>(
    () => userApi.brokers(),
    30_000,
    Boolean(user),
  );

  const brokers = catalogue.data?.length ? catalogue.data : FALLBACK_BROKERS;
  const links = linksPoll.data ?? [];
  const linked =
    links.find(
      (l) =>
        l.is_active &&
        l.broker_name.toLowerCase().replace(/\s+/g, "_") === selectedBroker,
    ) ?? null;
  const refreshLinks = linksPoll.refresh;

  const chosen = brokers.find((b) => b.key === selectedBroker) ?? brokers[0];
  const brokerLabel = chosen?.name ?? "broker";
  const canFetch = chosen?.status === "available";

  const loadHistoryPage = useCallback(
    async (offset: number, reset: boolean) => {
      if (historyBusyRef.current) return;
      historyBusyRef.current = true;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const data = await userApi.publishHistory({ limit: PAGE_SIZE, offset });
        setHistory((prev) => (reset ? data.days : [...prev, ...data.days]));
        setHistoryTotal(data.total);
        setHistoryHasMore(data.has_more);
      } catch (err) {
        setHistoryError(
          err instanceof ApiError ? err.message : "Could not load publish history"
        );
      } finally {
        setHistoryLoading(false);
        historyBusyRef.current = false;
      }
    },
    [],
  );

  const refreshHistory = useCallback(() => {
    historyBusyRef.current = false;
    void loadHistoryPage(0, true);
  }, [loadHistoryPage]);

  const publishFromBroker = useCallback(async () => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await userApi.syncPnl(selectedBroker);
      setSuccess(
        result.record
          ? result.broker_fetched_pnl != null
            ? `Fetched ${formatSignedINR(result.broker_fetched_pnl)} from ${result.broker_name ?? selectedBroker} — today's total P&L is ${formatSignedINR(result.record.net_pnl)}.`
            : `Posted ${formatSignedINR(result.record.net_pnl)} from ${result.record.broker_source ?? "your broker"} — today's realised P&L.`
          : result.message,
      );
      setSessionExpired(false);
      setError(null);
      await refresh();
      refreshLinks();
      refreshHistory();
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      const isSessionExpired =
        apiErr?.status === 401 ||
        /session has expired/i.test(apiErr?.message ?? "");
      if (isSessionExpired) {
        setSessionExpired(true);
        setError(
          `Your ${brokerLabel} session has expired. Click Reconnect to sign in again.`,
        );
      } else {
        setSessionExpired(false);
        setError(
          apiErr?.message ?? "Could not fetch P&L from the broker. Please try again.",
        );
      }
    } finally {
      setBusy(false);
    }
  }, [refresh, refreshLinks, refreshHistory, selectedBroker, brokerLabel]);

  // Just came back from the broker: pull today's figure straight away.
  const autoFetched = useRef<string | null>(null);
  useEffect(() => {
    if (!requested || !linked) return;
    if (autoFetched.current === requested) return;
    autoFetched.current = requested;
    const timer = window.setTimeout(() => {
      void publishFromBroker();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [requested, linked, publishFromBroker]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?next=/publish");
    }
  }, [loading, user, router]);

  const userId = user?.user_id ?? null;

  useEffect(() => {
    if (!userId) return;
    const timer = window.setTimeout(() => {
      void loadHistoryPage(0, true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [userId, loadHistoryPage]);

  useEffect(() => {
    const node = historySentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          !historyBusyRef.current &&
          historyHasMore
        ) {
          void loadHistoryPage(history.length, false);
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [historyHasMore, history.length, loadHistoryPage]);

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="card h-72 animate-pulse" />
      </div>
    );
  }

  async function submitManual(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    const value = Number(amount);
    if (!Number.isFinite(value) || value === 0) {
      setError("Enter a non-zero P&L amount");
      setBusy(false);
      return;
    }

    try {
      const target = editingDate ?? undefined;
      await userApi.publishPnl({
        net_pnl: value,
        date: target,
        notes: notes.trim() ? notes.trim() : null,
        trade_count: trades ? Number(trades) : 0,
      });
      setSuccess(
        target
          ? `Updated ${formatDate(target)} to ${formatSignedINR(value)}. The day's total was recalculated.`
          : `Published ${formatSignedINR(value)} as a self-reported figure.`,
      );
      setEditingDate(null);
      setAmount("");
      setNotes("");
      setTrades("");
      refreshHistory();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not publish");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(day: PublishDay, item: PublishItem) {
    setEditingDate(day.date);
    setMode("manual");
    setAmount(String(item.net_pnl));
    setNotes(item.notes ?? "");
    setTrades(item.trade_count ? String(item.trade_count) : "");
    setError(null);
    setSuccess(null);
    setExpanded((prev) => new Set(prev).add(day.date));
    router.replace("/publish", { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingDate(null);
    setAmount("");
    setNotes("");
    setTrades("");
  }

  function toggleDay(day: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function deleteItem(day: PublishDay, item: PublishItem) {
    const label =
      item.kind === "manual"
        ? "this manual entry"
        : item.kind === "legacy"
          ? "this legacy record"
          : `the ${item.broker_name ?? "broker"} fetch`;
    if (
      !window.confirm(
        `Delete ${label} for ${formatDate(day.date)}? The day's total will be recalculated.`,
      )
    ) {
      return;
    }
    setRowBusy(item.id);
    setError(null);
    setSuccess(null);
    try {
      if (item.kind === "broker") await userApi.deleteBrokerFetch(item.id);
      else await userApi.deleteRecord(item.id);
      if (editingDate === day.date && item.kind === "manual") cancelEdit();
      setSuccess("Deleted. The day's total was recalculated.");
      refreshHistory();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not delete this publish.",
      );
    } finally {
      setRowBusy(null);
    }
  }

  async function connectAndFetch() {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const { authorization_url } = await userApi.brokerAuthorizeUrl(selectedBroker);
      window.location.href = authorization_url;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not start the broker connection. Please try again.",
      );
      setBusy(false);
    }
  }

  function chooseBroker(key: string) {
    setError(null);
    setSuccess(null);
    router.replace(`/publish?broker=${key}`, { scroll: false });
  }

  function showManual() {
    setError(null);
    setSuccess(null);
    setMode("manual");
    router.replace("/publish", { scroll: false });
  }

  function showBroker() {
    setError(null);
    setSuccess(null);
    setMode("broker");
    router.replace(`/publish?broker=${selectedBroker}`, { scroll: false });
  }

  // A connected broker owns the day's figure, so broker mode wins.
  const effectiveMode: Mode = requested ? "broker" : mode;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <p className="eyebrow">Publish</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
          Publish your P&amp;L
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
          Type your session number in, or fetch today&apos;s realised P&amp;L from
          your broker. Broker figures are published as verified.
        </p>

        {/* Mode switch ---------------------------------------------------- */}
        <div
          role="group"
          aria-label="How to publish"
          className="mt-6 grid grid-cols-2 gap-1 rounded border border-line-strong bg-surface p-1"
        >
          <ModeButton
            active={effectiveMode === "manual"}
            title="Manual entry"
            hint="Type it yourself"
            onClick={showManual}
          />
          <ModeButton
            active={effectiveMode === "broker"}
            title="Fetch from broker"
            hint="Verified figure"
            onClick={showBroker}
          />
        </div>

        {/* Manual --------------------------------------------------------- */}
        <AnimatePresence mode="wait">
          {effectiveMode === "manual" ? (
            <motion.form
              key="manual"
              onSubmit={submitManual}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="card mt-4 p-5"
            >
              {editingDate && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-brand/20 bg-brand-soft px-4 py-3">
                  <p className="text-[12.5px] text-brand">
                    Editing the manual entry for{" "}
                    <span className="font-semibold">
                      {formatDate(editingDate)}
                    </span>
                    . Saving recalculates that day&apos;s total.
                  </p>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="btn-base btn-secondary ml-auto py-1 text-[11px]"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label
                    htmlFor="amount"
                    className="mb-1.5 block text-[12px] font-medium text-ink-soft"
                  >
                    Net P&amp;L (₹) &mdash; use a minus sign for a loss
                  </label>
                  <input
                    id="amount"
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="input-base numeric text-[15px]"
                    placeholder="-12500"
                  />
                  {amount && Number(amount) !== 0 && (
                    <p
                      className={`numeric mt-1.5 text-[13px] font-semibold ${
                        Number(amount) < 0 ? "text-loss" : "text-profit"
                      }`}
                    >
                      {formatSignedINR(Number(amount))}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="trades"
                    className="mb-1.5 block text-[12px] font-medium text-ink-soft"
                  >
                    Number of trades (optional)
                  </label>
                  <input
                    id="trades"
                    type="number"
                    min={0}
                    value={trades}
                    onChange={(e) => setTrades(e.target.value)}
                    className="input-base numeric"
                    placeholder="12"
                  />
                </div>

                <div>
                  <label
                    htmlFor="notes"
                    className="mb-1.5 block text-[12px] font-medium text-ink-soft"
                  >
                    Note (optional)
                  </label>
                  <input
                    id="notes"
                    type="text"
                    maxLength={280}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="input-base"
                    placeholder="Broke on a gap down"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="btn-base btn-primary mt-5"
              >
                {busy
                  ? editingDate
                    ? "Saving…"
                    : "Publishing…"
                  : editingDate
                    ? "Save changes"
                    : "Publish self-reported P&L"}
              </button>
            </motion.form>
          ) : (
            /* Broker ------------------------------------------------------ */
            <motion.div
              key="broker"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="card mt-4 overflow-hidden"
            >
              <div className="border-b border-line px-5 py-4">
                <h2 className="text-[14px] font-semibold text-foreground">
                  Choose your broker
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  You sign in on the broker&apos;s own page. We then read
                  today&apos;s realised P&amp;L from your positions, server-side.
                  Your broker credentials never reach this browser.
                </p>
              </div>

              <ul className="divide-y divide-line">
                {brokers.map((option) => {
                  const isSelected = option.key === selectedBroker;
                  const isLinked = option.key === selectedBroker && Boolean(linked);
                  const disabled = option.status !== "available";
                  return (
                    <li key={option.key}>
                      <button
                        type="button"
                        onClick={() => chooseBroker(option.key)}
                        disabled={disabled}
                        aria-pressed={isSelected}
                        className={`flex w-full items-start gap-3 px-5 py-3.5 text-left transition-colors ${
                          disabled
                            ? "cursor-not-allowed opacity-55"
                            : isSelected
                              ? "bg-brand-soft"
                              : "hover:bg-surface-alt"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                            isSelected ? "border-brand" : "border-line-strong"
                          }`}
                        >
                          {isSelected && (
                            <span className="h-2 w-2 rounded-full bg-brand" />
                          )}
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-semibold text-foreground">
                              {option.name}
                            </span>
                            {isLinked ? (
                              <VerifiedBadge size="sm" label="Connected" />
                            ) : disabled ? (
                              <span className="badge">Soon</span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 block text-[12px] leading-relaxed text-muted">
                            {option.detail}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="border-t border-line px-5 py-4">
                {linked ? (
                  <>
                    <div className="flex flex-wrap items-center gap-3">
                      <VerifiedBadge size="lg" />
                      <div>
                        <p className="text-[13.5px] font-semibold text-foreground">
                          {linked.broker_legal_name ?? `${brokerLabel} account`}
                        </p>
                        <p className="text-[12px] text-muted">
                          {sessionExpired
                            ? "Session expired — sign in again"
                            : linked.last_synced_at
                              ? ` · last fetched ${formatRelative(linked.last_synced_at)}`
                              : " · not fetched yet"}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3.5 text-[13px] leading-relaxed text-ink-soft">
                      Fetching replaces today&apos;s figure with the realised
                      number from your {brokerLabel} positions, and publishes it as
                      verified.
                    </p>
                    {sessionExpired ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSessionExpired(false);
                          setError(null);
                          connectAndFetch();
                        }}
                        disabled={busy || !canFetch}
                        className="btn-base btn-primary mt-4"
                      >
                        {busy ? "Connecting…" : `Reconnect ${brokerLabel}`}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={publishFromBroker}
                        disabled={busy || !canFetch}
                        className="btn-base btn-primary mt-4"
                      >
                        {busy
                          ? "Fetching from broker…"
                          : "Fetch today's realised P&L from broker"}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[13px] leading-relaxed text-ink-soft">
                      {canFetch
                        ? "Broker's login page opens next. After you sign in, we read today's realised P&L from your positions — holdings are never used."
                        : "Broker connection is unavailable right now."}
                    </p>
                    <button
                      type="button"
                      onClick={connectAndFetch}
                      disabled={busy || !canFetch}
                      className="btn-base btn-primary mt-4"
                    >
                      {busy
                        ? "Connecting…"
                        : `Connect ${chosen?.name ?? "broker"}`}
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded border border-loss/25 bg-loss-soft px-4 py-3 text-[13px] text-loss"
            >
              {error}
            </motion.p>
          )}
          {success && (
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 rounded border border-profit/25 bg-profit-soft px-4 py-3 text-[13px] text-profit"
            >
              {success}
            </motion.p>
          )}
        </AnimatePresence>

        {/* History -------------------------------------------------------- */}
        <section className="card mt-6 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">
                Publish history
              </h2>
              <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-muted">
                Newest day first. Expand a day to see every publish behind its
                total. Manual entries can be edited or deleted; broker fetches
                can be deleted.
              </p>
            </div>
            {historyTotal > 0 && (
              <span className="text-[12px] text-muted">
                {historyTotal} {historyTotal === 1 ? "day" : "days"}
              </span>
            )}
          </div>

          <div className="divide-y divide-line">
            {historyError && (
              <p className="px-5 py-4 text-[12.5px] text-loss">{historyError}</p>
            )}

            {!historyLoading && !historyError && history.length === 0 && (
              <p className="px-5 py-10 text-center text-[13px] text-muted">
                Nothing published yet. Your first publish will appear here.
              </p>
            )}

            {history.map((day) => {
              const open = expanded.has(day.date);
              return (
                <div key={day.date}>
                  <button
                    type="button"
                    onClick={() => toggleDay(day.date)}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface-alt"
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 16 16"
                      className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${
                        open ? "rotate-90" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path
                        d="M6 3l5 5-5 5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-foreground">
                          {formatDate(day.date)}
                        </span>
                        {day.is_verified ? (
                          <VerifiedBadge size="sm" label="Verified" />
                        ) : (
                          <UnverifiedBadge size="sm" />
                        )}
                        <span className="text-[11.5px] text-muted">
                          {day.items.length}{" "}
                          {day.items.length === 1 ? "publish" : "publishes"}
                        </span>
                      </span>
                      {day.broker_source && (
                        <span className="mt-0.5 block text-[11.5px] text-muted">
                          {day.broker_source}
                        </span>
                      )}
                    </span>
                    <span
                      className={`numeric text-[15px] font-semibold ${
                        day.net_pnl < 0 ? "text-loss" : "text-profit"
                      }`}
                    >
                      {formatSignedINR(day.net_pnl)}
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.ul
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="divide-y divide-line overflow-hidden border-t border-line bg-surface-alt/40"
                      >
                        {day.items.length === 0 ? (
                          <li className="px-5 py-3 text-[12px] text-muted">
                            No publishes on this day.
                          </li>
                        ) : (
                          day.items.map((item) => (
                            <li
                              key={`${item.kind}-${item.id}`}
                              className="flex flex-wrap items-center gap-2.5 px-5 py-2.5"
                            >
                              <span className="badge">
                                {item.kind === "manual"
                                  ? "Manual"
                                  : item.kind === "legacy"
                                    ? "Legacy"
                                    : item.broker_name ?? "Broker"}
                              </span>
                              <span
                                className={`numeric text-[13px] font-semibold ${
                                  item.net_pnl < 0 ? "text-loss" : "text-profit"
                                }`}
                              >
                                {formatSignedINR(item.net_pnl)}
                              </span>
                              {item.trade_count > 0 && (
                                <span className="text-[11.5px] text-muted">
                                  {item.trade_count} trades
                                </span>
                              )}
                              {item.notes && (
                                <span className="max-w-[45%] truncate text-[11.5px] italic text-muted">
                                  {item.notes}
                                </span>
                              )}
                              <span className="ml-auto flex items-center gap-3">
                                {item.can_edit && (
                                  <button
                                    type="button"
                                    onClick={() => startEdit(day, item)}
                                    className="text-[11px] font-medium text-brand hover:underline"
                                  >
                                    Edit
                                  </button>
                                )}
                                {item.can_delete && (
                                  <button
                                    type="button"
                                    onClick={() => deleteItem(day, item)}
                                    disabled={rowBusy === item.id}
                                    className="text-[11px] font-medium text-loss hover:text-loss/60 disabled:opacity-50"
                                  >
                                    {rowBusy === item.id
                                      ? "Deleting…"
                                      : "Delete"}
                                  </button>
                                )}
                              </span>
                            </li>
                          ))
                        )}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

          <div ref={historySentinel} className="h-px" aria-hidden />
          {historyLoading && (
            <p className="px-5 py-4 text-center text-[12px] text-muted">
              Loading history…
            </p>
          )}
          {historyHasMore && !historyLoading && (
            <div className="border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={() => loadHistoryPage(history.length, false)}
                className="btn-base btn-secondary w-full py-2 text-[12px]"
              >
                Load more days
              </button>
            </div>
          )}
        </section>
      </motion.div>
    </div>
  );
}

function ModeButton({
  active,
  title,
  hint,
  disabled,
  onClick,
}: {
  active: boolean;
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`rounded px-3 py-2 text-left transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : active
            ? "bg-brand-soft"
            : "hover:bg-surface-alt"
      }`}
    >
      <span
        className={`block text-[13px] font-semibold ${
          active ? "text-brand" : "text-foreground"
        }`}
      >
        {title}
      </span>
      <span className="mt-0.5 block text-[11.5px] text-muted">{hint}</span>
    </button>
  );
}
