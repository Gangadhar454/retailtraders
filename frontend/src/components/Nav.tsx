"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

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

        <div className="ml-auto flex items-center gap-2.5">
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded bg-surface-sunken" />
          ) : isAuthenticated && user ? (
            <>
              <Link
                href="/settings"
                className="hidden items-center gap-2 rounded border border-line bg-surface-alt px-2 py-1 transition-colors hover:bg-surface-sunken sm:flex"
              >
                <span
                  className="grid h-6 w-6 place-items-center rounded text-[10px] font-bold"
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
              </Link>
              <button
                type="button"
                onClick={() => void logout()}
                className="btn-base btn-ghost hidden sm:inline-flex"
              >
                Sign out
              </button>
            </>
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
            className="grid h-8 w-8 place-items-center rounded border border-line bg-surface text-ink-soft md:hidden"
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
    </header>
  );
}
