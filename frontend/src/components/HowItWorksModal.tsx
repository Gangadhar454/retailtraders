"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

interface HowItWorksModalProps {
  open: boolean;
  onClose: () => void;
}

const STEPS = [
  {
    num: "01",
    title: "Publish",
    body: "Enter your daily P&L manually, or link Upstox, Zerodha, or Angel One and let the platform read the realised number straight from your account.",
    icon: (
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    ),
  },
  {
    num: "02",
    title: "Verify",
    body: "Linked accounts carry a Verified P&L badge fetched directly from the broker — never self-reported.",
    icon: (
      <path
        d="M12 2.5l7.5 3v5.6c0 4.7-3.2 8.6-7.5 10.4-4.3-1.8-7.5-5.7-7.5-10.4V5.5l7.5-3zM8.6 12l2.4 2.4 4.4-4.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    num: "03",
    title: "Tip",
    body: "Supporters send a voluntary UPI gift straight to your verified UPI ID. The platform never holds funds.",
    icon: (
      <path
        d="M12 21s-7-4.6-7-10a7 7 0 1114 0c0 5.4-7 10-7 10z M12 8.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    ),
  },
];

export function HowItWorksModal({ open, onClose }: HowItWorksModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 backdrop-blur-xs"
          />

          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: "spring", stiffness: 450, damping: 36 }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line bg-surface-alt px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-soft text-[12px] font-bold text-brand">
                  ?
                </span>
                <h2 className="text-[15px] font-semibold text-foreground">
                  How It Works
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded text-ink-soft transition-colors hover:bg-surface-sunken hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                  <path
                    d="M18 6L6 18M6 6l12 12"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>

            {/* Steps */}
            <div className="divide-y divide-line p-5">
              {STEPS.map((step) => (
                <div key={step.num} className="flex gap-4 py-4 first:pt-1 last:pb-1">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-brand/20 bg-brand-soft text-brand">
                    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
                      {step.icon}
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[14px] font-semibold text-foreground">
                        {step.title}
                      </h3>
                      <span className="numeric text-[11px] font-medium text-muted">
                        {step.num}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-line bg-surface-alt px-5 py-3">
              <button
                type="button"
                onClick={onClose}
                className="btn-base btn-primary text-[13px]"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

