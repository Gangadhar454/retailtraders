"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { UnverifiedBadge, VerifiedBadge } from "@/components/VerifiedBadge";
import { publicApi } from "@/lib/api";
import {
  avatarInk,
  avatarTint,
  formatDateLong,
  formatSignedINR,
  initials,
  pnlTone,
} from "@/lib/format";
import type { UserCard } from "@/lib/types";

// Module-level in-memory cache for fast, zero-delay re-hovers
const userCardCache = new Map<string, UserCard>();
const pendingCardRequests = new Map<string, Promise<UserCard>>();

export function updateUserCardCache(
  username: string,
  updater: (prev: UserCard) => UserCard,
) {
  const existing = userCardCache.get(username.toLowerCase());
  if (existing) {
    userCardCache.set(username.toLowerCase(), updater(existing));
  }
}

interface UserHoverCardProps {
  username: string;
  children: ReactNode;
  initialData?: {
    displayName?: string;
    avatarSeed?: string;
    isVerified?: boolean;
    netPnl?: number;
  };
  className?: string;
}

export function UserHoverCard({
  username,
  children,
  initialData,
  className = "inline-flex",
}: UserHoverCardProps) {
  const router = useRouter();
  const { user: authUser, isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [card, setCard] = useState<UserCard | null>(
    userCardCache.get(username.toLowerCase()) ?? null,
  );
  const [followLoading, setFollowLoading] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    placeAbove: boolean;
  }>({
    top: 0,
    left: 0,
    placeAbove: false,
  });

  const triggerRef = useRef<HTMLDivElement>(null);
  const openTimerRef = useRef<NodeJS.Timeout | null>(null);
  const closeTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchCard = useCallback(async () => {
    const key = username.toLowerCase();
    if (userCardCache.has(key)) {
      setCard(userCardCache.get(key)!);
      return;
    }
    if (pendingCardRequests.has(key)) {
      try {
        const data = await pendingCardRequests.get(key)!;
        setCard(data);
      } catch {
        // ignore
      }
      return;
    }

    const req = publicApi
      .userCard(username)
      .then((data) => {
        userCardCache.set(key, data);
        setCard(data);
        pendingCardRequests.delete(key);
        return data;
      })
      .catch((err) => {
        pendingCardRequests.delete(key);
        throw err;
      });

    pendingCardRequests.set(key, req);
  }, [username]);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const cardWidth = 310;
    const cardHeight = 270;

    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < cardHeight + 20 && rect.top > cardHeight + 20;

    const top = placeAbove
      ? Math.max(8, rect.top - cardHeight - 8)
      : Math.min(window.innerHeight - cardHeight - 8, rect.bottom + 8);

    let left = rect.left;
    if (left + cardWidth > window.innerWidth - 16) {
      left = window.innerWidth - cardWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    setCoords({ top, left, placeAbove });
  }, []);

  const handleMouseEnter = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    openTimerRef.current = setTimeout(() => {
      updatePosition();
      setIsOpen(true);
      void fetchCard();
    }, 150);
  };

  const handleMouseLeave = () => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }

    closeTimerRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 250);
  };

  // Close on Escape or scroll
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    const handleScrollOrResize = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setIsOpen(false);
        return;
      }
      updatePosition();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", handleScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", handleScrollOrResize, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", handleScrollOrResize, {
        capture: true,
      });
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      const currentPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : `/u/${username}`;
      router.push(`/login?next=${encodeURIComponent(currentPath)}`);
      return;
    }
    if (!card || followLoading || card.is_self) return;

    const previousFollow = card.is_following;
    const nextFollow = !previousFollow;
    const newCount = previousFollow
      ? Math.max(0, card.followers_count - 1)
      : card.followers_count + 1;

    // Optimistic update
    const updatedCard: UserCard = {
      ...card,
      is_following: nextFollow,
      followers_count: newCount,
    };
    setCard(updatedCard);
    userCardCache.set(username.toLowerCase(), updatedCard);
    setFollowLoading(true);

    try {
      if (nextFollow) {
        const res = await publicApi.follow(username);
        const synced = {
          ...updatedCard,
          is_following: res.is_following,
          followers_count: res.followers_count,
        };
        setCard(synced);
        userCardCache.set(username.toLowerCase(), synced);
      } else {
        const res = await publicApi.unfollow(username);
        const synced = {
          ...updatedCard,
          is_following: res.is_following,
          followers_count: res.followers_count,
        };
        setCard(synced);
        userCardCache.set(username.toLowerCase(), synced);
      }
      window.dispatchEvent(
        new CustomEvent("netpnl:follow_change", {
          detail: { username, following: nextFollow },
        }),
      );
    } catch {
      const reverted: UserCard = {
        ...card,
        is_following: previousFollow,
        followers_count: card.followers_count,
      };
      setCard(reverted);
      userCardCache.set(username.toLowerCase(), reverted);
    } finally {
      setFollowLoading(false);
    }
  };

  const seed = card?.avatar_seed || initialData?.avatarSeed || username;
  const displayName = card?.display_name || initialData?.displayName || username;
  const isVerified = card
    ? card.is_verified_publisher
    : (initialData?.isVerified ?? false);
  const totalPnl = card ? card.total_pnl : (initialData?.netPnl ?? 0);
  const tone = pnlTone(totalPnl);
  const isSelf = Boolean(
    card?.is_self ||
      (authUser &&
        authUser.username.toLowerCase() === username.toLowerCase()),
  );

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={className}
      >
        {children}
      </div>

      {mounted &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{
                  opacity: 0,
                  scale: 0.95,
                  y: coords.placeAbove ? 6 : -6,
                }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{
                  opacity: 0,
                  scale: 0.95,
                  y: coords.placeAbove ? 6 : -6,
                }}
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                style={{
                  position: "fixed",
                  top: `${coords.top}px`,
                  left: `${coords.left}px`,
                  zIndex: 99999,
                }}
                className="w-76 sm:w-80 rounded-xl border border-line-strong bg-surface p-4 shadow-2xl backdrop-blur-md"
              >
                {/* Header: Avatar, Name, and Follow Action */}
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/u/${username}`}
                    onClick={() => setIsOpen(false)}
                    className="shrink-0 transition-transform active:scale-95"
                  >
                    <span
                      className="grid h-12 w-12 place-items-center rounded-lg text-sm font-bold shadow-2xs"
                      style={{
                        background: avatarTint(seed),
                        color: avatarInk(seed),
                      }}
                    >
                      {initials(displayName)}
                    </span>
                  </Link>

                  {/* Action Button */}
                  <div>
                    {isSelf ? (
                      <span className="inline-flex items-center rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold text-muted bg-surface-alt">
                        You
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleToggleFollow}
                        disabled={followLoading}
                        className={`group inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold shadow-2xs transition-all active:scale-95 cursor-pointer select-none ${
                          card?.is_following
                            ? "border border-line bg-surface text-foreground hover:border-loss/40 hover:bg-loss-soft hover:text-loss"
                            : "bg-brand text-brand-foreground hover:bg-brand-hover"
                        }`}
                      >
                        {card?.is_following ? (
                          <>
                            <span className="group-hover:hidden">Following</span>
                            <span className="hidden group-hover:inline">
                              Unfollow
                            </span>
                          </>
                        ) : (
                          <>
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              className="h-3.5 w-3.5 stroke-current"
                            >
                              <path
                                d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <circle
                                cx="9"
                                cy="7"
                                r="4"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <line
                                x1="19"
                                y1="8"
                                x2="19"
                                y2="14"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                              <line
                                x1="22"
                                y1="11"
                                x2="16"
                                y2="11"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                            Follow
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {/* Display Name & Handle */}
                <div className="mt-2.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Link
                      href={`/u/${username}`}
                      onClick={() => setIsOpen(false)}
                      className="font-semibold text-[14.5px] text-foreground hover:text-brand transition-colors line-clamp-1"
                    >
                      {displayName}
                    </Link>
                    {isVerified ? (
                      <VerifiedBadge size="sm" label="Verified" />
                    ) : (
                      <UnverifiedBadge size="sm" />
                    )}
                  </div>
                  <p className="font-mono text-[12px] text-muted">@{username}</p>
                </div>

                {/* Bio */}
                {card?.bio ? (
                  <p className="mt-2 text-[12px] text-ink-soft leading-snug line-clamp-2">
                    {card.bio}
                  </p>
                ) : null}

                {/* Member Since Row */}
                <div className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted border-t border-line/60 pt-2.5">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    className="h-3.5 w-3.5 shrink-0 stroke-current opacity-70"
                  >
                    <rect
                      x="3"
                      y="4"
                      width="18"
                      height="18"
                      rx="2"
                      strokeWidth="1.8"
                    />
                    <line x1="16" y1="2" x2="16" y2="6" strokeWidth="1.8" />
                    <line x1="8" y1="2" x2="8" y2="6" strokeWidth="1.8" />
                    <line x1="3" y1="10" x2="21" y2="10" strokeWidth="1.8" />
                  </svg>
                  <span>
                    Member since{" "}
                    {card?.created_at
                      ? formatDateLong(card.created_at)
                      : "Recently"}
                  </span>
                </div>

                {/* Stats Highlight Box: Net PnL & Today */}
                <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-lg bg-surface-alt/70 p-2.5 border border-line/50">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Net P&L
                    </p>
                    <p
                      className={`numeric text-[15px] font-bold mt-0.5 ${
                        tone === "loss"
                          ? "text-loss"
                          : tone === "profit"
                            ? "text-profit"
                            : "text-foreground"
                      }`}
                    >
                      {formatSignedINR(totalPnl)}
                    </p>
                    {card?.trade_count ? (
                      <p className="text-[10.5px] text-muted">
                        {card.trade_count} trades
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Network
                    </p>
                    <div className="mt-0.5 text-[13px] text-foreground font-semibold">
                      <span>{card?.followers_count ?? 0}</span>{" "}
                      <span className="text-[11px] font-normal text-muted">
                        followers
                      </span>
                    </div>
                    <div className="text-[12px] text-muted">
                      <span>{card?.following_count ?? 0}</span>{" "}
                      <span className="text-[10.5px] font-normal text-muted">
                        following
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer: View Full Profile Link */}
                <div className="mt-3 pt-1">
                  <Link
                    href={`/u/${username}`}
                    onClick={() => setIsOpen(false)}
                    className="btn-base btn-secondary w-full justify-center text-[12px] py-1.5 font-medium hover:border-brand/40 hover:text-brand transition-colors"
                  >
                    <span>View Full Profile</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      className="h-3.5 w-3.5 stroke-current"
                    >
                      <path
                        d="M5 12h14M12 5l7 7-7 7"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
