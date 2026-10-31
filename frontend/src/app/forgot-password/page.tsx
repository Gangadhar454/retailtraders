"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { motion } from "motion/react";

import { authApi, ApiError } from "@/lib/api";

type Step = "request" | "verify_and_reset" | "success";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Step 1: Send OTP to email
  async function onRequestOtp(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await authApi.forgotPasswordRequest(email.trim());
      setStep("verify_and_reset");
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to send verification code");
    } finally {
      setBusy(false);
    }
  }

  // Resend OTP
  async function onResendOtp() {
    if (resendCooldown > 0 || busy) return;
    setError(null);
    setBusy(true);

    try {
      await authApi.forgotPasswordRequest(email.trim());
      setResendCooldown(60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to resend verification code");
    } finally {
      setBusy(false);
    }
  }

  // Step 2: Reset Password with OTP
  async function onResetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanOtp = otp.trim().replace(/\s+/g, "");
    if (cleanOtp.length !== 6 || !/^\d{6}$/.test(cleanOtp)) {
      setError("Please enter a valid 6-digit verification code");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return;
    }

    if (!/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one letter and one number");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);

    try {
      await authApi.resetPasswordWithOtp({
        email: email.trim(),
        otp: cleanOtp,
        new_password: newPassword,
      });
      setStep("success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[78vh] max-w-7xl items-center justify-center px-4 py-12 sm:px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="card w-full max-w-md p-6 sm:p-8"
      >
        {step === "request" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Reset your password
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-soft">
              Enter your registered email address and we&apos;ll send you a 6-digit verification code to reset your password.
            </p>

            <form onSubmit={onRequestOtp} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink-soft">
                  Account Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-base"
                  placeholder="you@example.com"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded border border-loss/25 bg-loss-soft px-3 py-2 text-[13px] text-loss"
                >
                  <p>{error}</p>
                  {error.toLowerCase().includes("no account found") && (
                    <p className="mt-1 text-[12px] text-ink-soft">
                      Want to join?{" "}
                      <Link href="/register" className="font-semibold text-brand hover:underline">
                        Create an account free
                      </Link>
                    </p>
                  )}
                </motion.div>
              )}

              <button type="submit" disabled={busy} className="btn-base btn-primary w-full">
                {busy ? "Sending code…" : "Send verification code"}
              </button>
            </form>

            <p className="mt-6 text-center text-[13px] text-ink-soft">
              Remember your password?{" "}
              <Link href="/login" className="link font-medium">
                Sign in
              </Link>
            </p>
          </>
        )}

        {step === "verify_and_reset" && (
          <>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Enter verification code
            </h1>
            <p className="mt-1.5 text-[13px] text-ink-soft">
              We sent a 6-digit OTP code to <strong className="text-foreground">{email}</strong>. Enter it below along with your new password.
            </p>

            <form onSubmit={onResetPassword} className="mt-6 space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="otp" className="block text-[12px] font-medium text-ink-soft">
                    6-Digit Verification Code
                  </label>
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || busy}
                    onClick={onResendOtp}
                    className="text-[12px] font-medium text-brand hover:underline disabled:cursor-not-allowed disabled:text-muted"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                  </button>
                </div>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="input-base font-mono tracking-widest text-center text-lg font-bold"
                  placeholder="849201"
                />
              </div>

              <div>
                <label htmlFor="newPassword" className="mb-1.5 block text-[12px] font-medium text-ink-soft">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-base"
                  placeholder="At least 8 chars, 1 letter, 1 number"
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-[12px] font-medium text-ink-soft">
                  Confirm New Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input-base"
                  placeholder="Re-type new password"
                />
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded border border-loss/25 bg-loss-soft px-3 py-2 text-[13px] text-loss"
                >
                  {error}
                </motion.p>
              )}

              <button type="submit" disabled={busy} className="btn-base btn-primary w-full">
                {busy ? "Resetting password…" : "Reset Password"}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-between text-[13px] text-ink-soft">
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("request");
                }}
                className="hover:underline"
              >
                &larr; Change email
              </button>
              <Link href="/login" className="link font-medium">
                Sign in
              </Link>
            </div>
          </>
        )}

        {step === "success" && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-profit/15 text-profit">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Password reset successfully!
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
              Your account password has been updated. You can now sign in with your new credentials.
            </p>
            <div className="mt-6">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="btn-base btn-primary w-full"
              >
                Sign in to your account
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
