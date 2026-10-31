"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";

import { adminApi, getAdminToken, setAdminToken, clearAdminToken, type AdminMetrics, type BurstTrade } from "@/lib/api";
import { formatRelative, formatSignedINR } from "@/lib/format";


export default function AdminPage() {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"daily" | "cumulative">("daily");

  const [burstCount, setBurstCount] = useState<number>(5);
  const [bursting, setBursting] = useState(false);
  const [burstError, setBurstError] = useState<string | null>(null);
  const [burstResult, setBurstResult] = useState<BurstTrade[] | null>(null);

  const [toggling, setToggling] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);

  useEffect(() => {
    const saved = getAdminToken();
    if (saved) {
      setToken(saved);
    }
    setLoading(false);

    const handleAuthChange = () => {
      const currentToken = getAdminToken();
      setToken(currentToken);
      if (!currentToken) {
        setMetrics(null);
        setBurstResult(null);
      }
    };
    window.addEventListener("netpnl:auth_change", handleAuthChange);
    window.addEventListener("storage", handleAuthChange);
    return () => {
      window.removeEventListener("netpnl:auth_change", handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  const loadMetrics = useCallback(async (authToken: string) => {
    setMetricsLoading(true);
    try {
      const data = await adminApi.metrics(authToken);
      setMetrics(data);
    } catch {
      clearAdminToken();
      setToken(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      void loadMetrics(token);
    }
  }, [token, loadMetrics]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    if (!usernameInput || !passwordInput) return;
    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await adminApi.login(usernameInput, passwordInput);
      setAdminToken(res.access_token);
      setToken(res.access_token);
      setPasswordInput("");
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : "Invalid admin username or password.");
    } finally {
      setLoginBusy(false);
    }
  }

  function handleLogout() {
    clearAdminToken();
    setToken(null);
    setMetrics(null);
    setBurstResult(null);
  }

  async function handleBurst(count: number) {
    if (!token) return;
    setBursting(true);
    setBurstError(null);
    try {
      const res = await adminApi.burst(token, count);
      setBurstResult(res.trades);
      setMetrics(res.metrics);
    } catch (err: unknown) {
      setBurstError(err instanceof Error ? err.message : "Burst request failed.");
    } finally {
      setBursting(false);
    }
  }

  async function handleToggleSimulation() {
    if (!token || !metrics) return;
    setToggling(true);
    try {
      const nextState = !metrics.simulation_enabled;
      await adminApi.toggleSimulation(token, nextState);
      setMetrics((prev) => (prev ? { ...prev, simulation_enabled: nextState } : null));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not toggle simulation.");
    } finally {
      setToggling(false);
    }
  }

  async function handlePurge() {
    if (!token) return;
    setPurging(true);
    try {
      const res = await adminApi.purgeSimulation(token, true);
      setMetrics(res.metrics);
      setPurgeMessage(
        `Purged successfully: ${res.result.deleted_records} simulated records and ${res.result.deleted_users} simulated users removed.`
      );
      setPurgeOpen(false);
      setBurstResult(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Purge failed.");
    } finally {
      setPurging(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20 text-center">
        <div className="card h-48 animate-pulse" />
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // LOGIN SCREEN
  // --------------------------------------------------------------------------
  if (!token) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 sm:py-24">
        <div className="card p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-alt border border-line text-xs font-bold text-foreground">
              ⚡
            </span>
            <div>
              <p className="eyebrow text-[10px]">Restricted Area</p>
              <h1 className="text-lg font-bold text-foreground">Admin Console</h1>
            </div>
          </div>

          <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
            Sign in with the administrator credentials configured in your server&apos;s{" "}
            <code className="rounded bg-surface-alt px-1.5 py-0.5 font-mono text-xs">.env</code> file.
          </p>

          {loginError && (
            <div className="mt-4 rounded-md border border-loss/30 bg-loss-soft p-3 text-[12.5px] text-loss">
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-foreground">
                Admin Username
              </label>
              <input
                type="text"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="e.g. admin"
                required
                className="input-base mt-1 w-full"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground">
                Admin Password
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="••••••••••••"
                required
                className="input-base mt-1 w-full"
              />
            </div>

            <button
              type="submit"
              disabled={loginBusy}
              className="btn-base btn-primary w-full justify-center py-2.5 text-sm font-semibold"
            >
              {loginBusy ? "Authenticating..." : "Sign in to Admin Console"}
            </button>
          </form>

          <div className="mt-6 border-t border-line pt-4 text-center">
            <Link href="/" className="text-xs text-muted hover:text-foreground">
              ← Back to public dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // AUTHENTICATED DASHBOARD
  // --------------------------------------------------------------------------
  const currentMetrics = metrics ? (activeTab === "daily" ? metrics.daily : metrics.cumulative) : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              RetailTraders Admin Console
            </h1>
            {metrics && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${
                  metrics.simulation_enabled
                    ? "border-profit/30 bg-profit-soft text-profit"
                    : "border-line bg-surface-alt text-muted"
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    metrics.simulation_enabled ? "bg-profit animate-pulse" : "bg-muted"
                  }`}
                />
                {metrics.simulation_enabled ? "Engine Active" : "Engine Paused"}
              </span>
            )}
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            Live telemetry &middot; Market Hours:{" "}
            <span className="font-semibold text-foreground">
              {metrics?.is_market_open ? "🟢 Open (09:15 - 15:45 IST)" : "⚪ Closed (IST)"}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => token && loadMetrics(token)}
            disabled={metricsLoading}
            className="btn-base btn-secondary text-xs px-3 py-1.5"
            title="Refresh metrics"
          >
            {metricsLoading ? "Refreshing..." : "↻ Refresh"}
          </button>

          <button
            type="button"
            onClick={handleToggleSimulation}
            disabled={toggling}
            className={`btn-base text-xs px-3 py-1.5 font-medium border ${
              metrics?.simulation_enabled
                ? "border-amber/40 bg-amber-soft text-amber-950 hover:bg-amber-soft/80"
                : "border-profit/40 bg-profit-soft text-profit hover:bg-profit-soft/80"
            }`}
          >
            {toggling
              ? "Updating..."
              : metrics?.simulation_enabled
              ? "⏸️ Pause Engine"
              : "▶️ Resume Engine"}
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="btn-base btn-secondary text-xs px-3 py-1.5 text-loss hover:bg-loss-soft"
          >
            Sign out
          </button>
        </div>
      </header>

      {purgeMessage && (
        <div className="mt-4 rounded-lg border border-line bg-surface p-3 text-xs text-ink-soft">
          {purgeMessage}
        </div>
      )}

      {/* Tabs: Daily vs Cumulative */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-line bg-surface p-1">
          <button
            type="button"
            onClick={() => setActiveTab("daily")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "daily"
                ? "bg-surface-alt text-foreground shadow-xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            ☀️ Today ({metrics?.date ?? "Today"})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("cumulative")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition ${
              activeTab === "cumulative"
                ? "bg-surface-alt text-foreground shadow-xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            🌐 Total All-Time Cumulative
          </button>
        </div>

        <p className="text-[11.5px] text-muted">
          Showing {activeTab === "daily" ? "today's activity breakdown" : "platform totals since inception"}
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Users */}
        <div className="card p-4 space-y-1">
          <span className="eyebrow text-[10px]">Total Platform Users</span>
          <div className="text-2xl font-bold text-foreground">
            {currentMetrics?.total_users ?? "—"}
          </div>
          <p className="text-[11px] text-muted">
            {activeTab === "daily"
              ? `+${metrics?.daily.new_real_users ?? 0} new real signups today`
              : `${metrics?.cumulative.total_real_users ?? 0} Real · ${
                  metrics?.cumulative.total_simulated_users ?? 0
                } Simulated (Cohort)`}
          </p>
        </div>

        {/* Card 2: Real Users */}
        <div className="card p-4 space-y-1 border-l-4 border-l-brand">
          <span className="eyebrow text-[10px]">Real Organic Users</span>
          <div className="text-2xl font-bold text-foreground">
            {activeTab === "daily"
              ? `+${metrics?.daily.new_real_users ?? 0}`
              : metrics?.cumulative.total_real_users ?? "—"}
          </div>
          <p className="text-[11px] text-muted">
            {activeTab === "daily"
              ? "New verified accounts registered today"
              : "Total genuine human registered traders"}
          </p>
        </div>

        {/* Card 3: Real Postings (Highlighted) */}
        <div className="card p-4 space-y-1 border-l-4 border-l-profit bg-profit-soft/20 sm:col-span-2 lg:col-span-2">
          <div className="flex items-center justify-between">
            <span className="eyebrow text-[10px] text-profit font-bold">
              Real User Postings ({activeTab === "daily" ? "Today" : "All-Time"})
            </span>
            <span className="badge font-mono text-[10.5px]">
              {currentMetrics && currentMetrics.total_posts > 0
                ? `${Math.round((currentMetrics.real_posts / currentMetrics.total_posts) * 100)}% of total`
                : "0%"}
            </span>
          </div>

          <div className="text-2xl font-bold text-foreground">
            {currentMetrics?.real_posts ?? 0}
          </div>

          {/* Sub-breakdown: Manual vs Verified */}
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-2 text-xs">
            <div className="rounded border border-line bg-surface/80 p-2">
              <span className="text-muted block text-[10.5px]">✍️ Manual Postings</span>
              <span className="numeric text-sm font-semibold text-foreground">
                {currentMetrics?.real_manual_posts ?? 0}
              </span>
            </div>
            <div className="rounded border border-line bg-surface/80 p-2">
              <span className="text-muted block text-[10.5px]">🛡️ Verified Postings</span>
              <span className="numeric text-sm font-semibold text-profit">
                {currentMetrics?.real_verified_posts ?? 0}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Simulated Cohort Posts */}
        <div className="card p-4 space-y-1">
          <span className="eyebrow text-[10px]">Simulated Cohort Posts</span>
          <div className="text-2xl font-bold text-foreground">
            {currentMetrics?.simulated_posts ?? 0}
          </div>
          <p className="text-[11px] text-muted">
            {activeTab === "daily"
              ? "Entries published by 130-cohort today"
              : "All-time simulation records"}
          </p>
        </div>

        {/* Card 5: Total Overall Posts */}
        <div className="card p-4 space-y-1">
          <span className="eyebrow text-[10px]">Total Overall Posts</span>
          <div className="text-2xl font-bold text-foreground">
            {currentMetrics?.total_posts ?? 0}
          </div>
          <p className="text-[11px] text-muted">
            Real + Simulated visible across live tape &amp; leaderboard
          </p>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* INSTANT BURST ENGINE SECTION */}
      {/* -------------------------------------------------------------------- */}
      <section className="mt-8 card p-5 sm:p-6 border-brand/30 bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded bg-brand/10 text-xs font-bold text-brand">
                ⚡
              </span>
              <h2 className="text-base font-bold text-foreground">
                Instant Burst Engine (Social Media Pre-Drop)
              </h2>
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft max-w-2xl">
              Publish realistic sessions from the 130 persistent cohort right now so the Live Tape
              and leaderboard are freshly updated before you drop links on Reddit or Twitter.
            </p>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5">
            {[3, 5, 10, 20].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => setBurstCount(num)}
                className={`rounded border px-2.5 py-1 text-xs font-medium transition ${
                  burstCount === num
                    ? "border-brand bg-brand-soft text-brand font-bold"
                    : "border-line bg-surface-alt text-muted hover:text-foreground"
                }`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>

        {burstError && (
          <div className="mt-3 rounded-md border border-loss/30 bg-loss-soft p-2.5 text-xs text-loss">
            {burstError}
          </div>
        )}

        {/* Action Row */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-foreground">
              Number of traders to burst:
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={burstCount}
              onChange={(e) => setBurstCount(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
              className="input-base h-9 w-20 text-center font-bold text-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => handleBurst(burstCount)}
            disabled={bursting}
            className="btn-base btn-primary px-4 py-2 text-xs font-semibold shadow-sm active:scale-95"
          >
            {bursting ? "Triggering Burst..." : `🚀 Trigger Burst (${burstCount} Traders)`}
          </button>
        </div>

        {/* Burst Results Drawer */}
        <AnimatePresence>
          {burstResult && burstResult.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-5 rounded-lg border border-line bg-surface-alt/70 p-4"
            >
              <div className="flex items-center justify-between border-b border-line pb-2">
                <span className="text-xs font-semibold text-foreground">
                  🎉 Freshly Published ({burstResult.length} traders):
                </span>
                <span className="text-[11px] text-muted">
                  Visible live on{" "}
                  <Link href="/" target="_blank" className="underline font-semibold text-brand">
                    retailtraders.in
                  </Link>
                </span>
              </div>

              <div className="mt-2 divide-y divide-line/60">
                {burstResult.map((trade) => (
                  <div
                    key={trade.record_id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {trade.display_name}
                      </span>
                      <span className="text-muted">@{trade.username}</span>
                      <span className="badge text-[10px]">
                        {trade.trade_count} trades
                      </span>
                      {trade.is_update && (
                        <span className="inline-flex items-center gap-1 rounded border border-line bg-surface-alt px-1.5 py-0.5 text-[10px] font-medium text-ink-soft">
                          🔄 Update
                        </span>
                      )}
                      {trade.is_verified ? (
                        <span className="inline-flex items-center gap-1 rounded border border-brand/30 bg-brand-soft px-1.5 py-0.5 text-[10px] font-semibold text-brand">
                          🛡️ Verified ({trade.broker_source ?? "Broker"})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted">
                          ✍️ Self-reported
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-muted italic hidden md:inline max-w-sm truncate text-[11px]">
                        {trade.notes ? `“${trade.notes}”` : ""}
                      </span>
                      <span
                        className={`numeric font-bold text-xs ${
                          trade.net_pnl < 0 ? "text-loss" : "text-profit"
                        }`}
                      >
                        {formatSignedINR(trade.net_pnl)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/* DANGER ZONE / CLEANUP */}
      {/* -------------------------------------------------------------------- */}
      <section className="mt-8 card p-5 border-loss/20 bg-loss-soft/10">
        <h2 className="text-sm font-semibold text-loss">Danger Zone</h2>
        <p className="mt-1 text-xs text-muted">
          Purge all 130 simulated users and all their historical trading posts. Real user accounts and real posts are strictly preserved.
        </p>

        {!purgeOpen ? (
          <button
            type="button"
            onClick={() => setPurgeOpen(true)}
            className="mt-3 btn-base btn-secondary text-xs text-loss border-loss/30 hover:bg-loss-soft"
          >
            Purge Simulated Data...
          </button>
        ) : (
          <div className="mt-3 rounded border border-loss/40 bg-surface p-3 space-y-2">
            <p className="text-xs font-semibold text-loss">
              ⚠️ Are you sure? This will permanently delete simulated entries.
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePurge}
                disabled={purging}
                className="btn-base bg-loss text-white text-xs px-3 py-1.5 font-bold"
              >
                {purging ? "Purging..." : "Yes, Purge Simulated Data Now"}
              </button>
              <button
                type="button"
                onClick={() => setPurgeOpen(false)}
                className="btn-base btn-secondary text-xs px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

