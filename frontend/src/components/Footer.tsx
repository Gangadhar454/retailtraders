import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

const DISCLAIMER =
  "Not a SEBI registered platform. All transfers are voluntary peer-to-peer gifts. Zero funds held by platform.";

/**
 * The footer year is the only time-dependent value in the tree. Rendering it
 * at request time keeps the rest of the page statically cacheable.
 */
async function FooterYear() {
  await connection();
  return <>{new Date().getFullYear()}</>;
}

export function Footer() {
  return (
    <footer className="mt-8 border-t border-line bg-surface text-ink-soft">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6">
        {/* Top compact line: Brand + Navigation & Legal Links */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded bg-brand">
              <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                <path
                  d="M3 17.5l5.5-6 4 3.5L21 6"
                  stroke="#ffffff"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-[13.5px] font-bold tracking-tight text-foreground">
              Net<span className="text-brand">PnL</span>
            </span>
            <span className="text-line-strong" aria-hidden>
              &middot;
            </span>
            <span className="text-[12px] text-muted">
              Retail P&amp;L Transparency
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-soft">
            <Link href="/" className="transition-colors hover:text-foreground">
              Dashboard
            </Link>
            <span className="text-line-strong" aria-hidden>
              &middot;
            </span>
            <Link
              href="/leaderboard"
              className="transition-colors hover:text-foreground"
            >
              Leaderboard
            </Link>
            <span className="text-line-strong" aria-hidden>
              &middot;
            </span>
            <Link
              href="/publish"
              className="transition-colors hover:text-foreground"
            >
              Publish P&amp;L
            </Link>
            <span className="text-line-strong" aria-hidden>
              &middot;
            </span>
            <Link
              href="/terms"
              className="transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <span className="text-line-strong" aria-hidden>
              &middot;
            </span>
            <Link
              href="/privacy"
              className="transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <span className="text-line-strong" aria-hidden>
              &middot;
            </span>
            <Link
              href="/disclaimer"
              className="transition-colors hover:text-foreground"
            >
              Disclaimer
            </Link>
          </nav>
        </div>

        {/* Bottom compact line: Regulatory Disclaimer & Copyright */}
        <div className="mt-3 flex flex-col gap-1.5 border-t border-line/60 pt-2.5 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-1.5 leading-normal">
            <span className="font-semibold text-amber-700">Notice:</span>
            <span>{DISCLAIMER}</span>
          </p>

          <p className="leading-normal">
            &copy;{" "}
            <Suspense fallback={<span>2026</span>}>
              <FooterYear />
            </Suspense>{" "}
            NetPnL &middot; All rights reserved &middot; Unaffiliated with any broker &middot; IST
          </p>
        </div>
      </div>
    </footer>
  );
}
