"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, displayName);
      router.push("/settings");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account");
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
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Create your profile</h1>
        <p className="mt-1.5 text-[13px] text-ink-soft">
          A broker is optional — type your P&amp;L in, or connect one on the
          Publish page and fetch the day&apos;s figure.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="displayName"
              className="mb-1.5 block text-[12px] font-medium text-ink-soft"
            >
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              required
              minLength={2}
              maxLength={64}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-base"
              placeholder="Ravi Sharma"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-[12px] font-medium text-ink-soft">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-[12px] font-medium text-ink-soft"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base"
              placeholder="At least 8 characters, with a number"
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
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-ink-soft">
          Already registered?{" "}
          <Link href="/login" className="link font-medium">
            Sign in
          </Link>
        </p>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          By joining you agree that published figures are your own claims, and
          that any gifts sent to you are voluntary peer-to-peer transfers.
        </p>
      </motion.div>
    </div>
  );
}
