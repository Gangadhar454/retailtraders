"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

import { ApiError, userApi } from "@/lib/api";

type Status = "working" | "success" | "error";

const FRIENDLY: { match: RegExp; text: string }[] = [
  {
    match: /validate credentials|unauthor|not signed in|sign in|token|session/i,
    text: "Your session ended while the broker was connecting. Sign in again, then retry from the Publish page.",
  },
  {
    match: /invalid credentials|redirect|url|client id/i,
    text: "The broker did not accept this app's redirect details. Check the API key and redirect URL registered with the broker.",
  },
  {
    match: /segment/i,
    text: "Your broker account has no active segments. Reactivate them in the broker app, then try again.",
  },
  {
    match: /expired/i,
    text: "That broker request expired. Please start again.",
  },
];

const SESSION_LOST =
  /validate credentials|unauthor|not signed in|sign in|token|session/i;

function friendly(message: string): string {
  if (!message) return "Could not connect the broker. Please try again.";
  for (const rule of FRIENDLY) {
    if (rule.match.test(message)) return rule.text;
  }
  // Never echo a raw broker payload back to the browser.
  if (message.trim().startsWith("{") || message.trim().startsWith("[")) {
    return "The broker rejected the connection. Please try again.";
  }
  return message;
}

function CallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("working");
  const [message, setMessage] = useState("Completing your broker connection…");
  const started = useRef(false);

  const brokerParam = (searchParams.get("broker") ?? "").toLowerCase();
  const requestToken = searchParams.get("request_token");
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const connected = searchParams.get("connected") === "1";

  // Kite has no top-level state parameter, so the broker key rides along in
  // redirect_params; Upstox callbacks are identified by their `code`.
  const broker =
    brokerParam === "zerodha" || requestToken
      ? "zerodha"
      : brokerParam === "angel_one"
        ? "angel_one"
        : "upstox";
  const brokerLabel =
    broker === "zerodha" ? "Zerodha" : broker === "angel_one" ? "Angel One" : "Upstox";
  const credential = broker === "zerodha" ? requestToken : code;

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      // Defer state updates out of the synchronous effect body.
      await Promise.resolve();

      if (connected) {
        setStatus("success");
        setMessage(`${brokerLabel} connected. Fetching today's P&L…`);
        window.setTimeout(() => {
          router.replace(`/publish?broker=${broker}`);
          router.refresh();
        }, 900);
        return;
      }

      if (oauthError) {
        setStatus("error");
        setMessage(friendly(`${brokerLabel} returned an error: ${oauthError}`));
        return;
      }

      if (!credential || !state) {
        setStatus("error");
        setMessage("The broker did not return an authorisation code.");
        return;
      }

      try {
        await userApi.brokerCallback(broker, {
          state,
          ...(broker === "zerodha"
            ? { request_token: credential }
            : { code: credential }),
        });
        setStatus("success");
        setMessage(`${brokerLabel} connected. Fetching today's P&L…`);
        window.setTimeout(() => {
          router.replace(`/publish?broker=${broker}`);
          router.refresh();
        }, 900);
      } catch (err) {
        setStatus("error");
        setMessage(
          friendly(
            err instanceof ApiError
              ? err.message
              : `Could not connect ${brokerLabel}`,
          ),
        );
      }
    })();
  }, [broker, brokerLabel, connected, credential, state, oauthError, router]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
        className="card w-full p-8 text-center"
      >
        {status === "working" && (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-soft">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 animate-spin text-brand">
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeDasharray="42 14"
                />
              </svg>
            </span>
            <p className="mt-5 text-[13px] text-ink-soft">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-profit-soft">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-profit">
                <path
                  d="M5 12.5l4.5 4.5L19 7"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className="mt-5 text-[14px] font-semibold text-profit">{message}</p>
          </>
        )}

        {status === "error" && (
          <>
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-loss-soft">
              <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6 text-loss">
                <path
                  d="M7 7l10 10M17 7L7 17"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <p className="mt-5 text-[13px] leading-relaxed text-loss">{message}</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {SESSION_LOST.test(message) && (
                <Link href="/login?next=/publish" className="btn-base btn-primary">
                  Sign in again
                </Link>
              )}
              <Link href={`/publish?broker=${broker}`} className="btn-base btn-secondary">
                Back to publish
              </Link>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function BrokerCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackInner />
    </Suspense>
  );
}
