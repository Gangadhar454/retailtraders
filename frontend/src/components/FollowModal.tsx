"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { UnverifiedBadge, VerifiedBadge } from "@/components/VerifiedBadge";
import { publicApi } from "@/lib/api";
import {
  avatarInk,
  avatarTint,
  formatSignedINR,
  initials,
  pnlTone,
} from "@/lib/format";
import type { FollowUser } from "@/lib/types";

interface FollowModalProps {
  open: boolean;
  onClose: () => void;
  username: string;
  initialTab?: "followers" | "following";
  followersCount: number;
  followingCount: number;
  onCountsChange?: (followers: number, following: number) => void;
}

export function FollowModal({
  open,
  onClose,
  username,
  initialTab = "followers",
  followersCount,
  followingCount,
  onCountsChange,
}: FollowModalProps) {
  const router = useRouter();
  const { user: authUser, isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"followers" | "following">(initialTab);
  const [users, setUsers] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const loadTabUsers = useCallback(async (tab: "followers" | "following") => {
    setLoading(true);
    setError(null);
    try {
      const data =
        tab === "followers"
          ? await publicApi.followers(username)
          : await publicApi.following(username);
      setUsers(data.users || []);
    } catch {
      setError(`Failed to load ${tab}. Please try again.`);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    if (open) {
      void loadTabUsers(activeTab);
    }
  }, [open, activeTab, loadTabUsers]);

  const handleToggleFollow = async (targetUser: FollowUser) => {
    if (!isAuthenticated) {
      const nextPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : `/u/${username}`;
      router.push(`/login?next=${encodeURIComponent(nextPath)}`);
      return;
    }
    if (targetUser.is_self) return;

    const uName = targetUser.username;
    const isNowFollowing = !targetUser.is_following;

    // Optimistic update
    setUsers((prev) =>
      prev.map((u) =>
        u.username.toLowerCase() === uName.toLowerCase()
          ? { ...u, is_following: isNowFollowing }
          : u,
      ),
    );
    setActionLoading((prev) => ({ ...prev, [uName]: true }));

    try {
      const res = isNowFollowing
        ? await publicApi.follow(uName)
        : await publicApi.unfollow(uName);

      // If we are looking at our own following tab and unfollowed someone, optionally update counts
      if (
        authUser &&
        authUser.username.toLowerCase() === username.toLowerCase() &&
        activeTab === "following" &&
        !isNowFollowing
      ) {
        onCountsChange?.(followersCount, Math.max(0, followingCount - 1));
      }

      window.dispatchEvent(
        new CustomEvent("netpnl:follow_change", {
          detail: {
            username: uName,
            following: isNowFollowing,
            followersCount: res.followers_count,
            source: "modal",
          },
        }),
      );
    } catch {
      // Revert on error
      setUsers((prev) =>
        prev.map((u) =>
          u.username.toLowerCase() === uName.toLowerCase()
            ? { ...u, is_following: !isNowFollowing }
            : u,
        ),
      );
    } finally {
      setActionLoading((prev) => ({ ...prev, [uName]: false }));
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: "spring", stiffness: 460, damping: 38 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4"
          >
            <div className="card shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-line px-5 py-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-[16px] font-semibold text-foreground">
                    @{username}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="rounded-lg p-1.5 text-muted hover:bg-surface-alt hover:text-foreground transition-colors cursor-pointer select-none"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                    <path
                      d="M18 6L6 18M6 6l12 12"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-line bg-surface-alt/40 px-5">
                <button
                  type="button"
                  onClick={() => setActiveTab("followers")}
                  className={`flex-1 py-3 text-[13px] font-semibold text-center border-b-2 transition-colors cursor-pointer select-none ${
                    activeTab === "followers"
                      ? "border-brand text-brand"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  Followers{" "}
                  <span className="ml-1 text-[11px] font-normal opacity-80">
                    ({followersCount})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("following")}
                  className={`flex-1 py-3 text-[13px] font-semibold text-center border-b-2 transition-colors cursor-pointer select-none ${
                    activeTab === "following"
                      ? "border-brand text-brand"
                      : "border-transparent text-muted hover:text-foreground"
                  }`}
                >
                  Following{" "}
                  <span className="ml-1 text-[11px] font-normal opacity-80">
                    ({followingCount})
                  </span>
                </button>
              </div>

              {/* User List Body */}
              <div className="flex-1 overflow-y-auto divide-y divide-line/60 p-2 sm:p-3 min-h-[220px]">
                {loading ? (
                  <div className="space-y-3 p-3">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex items-center justify-between gap-3 animate-pulse">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-surface-sunken" />
                          <div className="space-y-1.5">
                            <div className="h-3.5 w-28 rounded bg-surface-sunken" />
                            <div className="h-2.5 w-16 rounded bg-surface-sunken" />
                          </div>
                        </div>
                        <div className="h-7 w-20 rounded-full bg-surface-sunken" />
                      </div>
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-8 text-center text-[13px] text-loss">{error}</div>
                ) : users.length === 0 ? (
                  <div className="py-12 px-4 text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-alt text-muted mb-3">
                      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 stroke-current">
                        <path
                          d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle cx="9" cy="7" r="4" strokeWidth="1.8" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" strokeWidth="1.8" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" strokeWidth="1.8" />
                      </svg>
                    </div>
                    <p className="text-[14px] font-semibold text-foreground">
                      {activeTab === "followers"
                        ? "No followers yet"
                        : "Not following anyone yet"}
                    </p>
                    <p className="mt-1 text-[12px] text-muted max-w-xs mx-auto">
                      {activeTab === "followers"
                        ? "Traders who follow this profile will appear here."
                        : "Profiles followed by this trader will be listed here."}
                    </p>
                  </div>
                ) : (
                  users.map((u) => {
                    const seed = u.avatar_seed || u.username;
                    const tone = pnlTone(u.total_pnl);
                    const isSelf = Boolean(
                      u.is_self || (authUser && authUser.username.toLowerCase() === u.username.toLowerCase()),
                    );

                    return (
                      <div
                        key={u.user_id}
                        className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-surface-alt/50 transition-colors"
                      >
                        <Link
                          href={`/u/${u.username}`}
                          onClick={onClose}
                          className="flex items-center gap-3 min-w-0 flex-1"
                        >
                          <span
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-xs font-bold shadow-2xs"
                            style={{
                              background: avatarTint(seed),
                              color: avatarInk(seed),
                            }}
                          >
                            {initials(u.display_name)}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-[13.5px] text-foreground truncate hover:text-brand transition-colors">
                                {u.display_name}
                              </span>
                              {u.is_verified_publisher ? (
                                <VerifiedBadge size="sm" label="Verified" />
                              ) : (
                                <UnverifiedBadge size="sm" />
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11.5px] text-muted">
                              <span className="font-mono truncate">@{u.username}</span>
                              {u.total_pnl !== 0 && (
                                <>
                                  <span aria-hidden>&middot;</span>
                                  <span
                                    className={`numeric font-semibold ${
                                      tone === "loss" ? "text-loss" : tone === "profit" ? "text-profit" : "text-foreground"
                                    }`}
                                  >
                                    {formatSignedINR(u.total_pnl)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </Link>

                        {/* Follow Button */}
                        <div className="shrink-0">
                          {isSelf ? (
                            <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold text-muted bg-surface-alt">
                              You
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleFollow(u)}
                              disabled={actionLoading[u.username]}
                              className={`group inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11.5px] font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer select-none ${
                                u.is_following
                                  ? "border border-line bg-surface text-foreground hover:border-loss/40 hover:bg-loss-soft hover:text-loss"
                                  : "bg-brand text-brand-foreground hover:bg-brand-hover"
                              }`}
                            >
                              {u.is_following ? (
                                <>
                                  <span className="group-hover:hidden">Following</span>
                                  <span className="hidden group-hover:inline">Unfollow</span>
                                </>
                              ) : (
                                "Follow"
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
