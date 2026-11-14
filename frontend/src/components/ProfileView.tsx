"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";

import { AnimatedNumber } from "@/components/AnimatedNumber";
import { useAuth } from "@/components/AuthProvider";
import { ExportModal } from "@/components/ExportModal";
import { FollowModal } from "@/components/FollowModal";
import { PostReactions } from "@/components/PostReactions";
import { UnverifiedBadge, VerifiedBadge } from "@/components/VerifiedBadge";
import { UpiQr } from "@/components/UpiQr";
import { publicApi } from "@/lib/api";
import { usePolling } from "@/lib/hooks";
import {
  avatarInk,
  avatarTint,
  formatDateLong,
  formatINR,
  formatPercent,
  formatSignedINR,
  initials,
  pnlTone,
} from "@/lib/format";
import type { UserProfile } from "@/lib/types";

const PerformanceOrb = dynamic(() => import("@/components/three/PerformanceOrb"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center rounded bg-surface-alt text-[12px] text-muted">
      Loading 3D view…
    </div>
  ),
});

function toneClass(tone: "profit" | "loss" | "flat" | "neutral"): string {
  if (tone === "profit") return "text-profit";
  if (tone === "loss") return "text-loss";
  if (tone === "flat") return "text-muted";
  return "text-foreground";
}

