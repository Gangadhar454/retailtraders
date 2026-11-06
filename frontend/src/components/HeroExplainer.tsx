"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

interface HeroExplainerProps {
  onOpenHelp?: () => void;
}

const STORAGE_KEY = "netpnl_top_strip_dismissed";

interface BrokerItem {
  id: string;
  name: string;
  subtext: string;
  status: "live" | "coming_soon";
  badgeText: string;
  href: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}

function UpstoxOfficialIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 150 150" fill="none" className={className} aria-label="Upstox logo">
      <rect width="150" height="150" rx="32" fill="#5B2D91" />
      <g fill="#ffffff">
        <path d="M111.54 46.43c0-13.16 0-26.32 0-39.48 0-1.4.47-2.57 1.46-3.53 1.42-1.39 3.66-1.38 5.39-.58 2.06.96 2.78 2.97 2.65 5.11-.3 27.23.62 54.52-.39 81.71-.2 2.17-.66 4.29-1.23 6.39-4.48 17.24-19.27 31.39-36.94 34.31-24 4.2-47.79-12.37-52.56-36.18-1.92-12.02-.51-24.36-.92-36.49-.16-4.37 1.19-8.74 3.81-12.24 7.54-10.35 24.26-10.42 31.91-.14 2.68 3.49 4.26 7.85 4.21 12.27 0 8.27 0 16.55 0 24.82-.06 3.01 2.06 5.76 5.04 6.26 4 .86 7.52-2.69 7.28-6.64.01-11.94.01-23.88 0-35.82-.17-3.74 4.17-6.22 7.29-4.16 1.92 1.11 2.34 3.25 2.22 5.32 0 11.49 0 22.99 0 34.48.16 7.89-5.97 15.46-13.94 16.24-8.99 1.21-17.61-6.62-17.35-15.68 0-8.07 0-16.14 0-24.21.08-2.59-.55-5.2-2.18-7.26-3.05-4.16-9.16-5.37-13.61-2.8-3.26 1.77-5.17 5.01-5.19 8.72 0 9.29-.01 18.58 0 27.88.4 33.53 41.85 49.47 63.91 23.72 4.56-5.27 7.6-11.84 8.67-18.73 1.2-14.36.18-28.86.51-43.27z" />
        <path d="M98.4 24.16c3.06-1.52 7.01.88 6.78 4.36 0 18.66 0 37.31 0 55.97 0 2.92-.49 5.77-1.37 8.55-5.67 18.93-29.19 27.47-45.54 16.24-8.63-5.79-13.88-16.02-13.8-26.38 0-8.38 0-16.77 0-25.15 0-1.39.44-2.61 1.44-3.6 2.67-2.8 7.97-.93 8.06 3.01.06 8.73 0 17.47.02 26.21-.06 8.58 5.39 16.94 13.42 20.08 9.63 3.99 21.61-.72 26.09-10.09.83-1.7 1.45-3.47 1.81-5.33 1.03-19.78.05-39.72.38-59.54 0-1.92.93-3.53 2.73-4.32z" />
      </g>
    </svg>
  );
}

function AngelOneOfficialIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 58 55" fill="none" className={className} aria-label="Angel One logo">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.7866 8.68398C20.6349 8.93915 20.6349 9.25349 20.7866 9.50866L46.8693 53.1389C47.0135 53.383 47.2761 53.5309 47.5609 53.5309H56.3069C56.9318 53.5309 57.3164 52.8504 56.9984 52.3142L26.2154 0.810714C26.0527 0.537054 25.657 0.537054 25.4943 0.810714L20.7866 8.68398Z"
        fill="#11AF4B"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.487 18H24.8914C25.2021 18 25.3944 18.3365 25.239 18.6028L23.035 22.4192L20.8346 26.2357C20.6793 26.5019 20.2947 26.5019 20.1393 26.2357L17.9353 22.4192L15.7312 18.6028C15.5759 18.3365 15.7682 18 16.0788 18H20.487Z"
        fill="#FF7300"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.2285 26.8481H19.6329C19.9435 26.8481 20.1358 27.1847 19.9805 27.4509L17.7765 31.2674L15.5724 35.0838C15.4171 35.3501 15.0325 35.3501 14.8771 35.0838L12.6731 31.2674L10.469 27.4509C10.3137 27.1847 10.506 26.8481 10.8166 26.8481H15.2285Z"
        fill="#FF7300"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.93256 35.835H14.337C14.6476 35.835 14.8399 36.1715 14.6846 36.4378L12.4806 40.2542L10.2765 44.0706C10.1212 44.3369 9.73656 44.3369 9.58124 44.0706L7.37717 40.2542L5.1731 36.4378C5.01778 36.1715 5.21008 35.835 5.52072 35.835H9.93256Z"
        fill="#FF7300"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4.8107 45.0605H9.21515C9.52579 45.0605 9.71809 45.3971 9.56277 45.6633L7.3587 49.4798L5.15463 53.2962C4.99931 53.5625 4.6147 53.5625 4.45938 53.2962L2.25901 49.4798L0.0549384 45.6633C-0.100382 45.3971 0.0919194 45.0605 0.40256 45.0605H4.8107Z"
        fill="#FF7300"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M15.2617 45.0605H19.6661C19.9767 45.0605 20.1691 45.3971 20.0137 45.6633L17.8097 49.4798L15.6056 53.2962C15.4503 53.5625 15.0657 53.5625 14.9103 53.2962L12.7063 49.4798L10.5022 45.6633C10.3469 45.3971 10.5392 45.0605 10.8498 45.0605H15.2617Z"
        fill="#FF7300"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M25.8527 45.0605H30.2571C30.5678 45.0605 30.7601 45.3971 30.6048 45.6633L28.4007 49.4798L26.1966 53.2962C26.0413 53.5625 25.6567 53.5625 25.5014 53.2962L23.301 49.4798L21.0969 45.6633C20.9416 45.3971 21.1339 45.0605 21.4446 45.0605H25.8527Z"
        fill="#FF7300"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M36.4443 45.0605H40.8487C41.1594 45.0605 41.3517 45.3971 41.1963 45.6633L38.9923 49.4798L36.7882 53.2962C36.6329 53.5625 36.2483 53.5625 36.093 53.2962L33.8889 49.4798L31.6848 45.6633C31.5295 45.3971 31.7218 45.0605 32.0324 45.0605H36.4443Z"
        fill="#FF7300"
      />
    </svg>
  );
}

function ZerodhaOfficialIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 60" fill="none" className={className} aria-label="Zerodha Kite logo">
      <polygon points="30 0 0 30 30 60 60 30 90 0 30 0" fill="#F6461A" />
      <polygon points="30 60 60 30 90 60 30 60" fill="#DB342C" />
    </svg>
  );
}

const BROKERS: BrokerItem[] = [
  {
    id: "upstox",
    name: "Upstox",
    subtext: "Official API",
    status: "live",
    badgeText: "Live Sync",
    href: "/publish?broker=upstox",
    icon: UpstoxOfficialIcon,
  },
  {
    id: "angel_one",
    name: "Angel One",
    subtext: "SmartAPI",
    status: "live",
    badgeText: "Live Sync",
    href: "/publish?broker=angel_one",
    icon: AngelOneOfficialIcon,
  },
  {
    id: "zerodha",
    name: "Zerodha Kite",
    subtext: "Kite Connect",
    status: "coming_soon",
    badgeText: "Coming Soon",
    href: "/publish",
    icon: ZerodhaOfficialIcon,
  },
];

function BrokerPill({ broker }: { broker: BrokerItem }) {
  const Icon = broker.icon;
  const isLive = broker.status === "live";

  return (
    <Link
      href={broker.href}
      className={`group flex items-center gap-1.5 rounded border px-2 py-0.5 transition-all select-none whitespace-nowrap cursor-pointer ${
        isLive
          ? "border-line bg-surface hover:border-brand/40 hover:bg-brand-soft/40 shadow-2xs"
          : "border-line/60 bg-surface/50 opacity-70 hover:opacity-100"
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:scale-105" />
      <span className="text-[11.5px] font-semibold text-foreground">
        {broker.name}
      </span>
      <span className="text-[10px] text-muted hidden sm:inline">
        ({broker.subtext})
      </span>
      <span
        className={`rounded px-1.5 py-0.2 text-[8.5px] font-bold uppercase tracking-wider ${
          isLive
            ? "bg-profit-soft text-profit border border-profit/25"
            : "bg-surface-sunken text-muted border border-line"
        }`}
      >
        {isLive && (
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-profit animate-pulse mr-1" />
        )}
        {broker.badgeText}
      </span>
    </Link>
  );
}

export function HeroExplainer({ onOpenHelp }: HeroExplainerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (localStorage.getItem(STORAGE_KEY) === "true") {
        setDismissed(true);
      }
    } catch {
      // LocalStorage unavailable
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // LocalStorage unavailable
    }
  }

  if (!mounted) {
    return null;
  }

  return (
    <div className="rounded-lg border border-line bg-surface-alt/70 px-3 py-1.5 sm:px-3.5 shadow-2xs">
      {/* Top Line: Not a trading broker text (Collapsible via X button) */}
      <AnimatePresence initial={false}>
        {!dismissed && (
          <motion.div
            key="not-a-broker-notice"
            initial={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.16, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 text-[12px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-brand-soft px-1.5 py-0.5 text-[10.5px] font-bold text-brand uppercase tracking-wider select-none">
                  Not a Trading Broker
                </span>
                <span className="text-ink-soft">
                  <strong className="font-semibold text-foreground">Did retail traders gain or lose today?</strong>{" "}
                  NetPnL is a community space where Indian traders gather, share their daily P&amp;L, and see how retail India traded today.
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0">
                {onOpenHelp && (
                  <button
                    type="button"
                    onClick={onOpenHelp}
                    className="font-semibold text-brand transition-colors hover:underline cursor-pointer select-none text-[11.5px]"
                  >
                    How it works &rarr;
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleDismiss}
                  aria-label="Dismiss notice"
                  title="Dismiss notice"
                  className="grid h-4.5 w-4.5 place-items-center rounded text-muted hover:bg-surface-sunken hover:text-foreground cursor-pointer select-none transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3 w-3">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="border-t border-line/60 mb-1.5" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Line: Supported Brokers scrolling (ALWAYS VISIBLE) */}
      <div className="flex items-center gap-2 overflow-hidden py-0.5">
        <div className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted select-none whitespace-nowrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3 w-3 text-brand">
            <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Supports Direct P&amp;L Sync:</span>
        </div>

        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_2%,black_98%,transparent)]">
          <div
            className="animate-marquee gap-2.5"
            style={{ "--marquee-duration": "24s" } as React.CSSProperties}
          >
            {BROKERS.map((broker) => (
              <BrokerPill key={`b1-${broker.id}`} broker={broker} />
            ))}
            {BROKERS.map((broker) => (
              <BrokerPill key={`b2-${broker.id}`} broker={broker} />
            ))}
            {BROKERS.map((broker) => (
              <BrokerPill key={`b3-${broker.id}`} broker={broker} />
            ))}
            {BROKERS.map((broker) => (
              <BrokerPill key={`b4-${broker.id}`} broker={broker} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
