import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Disclaimer & Risk Disclosure",
  description: "Financial disclaimer, SEBI regulatory disclosure, and risk warnings for RetailTraders (NetPnL).",
};

export default function DisclaimerPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="eyebrow">Regulatory &amp; Compliance</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Disclaimer &amp; Risk Disclosure
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          Last updated: October 29, 2026 &middot; Mandatory disclosure for all platform users
        </p>
      </header>

      <div className="card space-y-8 p-6 sm:p-10">
        {/* SEBI Disclaimer */}
        <section className="space-y-3">
          <div className="rounded-lg border border-amber/40 bg-amber-soft p-5 text-[13.5px] leading-relaxed text-amber-950">
            <h2 className="text-base font-bold text-amber-950">1. Not SEBI Registered — No Financial Advice</h2>
            <p className="mt-2">
              <strong>RetailTraders</strong> (operating as <strong>NetPnL</strong>, accessible at{" "}
              <Link href="/" className="underline font-semibold">retailtraders.in</Link>) is an independent community journal
              and transparency counter. We are <strong>NOT</strong> registered with the Securities and Exchange Board of India
              (SEBI) as an Investment Adviser (IA), Research Analyst (RA), Stock Broker, Portfolio Manager, or Financial Intermediary.
            </p>
            <p className="mt-2">
              <strong>No Investment Advice:</strong> None of the materials, metrics, leaderboards, sentiment aggregations, P&amp;L
              posts, or user comments published on this site constitute financial, investment, legal, tax, or trading advice. We
              do not issue buy/sell calls, trade recommendations, stock tips, or managed accounts.
            </p>
          </div>
        </section>

        {/* SEBI F&O Risk Disclosure */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">2. SEBI Risk Disclosure on Derivatives (F&amp;O)</h2>
          <div className="rounded-lg border border-line bg-surface-alt p-5 text-[13px] leading-relaxed text-ink-soft space-y-3">
            <p className="font-semibold text-foreground">
              As mandated by SEBI guidelines for market participants, all retail traders should review the findings of SEBI&apos;s
              study on individual trader performance:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>9 out of 10 individual traders</strong> in the equity Futures and Options (F&amp;O) segment incurred net
                losses over the audited period.
              </li>
              <li>
                On average, loss-makers registered an average net trading loss of approximately <strong>₹50,000</strong>.
              </li>
              <li>
                Over and above the net trading losses, loss-makers expended an additional <strong>28%</strong> of their net trading
                losses as transaction costs and brokerage fees.
              </li>
              <li>
                Those making net trading profits incurred between <strong>15% to 50%</strong> of such profits as transaction costs.
              </li>
            </ul>
            <p className="text-[12px] text-muted italic">
              Source: SEBI Study on &ldquo;Analysis of Profit and Loss of Individual Traders Dealing in Equity F&amp;O Segment&rdquo;.
            </p>
          </div>
        </section>

        {/* Broker Independence & Non-Affiliation */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">3. Broker Independence &amp; Trademark Disclaimers</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            RetailTraders (NetPnL) is an independently created software product. We are <strong>not</strong> an official partner,
            affiliate, subsidiary, or representative of:
          </p>
          <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li><strong>Zerodha Broking Limited</strong> (or Kite Connect)</li>
            <li><strong>Upstox</strong> (RKSV Securities India Pvt. Ltd.)</li>
            <li><strong>Angel One Limited</strong></li>
            <li><strong>Groww</strong> (Billionbrains Garage Ventures Pvt. Ltd.)</li>
            <li>Or any other Indian stock broker, depository participant, or clearing corporation.</li>
          </ul>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            All broker names, logos, and trademarks are the intellectual property of their respective corporate entities.
            Our integrations connect strictly through official, public developer OAuth APIs provided by brokers to authenticate
            daily realised P&amp;L records.
          </p>
        </section>

        {/* Verification Limits & Educational Scope */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">4. Verification &amp; Data Accuracy Limitations</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            While we make every effort to ensure authenticated broker posts accurately reflect daily realized position P&amp;L as
            reported by broker APIs:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>
              <strong>Self-Reported Figures:</strong> Any post labeled as &ldquo;Self-reported&rdquo; is voluntarily entered by the
              user and has not been verified against a brokerage clearing system.
            </li>
            <li>
              <strong>No Guarantee of Completeness:</strong> A trader&apos;s verified post reflects the account synced with the
              platform on that date. It may not reflect trades executed across multiple demat accounts or external derivative
              positions.
            </li>
            <li>
              <strong>Past Performance:</strong> Past P&amp;L is not an indicator or guarantee of future returns. High ranks on
              the Hall of Pain leaderboard reflect past historical data only.
            </li>
          </ul>
        </section>

        {/* Peer-to-Peer Tipping */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">5. Peer-to-Peer Gifting (UPI Tipping)</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            RetailTraders provides a convenience QR code / intent link allowing users to send voluntary peer-to-peer gifts
            directly to a trader&apos;s verified UPI ID:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>RetailTraders does not collect, hold, route, or take commission on any UPI transfers.</li>
            <li>Tipping is purely voluntary and personal. It does not create any commercial partnership, advisory contract, or fiduciary relationship between the sender and receiver.</li>
            <li>Never tip in exchange for promised trading profits, tips, insider information, or advisory calls. RetailTraders takes zero responsibility for personal financial transfers between users.</li>
          </ul>
        </section>

        {/* Contact */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">6. Questions &amp; Inquiries</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            If you have questions regarding these disclosures or our regulatory practices, please write to:
          </p>
          <div className="rounded-lg border border-line bg-surface-alt p-4 text-[13px] text-ink-soft">
            <p><strong>Compliance Desk:</strong> RetailTraders Legal</p>
            <p className="mt-1"><strong>Email:</strong> <a href="mailto:support@retailtraders.in" className="link">support@retailtraders.in</a></p>
            <p className="mt-1"><strong>Website:</strong> <a href="https://retailtraders.in" className="link">https://retailtraders.in</a></p>
          </div>
        </section>
      </div>
    </div>
  );
}

