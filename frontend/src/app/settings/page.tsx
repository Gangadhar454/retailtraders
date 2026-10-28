"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { AnimatePresence, motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { CopyButton } from "@/components/CopyButton";
import { UnverifiedBadge, VerifiedBadge } from "@/components/VerifiedBadge";
import { ApiError, authApi, userApi } from "@/lib/api";

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading, refresh } = useAuth();

  // Profile Display Name State
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMessage, setNameMessage] = useState<{
    kind: "ok" | "error";
    text: string;
  } | null>(null);

  // Password Modal State
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

  useEffect(() => {
    if (user?.display_name) {
      setDisplayNameInput(user.display_name);
    }
  }, [user?.display_name]);

  if (loading || !user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="card h-80 animate-pulse" />
      </div>
    );
  }

  const upiVerified = user.upi_verification_status === "VERIFIED" && user.verified_upi_id;

  async function handleUpdateDisplayName(e: FormEvent) {
    e.preventDefault();
    setNameMessage(null);
    const cleanName = displayNameInput.trim();
    if (cleanName.length < 2) {
      setNameMessage({ kind: "error", text: "Display name must be at least 2 characters" });
      return;
    }

    setNameBusy(true);
    try {
      await authApi.updateProfile({ display_name: cleanName });
      await refresh();
      setNameMessage({ kind: "ok", text: "Display name updated successfully" });
    } catch (err) {
      setNameMessage({
        kind: "error",
        text: err instanceof ApiError ? err.message : "Failed to update display name",
      });
    } finally {
      setNameBusy(false);
    }
  }

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
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
          <p className="mt-1.5 text-[13px] text-ink-soft">
            Manage your profile details, security, and UPI tipping settings.
          </p>
        </header>

        {/* Profile Details --------------------------------------------- */}
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Profile details</h2>
              <p className="mt-0.5 text-[12px] text-ink-soft">
                Your display name is visible across the leaderboard and your public profile.
              </p>
            </div>
            <span className="rounded bg-surface-sunken border border-line px-2.5 py-1 text-[12px] font-medium text-muted">
              @{user.username}
            </span>
          </div>

          <form onSubmit={handleUpdateDisplayName} className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="displayName" className="block text-[12px] font-medium text-ink-soft">
                  Display name
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    id="displayName"
                    type="text"
                    required
                    minLength={2}
                    maxLength={64}
                    value={displayNameInput}
                    onChange={(e) => setDisplayNameInput(e.target.value)}
                    className="input-base flex-1"
                    placeholder="Your display name"
                  />
                  <button
                    type="submit"
                    disabled={nameBusy || displayNameInput.trim() === user.display_name}
                    className="btn-base btn-primary whitespace-nowrap py-2 text-[12px]"
                  >
                    {nameBusy ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-ink-soft">
                  Email address
                </label>
                <div className="mt-1.5 flex items-center rounded border border-line bg-surface-sunken px-3.5 py-2.5">
                  <span className="text-[13px] font-medium text-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </div>

            <AnimatePresence>
              {nameMessage && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`rounded border px-3 py-2 text-[12px] ${
                    nameMessage.kind === "ok"
                      ? "border-profit/25 bg-profit-soft text-profit"
                      : "border-loss/25 bg-loss-soft text-loss"
                  }`}
                >
                  {nameMessage.text}
                </motion.p>
              )}
            </AnimatePresence>
          </form>
        </section>

        {/* Password & Security ----------------------------------------- */}
        <section className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Password &amp; Security</h2>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-soft">
              Ensure your account is protected with a secure password.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswordModal(true)}
            className="btn-base btn-secondary py-2 text-[13px]"
          >
            Change password
          </button>
        </section>

        {/* Change Password Modal Popup */}
        <ChangePasswordModal
          open={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
        />

        {/* UPI Verification -------------------------------------------- */}
        <section className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">UPI ID for tipping</h2>
              <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-ink-soft">
                Connect your UPI ID so supporters can send voluntary peer-to-peer gifts directly to your UPI app from your public profile.
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
                    (Boolean(upiVerified) && upiInput.trim() === user.verified_upi_id)
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
