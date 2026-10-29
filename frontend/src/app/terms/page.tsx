import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description: "Terms of Service and Conditions governing the use of RetailTraders (NetPnL).",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="eyebrow">Legal &amp; Compliance</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Terms &amp; Conditions
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          Last updated: October 29, 2026 &middot; Effective date: October 25, 2026
        </p>
      </header>

      <div className="card space-y-8 p-6 sm:p-10">
        {/* Section 1 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            By accessing or using <strong>RetailTraders</strong> (operating under <strong>NetPnL</strong>, accessible at{" "}
            <Link href="/" className="link font-medium">retailtraders.in</Link>), you agree to be bound by these
            Terms and Conditions (&ldquo;Terms&rdquo;) and all applicable laws and regulations in the Republic of India. If you do not
            agree with any part of these Terms, you are prohibited from using or accessing this platform.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">2. Nature of Platform &amp; SEBI Non-Registration</h2>
          <div className="rounded-lg border border-amber/30 bg-amber-soft p-4 text-[13px] leading-relaxed text-amber-900">
            <strong>Important Regulatory Notice:</strong> RetailTraders (NetPnL) is an independent record-keeping, journal, and
            transparency platform for retail traders. We are <strong>NOT</strong> registered with the Securities and Exchange Board
            of India (SEBI) as an Investment Adviser (IA), Research Analyst (RA), Stock Broker, Portfolio Manager, or Financial
            Intermediary under SEBI regulations.
          </div>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            Nothing published on this website—including daily net profit and loss figures, trader leaderboards, community
            sentiment metrics, historical charts, or user commentary—constitutes investment advice, portfolio management, stock
            recommendations, or solicitation of securities trading.
          </p>
        </section>

        {/* Section 3 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">3. User Eligibility &amp; Accounts</h2>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>You must be at least 18 years of age and legally competent to enter into binding contracts under Indian law.</li>
            <li>You are responsible for maintaining the confidentiality of your account credentials (password and session tokens).</li>
            <li>You must provide accurate, current, and truthful information during registration. Impersonation of other individuals or entities is strictly prohibited.</li>
          </ul>
        </section>

        {/* Section 4 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">4. P&amp;L Records &amp; Broker Verification</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            Users may publish daily trading performance through two mechanisms:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>
              <strong>Self-Reported (Manual) P&amp;L:</strong> Manually entered by the user. These entries carry a clear &ldquo;Self-reported&rdquo; badge. Users warrant that self-reported figures reflect their genuine trading outcomes.
            </li>
            <li>
              <strong>Broker-Verified P&amp;L:</strong> Fetched via official read-only OAuth integrations with supported brokerage platforms (e.g., Upstox, Angel One, Zerodha). Broker-verified figures are authenticated by server-side APIs and carry a blue &ldquo;Verified&rdquo; badge.
            </li>
          </ul>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            We reserve the right to audit, flag, or remove any published entry that contains fraudulent, fabricated, or mathematically inconsistent data.
          </p>
        </section>

        {/* Section 5 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">5. Peer-to-Peer UPI Tipping &amp; Zero Custody of Funds</h2>
          <div className="rounded-lg border border-line bg-surface-alt p-4 text-[13px] leading-relaxed text-ink-soft">
            <strong>Zero Custody Guarantee:</strong> RetailTraders does not hold, handle, escrow, route, or clear user funds. We are not a payment gateway, payment aggregator, wallet, or bank.
          </div>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>Any tips sent to traders are voluntary, peer-to-peer gifts transferred directly from the supporter&apos;s UPI application to the trader&apos;s verified UPI ID.</li>
            <li>Transfers are completely voluntary and unconditional. Tipping does not entitle the sender to investment advice, trading tips, signals, paid courses, or commercial services.</li>
            <li>All peer-to-peer gifts are final and non-refundable. RetailTraders bears no liability for disputes between users regarding UPI transfers.</li>
          </ul>
        </section>

        {/* Section 6 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">6. Intellectual Property &amp; Copyright Notice</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            All content, layout, branding, logos, software code, algorithms, and interface elements on RetailTraders are the
            exclusive intellectual property of NetPnL / RetailTraders and are protected by applicable copyright, trademark, and
            intellectual property laws of India:
          </p>
          <p className="font-mono text-[13px] font-semibold text-foreground">
            &copy; 2026 NetPnL / RetailTraders. All rights reserved.
          </p>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            Third-party trademarks—including Upstox, Zerodha, Kite Connect, Angel One, and Groww—belong exclusively to their
            respective owners and are referenced solely for identification and integration compatibility purposes.
          </p>
        </section>

        {/* Section 7 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">7. Prohibited Uses</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">You agree not to:</p>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>Use the platform for market manipulation, fraudulent scheme promotion, or unlicensed financial advisory.</li>
            <li>Scrape, crawl, harvest, or extract data from the platform using automated bots without express prior written consent.</li>
            <li>Attempt to bypass, defeat, or manipulate broker verification checks or API access limits.</li>
            <li>Upload malicious code, viruses, or interfere with the infrastructure, servers, or networks hosting the service.</li>
          </ul>
        </section>

        {/* Section 8 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">8. Limitation of Liability</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            To the maximum extent permitted under applicable law, RetailTraders, its founders, contributors, and service
            providers shall not be liable for any direct, indirect, incidental, consequential, or punitive damages—including
            trading losses, lost profits, financial distress, or data loss—resulting from your use of or inability to use the
            platform, reliance on any published P&amp;L records, or third-party broker downtime.
          </p>
        </section>

        {/* Section 9 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">9. Governing Law &amp; Jurisdiction</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            These Terms shall be governed by and construed in accordance with the laws of the Republic of India. Any disputes
            arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the competent courts in
            India.
          </p>
        </section>

        {/* Section 10 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">10. Contact &amp; Grievances</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            For questions regarding these Terms, compliance inquiries, or grievance redressal, please contact:
          </p>
          <div className="rounded-lg border border-line bg-surface-alt p-4 text-[13px] text-ink-soft">
            <p><strong>Grievance &amp; Compliance Officer:</strong> RetailTraders Legal Desk</p>
            <p className="mt-1"><strong>Email:</strong> <a href="mailto:support@retailtraders.in" className="link">support@retailtraders.in</a></p>
            <p className="mt-1"><strong>Platform:</strong> <a href="https://retailtraders.in" className="link">retailtraders.in</a></p>
          </div>
        </section>
      </div>
    </div>
  );
}

