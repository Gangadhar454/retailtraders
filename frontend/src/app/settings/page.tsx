"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { CopyButton } from "@/components/CopyButton";
import { UnverifiedBadge, VerifiedBadge } from "@/components/VerifiedBadge";
import { ApiError, userApi } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();

  const [upiInput, setUpiInput] = useState("");
  const [upiBusy, setUpiBusy] = useState(false);
  const [upiMessage, setUpiMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login?next=/settings");
    }
  }, [loading, user, router]);

  if (loading || !user) {
  return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="card h-80 animate-pulse" />
      </div>
    );
  }

  const upiVerified = user.upi_verification_status === "VERIFIED" && user.verified_upi_id;

  async function verifyUpi() {
    setUpiBusy(true);
    setUpiMessage(null);
    try {
      const result = await userApi.verifyUpi(upiInput.trim());
      setUpiMessage({
        kind: result.can_tip ? "ok" : "error",
        text: result.message,
      });
      if (result.can_tip) setUpiInput("");
      await refresh();
    } catch (err) {
      setUpiMessage({
        kind: "error",
        text: err instanceof ApiError ? err.message : "Verification failed",
      });
    } finally {
      setUpiBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        <header>
          <p className="eyebrow">Account</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            Manage your UPI verification. Publishing and edits live on the
            Publish page.
          </p>
        </header>
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">UPI verification</h2>
              <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-soft">
                We drop ₹1 to your UPI ID and read back the bank account name.
                Once verified, tipping is live on your public profile.
              </p>
            </div>
            {upiVerified ? (
              <VerifiedBadge label="UPI Verified" />
            ) : (
              <UnverifiedBadge />
            )}
          </div>

          {upiVerified ? (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded border border-brand/20 bg-brand-soft px-4 py-3">
                <span className="numeric text-[13px] font-semibold text-brand">
                  {user.verified_upi_id}
                </span>
                <span className="text-[12px] text-muted">
                  resolved as {user.upi_verified_name}
                </span>
                <CopyButton
                  value={user.verified_upi_id!}
                  className="btn-base btn-secondary ml-auto py-1.5 text-[12px]"
                />
              </div>
              <p className="text-[12px] text-muted">
                Tipping is live on your public profile. Transfers are voluntary
                peer-to-peer gifts made straight from the supporter&apos;s UPI
                app — the platform never holds funds.
              </p>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={upiInput}
                  onChange={(e) => setUpiInput(e.target.value)}
                  placeholder="yourname@okhdfcbank"
                  className="input-base flex-1"
                />
                <button
                  type="button"
                  onClick={verifyUpi}
                  disabled={upiBusy || !upiInput.trim()}
                  className="btn-base btn-primary"
                >
                  {upiBusy ? "Dropping ₹1…" : "Verify with ₹1 drop"}
                </button>
              </div>
            </div>
          )}

          <AnimatePresence>
            {upiMessage && (
              <motion.p
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`mt-4 rounded border px-4 py-3 text-[13px] ${
                  upiMessage.kind === "ok"
                    ? "border-profit/25 bg-profit-soft text-profit"
                    : "border-loss/25 bg-loss-soft text-loss"
                }`}
              >
                {upiMessage.text}
              </motion.p>
            )}
          </AnimatePresence>
        </section>

        {/* Publishing --------------------------------------------------- */}
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Publishing</h2>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-soft">
              Your day-by-day publish history lives on the Publish page, where
              you can add a self-reported figure, edit it, or remove a publish.
            </p>
          </div>
          <Link href="/publish" className="btn-base btn-primary py-2 text-[12px]">
            Open publish history
          </Link>
        </section>
      </motion.div>
    </div>
  );
}