function StatCell({
  label,
  value,
  tone = "neutral",
  hint,
  badge,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "profit" | "loss" | "flat";
  hint?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
          {label}
        </p>
        {badge}
      </div>
      <p className={`numeric mt-1 text-[15px] font-semibold ${toneClass(tone)}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function ProfileView({ username }: { username: string }) {
  const router = useRouter();
  const { user: authUser, isAuthenticated } = useAuth();
  const [exportOpen, setExportOpen] = useState(false);
  const [followModalOpen, setFollowModalOpen] = useState(false);
  const [followModalTab, setFollowModalTab] = useState<"followers" | "following">("followers");
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  const load = useCallback(() => publicApi.profile(username), [username]);
  const { data, loading, error } = usePolling<UserProfile>(load, 15_000, true, username);

  useEffect(() => {
    if (data) {
      setFollowersCount(data.followers_count ?? 0);
      setFollowingCount(data.following_count ?? 0);
      setIsFollowing(Boolean(data.is_following));
    }
  }, [data]);

  useEffect(() => {
    const handleFollowChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ username: string; following: boolean }>;
      if (customEvent.detail?.username?.toLowerCase() === username.toLowerCase()) {
        setIsFollowing(customEvent.detail.following);
        setFollowersCount((prev) =>
          customEvent.detail.following ? prev + 1 : Math.max(0, prev - 1),
        );
      }
    };
    window.addEventListener("netpnl:follow_change", handleFollowChange);
    return () => window.removeEventListener("netpnl:follow_change", handleFollowChange);
  }, [username]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <div className="card h-36 animate-pulse" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="card h-80 animate-pulse lg:col-span-2" />
          <div className="card h-80 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <h1 className="text-xl font-semibold text-foreground">Trader not found</h1>
        <p className="mt-2 text-[13px] text-ink-soft">
          {error ?? `No trader with the handle @${username}.`}
        </p>
        <Link href="/" className="btn-base btn-secondary mt-6">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  const { user, stats, timeline, today, upi } = data;
  const tone = pnlTone(today?.net_pnl ?? stats.total_pnl);
  const winDays = stats.win_days ?? timeline.filter((p) => p.net_pnl > 0).length;
  const lossDays = stats.loss_days ?? timeline.filter((p) => p.net_pnl < 0).length;

  function scrollToTip() {
    document.getElementById("tip-box")?.scrollIntoView({ behavior: "smooth" });
  }

  const isSelf = Boolean(
    authUser && authUser.username.toLowerCase() === username.toLowerCase(),
  );

  const handleToggleFollow = async () => {
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(`/u/${username}`)}`);
      return;
    }
    if (isSelf || followLoading) return;

    const nextFollow = !isFollowing;
    setIsFollowing(nextFollow);
    setFollowersCount((prev) => (nextFollow ? prev + 1 : Math.max(0, prev - 1)));
    setFollowLoading(true);

    try {
      if (nextFollow) {
        const res = await publicApi.follow(username);
        setIsFollowing(res.is_following);
        setFollowersCount(res.followers_count);
      } else {
        const res = await publicApi.unfollow(username);
        setIsFollowing(res.is_following);
        setFollowersCount(res.followers_count);
      }
      window.dispatchEvent(
        new CustomEvent("netpnl:follow_change", {
          detail: { username, following: nextFollow },
        }),
      );
    } catch {
      setIsFollowing(!nextFollow);
      setFollowersCount((prev) => (!nextFollow ? prev + 1 : Math.max(0, prev - 1)));
    } finally {
      setFollowLoading(false);
    }
  };

  const seed = user.avatar_seed || user.username;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header ---------------------------------------------------------- */}
      <motion.header
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="card p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start gap-5">
          <span
            className="grid h-16 w-16 shrink-0 place-items-center rounded-lg text-xl font-semibold"
            style={{ background: avatarTint(seed), color: avatarInk(seed) }}
          >
            {initials(user.display_name)}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {user.display_name}
              </h1>
              {data.linked_broker ? (
                <VerifiedBadge label="Broker linked" />
              ) : (
                <UnverifiedBadge />
              )}
            </div>

            <p className="mt-1 text-[13px] text-ink-soft">
              @{user.username} &middot; member since{" "}
              {formatDateLong(user.created_at)}
            </p>

            {/* Followers & Following Counts */}
            <div className="mt-2 flex items-center gap-3 text-[13px]">
              <button
                type="button"
                onClick={() => {
                  setFollowModalTab("followers");
                  setFollowModalOpen(true);
                }}
                className="group inline-flex items-center gap-1.5 font-medium text-foreground hover:text-brand transition-colors cursor-pointer select-none"
              >
                <span className="font-bold">{followersCount}</span>
                <span className="text-muted group-hover:text-brand transition-colors">followers</span>
              </button>
              <span className="text-muted opacity-60" aria-hidden>&middot;</span>
              <button
                type="button"
                onClick={() => {
                  setFollowModalTab("following");
                  setFollowModalOpen(true);
                }}
                className="group inline-flex items-center gap-1.5 font-medium text-foreground hover:text-brand transition-colors cursor-pointer select-none"
              >
                <span className="font-bold">{followingCount}</span>
                <span className="text-muted group-hover:text-brand transition-colors">following</span>
              </button>
            </div>

            {user.bio && (
              <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-ink-soft">
                {user.bio}
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="eyebrow">Today</p>
            <AnimatedNumber
              value={today?.net_pnl ?? 0}
              signed
              className={`text-2xl font-semibold sm:text-3xl ${toneClass(tone)}`}
            />
            {today?.trade_count ? (
              <p className="numeric mt-0.5 text-[12px] text-muted">
                {today.trade_count} trades
              </p>
            ) : null}
            {today?.record_id && (
              <div className="mt-2 flex justify-end">
                <PostReactions
                  recordId={today.record_id}
                  initialReactions={today.reactions ?? {}}
                  initialUserReactions={today.user_reactions ?? []}
                />
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
          {!isSelf && (
            <button
              type="button"
              onClick={handleToggleFollow}
              disabled={followLoading}
              className={`btn-base group cursor-pointer select-none ${
                isFollowing
                  ? "btn-secondary hover:border-loss/40 hover:bg-loss-soft hover:text-loss"
                  : "btn-primary"
              }`}
            >
              {isFollowing ? (
                <>
                  <span className="group-hover:hidden">Following</span>
                  <span className="hidden group-hover:inline">Unfollow</span>
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 stroke-current">
                    <path
                      d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="9" cy="7" r="4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="19" y1="8" x2="19" y2="14" strokeWidth="2" strokeLinecap="round" />
                    <line x1="22" y1="11" x2="16" y2="11" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Follow
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setExportOpen(true)}
            className="btn-base btn-secondary"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Share my card
          </button>

          {upi.can_tip && (
            <button type="button" onClick={scrollToTip} className="btn-base btn-primary">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                <path
                  d="M12 21s-7-4.6-7-10a7 7 0 1114 0c0 5.4-7 10-7 10z"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="11" r="2.4" stroke="currentColor" strokeWidth="1.9" />
              </svg>
              Send a tip
            </button>
          )}
        </div>
      </motion.header>

      {/* Stats ----------------------------------------------------------- */}
      <section className="card mt-4 overflow-hidden">
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-5">
          <StatCell
            label="Total P&L"
            value={formatSignedINR(stats.total_pnl)}
            tone={pnlTone(stats.total_pnl)}
            hint={`${stats.total_records} sessions`}
          />
          <StatCell
            label="Verified P&L"
            value={formatSignedINR(stats.verified_pnl ?? 0)}
            tone={pnlTone(stats.verified_pnl ?? 0)}
            hint={`${stats.verified_records ?? 0} verified`}
            badge={
              <span className="inline-flex items-center rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                Broker
              </span>
            }
          />
          <StatCell
            label="Best day"
            value={formatINR(stats.best_day)}
            tone={stats.best_day > 0 ? "profit" : "neutral"}
          />
          <StatCell
            label="Worst day"
            value={formatINR(stats.worst_day)}
            tone={stats.worst_day < 0 ? "loss" : "neutral"}
          />
          <StatCell
            label="Win rate"
            value={formatPercent(stats.win_rate)}
            hint={`${winDays} ${winDays === 1 ? "win" : "wins"} · ${lossDays} ${lossDays === 1 ? "loss" : "losses"}`}
          />
        </div>
      </section>

      {/* 3D + QR --------------------------------------------------------- */}
      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-foreground">
              Performance map
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-profit" /> equity
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-loss" /> drawdown
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-muted" /> peak
              </span>
            </div>
          </div>

          <div className="mt-2 h-[340px] sm:h-[420px]">
            <PerformanceOrb timeline={timeline} stats={stats} className="h-full w-full" />
          </div>

          <p className="text-center text-[11px] text-muted">
            Height is cumulative P&amp;L, depth is distance below the
            high-water mark. Drag the model to inspect it.
          </p>
        </div>

        <div className="space-y-4">
          {/* Tip box */}
          <div id="tip-box" className="card p-5">
            <h2 className="text-[15px] font-semibold text-foreground">Send a tip</h2>

            {upi.can_tip && upi.upi_id ? (
              <div className="mt-4">
                <UpiQr
                  upiId={upi.upi_id}
                  payeeName={upi.resolved_name}
                  canTip={upi.can_tip}
                  size={200}
                />
              </div>
            ) : (
              <div className="mt-3 rounded border border-line bg-surface-alt px-4 py-6 text-center">
                <p className="text-[13px] font-medium text-foreground">
                  Tipping isn&apos;t enabled
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                  This trader hasn&apos;t completed UPI name verification yet,
                  so no payment details are published.
                </p>
              </div>
            )}
          </div>

          {/* Session log */}
          <div className="card p-5">
            <h2 className="text-[15px] font-semibold text-foreground">
              Recent sessions
            </h2>
            <div className="mt-3 max-h-64 divide-y divide-line overflow-y-auto">
              {[...timeline]
                .reverse()
                .slice(0, 40)
                .map((point) => (
                  <div
                    key={point.date}
                    className="row-hover flex items-center gap-2.5 px-1 py-2"
                  >
                    <span className="numeric text-[12px] text-muted">
                      {formatDateLong(point.date).slice(0, 6)}
                    </span>
                    {point.is_verified ? (
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-3.5 w-3.5 shrink-0 text-brand"
                      >
                        <path
                          d="M12 2.5l7.5 3v5.6c0 4.7-3.2 8.6-7.5 10.4-4.3-1.8-7.5-5.7-7.5-10.4V5.5l7.5-3z"
                          fill="rgba(56,126,209,0.12)"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8.6 12l2.4 2.4 4.4-4.8"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-dashed border-line-strong" />
                    )}
                    <span
                      className={`numeric ml-auto text-[13px] font-semibold ${
                        point.net_pnl < 0 ? "text-loss" : "text-profit"
                      }`}
                    >
                      {formatSignedINR(point.net_pnl)}
                    </span>
                  </div>
                ))}
              {timeline.length === 0 && (
                <p className="py-6 text-center text-[13px] text-muted">
                  No sessions published yet.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <ExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        user={user}
        netPnl={today?.net_pnl ?? stats.total_pnl}
        isVerified={Boolean(today?.is_verified)}
        upi={upi}
        tradeCount={today?.trade_count ?? 0}
      />

      <FollowModal
        open={followModalOpen}
        onClose={() => setFollowModalOpen(false)}
        username={user.username}
        initialTab={followModalTab}
        followersCount={followersCount}
        followingCount={followingCount}
        onCountsChange={(newFollowers, newFollowing) => {
          setFollowersCount(newFollowers);
          setFollowingCount(newFollowing);
        }}
      />
    </div>
  );
}
