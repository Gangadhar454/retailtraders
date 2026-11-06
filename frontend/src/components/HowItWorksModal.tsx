"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

type TabKey = "overview" | "publishing" | "leaderboard" | "tipping" | "security" | "faq";

interface TabItem {
  id: TabKey;
  label: string;
  badge?: string;
  icon: (props: { className?: string }) => React.JSX.Element;
}

const TABS: TabItem[] = [
  {
    id: "overview",
    label: "Overview",
    icon: ({ className = "h-4 w-4" }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "publishing",
    label: "Broker Sync & Verify",
    badge: "OAuth",
    icon: ({ className = "h-4 w-4" }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M12 2.5l7.5 3v5.6c0 4.7-3.2 8.6-7.5 10.4-4.3-1.8-7.5-5.7-7.5-10.4V5.5l7.5-3z" />
        <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "leaderboard",
    label: "Leaderboards & Sentiment",
    icon: ({ className = "h-4 w-4" }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M18 20V10M12 20V4M6 20v-6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "tipping",
    label: "UPI Tipping (0% Fee)",
    badge: "Direct",
    icon: ({ className = "h-4 w-4" }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
        <circle cx="12" cy="15" r="1.5" />
      </svg>
    ),
  },
  {
    id: "security",
    label: "Security & Privacy",
    icon: ({ className = "h-4 w-4" }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    ),
  },
  {
    id: "faq",
    label: "FAQ & Support",
    icon: ({ className = "h-4 w-4" }) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" strokeLinecap="round" />
        <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
];

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/55 backdrop-blur-xs cursor-pointer"
          />

          {/* Dialog Container */}
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: "spring", stiffness: 440, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 flex h-full max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-line bg-surface-alt px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="grid h-7 w-7 place-items-center rounded-md bg-brand-soft text-[13px] font-bold text-brand select-none">
                  ?
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                    RetailTraders User Manual
                  </h2>
                  <p className="text-[12px] text-ink-soft hidden sm:block">
                    Everything you need to know about publishing, broker sync, and UPI tipping
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close user manual"
                className="grid h-8 w-8 place-items-center rounded border border-line bg-surface text-ink-soft transition-colors hover:bg-surface-sunken hover:text-foreground cursor-pointer select-none"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
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

            {/* Modal Body: Sidebar Tabs + Content Area */}
            <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
              {/* Tab Navigation (Sidebar on Desktop, Horizontal Pill Bar on Mobile) */}
              <div className="border-b border-line bg-surface-alt/60 p-2 md:w-60 md:shrink-0 md:border-b-0 md:border-r md:p-3 overflow-x-auto md:overflow-x-visible">
                <nav className="flex gap-1 md:flex-col" aria-label="Manual navigation">
                  {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium transition-all cursor-pointer select-none whitespace-nowrap md:whitespace-normal ${
                          isActive
                            ? "bg-brand text-white shadow-xs"
                            : "text-ink-soft hover:bg-surface-sunken hover:text-foreground"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-white" : "text-ink-soft group-hover:text-foreground"}`} />
                        <span className="flex-1 truncate">{tab.label}</span>
                        {tab.badge && (
                          <span
                            className={`hidden rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider sm:inline-block ${
                              isActive ? "bg-white/20 text-white" : "bg-surface-sunken text-muted"
                            }`}
                          >
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </nav>
              </div>

              {/* Scrollable Content Area */}
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 [scrollbar-width:thin]">
                {activeTab === "overview" && (
                  <div className="space-y-6">
                    <div>
                      <span className="badge text-brand border-brand/20 bg-brand-soft mb-2">
                        Platform Philosophy
                      </span>
                      <h3 className="text-lg font-bold text-foreground">
                        India&apos;s Retail Trader Community
                      </h3>
                      <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
                        RetailTraders (NetPnL) is an open community space built for Indian retail traders to gather after market hours, share their daily P&amp;L, and see whether retail traders gained or lost money today.
                      </p>
                    </div>

                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <div className="card p-4">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 place-items-center rounded bg-profit-soft text-profit">
                            ✓
                          </span>
                          <h4 className="text-[13.5px] font-semibold text-foreground">
                            100% Broker-Verified P&amp;L
                          </h4>
                        </div>
                        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                          We connect directly to official broker APIs (Upstox, Angel One) to read settled realised daily P&amp;L straight from the exchange. No Photoshop, no altered numbers.
                        </p>
                      </div>

                      <div className="card p-4">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-7 w-7 place-items-center rounded bg-brand-soft text-brand">
                            ₹
                          </span>
                          <h4 className="text-[13.5px] font-semibold text-foreground">
                            Zero-Fund Holding Policy
                          </h4>
                        </div>
                        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
                          We never hold, escrow, or deduct money. When supporters tip a trader, the transaction occurs 100% peer-to-peer via NPCI UPI rails directly between user bank accounts.
                        </p>
                      </div>
                    </div>

                    {/* Non-SEBI Disclaimer Box */}
                    <div className="rounded-lg border border-amber/30 bg-amber-soft p-4">
                      <div className="flex items-start gap-3">
                        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0 text-amber mt-0.5">
                          <path
                            d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                          />
                        </svg>
                        <div>
                          <h5 className="text-[13px] font-bold text-amber uppercase tracking-wider">
                            Statutory Notice &amp; Disclaimer
                          </h5>
                          <p className="mt-1 text-[12px] leading-relaxed text-foreground/80">
                            RetailTraders.in is purely a software journaling and cryptographic verification platform. We are NOT registered with the Securities and Exchange Board of India (SEBI) as a Research Analyst (RA) or Investment Adviser (IA). No trade, note, leaderboard ranking, or tip constitutes financial advice or buy/sell recommendations.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "publishing" && (
                  <div className="space-y-6">
                    <div>
                      <span className="badge text-brand border-brand/20 bg-brand-soft mb-2">
                        Verification Guide
                      </span>
                      <h3 className="text-lg font-bold text-foreground">
                        How to Publish &amp; Verify Your Daily P&amp;L
                      </h3>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
                        We support two methods of publishing trades: automated broker sync and manual journaling.
                      </p>
                    </div>

                    <div className="space-y-4">
                      {/* Step 1 */}
                      <div className="flex gap-4 rounded-lg border border-line bg-surface p-4">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-bold text-white select-none">
                          1
                        </span>
                        <div>
                          <h4 className="text-[14px] font-semibold text-foreground">
                            Connect Your Broker (Upstox or Angel One)
                          </h4>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                            Navigate to <Link href="/publish" onClick={onClose} className="text-brand font-medium hover:underline">Publish P&amp;L</Link> and select your broker. You will be redirected to the official broker OAuth login page. Your login credentials and MPIN are entered directly on your broker&apos;s site and are never seen by our servers.
                          </p>
                        </div>
                      </div>

                      {/* Step 2 */}
                      <div className="flex gap-4 rounded-lg border border-line bg-surface p-4">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-bold text-white select-none">
                          2
                        </span>
                        <div>
                          <h4 className="text-[14px] font-semibold text-foreground">
                            Fetch Realised P&amp;L with One Click
                          </h4>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                            Click <strong>&ldquo;Fetch from Broker&rdquo;</strong>. Our backend contacts the broker API, calculates your net realised positions for today&apos;s market session, and populates your trade count and net P&amp;L automatically.
                          </p>
                        </div>
                      </div>

                      {/* Step 3 */}
                      <div className="flex gap-4 rounded-lg border border-line bg-surface p-4">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-bold text-white select-none">
                          3
                        </span>
                        <div>
                          <h4 className="text-[14px] font-semibold text-foreground">
                            Earn the Verified Badge
                          </h4>
                          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                            Trades synced directly from your broker carry the blue <strong>Verified P&amp;L</strong> badge across the Hall of Pain leaderboard and your public profile. Manual self-reported entries carry a subtle <em>Self-reported</em> tag to maintain transparency.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-line bg-surface-alt p-4">
                      <h4 className="text-[13px] font-semibold text-foreground">
                        Why does my broker require reconnecting each morning?
                      </h4>
                      <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                        Under Indian exchange regulations (NSE/BSE) and broker compliance policies, all broker OAuth access tokens expire daily around <strong>6:00 AM IST</strong>. Simply re-authenticate each morning before publishing your day&apos;s results.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "leaderboard" && (
                  <div className="space-y-6">
                    <div>
                      <span className="badge text-brand border-brand/20 bg-brand-soft mb-2">
                        Rankings &amp; Metrics
                      </span>
                      <h3 className="text-lg font-bold text-foreground">
                        Understanding the Leaderboards &amp; Sentiment
                      </h3>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
                        Track daily market performance and cumulative consistency across India&apos;s retail trading community.
                      </p>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="card p-4">
                        <h4 className="text-[14px] font-semibold text-foreground">
                          Today&apos;s Hall of Pain / Fame
                        </h4>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                          Shows live rankings for the current active trading session. Filter by:
                        </p>
                        <ul className="mt-2 space-y-1 text-[12px] text-ink-soft">
                          <li>• <strong>All Traders:</strong> Complete ranking from largest gain to deepest drawdown.</li>
                          <li>• <strong>Losses Only:</strong> Honest community space highlighting tough days.</li>
                          <li>• <strong>Profits Only:</strong> Top performers of the trading session.</li>
                        </ul>
                      </div>

                      <div className="card p-4">
                        <h4 className="text-[14px] font-semibold text-foreground">
                          Cumulative Consistency Board
                        </h4>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                          One good day does not make a profitable trader. The cumulative board aggregates all historical published sessions to showcase long-term consistency and net risk-adjusted returns.
                        </p>
                      </div>
                    </div>

                    <div className="card p-4">
                      <h4 className="text-[14px] font-semibold text-foreground">
                        India&apos;s Retail Net P&amp;L Sentiment Banner
                      </h4>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">
                        Located at the top of the homepage, the Retail Sentiment Banner computes the aggregate net P&amp;L across all participating traders in India for today. It reveals whether retail traders as a collective cohort are green or red during high-volatility expiry sessions.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === "tipping" && (
                  <div className="space-y-6">
                    <div>
                      <span className="badge text-brand border-brand/20 bg-brand-soft mb-2">
                        P2P Support
                      </span>
                      <h3 className="text-lg font-bold text-foreground">
                        Setting Up 0% Commission UPI Tipping
                      </h3>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
                        Traders on tough loss days can receive voluntary community support directly to their bank account via UPI.
                      </p>
                    </div>

                    <div className="space-y-3.5">
                      <div className="flex gap-3.5 rounded-lg border border-line bg-surface p-4">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-brand-soft text-[12px] font-bold text-brand">
                          1
                        </span>
                        <div>
                          <h4 className="text-[13.5px] font-semibold text-foreground">
                            Configure your UPI VPA in Settings
                          </h4>
                          <p className="mt-1 text-[12px] text-ink-soft">
                            Head to <Link href="/settings" onClick={onClose} className="text-brand font-medium hover:underline">Settings</Link> and enter your standard UPI ID (e.g., <code>yourname@okhdfcbank</code>, <code>mobile@paytm</code>).
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3.5 rounded-lg border border-line bg-surface p-4">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-brand-soft text-[12px] font-bold text-brand">
                          2
                        </span>
                        <div>
                          <h4 className="text-[13.5px] font-semibold text-foreground">
                            Automated Name Verification (Penny-Drop)
                          </h4>
                          <p className="mt-1 text-[12px] text-ink-soft">
                            To protect supporters against impersonation, we verify your VPA with NPCI bank rails to confirm the bank account title matches your profile before unlocking the Donate button.
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-3.5 rounded-lg border border-line bg-surface p-4">
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-brand-soft text-[12px] font-bold text-brand">
                          3
                        </span>
                        <div>
                          <h4 className="text-[13.5px] font-semibold text-foreground">
                            Direct Bank-to-Bank Transfer (0% Platform Cut)
                          </h4>
                          <p className="mt-1 text-[12px] text-ink-soft">
                            When someone clicks &ldquo;Donate&rdquo; or scans your dynamic QR code, the payment opens directly in GPay, PhonePe, Paytm, or BHIM. NetPnL takes <strong>₹0.00</strong> commission.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "security" && (
                  <div className="space-y-6">
                    <div>
                      <span className="badge text-brand border-brand/20 bg-brand-soft mb-2">
                        Data Protection
                      </span>
                      <h3 className="text-lg font-bold text-foreground">
                        Enterprise-Grade Security &amp; Privacy
                      </h3>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
                        Your trust is paramount. Here is how we safeguard your broker credentials, tokens, and data.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div className="card p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px]">🔐</span>
                          <h4 className="text-[13.5px] font-semibold text-foreground">
                            AES-128 Fernet Encryption at Rest
                          </h4>
                        </div>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
                          All broker OAuth access tokens and refresh tokens are encrypted using symmetric AES-128 Fernet cryptography prior to database insertion. Even in the event of an unauthorized database dump, tokens remain unreadable.
                        </p>
                      </div>

                      <div className="card p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px]">🛡️</span>
                          <h4 className="text-[13.5px] font-semibold text-foreground">
                            Read-Only Scope Guarantee
                          </h4>
                        </div>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
                          We request only <code>read-only</code> positions and trades permission from brokers. We CANNOT place orders, modify open positions, execute trades, or access your funds.
                        </p>
                      </div>

                      <div className="card p-4">
                        <div className="flex items-center gap-2">
                          <span className="text-[14px]">⚡</span>
                          <h4 className="text-[13.5px] font-semibold text-foreground">
                            Cloudflare Edge Protection &amp; Rate Limiting
                          </h4>
                        </div>
                        <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
                          All traffic is routed through Cloudflare Anycast edge servers with unmetered DDoS mitigation, automated TLS encryption, and two-tier rate limiting (120 req/min general, 15 req/min authentication).
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "faq" && (
                  <div className="space-y-6">
                    <div>
                      <span className="badge text-brand border-brand/20 bg-brand-soft mb-2">
                        Support &amp; Answers
                      </span>
                      <h3 className="text-lg font-bold text-foreground">
                        Frequently Asked Questions
                      </h3>
                      <p className="mt-1 text-[13.5px] leading-relaxed text-ink-soft">
                        Quick answers to common questions about accounts, trades, and features.
                      </p>
                    </div>

                    <div className="space-y-3.5">
                      <div className="rounded-lg border border-line bg-surface p-4">
                        <h4 className="text-[13.5px] font-semibold text-foreground">
                          Is RetailTraders.in completely free to use?
                        </h4>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                          Yes! Journaling, broker verification, leaderboard participation, and UPI tipping are 100% free for all retail traders.
                        </p>
                      </div>

                      <div className="rounded-lg border border-line bg-surface p-4">
                        <h4 className="text-[13.5px] font-semibold text-foreground">
                          Can I delete or edit a published trade?
                        </h4>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                          Yes. From your <Link href="/publish" onClick={onClose} className="text-brand font-medium hover:underline">Publish P&amp;L</Link> dashboard, expand any previous day under your publishing history to edit the note or delete the record.
                        </p>
                      </div>

                      <div className="rounded-lg border border-line bg-surface p-4">
                        <h4 className="text-[13.5px] font-semibold text-foreground">
                          Can people see my bank account number or personal phone number?
                        </h4>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                          No. Your bank account number is never stored or displayed. Only your verified UPI ID (VPA) and the resolved bank name are shown to allow direct UPI tipping.
                        </p>
                      </div>

                      <div className="rounded-lg border border-line bg-surface p-4">
                        <h4 className="text-[13.5px] font-semibold text-foreground">
                          When will Zerodha Kite and Dhan be supported?
                        </h4>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
                          Zerodha Kite Connect and Dhan OAuth integrations are currently in active development and will be rolled out in upcoming updates.
                        </p>
                      </div>
                    </div>

                    {/* Support Contact Box */}
                    <div className="rounded-lg border border-brand/20 bg-brand-soft p-4">
                      <h4 className="text-[13px] font-semibold text-brand">
                        Need personal assistance or have feedback?
                      </h4>
                      <p className="mt-1 text-[12px] text-ink-soft">
                        Our engineering and support team is here to help. Reach out directly at:
                      </p>
                      <a
                        href="mailto:support@retailtraders.in"
                        className="mt-2 inline-flex items-center gap-1.5 font-semibold text-brand hover:underline text-[13px]"
                      >
                        ✉ support@retailtraders.in
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between border-t border-line bg-surface-alt px-5 py-3">
              <span className="text-[12px] text-ink-soft">
                Support:{" "}
                <a
                  href="mailto:support@retailtraders.in"
                  className="font-medium text-brand hover:underline cursor-pointer"
                >
                  support@retailtraders.in
                </a>
              </span>
              <button
                type="button"
                onClick={onClose}
                className="btn-base btn-primary text-[13px] cursor-pointer select-none"
              >
                Close Manual
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
