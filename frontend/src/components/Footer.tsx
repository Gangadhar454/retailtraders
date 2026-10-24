import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

const DISCLAIMER =
  "Not a SEBI registered platform. All transfers are voluntary peer-to-peer gifts.";

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
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded bg-brand">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path
                    d="M3 17.5l5.5-6 4 3.5L21 6"
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
            </div>
            <p className="mt-3 max-w-sm text-[13px] leading-relaxed text-ink-soft">
              India&apos;s retail net P&amp;L counter. Publish your daily profit
              and loss, back it with a linked broker account, and let the
              community send you a voluntary UPI gift.
            </p>
          </div>

          <div>
            <h3 className="eyebrow">Product</h3>
            <ul className="mt-3 space-y-2 text-[13px]">
              <li>
                <Link href="/" className="link">
                  Dashboard
                </Link>
              </li>
              <li>
                <Link href="/leaderboard" className="link">
                  Hall of Pain
                </Link>
              </li>
              <li>
                <Link href="/publish" className="link">
                  Publish P&amp;L
                </Link>
              </li>
              <li>
                <Link href="/settings" className="link">
                  Settings
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="eyebrow">Legal</h3>
            <ul className="mt-3 space-y-2 text-[13px] text-ink-soft">
              <li>Zero funds held by the platform.</li>
              <li>Tips are voluntary peer-to-peer gifts.</li>
              <li>Broker data is shown exactly as reported.</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded border border-amber/25 bg-amber-soft px-4 py-3">
          <p className="flex items-start gap-2 text-[12px] leading-relaxed text-amber">
            <svg viewBox="0 0 24 24" fill="none" className="mt-px h-4 w-4 shrink-0">
              <path
                d="M12 9v4m0 3.5h.01M10.3 3.9L2.6 17.4A2 2 0 004.3 20.4h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-medium">{DISCLAIMER}</span>
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>
            &copy;{" "}
            <Suspense fallback={<span>2026</span>}>
              <FooterYear />
            </Suspense>{" "}
              NetPnL. Not affiliated with Upstox, Zerodha or any broker.
          </span>
          <span className="numeric">
            Built for retail traders &middot; Data shown in IST
          </span>
        </div>
      </div>
    </footer>
  );
}
