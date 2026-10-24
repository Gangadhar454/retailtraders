"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { motion } from "motion/react";

import { useAuth } from "@/components/AuthProvider";
import { ApiError } from "@/lib/api";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const next = searchParams.get("next") ?? "/";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in");
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="card w-full max-w-md p-6 sm:p-8"
    >
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        Welcome back
      </h1>
      <p className="mt-1.5 text-[13px] text-ink-soft">
        Sign in to publish your P&amp;L — typed in, or fetched from your broker.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-[12px] font-medium text-ink-soft"
          >
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
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-base"
            placeholder="••••••••"
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
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-ink-soft">
        No account yet?{" "}
        <Link href="/register" className="link font-medium">
          Create one free
        </Link>
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[78vh] max-w-7xl items-center justify-center px-4 py-12 sm:px-6">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
