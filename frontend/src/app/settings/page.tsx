"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { EditProfileModal } from "@/components/EditProfileModal";
import { CopyButton } from "@/components/CopyButton";
import { UnverifiedBadge, VerifiedBadge } from "@/components/VerifiedBadge";
import { ApiError, userApi } from "@/lib/api";
import { avatarInk, avatarTint, formatDateLong, initials } from "@/lib/format";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();

  // Modals State
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  // UPI State
  const [upiInput, setUpiInput] = useState("");
  const [upiBusy, setUpiBusy] = useState(false);
  const [isEditingUpi, setIsEditingUpi] = useState(false);
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

  const upiVerified =
    user.upi_verification_status === "VERIFIED" && user.verified_upi_id;
  const seed = user.avatar_seed || user.username;

  async function verifyUpi() {
    setUpiBusy(true);
    setUpiMessage(null);
    try {
      const result = await userApi.verifyUpi(upiInput.trim());
      setUpiMessage({
        kind: result.can_tip ? "ok" : "error",
        text: result.message,
      });
      if (result.can_tip) {
        setUpiInput("");
        setIsEditingUpi(false);
      }
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
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">
            Account Settings
          </h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            Manage your credentials, password & security, UPI tipping ID, and
            linked broker integrations.
          </p>
        </header>

        {/* 1. Public Trader Profile Card ----------------------------- */}
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span
                className="grid h-14 w-14 shrink-0 place-items-center rounded-xl text-lg font-bold shadow-2xs"
                style={{
                  background: avatarTint(seed),
                  color: avatarInk(seed),
                }}
              >
                {initials(user.display_name)}
              </span>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-[17px] font-semibold text-foreground">
                    {user.display_name}
                  </h2>
                  <span className="font-mono text-[12px] text-muted">
                    @{user.username}
                  </span>
                </div>

                <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-soft">
                  {user.bio ? (
                    user.bio
                  ) : (
                    <span className="italic text-muted">
                      No bio added yet. Tell other traders about your trading
                      philosophy and style.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Profile Action Buttons */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowEditProfileModal(true)}
                className="btn-base btn-primary py-2 text-[12.5px] cursor-pointer select-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-3.5 w-3.5 stroke-current"
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
                href={`/u/${user.username}`}
                className="btn-base btn-secondary py-2 text-[12.5px]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-3.5 w-3.5 stroke-current"
                >
                  <path
                    d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points="15 3 21 3 21 9"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <line
                    x1="10"
                    y1="14"
                    x2="21"
                    y2="3"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                View Profile
              </Link>
            </div>
          </div>
        </section>

        {/* 2. Account Information & Credentials ---------------------- */}
        <section className="card p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              Account Information
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-soft">
              Your registered email and permanent account handle.
            </p>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-[12px] font-medium text-ink-soft">
                Trader Handle
              </label>
              <div className="mt-1.5 flex items-center justify-between rounded border border-line bg-surface-sunken px-3.5 py-2.5">
                <span className="font-mono text-[13px] font-semibold text-foreground">
                  @{user.username}
                </span>
                <span className="rounded bg-surface border border-line/60 px-2 py-0.5 text-[11px] font-medium text-muted">
                  Permanent
                </span>
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-ink-soft">
                Registered Email
              </label>
              <div className="mt-1.5 flex items-center justify-between rounded border border-line bg-surface-sunken px-3.5 py-2.5">
                <span className="text-[13px] font-medium text-foreground">
                  {user.email}
                </span>
                <span className="rounded bg-profit-soft border border-profit/20 px-2 py-0.5 text-[11px] font-medium text-profit">
                  Verified
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-line/60 flex items-center gap-2 text-[12px] text-muted">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="h-3.5 w-3.5 stroke-current opacity-70"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="1.8" />
              <line x1="16" y1="2" x2="16" y2="6" strokeWidth="1.8" />
              <line x1="8" y1="2" x2="8" y2="6" strokeWidth="1.8" />
              <line x1="3" y1="10" x2="21" y2="10" strokeWidth="1.8" />
            </svg>
            <span>
              Member since {formatDateLong(user.created_at)}
            </span>
          </div>
        </section>

        {/* 3. Password & Security ------------------------------------- */}
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {user.has_password
                ? "Password & Security"
                : "Set Account Password"}
            </h2>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-soft">
              {user.has_password
                ? "Ensure your account is protected with a secure password."
                : "You signed in with Google and do not have a password set. Set a password to enable email & password sign-in."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="btn-base btn-secondary py-2 text-[13px]"
          >
            {user.has_password ? "Change password" : "Set password"}
          </button>
        </section>

        {/* 4. UPI Verification for Tipping --------------------------- */}
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">
                UPI ID for Tipping
              </h2>
              <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-soft">
                Connect your UPI ID so supporters can send voluntary
                peer-to-peer gifts directly to your UPI app from your public
                profile.
              </p>
            </div>
            {upiVerified ? (
              <VerifiedBadge label="UPI Verified" />
            ) : (
              <UnverifiedBadge />
            )}
          </div>

          {upiVerified && !isEditingUpi ? (
            <div className="mt-5 space-y-3">
              <div className="flex flex-wrap items-center gap-3 rounded border border-brand/20 bg-brand-soft px-4 py-3">
                <span className="numeric text-[13px] font-semibold text-brand">
                  {user.verified_upi_id}
                </span>
                <span className="text-[12px] text-muted">
                  resolved as {user.upi_verified_name}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <CopyButton
                    value={user.verified_upi_id!}
                    className="btn-base btn-secondary py-1.5 text-[12px]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingUpi(true);
                      setUpiInput(user.verified_upi_id || "");
                      setUpiMessage(null);
                    }}
                    className="btn-base btn-secondary py-1.5 text-[12px]"
                  >
                    Change UPI ID
                  </button>
                </div>
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
                  disabled={
                    upiBusy ||
                    !upiInput.trim() ||
                    (Boolean(upiVerified) &&
                      upiInput.trim() === user.verified_upi_id)
                  }
                  className="btn-base btn-primary whitespace-nowrap py-2 text-[12px]"
                >
                  {upiBusy
                    ? "Verifying…"
                    : upiVerified
                    ? "Verify & Save"
                    : "Verify UPI ID"}
                </button>
                {upiVerified && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingUpi(false);
                      setUpiInput("");
                      setUpiMessage(null);
                    }}
                    className="btn-base btn-secondary whitespace-nowrap py-2 text-[12px]"
                  >
                    Cancel
                  </button>
                )}
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

        {/* 5. Publishing Records -------------------------------------- */}
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              Publishing Records
            </h2>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-soft">
              Your day-by-day publish history lives on the Publish page, where
              you can review verified broker daily records or add self-reported
              trading sessions.
            </p>
          </div>
          <Link
            href="/publish"
            className="btn-base btn-primary py-2 text-[12px]"
          >
            Open publish history
          </Link>
        </section>

        {/* 6. Support & Inquiries -------------------------------------- */}
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              Need Help or Have Feedback?
            </h2>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-soft">
              Have questions about your account, broker verification, or need
              assistance? Reach out to our team at{" "}
              <a
                href="mailto:support@retailtraders.in"
                className="font-medium text-brand hover:underline"
              >
                support@retailtraders.in
              </a>
              .
            </p>
          </div>
          <a
            href="mailto:support@retailtraders.in"
            className="btn-base btn-secondary py-2 text-[12px]"
          >
            Contact Support
          </a>
        </section>
      </motion.div>

      {/* Edit Profile Modal */}
      <EditProfileModal
        open={showEditProfileModal}
        onClose={() => setShowEditProfileModal(false)}
      />

      {/* Change / Set Password Modal Popup */}
      <ChangePasswordModal
        open={showPasswordModal}
        hasPassword={user.has_password ?? true}
        onSuccess={refresh}
        onClose={() => setShowPasswordModal(false)}
      />
    </div>
  );
}
