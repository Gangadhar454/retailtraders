"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { EditProfileModal } from "@/components/EditProfileModal";
import { HowItWorksModal } from "@/components/HowItWorksModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { avatarInk, avatarTint, initials } from "@/lib/format";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/publish", label: "Publish P&L" },
];

export function Nav() {
  const pathname = usePathname();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    if (!userMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [userMenuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="group flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded bg-brand">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M3 17.5l5.5-6 4 3.5L21 6"
                stroke="#ffffff"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M15.5 6H21v5.5"
                stroke="#ffffff"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-[15px] font-bold tracking-tight text-foreground">
            Net<span className="text-brand">PnL</span>
          </span>
          <span className="hidden sm:inline-block rounded border border-line bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-muted select-none">
            Retail Trader Community
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`relative px-3 py-4 text-[13px] font-medium transition-colors ${
                isActive(link.href)
                  ? "text-brand"
                  : "text-ink-soft hover:text-foreground"
              }`}
            >
              {link.label}
              {isActive(link.href) && (
                <motion.span
                  layoutId="nav-active"
                  className="absolute inset-x-2 bottom-0 h-0.5 bg-brand"
                />
              )}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {/* Theme toggle */}
          <ThemeToggle />

          {/* Help / How it works button */}
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            title="Help & User Manual"
            aria-label="Help & User Manual"
            className="grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-[12px] font-bold text-ink-soft transition-all hover:border-brand/40 hover:bg-brand-soft hover:text-brand cursor-pointer select-none"
          >
            ?
          </button>

          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded bg-surface-sunken" />
          ) : isAuthenticated && user ? (
            <div ref={userMenuRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setUserMenuOpen((prev) => !prev)}
                className="flex items-center gap-2 rounded-full border border-line bg-surface-alt py-1 pl-1 pr-2.5 transition-all hover:bg-surface-sunken hover:border-line-strong cursor-pointer select-none"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold shadow-2xs"
                  style={{
                    background: avatarTint(user.avatar_seed || user.username),
                    color: avatarInk(user.avatar_seed || user.username),
                  }}
                >
                  {initials(user.display_name)}
                </span>
                <span className="max-w-28 truncate text-[13px] font-medium text-foreground">
                  {user.display_name}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className={`h-3.5 w-3.5 text-muted transition-transform duration-150 ${
                    userMenuOpen ? "rotate-180" : ""
                  }`}
                >
                  <path
                    d="M6 9l6 6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -4 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-line-strong bg-surface p-1.5 shadow-xl backdrop-blur-md z-50"
                  >
                    {/* User Info Header */}
                    <div className="px-3 py-2 border-b border-line/60">
                      <p className="text-[13px] font-semibold text-foreground truncate">
                        {user.display_name}
                      </p>
                      <p className="font-mono text-[11px] text-muted truncate">
                        @{user.username}
                      </p>
                    </div>

                    <div className="py-1">
                      {/* View Profile */}
                      <Link
                        href={`/u/${user.username}`}
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-foreground hover:bg-surface-alt transition-colors"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="h-4 w-4 stroke-current text-muted"
                        >
                          <path
                            d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <circle
                            cx="12"
                            cy="7"
                            r="4"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        View Profile
                      </Link>

                      {/* Edit Profile */}
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          setEditProfileOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-foreground hover:bg-surface-alt transition-colors cursor-pointer select-none"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="h-4 w-4 stroke-current text-muted"
                        >
                          <path
                            d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Edit Profile
                      </button>

                      {/* Account Settings */}
                      <Link
                        href="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-foreground hover:bg-surface-alt transition-colors"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="h-4 w-4 stroke-current text-muted"
                        >
                          <circle cx="12" cy="12" r="3" strokeWidth="2" />
                          <path
                            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                            strokeWidth="2"
                          />
                        </svg>
                        Account Settings
                      </Link>
                    </div>

                    <div className="border-t border-line/60 pt-1">
                      {/* Sign Out */}
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          void logout();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium text-loss hover:bg-loss-soft transition-colors cursor-pointer select-none"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          className="h-4 w-4 stroke-current"
                        >
                          <path
                            d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <polyline
                            points="16 17 21 12 16 7"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <line
                            x1="21"
                            y1="12"
                            x2="9"
                            y2="12"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Sign out
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <>
              <Link href="/login" className="btn-base btn-ghost">
                Sign in
              </Link>
              <Link href="/register" className="btn-base btn-primary">
                Join free
              </Link>
            </>
          )}

          <button
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((open) => !open)}
            className="grid h-8 w-8 place-items-center rounded border border-line bg-surface text-ink-soft md:hidden cursor-pointer select-none"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.nav
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-line bg-surface md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-3">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className={`rounded px-3 py-2 text-[13px] font-medium ${
                    isActive(link.href)
                      ? "bg-brand-soft text-brand"
                      : "text-ink-soft"
                  }`}
                >
                  {link.label}
                </Link>
              ))}

              {isAuthenticated && user && (
                <div className="mt-2 border-t border-line pt-3">
                  <div className="flex items-center gap-2.5 px-3 py-2">
                    <span
                      className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-bold"
                      style={{
                        background: avatarTint(
                          user.avatar_seed || user.username,
                        ),
                        color: avatarInk(user.avatar_seed || user.username),
                      }}
                    >
                      {initials(user.display_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-foreground truncate">
                        {user.display_name}
                      </p>
                      <p className="font-mono text-[11px] text-muted truncate">
                        @{user.username}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 mt-1">
                    <Link
                      href={`/u/${user.username}`}
                      onClick={() => setMobileOpen(false)}
                      className="rounded px-3 py-2 text-[13px] font-medium text-foreground hover:bg-surface-sunken flex items-center gap-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-4 w-4 stroke-current text-muted"
                      >
                        <path
                          d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle
                          cx="12"
                          cy="7"
                          r="4"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      View Profile
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        setEditProfileOpen(true);
                      }}
                      className="rounded px-3 py-2 text-[13px] font-medium text-foreground hover:bg-surface-sunken flex items-center gap-2 text-left cursor-pointer select-none"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-4 w-4 stroke-current text-muted"
                      >
                        <path
                          d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Edit Profile
                    </button>
                    <Link
                      href="/settings"
                      onClick={() => setMobileOpen(false)}
                      className="rounded px-3 py-2 text-[13px] font-medium text-foreground hover:bg-surface-sunken flex items-center gap-2"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-4 w-4 stroke-current text-muted"
                      >
                        <circle cx="12" cy="12" r="3" strokeWidth="2" />
                        <path
                          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                          strokeWidth="2"
                        />
                      </svg>
                      Account Settings
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        void logout();
                      }}
                      className="rounded px-3 py-2 text-[13px] font-medium text-loss hover:bg-loss-soft flex items-center gap-2 text-left cursor-pointer select-none"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        className="h-4 w-4 stroke-current"
                      >
                        <path
                          d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <polyline
                          points="16 17 21 12 16 7"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <line
                          x1="21"
                          y1="12"
                          x2="9"
                          y2="12"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              )}

              {!isAuthenticated && (
                <Link
                  href="/register"
                  onClick={() => setMobileOpen(false)}
                  className="btn-base btn-primary mt-2"
                >
                  Join free
                </Link>
              )}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      <HowItWorksModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <EditProfileModal
        open={editProfileOpen}
        onClose={() => setEditProfileOpen(false)}
      />
    </header>
  );
}
