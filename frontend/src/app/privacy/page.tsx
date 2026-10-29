import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy Policy and data protection practices of RetailTraders (NetPnL).",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-8">
        <p className="eyebrow">Legal &amp; Privacy</p>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Privacy Policy
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          Last updated: October 29, 2026 &middot; Effective date: October 25, 2026
        </p>
      </header>

      <div className="card space-y-8 p-6 sm:p-10">
        {/* Intro */}
        <section className="space-y-3">
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            At <strong>RetailTraders</strong> (operating under <strong>NetPnL</strong>, accessible at{" "}
            <Link href="/" className="link font-medium">retailtraders.in</Link>), we respect your privacy and are committed
            to protecting the personal information you share with us. This Privacy Policy describes how we collect, store,
            use, and safeguard your data when you interact with our website and application.
          </p>
        </section>

        {/* Information Collected */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">1. Information We Collect</h2>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>
              <strong>Account Information:</strong> When you register an account, we collect your email address, chosen
              username, display name, password (cryptographically hashed using bcrypt + SHA-256), and optional profile bio.
            </li>
            <li>
              <strong>Trading P&amp;L Records:</strong> When you publish performance figures, we store the calendar date, net
              profit or loss amount, trade count, optional trader notes, and whether the record is verified or self-reported.
            </li>
            <li>
              <strong>UPI Details:</strong> If you connect a UPI ID for community tipping, we verify your VPA via a reverse
              penny-drop and store your verified UPI handle and resolved account name.
            </li>
            <li>
              <strong>Log &amp; Device Information:</strong> Standard server logs, IP addresses, browser user-agent, operating
              system, and timestamp data for performance monitoring and security auditing.
            </li>
          </ul>
        </section>

        {/* Broker Data Security */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">2. Broker OAuth &amp; Security Standards</h2>
          <div className="rounded-lg border border-line bg-surface-alt p-4 text-[13px] leading-relaxed text-ink-soft">
            <strong>Strict Read-Only Broker Access:</strong> We connect to supported brokers (Upstox, Angel One, Zerodha)
            strictly via official developer OAuth protocols.
          </div>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>
              <strong>No Credential Storage:</strong> You sign in directly on the broker&apos;s own official login portal. We
              <strong> never</strong> receive, store, or have access to your broker passwords, PINs, TOTP codes, or banking
              details.
            </li>
            <li>
              <strong>Limited Scope:</strong> We only request read access to realized daily position P&amp;L. We never request or
              exercise order placement, trade execution, or fund withdrawal permissions.
            </li>
            <li>
              <strong>Token Encryption:</strong> OAuth access tokens are securely managed and can be unlinked at any time by
              disconnecting the broker in your Account Settings.
            </li>
          </ul>
        </section>

        {/* Cookies & Advertising */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">3. Cookies &amp; Third-Party Advertising (Google AdSense)</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            We use essential cookies to maintain secure authentication sessions and theme preferences.
          </p>
          <div className="rounded-lg border border-line bg-surface-alt p-4 text-[13px] leading-relaxed text-ink-soft space-y-2">
            <p><strong>Third-Party Advertising Partners:</strong></p>
            <p>
              Third-party vendors, including Google, use cookies to serve ads based on a user&apos;s prior visits to our
              website or other websites on the Internet.
            </p>
            <p>
              Google&apos;s use of advertising cookies enables it and its partners to serve ads to our users based on their
              visit to RetailTraders and/or other sites on the Internet.
            </p>
            <p>
              Users may opt out of personalized advertising by visiting{" "}
              <a
                href="https://adssettings.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="link font-medium"
              >
                Google Ads Settings
              </a>{" "}
              or through the Network Advertising Initiative opt-out page at{" "}
              <a
                href="https://www.aboutads.info/choices"
                target="_blank"
                rel="noopener noreferrer"
                className="link font-medium"
              >
                aboutads.info
              </a>.
            </p>
          </div>
        </section>

        {/* How We Use Information */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">4. How We Use Your Information</h2>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li>To display your public profile, trading timeline, and leaderboard rankings.</li>
            <li>To compute collective market sentiment metrics (aggregate daily profit/loss counters).</li>
            <li>To allow supporters to send voluntary peer-to-peer UPI gifts directly to your UPI app.</li>
            <li>To prevent fraud, automated abuse, duplicate submissions, and ensure platform security.</li>
          </ul>
          <p className="text-[13.5px] leading-relaxed text-ink-soft font-medium text-foreground">
            We do not sell, rent, or trade your personal data to third-party data brokers or marketing firms.
          </p>
        </section>

        {/* Data Retention & Deletion Rights */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">5. Your Data Rights &amp; Account Deletion</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            You maintain full ownership of your data on RetailTraders:
          </p>
          <ul className="list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-soft">
            <li><strong>Edit or Remove P&amp;L Posts:</strong> You can edit or delete any of your manual daily P&amp;L submissions at any time from your publish history.</li>
            <li><strong>Unlink Brokers:</strong> You can disconnect linked broker accounts with a single click in Settings.</li>
            <li><strong>Complete Account Deletion:</strong> You have the right to request full erasure of your account, profile, and historical data by emailing our support desk.</li>
          </ul>
        </section>

        {/* Security Practices */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">6. Security Measures</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            We implement industry-standard technical and organizational security measures, including HTTPS/TLS 1.3 encryption
            in transit, salted and hashed passwords (bcrypt with 12 rounds), parameter-binding queries to prevent SQL injection,
            and strict CORS policies.
          </p>
        </section>

        {/* Contact Information */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">7. Grievance Redressal &amp; Privacy Contact</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-soft">
            In compliance with the Information Technology Act, 2000 and Digital Personal Data Protection Act, 2023 of India,
            for any questions, complaints, or privacy requests, please reach out to our Grievance Officer:
          </p>
          <div className="rounded-lg border border-line bg-surface-alt p-4 text-[13px] text-ink-soft">
            <p><strong>Grievance Officer:</strong> RetailTraders Privacy Desk</p>
            <p className="mt-1"><strong>Email:</strong> <a href="mailto:support@retailtraders.in" className="link">support@retailtraders.in</a></p>
            <p className="mt-1"><strong>Domain:</strong> <a href="https://retailtraders.in" className="link">https://retailtraders.in</a></p>
          </div>
        </section>
      </div>
    </div>
  );
}

